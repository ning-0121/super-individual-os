#!/usr/bin/env node
// ─────────────────────────────────────────────────
// V0.1 — Super Individual OS local agent runner
// Read-only. Sandboxed to one project path. Two cadences:
//   - heartbeat   every SIO_HEARTBEAT_MS (default 30s)
//   - poll+exec   every SIO_POLL_MS      (default 10s)
// Exit on SIGINT / SIGTERM with a clean log line.
// ─────────────────────────────────────────────────

import { loadConfig, maskToken, type RunnerConfig } from './config.js'
import { CloudClient, type PendingTask } from './client.js'
import { runAction } from './actions.js'

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  // Single-line JSON for trivial log shipping. Falls back to plain if console only.
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra })
  if (level === 'error')      console.error(line)
  else if (level === 'warn')  console.warn(line)
  else                        console.log(line)
}

async function executeAndReport(cfg: RunnerConfig, client: CloudClient, task: PendingTask): Promise<void> {
  const t0 = Date.now()
  log('info', 'task.start', { tool_run_id: task.tool_run_id, action: task.action })

  const out = await runAction(
    { projectPath: cfg.projectPath, dryRun: cfg.dryRun },
    task.action,
    (task.params ?? {}) as Record<string, never>,
  )

  const duration_ms = Date.now() - t0
  if (out.ok) {
    const r = await client.postResult({
      tool_run_id: task.tool_run_id,
      status: 'success',
      result: out.result ?? {},
      duration_ms,
    })
    log(r.ok ? 'info' : 'warn', 'task.success', {
      tool_run_id: task.tool_run_id, duration_ms, posted: r.ok, error: r.error,
    })
  } else {
    const r = await client.postResult({
      tool_run_id: task.tool_run_id,
      status: 'error',
      error_message: out.error ?? 'unknown error',
      duration_ms,
    })
    log('warn', 'task.error', {
      tool_run_id: task.tool_run_id, duration_ms, runner_error: out.error, posted: r.ok,
    })
  }
}

async function pollCycle(cfg: RunnerConfig, client: CloudClient): Promise<number> {
  const res = await client.pending()
  if ('error' in res) {
    log('warn', 'pending.fail', { status: res.status, error: res.error })
    return 0
  }
  if (res.count === 0) return 0
  for (const task of res.tasks) {
    await executeAndReport(cfg, client, task)
  }
  return res.tasks.length
}

async function main(): Promise<void> {
  const cfg = loadConfig()
  const client = new CloudClient(cfg)

  log('info', 'runner.start', {
    api: cfg.apiUrl,
    machine: cfg.machineName,
    project: cfg.projectPath,
    token: maskToken(cfg.agentToken),
    dry_run: cfg.dryRun,
    once: cfg.once,
    heartbeat_ms: cfg.heartbeatIntervalMs,
    poll_ms: cfg.pollIntervalMs,
  })

  // Initial heartbeat — confirms credentials.
  const hb0 = await client.heartbeat()
  if (!hb0.ok) {
    log('error', 'heartbeat.failed', { status: hb0.status, error: hb0.error })
    if (hb0.status === 401 || hb0.status === 403) process.exit(2)
  }

  // One-shot mode for smoke / CI.
  if (cfg.once) {
    const n = await pollCycle(cfg, client)
    log('info', 'runner.once.done', { executed: n })
    return
  }

  let stopping = false
  const stop = (sig: string) => {
    if (stopping) return
    stopping = true
    log('info', 'runner.stop', { signal: sig })
    process.exit(0)
  }
  process.on('SIGINT',  () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))

  setInterval(() => { client.heartbeat().catch(() => {}) }, cfg.heartbeatIntervalMs)
  setInterval(() => {
    pollCycle(cfg, client).catch(e => log('error', 'poll.crash', {
      error: e instanceof Error ? e.message : String(e),
    }))
  }, cfg.pollIntervalMs)
}

main().catch(e => {
  log('error', 'runner.fatal', { error: e instanceof Error ? e.message : String(e) })
  process.exit(1)
})
