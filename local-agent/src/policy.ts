// ─────────────────────────────────────────────────
// V0.1 — Runner-side policy guard (mirror of cloud policy)
// Single source of truth lives in cloud src/lib/local-agent/policy.ts.
// Defence in depth: the runner re-checks every action before executing,
// so even if a malicious row reaches us, we refuse to run it locally.
// ─────────────────────────────────────────────────

import { resolve, relative, isAbsolute, basename } from 'node:path'

export const READ_ONLY_ACTIONS = [
  'git_status',
  'git_branch',
  'list_files',
  'list_directory',     // alias kept for compatibility with cloud whitelist
  'npm_test_status',
  'build_status',
  'read_project_files',
] as const
export type ReadOnlyAction = typeof READ_ONLY_ACTIONS[number]

export const DESTRUCTIVE_VERBS = new Set([
  'write_file', 'delete_file', 'run_shell', 'shell',
  'git_push', 'git_commit', 'deploy', 'db_migration', 'migration',
  'cursor_edit', 'install', 'npm_install', 'rm',
])

// Files / paths that are NEVER readable, even when whitelisted by extension.
const DENY_NAME_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.next(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /id_rsa/i,
  /credentials\.json$/i, /secrets?\.(json|ya?ml|toml)$/i,
]

// Allow-list of files/paths the runner is willing to read.
// First match wins. Anything not on this list is rejected.
export interface ReadAllowRule {
  // Either an exact basename match (`package.json`), a wildcard basename
  // (`next.config.*`), or a prefix path relative to project root (`src/app/`).
  kind: 'basename_exact' | 'basename_glob' | 'prefix'
  pattern: string
}

export const READ_ALLOW_RULES: ReadAllowRule[] = [
  { kind: 'basename_exact', pattern: 'package.json' },
  { kind: 'basename_exact', pattern: 'README.md' },
  { kind: 'basename_exact', pattern: 'tsconfig.json' },
  { kind: 'basename_glob',  pattern: 'next.config.*' },
  { kind: 'prefix',         pattern: 'src/app/' },
]

export interface PolicyVerdict {
  allowed: boolean
  reason: string
}

export function classifyAction(rawAction: string): PolicyVerdict {
  if (!rawAction) return { allowed: false, reason: 'empty action' }
  const a = rawAction.trim().toLowerCase()
  if (DESTRUCTIVE_VERBS.has(a)) {
    return { allowed: false, reason: 'V0.1 runner refuses destructive actions' }
  }
  if ((READ_ONLY_ACTIONS as readonly string[]).includes(a)) {
    return { allowed: true, reason: 'read-only action permitted' }
  }
  return { allowed: false, reason: 'unknown action (fail-closed)' }
}

// ─────────────────────────────────────────────
// Path safety — guards every fs access.
// ─────────────────────────────────────────────
export interface PathVerdict {
  allowed: boolean
  reason: string
  resolved?: string             // absolute, normalized path (only when allowed)
  rel?: string                  // POSIX-style path relative to projectPath
}

export function safeResolveInsideProject(
  projectPath: string, requested: string,
): PathVerdict {
  if (!requested || typeof requested !== 'string') {
    return { allowed: false, reason: 'path is required' }
  }
  // Reject null bytes outright.
  if (requested.includes('\0')) return { allowed: false, reason: 'null byte in path' }

  // Reject leading absolute paths — we anchor everything to projectPath.
  if (isAbsolute(requested)) return { allowed: false, reason: 'absolute paths forbidden' }

  const abs = resolve(projectPath, requested)
  const rel = relative(projectPath, abs).replaceAll('\\', '/')

  // Path traversal — relative path that climbs above project.
  if (rel.startsWith('..') || rel.startsWith('/')) {
    return { allowed: false, reason: 'path traversal blocked' }
  }
  // Deny-list — applies whether or not the file is on the allow-list.
  for (const re of DENY_NAME_PATTERNS) {
    if (re.test(rel) || re.test('/' + rel)) {
      return { allowed: false, reason: `denied by pattern ${re}` }
    }
  }
  return { allowed: true, reason: 'inside project & not denied', resolved: abs, rel }
}

export function isReadableProjectFile(rel: string): boolean {
  const base = basename(rel)
  for (const rule of READ_ALLOW_RULES) {
    if (rule.kind === 'basename_exact' && base === rule.pattern) return true
    if (rule.kind === 'basename_glob') {
      const regex = new RegExp('^' + rule.pattern.replaceAll('.', '\\.').replaceAll('*', '.*') + '$')
      if (regex.test(base)) return true
    }
    if (rule.kind === 'prefix' && rel.startsWith(rule.pattern)) return true
  }
  return false
}
