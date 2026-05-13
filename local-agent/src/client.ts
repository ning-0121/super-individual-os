// ─────────────────────────────────────────────────
// V0.1 — tiny HTTP client wrapping cloud endpoints.
// Uses native fetch (Node ≥18). All requests carry the agent token
// via Authorization: Bearer.
// ─────────────────────────────────────────────────

import type { RunnerConfig } from './config.js'

export interface PendingTask {
  tool_run_id: string
  action: string                // bare verb, e.g. "git_status"
  params: Record<string, unknown> | null
  risk_level: number
  issued_at: string
}

export interface PendingResponse {
  session_id: string
  hostname: string | null
  count: number
  tasks: PendingTask[]
}

export class CloudClient {
  constructor(private cfg: RunnerConfig) {}

  private headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      'authorization': `Bearer ${this.cfg.agentToken}`,
      'x-agent-token': this.cfg.agentToken,
      'content-type': 'application/json',
      'user-agent': `sio-local-agent/0.1 (${this.cfg.machineName})`,
      ...extra,
    }
  }

  async heartbeat(): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const r = await fetch(`${this.cfg.apiUrl}/api/local-agent/heartbeat`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ agent_token: this.cfg.agentToken, status: 'active' }),
      })
      if (!r.ok) return { ok: false, status: r.status, error: await r.text().catch(() => '') }
      return { ok: true, status: r.status }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async pending(): Promise<PendingResponse | { error: string; status?: number }> {
    try {
      const r = await fetch(`${this.cfg.apiUrl}/api/local-agent/pending`, {
        method: 'GET',
        headers: this.headers(),
      })
      if (!r.ok) return { error: await r.text().catch(() => ''), status: r.status }
      return await r.json() as PendingResponse
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  async postResult(payload: {
    tool_run_id: string
    status: 'success' | 'error'
    result?: Record<string, unknown>
    error_message?: string
    duration_ms?: number
  }): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const r = await fetch(`${this.cfg.apiUrl}/api/local-agent/result`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      })
      if (!r.ok) return { ok: false, status: r.status, error: await r.text().catch(() => '') }
      return { ok: true, status: r.status }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}
