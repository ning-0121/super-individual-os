// ─────────────────────────────────────────────────
// V3.1 — Local Agent policy guard (pure, V0 = read-only)
// V0 ships a strict whitelist of read-only actions. Anything else is
// rejected with a clear reason. Future versions will widen this with
// human-in-the-loop gates.
// ─────────────────────────────────────────────────

export type LocalAgentActionCategory = 'read' | 'destructive'

export interface LocalAgentActionDef {
  action: string                     // canonical short id, e.g. 'git_status'
  category: LocalAgentActionCategory
  description: string
}

// ─────────────────────────────────────────
// Whitelist — V0 reads only. Order is irrelevant; first match wins.
// ─────────────────────────────────────────
export const LOCAL_AGENT_READ_ONLY: ReadonlyArray<LocalAgentActionDef> = [
  { action: 'read_project_files', category: 'read', description: '读取项目文件内容（受路径过滤）' },
  { action: 'list_directory',     category: 'read', description: '列出某个目录的文件结构' },
  { action: 'list_files',         category: 'read', description: '列出某个目录的文件（list_directory 的别名）' },
  { action: 'git_status',         category: 'read', description: '查询当前 git 工作区状态' },
  { action: 'git_branch',         category: 'read', description: '查询当前分支信息' },
  { action: 'npm_test_status',    category: 'read', description: '查询 npm test / vitest 最近一次结果' },
  { action: 'build_status',       category: 'read', description: '查询本地最近一次构建状态' },
]

// V0 explicit deny-list — these are recognized but always rejected.
export const LOCAL_AGENT_DESTRUCTIVE: ReadonlyArray<LocalAgentActionDef> = [
  { action: 'write_file',     category: 'destructive', description: '写入文件' },
  { action: 'delete_file',    category: 'destructive', description: '删除文件' },
  { action: 'run_shell',      category: 'destructive', description: '执行任意 shell 命令' },
  { action: 'deploy',         category: 'destructive', description: '触发部署' },
  { action: 'db_migration',   category: 'destructive', description: '应用数据库迁移' },
  { action: 'git_push',       category: 'destructive', description: '推送 git 提交' },
  { action: 'git_commit',     category: 'destructive', description: '生成 git 提交' },
  { action: 'cursor_edit',    category: 'destructive', description: '通过 Cursor 修改代码' },
]

export interface PolicyVerdict {
  allowed: boolean
  category: LocalAgentActionCategory | 'unknown'
  reason: string
  matched_def?: LocalAgentActionDef
}

// ─────────────────────────────────────────────────
// V0 verdict: read-only ⇒ allow, destructive ⇒ deny, unknown ⇒ deny.
// ─────────────────────────────────────────────────
export function classifyLocalAgentAction(rawAction: string): PolicyVerdict {
  if (!rawAction) {
    return { allowed: false, category: 'unknown', reason: 'V0 only supports read-only local actions' }
  }
  const action = rawAction.trim().toLowerCase()

  const ro = LOCAL_AGENT_READ_ONLY.find(d => d.action === action)
  if (ro) {
    return { allowed: true, category: 'read', reason: 'OK — read-only action permitted', matched_def: ro }
  }

  const destructive = LOCAL_AGENT_DESTRUCTIVE.find(d => d.action === action)
  if (destructive) {
    return {
      allowed: false, category: 'destructive', matched_def: destructive,
      reason: 'V0 only supports read-only local actions',
    }
  }

  // Unknown verbs default to deny (fail closed).
  return {
    allowed: false, category: 'unknown',
    reason: 'V0 only supports read-only local actions',
  }
}

export function isReadOnlyAction(action: string): boolean {
  return classifyLocalAgentAction(action).allowed
}

export function listReadOnlyActions(): string[] {
  return LOCAL_AGENT_READ_ONLY.map(d => d.action)
}

export function listDestructiveActions(): string[] {
  return LOCAL_AGENT_DESTRUCTIVE.map(d => d.action)
}

// ─────────────────────────────────────────────────
// Status derivation — pure.
// V0 maps the granular session.status into a simple {online,offline,error}.
// "online" = active/registered with a heartbeat in the last 5 minutes.
// "error"  = the agent reported error or there's a session in error state.
// "offline" = everything else (idle long enough, disconnected, revoked, stale heartbeat).
// ─────────────────────────────────────────────────
export type DerivedAgentStatus = 'online' | 'offline' | 'error'

export interface SessionLike {
  status: string                       // raw enum
  last_heartbeat: string | null        // ISO
}

export const ONLINE_WINDOW_MS = 5 * 60 * 1000   // 5min

export function deriveAgentStatus(
  s: SessionLike, now: Date = new Date(),
): DerivedAgentStatus {
  if (s.status === 'error') return 'error'
  if (s.status === 'revoked' || s.status === 'disconnected') return 'offline'

  if (!s.last_heartbeat) return 'offline'
  const hb = Date.parse(s.last_heartbeat)
  if (isNaN(hb)) return 'offline'

  const ageMs = now.getTime() - hb
  if (ageMs < 0) return 'offline'             // future timestamp = bogus
  if (ageMs <= ONLINE_WINDOW_MS && (s.status === 'active' || s.status === 'registered' || s.status === 'idle')) {
    return s.status === 'idle' && ageMs > 2 * 60_000 ? 'offline' : 'online'
  }
  return 'offline'
}
