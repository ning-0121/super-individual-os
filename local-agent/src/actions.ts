// ─────────────────────────────────────────────────
// V0.1 — Read-only action handlers.
// Every handler is side-effect-free with respect to the filesystem:
//   git_status, git_branch:    spawn `git` with a fixed argv (no shell interp)
//   list_files:                fs.readdir, single level, sanitized
//   npm_test_status, build:    parse package.json scripts, NEVER execute
//   read_project_files:        read whitelisted small files (≤ 64 KB each)
// ─────────────────────────────────────────────────

import { spawn } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  classifyAction, safeResolveInsideProject, isReadableProjectFile,
} from './policy.js'

const MAX_BYTES_PER_FILE = 64 * 1024
const MAX_FILES_PER_READ = 8
const CMD_TIMEOUT_MS     = 10_000

export interface ActionContext {
  projectPath: string
  dryRun: boolean               // V0.1: only git_status defies dry-run; others run anyway since pure-read
}

export interface ActionParams {
  // For list_files / read_project_files
  dir?: string                  // relative subdir, defaults to project root
  paths?: string[]              // for read_project_files
}

export interface ActionResult {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
}

// ─────────────────────────────────────────────
// Entry — re-checks the verb against runner policy first.
// ─────────────────────────────────────────────
export async function runAction(
  ctx: ActionContext, verb: string, params: ActionParams,
): Promise<ActionResult> {
  const verdict = classifyAction(verb)
  if (!verdict.allowed) return { ok: false, error: `runner_policy: ${verdict.reason}` }

  try {
    switch (verb.toLowerCase()) {
      case 'git_status':    return await gitStatus(ctx)
      case 'git_branch':    return await gitBranch(ctx)
      case 'list_files':
      case 'list_directory':return await listFiles(ctx, params)
      case 'npm_test_status':return await scriptStatus(ctx, 'test')
      case 'build_status':  return await scriptStatus(ctx, 'build')
      case 'read_project_files': return await readProjectFiles(ctx, params)
      default:
        return { ok: false, error: `unhandled verb: ${verb}` }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────────
// git_status — spawn git with fixed argv. NEVER pass user-controlled args.
// ─────────────────────────────────────────────
async function gitStatus(ctx: ActionContext): Promise<ActionResult> {
  if (ctx.dryRun) {
    // Per spec: dry-run MAY still execute git_status (it's the canary).
  }
  const out = await runGit(ctx.projectPath, ['status', '--short', '--branch'])
  if (!out.ok) return { ok: false, error: out.stderr || 'git status failed' }
  const lines = out.stdout.split('\n').filter(Boolean)
  return {
    ok: true,
    result: {
      branch_line: lines[0] ?? '',
      changes: lines.slice(1),
      clean: lines.length <= 1,
      raw: out.stdout,
    },
  }
}

async function gitBranch(ctx: ActionContext): Promise<ActionResult> {
  if (ctx.dryRun) {
    // Dry-run: still ok, this is a pure read.
  }
  const out = await runGit(ctx.projectPath, ['branch', '--show-current'])
  if (!out.ok) return { ok: false, error: out.stderr || 'git branch failed' }
  return { ok: true, result: { branch: out.stdout.trim() } }
}

interface GitOut { ok: boolean; stdout: string; stderr: string; code: number }

function runGit(cwd: string, args: string[]): Promise<GitOut> {
  // Hard-coded executable + literal args. No shell, no interp.
  return new Promise(resolve => {
    const child = spawn('git', args, { cwd, shell: false })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), CMD_TIMEOUT_MS)
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', e => {
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr: stderr || e.message, code: -1 })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout, stderr, code: code ?? -1 })
    })
  })
}

// ─────────────────────────────────────────────
// list_files — single level only, sanitized
// ─────────────────────────────────────────────
async function listFiles(ctx: ActionContext, params: ActionParams): Promise<ActionResult> {
  const sub = (params.dir ?? '.').trim() || '.'
  const verdict = safeResolveInsideProject(ctx.projectPath, sub === '.' ? '' : sub)
  if (!verdict.allowed || !verdict.resolved) {
    return { ok: false, error: `path: ${verdict.reason}` }
  }
  const target = verdict.resolved
  const entries = await readdir(target, { withFileTypes: true })
  const items: Array<{ name: string; type: 'file' | 'dir' | 'other' }> = []
  for (const ent of entries) {
    const name = ent.name
    // Hide deny-listed entries even from the listing.
    if (name === '.env' || name.startsWith('.env.') || name === 'node_modules' || name === '.git' || name === '.next') continue
    items.push({
      name,
      type: ent.isFile() ? 'file' : ent.isDirectory() ? 'dir' : 'other',
    })
  }
  return {
    ok: true,
    result: { dir: verdict.rel || '.', count: items.length, items },
  }
}

// ─────────────────────────────────────────────
// npm_test_status / build_status — read package.json, return script presence.
// V0.1 NEVER executes tests/builds.
// ─────────────────────────────────────────────
async function scriptStatus(ctx: ActionContext, key: 'test' | 'build'): Promise<ActionResult> {
  const pkgPath = join(ctx.projectPath, 'package.json')
  try {
    const text = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(text) as { scripts?: Record<string, string> }
    const cmd = pkg.scripts?.[key] ?? null
    return {
      ok: true,
      result: {
        script_present: !!cmd,
        command: cmd,
        executed: false,
        note: 'V0.1 read-only — script not executed. Re-enable in a future version.',
      },
    }
  } catch (e) {
    return { ok: false, error: `package.json read failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ─────────────────────────────────────────────
// read_project_files — whitelisted small files only.
// ─────────────────────────────────────────────
async function readProjectFiles(ctx: ActionContext, params: ActionParams): Promise<ActionResult> {
  const requested = Array.isArray(params.paths) ? params.paths : []
  if (requested.length === 0) return { ok: false, error: 'paths[] required' }
  if (requested.length > MAX_FILES_PER_READ) {
    return { ok: false, error: `too many files (max ${MAX_FILES_PER_READ})` }
  }
  const files: Array<{ path: string; size: number; truncated: boolean; content: string }> = []
  const rejected: Array<{ path: string; reason: string }> = []

  for (const p of requested) {
    const verdict = safeResolveInsideProject(ctx.projectPath, p)
    if (!verdict.allowed || !verdict.resolved || !verdict.rel) {
      rejected.push({ path: p, reason: verdict.reason })
      continue
    }
    if (!isReadableProjectFile(verdict.rel)) {
      rejected.push({ path: p, reason: 'not on read allow-list' })
      continue
    }
    try {
      const s = await stat(verdict.resolved)
      if (!s.isFile()) { rejected.push({ path: p, reason: 'not a regular file' }); continue }
      const raw = await readFile(verdict.resolved, 'utf8')
      const truncated = raw.length > MAX_BYTES_PER_FILE
      files.push({
        path: verdict.rel,
        size: s.size,
        truncated,
        content: truncated ? raw.slice(0, MAX_BYTES_PER_FILE) : raw,
      })
    } catch (e) {
      rejected.push({ path: p, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    ok: files.length > 0 || rejected.length === 0,
    result: { files, rejected },
  }
}
