// ─────────────────────────────────────────────────
// V2.8 — Workflow DAG helpers (pure)
// Steps depend on other steps via their step_key. We need:
// - readiness: which steps have all dependencies satisfied?
// - cycle detection (so we refuse to start a malformed workflow)
// - topo order for ETA estimation
// ─────────────────────────────────────────────────

export interface StepNode {
  step_key: string
  depends_on: string[]
}

export interface ReadinessSlice {
  step_key: string
  status: 'waiting' | 'ready' | 'running' | 'blocked_approval' | 'succeeded' | 'failed' | 'escalated' | 'skipped'
}

// A step becomes "ready" when all its dependencies are succeeded (or skipped).
// Returns the step_keys that should transition waiting → ready right now.
export function findNewlyReady(nodes: StepNode[], slices: ReadinessSlice[]): string[] {
  const byKey = new Map(slices.map(s => [s.step_key, s.status]))
  const completed = new Set(slices
    .filter(s => s.status === 'succeeded' || s.status === 'skipped')
    .map(s => s.step_key))

  const out: string[] = []
  for (const node of nodes) {
    const cur = byKey.get(node.step_key)
    if (cur !== 'waiting') continue
    const allDepsDone = (node.depends_on ?? []).every(d => completed.has(d))
    if (allDepsDone) out.push(node.step_key)
  }
  return out
}

// Cycle detection via DFS. Returns null if acyclic, else the cycle as keys.
export function detectCycle(nodes: StepNode[]): string[] | null {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.step_key, n.depends_on ?? [])

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const n of nodes) color.set(n.step_key, WHITE)
  const stack: string[] = []

  function dfs(u: string): string[] | null {
    color.set(u, GRAY)
    stack.push(u)
    for (const v of adj.get(u) ?? []) {
      if (!color.has(v)) continue                       // dangling dep — caller should validate separately
      const c = color.get(v)!
      if (c === GRAY) {
        // Cycle: slice from where v appears in stack
        const idx = stack.indexOf(v)
        return idx >= 0 ? [...stack.slice(idx), v] : [v]
      }
      if (c === WHITE) {
        const found = dfs(v)
        if (found) return found
      }
    }
    color.set(u, BLACK)
    stack.pop()
    return null
  }

  for (const n of nodes) {
    if (color.get(n.step_key) === WHITE) {
      const cyc = dfs(n.step_key)
      if (cyc) return cyc
    }
  }
  return null
}

// Topological order (returns null if cyclic).
export function topoOrder(nodes: StepNode[]): string[] | null {
  if (detectCycle(nodes)) return null
  // Kahn's algorithm using reverse edges (depends_on means "must come after")
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    indeg.set(n.step_key, (indeg.get(n.step_key) ?? 0) + 0)
    for (const d of n.depends_on ?? []) {
      adj.set(d, [...(adj.get(d) ?? []), n.step_key])
      indeg.set(n.step_key, (indeg.get(n.step_key) ?? 0) + 1)
    }
  }
  const queue: string[] = []
  for (const [k, v] of indeg.entries()) if (v === 0) queue.push(k)
  const out: string[] = []
  while (queue.length) {
    const k = queue.shift()!
    out.push(k)
    for (const next of adj.get(k) ?? []) {
      const nv = (indeg.get(next) ?? 0) - 1
      indeg.set(next, nv)
      if (nv === 0) queue.push(next)
    }
  }
  return out.length === nodes.length ? out : null
}

// Pure ETA estimator. Given remaining (non-terminal) steps and an average
// step duration heuristic, return milliseconds-from-now.
// All remaining steps contribute their proportional weight; parallelism
// is approximated by dividing by `parallelism`.
export function estimateEtaMs(
  remainingSteps: number,
  avgStepMs = 5 * 60_000,                                // 5 min default
  parallelism = 2,
): number {
  if (remainingSteps <= 0) return 0
  return Math.ceil((remainingSteps * avgStepMs) / Math.max(1, parallelism))
}
