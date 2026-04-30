'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { CheckCircle2, XCircle, Clock, ExternalLink, Loader2, X, GitBranch, Trash2, Edit2, Database, Rocket, Lock } from 'lucide-react'

type Integration = {
  id: string
  tool_name: string
  tool_type: string
  auth_status: 'connected' | 'disconnected' | 'error'
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
}

interface FieldDef { key: string; label: string; type: 'text' | 'password'; required: boolean; placeholder?: string; help?: string }
interface ToolDef {
  key: string
  name: string
  type: string
  description: string
  actions: string[]
  fields: FieldDef[]
  allowed_agent_types: string[]
  external_link?: { label: string; url: string }
  icon: React.FC<{ size?: number; className?: string }>
}

const NATIVE_TOOLS: ToolDef[] = [
  {
    key: 'github',
    name: 'GitHub',
    type: 'API · PAT',
    description: '创建分支、提交文件、开 PR、建 Issue。Engineering Agent 可调用产出真实 PR。',
    actions: ['createPullRequest', 'createIssue', 'listRepos'],
    fields: [
      { key: 'access_token',  label: 'Personal Access Token', type: 'password', required: true,  placeholder: 'ghp_... 或 fine-grained token' },
      { key: 'default_repo',  label: '默认仓库（可选）',       type: 'text',     required: false, placeholder: 'username/repo-name' },
      { key: 'default_branch',label: '默认基础分支',           type: 'text',     required: false, placeholder: 'main' },
    ],
    allowed_agent_types: ['engineering', 'devops', 'qa'],
    external_link: { label: '创建 Fine-grained PAT', url: 'https://github.com/settings/tokens?type=beta' },
    icon: GitBranch,
  },
  {
    key: 'supabase',
    name: 'Supabase',
    type: 'Database · Service Role Key',
    description: '生成 SQL migration、静态校验 SQL、验证连接。无需 URL 也可使用本地校验。',
    actions: ['createMigrationFile', 'validateSql', 'listTables'],
    fields: [
      { key: 'project_url',     label: 'Project URL（可选，仅 listTables 用）', type: 'text',     required: false, placeholder: 'https://xxx.supabase.co' },
      { key: 'service_role_key',label: 'Service Role Key（可选）',              type: 'password', required: false, placeholder: 'eyJ...' },
    ],
    allowed_agent_types: ['engineering', 'devops', 'qa'],
    external_link: { label: 'Supabase Dashboard', url: 'https://supabase.com/dashboard' },
    icon: Database,
  },
  {
    key: 'vercel',
    name: 'Vercel',
    type: 'Deploy · API Token',
    description: '查询项目信息、部署列表、部署状态。DevOps Agent 可监控部署。',
    actions: ['getProject', 'listDeployments', 'getDeploymentStatus'],
    fields: [
      { key: 'access_token', label: 'API Token',           type: 'password', required: true,  placeholder: 'vercel_token...' },
      { key: 'team_id',      label: 'Team ID（可选）',     type: 'text',     required: false },
      { key: 'project_id',   label: '默认 Project ID（可选）', type: 'text',  required: false },
    ],
    allowed_agent_types: ['devops', 'engineering'],
    external_link: { label: '创建 Vercel Token', url: 'https://vercel.com/account/tokens' },
    icon: Rocket,
  },
]

const COMING_SOON: Array<{ name: string; type: string; description: string; agents: string[] }> = [
  { name: 'Cursor',      type: 'IDE',      description: 'AI 辅助编码',         agents: ['Engineering'] },
  { name: 'Figma',       type: 'Design',   description: 'UI/UX 原型',          agents: ['Design','Product'] },
  { name: 'Notion',      type: 'Docs',     description: '文档管理',            agents: ['Research','Product'] },
  { name: 'Slack',       type: 'Comms',    description: '团队通知',            agents: ['全部'] },
  { name: 'Gmail',       type: 'Email',    description: '邮件外联',            agents: ['Growth'] },
  { name: 'Google Cal',  type: 'Calendar', description: '日程管理',            agents: ['Strategic'] },
  { name: 'Blender',     type: '3D',       description: '3D 建模',             agents: ['3D Avatar'] },
  { name: 'OpenAI API',  type: 'AI',       description: 'GPT-4o 备用',         agents: ['全部'] },
  { name: 'Gemini API',  type: 'AI',       description: 'Gemini 多模态',       agents: ['Research'] },
]

export default function ToolsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTool, setEditingTool] = useState<{ tool: ToolDef; existing: Integration | null } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const r = await fetch('/api/tool-integrations')
    if (r.ok) setIntegrations(await r.json())
    setLoading(false)
  }

  async function disconnect(id: string) {
    if (!confirm('确定要断开此工具吗？所有 Agent 将无法继续调用。')) return
    await fetch(`/api/tool-integrations/${id}`, { method: 'DELETE' })
    setIntegrations(prev => prev.filter(i => i.id !== id))
  }

  function findIntegration(toolKey: string) {
    return integrations.find(i => i.tool_name === toolKey) ?? null
  }

  const connectedCount = integrations.filter(i => i.auth_status === 'connected').length

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-orange-400 tracking-widest uppercase mb-0.5">Multi-Agent OS</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tool Integrations</h1>
          </div>
          <div className="text-xs flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1 text-emerald-400">
              <Lock size={11} /> 密钥已加密存储 (AES-256-GCM)
            </span>
            <span>·</span>
            <span>{connectedCount} 已连接</span>
            <span>·</span>
            <span>{NATIVE_TOOLS.length} 可连接</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">
          {loading && <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && (
            <>
              {/* Connected */}
              {integrations.length > 0 && (
                <div className="mb-8">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">已连接工具</p>
                  <div className="grid grid-cols-2 gap-3">
                    {integrations.map(int => {
                      const def = NATIVE_TOOLS.find(t => t.key === int.tool_name)
                      const Icon = def?.icon ?? GitBranch
                      return (
                        <div key={int.id} className="glass-strong rounded-xl p-4 group" style={{ border: '1px solid rgba(52,211,153,0.2)' }}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Icon size={14} className="text-emerald-400" />
                              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{def?.name ?? int.tool_name}</p>
                            </div>
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <CheckCircle2 size={10} /> 已连接
                            </span>
                          </div>
                          <div className="text-[10px] space-y-0.5 mb-3" style={{ color: 'var(--text-muted)' }}>
                            {Object.entries(int.config ?? {}).map(([k, v]) => (
                              <p key={k}>{k}: <span style={{ color: 'var(--text-secondary)' }}>{String(v) || '—'}</span></p>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            {def && (
                              <button onClick={() => setEditingTool({ tool: def, existing: int })}
                                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors"
                                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <Edit2 size={9} /> 修改
                              </button>
                            )}
                            <button onClick={() => disconnect(int.id)}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors hover:text-red-400"
                              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              <Trash2 size={9} /> 断开
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Native */}
              <div className="mb-8">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">可连接工具（V1.5 已实现）</p>
                <div className="grid grid-cols-3 gap-3">
                  {NATIVE_TOOLS.map(t => {
                    const Icon = t.icon
                    const existing = findIntegration(t.key)
                    return (
                      <div key={t.key} className="glass rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-[var(--text-primary)]" />
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                          </div>
                          {existing ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <CheckCircle2 size={10} /> 已连接
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <XCircle size={10} /> 未连接
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded inline-block mb-2"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          {t.type}
                        </span>
                        <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {t.actions.map(a => (
                            <code key={a} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                              style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}>
                              {a}
                            </code>
                          ))}
                        </div>
                        {!existing && (
                          <button onClick={() => setEditingTool({ tool: t, existing: null })}
                            className="w-full text-xs px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--accent)', color: 'white' }}>
                            连接 {t.name}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Coming soon */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">即将支持</p>
                <div className="grid grid-cols-3 gap-3">
                  {COMING_SOON.map(t => (
                    <div key={t.name} className="glass rounded-xl p-3 opacity-60">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                        <span className="flex items-center gap-1 text-[9px] text-amber-400"><Clock size={8} /> 即将</span>
                      </div>
                      <span className="text-[9px] px-1 py-0.5 rounded inline-block mb-2"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        {t.type}
                      </span>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-xl p-5 mt-6">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">安全保障</p>
                <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-muted)' }}>
                  <li>🔒 所有 token / secret 字段使用 <code className="text-[var(--accent-light)]">AES-256-GCM</code> 加密存储</li>
                  <li>🛡️ Row Level Security 隔离用户数据，前端永不返回明文密钥（GET 接口已脱敏）</li>
                  <li>🔑 加密密钥来自 <code className="text-[var(--accent-light)]">ENCRYPTION_KEY</code> 环境变量（运维需妥善保管）</li>
                  <li>📝 工具调用日志结构化输出，不打印密钥内容</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </main>

      {editingTool && (
        <ConnectModal
          tool={editingTool.tool}
          existing={editingTool.existing}
          onClose={() => setEditingTool(null)}
          onSaved={() => { load(); setEditingTool(null) }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// Generic ConnectModal — works for any ToolDef
// ─────────────────────────────────────────────────
function ConnectModal({ tool, existing, onClose, onSaved }: {
  tool: ToolDef
  existing: Integration | null
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of tool.fields) {
      const existingVal = existing?.config?.[f.key]
      init[f.key] = typeof existingVal === 'string' ? existingVal : ''
    }
    return init
  })
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null)

  function setField(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  async function testConnection() {
    setTesting(true)
    // For test, send raw values (the user just typed plaintext)
    const r = await fetch('/api/tool-integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: tool.key, config: values }),
    })
    setTestResult(await r.json())
    setTesting(false)
  }

  async function save() {
    // Validate required fields (allow masked values when editing)
    for (const f of tool.fields) {
      if (!f.required) continue
      const v = values[f.key]
      if (!v || (existing && v.startsWith('••'))) {
        if (!existing) {
          setTestResult({ ok: false, message: `请填写 ${f.label}` })
          return
        }
      }
    }
    setSaving(true)
    const r = await fetch('/api/tool-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: tool.key,
        tool_type: 'api',
        config: values,
        allowed_agent_types: tool.allowed_agent_types,
      }),
    })
    if (r.ok) onSaved()
    else {
      const err = await r.json().catch(() => ({}))
      setTestResult({ ok: false, message: err?.error?.message ?? err?.error ?? '保存失败' })
    }
    setSaving(false)
  }

  const Icon = tool.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto"
        style={{ border: '1px solid var(--border-strong)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-[var(--text-primary)]" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {existing ? `编辑 ${tool.name} 连接` : `连接 ${tool.name}`}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div className="space-y-4">
          {tool.fields.map(f => (
            <div key={f.key}>
              <label className="label-xs">{f.label}{f.required ? ' *' : ''}</label>
              <input
                type={f.type}
                value={values[f.key] ?? ''}
                onChange={e => setField(f.key, e.target.value)}
                placeholder={existing && f.type === 'password' ? '留空保持原值，输入新值则覆盖' : f.placeholder}
                className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              {f.help && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{f.help}</p>}
            </div>
          ))}

          {tool.external_link && (
            <a href={tool.external_link.url} target="_blank" rel="noreferrer"
              className="text-[10px] inline-flex items-center gap-1"
              style={{ color: 'var(--accent-light)' }}>
              <ExternalLink size={9} /> {tool.external_link.label}
            </a>
          )}

          {testResult && (
            <div className="text-xs px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: testResult.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                border: `1px solid ${testResult.ok ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
                color: testResult.ok ? '#34d399' : '#f87171',
              }}>
              {testResult.ok ? <CheckCircle2 size={12} className="mt-0.5" /> : <XCircle size={12} className="mt-0.5" />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={testConnection} disabled={testing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {testing ? <Loader2 size={11} className="animate-spin" /> : null}
              测试连接
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>

          <div className="text-[10px] p-2 rounded-lg flex items-start gap-2"
            style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)', color: 'var(--text-muted)' }}>
            <Lock size={11} className="mt-0.5 text-emerald-400 shrink-0" />
            <span>敏感字段（token / secret / key）会用 <strong>AES-256-GCM</strong> 加密后存入数据库，前端只显示 <code>••••••••</code>。运行时由服务端解密使用，永不发回浏览器。</span>
          </div>
        </div>
      </div>
    </div>
  )
}
