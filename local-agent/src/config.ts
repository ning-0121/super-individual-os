// ─────────────────────────────────────────────────
// V0.1 — runner config (env-driven)
// ─────────────────────────────────────────────────
import { hostname } from 'node:os'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'

export interface RunnerConfig {
  apiUrl: string                // SIO cloud base, e.g. https://super-individual-os.vercel.app
  agentToken: string            // la_<32hex>
  projectPath: string           // absolute repo path the runner is bound to
  machineName: string
  heartbeatIntervalMs: number
  pollIntervalMs: number
  dryRun: boolean               // V0.1 default: true; only git_status executes a real command
  once: boolean                 // run one cycle then exit (CI / smoke test)
}

function need(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing required env: ${name}`)
  }
  return v.trim()
}

export function loadConfig(argv: string[] = process.argv): RunnerConfig {
  const apiUrl       = (process.env.SIO_API_URL ?? '').trim() || 'http://localhost:3000'
  const agentToken   = need('SIO_AGENT_TOKEN')
  const projectPath  = resolve(need('SIO_PROJECT_PATH'))
  const machineName  = (process.env.SIO_MACHINE_NAME ?? '').trim() || hostname()
  const heartbeat    = parseInt(process.env.SIO_HEARTBEAT_MS ?? '30000', 10)
  const poll         = parseInt(process.env.SIO_POLL_MS ?? '10000', 10)
  const dryRun       = (process.env.SIO_DRY_RUN ?? '1') !== '0'

  // Path must exist and be a directory; refuse `/` and `/home`-style overreach.
  let st: ReturnType<typeof statSync>
  try { st = statSync(projectPath) } catch {
    throw new Error(`SIO_PROJECT_PATH does not exist: ${projectPath}`)
  }
  if (!st.isDirectory()) throw new Error(`SIO_PROJECT_PATH is not a directory: ${projectPath}`)
  if (projectPath === '/' || projectPath.length < 4) {
    throw new Error(`SIO_PROJECT_PATH is unsafe (refuse root-ish): ${projectPath}`)
  }
  if (!/^la_[a-f0-9]{16,}$/i.test(agentToken)) {
    throw new Error('SIO_AGENT_TOKEN must look like "la_<hex>" (≥16 hex chars)')
  }
  if (!/^https?:\/\//i.test(apiUrl)) {
    throw new Error('SIO_API_URL must start with http:// or https://')
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ''),
    agentToken,
    projectPath,
    machineName,
    heartbeatIntervalMs: Math.max(5000, isFinite(heartbeat) ? heartbeat : 30000),
    pollIntervalMs: Math.max(2000, isFinite(poll) ? poll : 10000),
    dryRun,
    once: argv.includes('--once'),
  }
}

export function maskToken(t: string): string {
  if (t.length < 10) return '***'
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}
