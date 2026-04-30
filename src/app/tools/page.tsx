'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Wrench, CheckCircle2, XCircle, Clock, ExternalLink, Loader2, X, GitBranch, Trash2, Edit2 } from 'lucide-react'

type Integration = {
  id: string
  tool_name: string
  tool_type: string
  auth_status: 'connected' | 'disconnected' | 'error'
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
}

const COMING_SOON: Array<{ name: string; type: string; description: string; agents: string[] }> = [
  { name: 'Supabase',     type: 'Database', description: '数据库迁移、Auth 管理',                     agents: ['Engineering','DevOps'] },
  { name: 'Vercel',       type: 'Deploy',   description: '部署、环境变量、域名',                       agents: ['DevOps'] },
  { name: 'Cursor',       type: 'IDE',      description: 'AI 辅助编码',                              agents: ['Engineering'] },
  { name: 'Figma',        type: 'Design',   description: 'UI/UX 原型',                              agents: ['Design','Product'] },
  { name: 'Notion',       type: 'Docs',     description: '文档管理',                                agents: ['Research','Product','Growth'] },
  { name: 'Slack',        type: 'Comms',    description: '团队通知',                                agents: ['全部'] },
  { name: 'Gmail',        type: 'Email',    description: '邮件外联',                                agents: ['Growth'] },
  { name: 'Google Cal',   type: 'Calendar', description: '日程管理',                                agents: ['Strategic'] },
  { name: 'Blender',      type: '3D',       description: '3D 建模',                                 agents: ['3D Avatar'] },
  { name: 'Three.js',     type: '3D/Web',   description: 'Web 3D 渲染',                            agents: ['3D Avatar','Engineering'] },
  { name: 'OpenAI API',   type: 'AI',       description: 'GPT-4o 备用',                            agents: ['全部'] },
  { name: 'Gemini API',   type: 'AI',       description: 'Gemini 多模态',                          agents: ['Research','3D Avatar'] },
  { name: 'Claude Code',  type: 'CLI',      description: 'Claude Code CLI',                       agents: ['Engineering','DevOps'] },
]

export default function ToolsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading]           = useState(true)
  const [showGitBranchModal, setShowGitBranchModal] = useState(false)
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null)

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

  const githubIntegration = integrations.find(i => i.tool_name === 'github')
  const builtInTools = ['github']  // Tools with handlers (V1.2)

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-orange-400 tracking-widest uppercase mb-0.5">Multi-Agent OS</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tool Integrations</h1>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {integrations.filter(i => i.auth_status === 'connected').length} 已连接
            <span className="mx-2">·</span>
            {builtInTools.length} 可连接
            <span className="mx-2">·</span>
            {COMING_SOON.length} 即将支持
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">
          {loading && <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && (
            <>
              {/* ── Section 1: Active integrations ── */}
              {integrations.length > 0 && (
                <div className="mb-8">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">已连接工具</p>
                  <div className="grid grid-cols-2 gap-3">
                    {integrations.map(int => (
                      <div key={int.id} className="glass-strong rounded-xl p-4 group" style={{ border: '1px solid rgba(52,211,153,0.2)' }}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {int.tool_name === 'github' && <GitBranch size={14} className="text-emerald-400" />}
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{int.tool_name}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <CheckCircle2 size={10} /> 已连接
                            </span>
                          </div>
                        </div>

                        {/* Config preview */}
                        <div className="text-[10px] space-y-0.5 mb-3" style={{ color: 'var(--text-muted)' }}>
                          {Object.entries(int.config ?? {}).map(([k, v]) => (
                            <p key={k}>{k}: <span style={{ color: 'var(--text-secondary)' }}>{String(v) || '—'}</span></p>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          {int.tool_name === 'github' && (
                            <button onClick={() => { setEditingIntegration(int); setShowGitBranchModal(true) }}
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
                    ))}
                  </div>
                </div>
              )}

              {/* ── Section 2: Available (V1.2 native) ── */}
              <div className="mb-8">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">可连接工具（V1.2 已实现）</p>
                <div className="grid grid-cols-2 gap-3">
                  <ToolConnectCard
                    name="GitHub"
                    icon={<GitBranch size={14} className="text-[var(--text-primary)]" />}
                    type="API · PAT"
                    description="创建分支、提交文件、开 PR、建 Issue。Engineering Agent 可以调用此工具产出真实 PR。"
                    actions={['createPullRequest', 'createIssue', 'listRepos']}
                    connected={!!githubIntegration}
                    onConnect={() => { setEditingIntegration(null); setShowGitBranchModal(true) }}
                  />
                </div>
              </div>

              {/* ── Section 3: Coming soon ── */}
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
                      <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {t.agents.map(a => (
                          <span key={a} className="text-[8px] px-1 py-0.5 rounded"
                            style={{ background: 'rgba(99,102,241,0.06)', color: 'var(--accent-light)' }}>
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-xl p-5 mt-6">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Tool Layer 架构</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Agent 在 system prompt 中声明 <code className="text-[var(--accent-light)]">tools_allowed</code>。
                  当用户已连接对应工具时，AI Gateway 会注入工具能力清单 → Claude 在 JSON 输出中生成 <code>tool_calls[]</code> →
                  Tool Router 校验权限并执行 → 结果保存到 <code>task_runs.tool_calls</code> → UI 显示真实产出（如 PR URL）。
                </p>
              </div>
            </>
          )}
        </div>
      </main>

      {/* GitHub Connect Modal */}
      {showGitBranchModal && (
        <GitHubConnectModal
          existing={editingIntegration}
          onClose={() => { setShowGitBranchModal(false); setEditingIntegration(null) }}
          onSaved={() => { load(); setShowGitBranchModal(false); setEditingIntegration(null) }}
        />
      )}
    </div>
  )
}

function ToolConnectCard({ name, icon, type, description, actions, connected, onConnect }: {
  name: string
  icon: React.ReactNode
  type: string
  description: string
  actions: string[]
  connected: boolean
  onConnect: () => void
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</p>
        </div>
        {connected ? (
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
        {type}
      </span>
      <p className="text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {actions.map(a => (
          <code key={a} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}>
            {a}
          </code>
        ))}
      </div>
      {!connected && (
        <button onClick={onConnect}
          className="w-full text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'var(--accent)', color: 'white' }}>
          连接 {name}
        </button>
      )}
    </div>
  )
}

function GitHubConnectModal({ existing, onClose, onSaved }: {
  existing: Integration | null
  onClose: () => void
  onSaved: () => void
}) {
  const [token, setToken]             = useState('')
  const [defaultRepo, setDefaultRepo] = useState((existing?.config?.default_repo as string) ?? '')
  const [defaultBranch, setDefaultBranch] = useState((existing?.config?.default_branch as string) ?? 'main')
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null)
  const [saving, setSaving]     = useState(false)

  async function testConnection() {
    if (!token) { setTestResult({ ok: false, message: '请先输入 PAT' }); return }
    setTesting(true)
    const r = await fetch('/api/tool-integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'github', config: { access_token: token } }),
    })
    const result = await r.json()
    setTestResult(result)
    setTesting(false)
  }

  async function save() {
    if (!token && !existing) { setTestResult({ ok: false, message: '请输入 PAT' }); return }
    setSaving(true)

    // If editing without new token, keep existing — but our GET masks it. So we need user to re-enter or skip update.
    const config: Record<string, unknown> = {
      default_repo: defaultRepo,
      default_branch: defaultBranch,
    }
    if (token) config.access_token = token

    const r = await fetch('/api/tool-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'github',
        tool_type: 'api',
        config,
        allowed_agent_types: ['engineering', 'devops', 'qa'],
      }),
    })

    if (r.ok) {
      onSaved()
    } else {
      const err = await r.json()
      setTestResult({ ok: false, message: err.error ?? '保存失败' })
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto"
        style={{ border: '1px solid var(--border-strong)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-[var(--text-primary)]" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {existing ? '编辑 GitHub 连接' : '连接 GitHub'}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div className="space-y-4">
          {/* PAT input */}
          <div>
            <label className="label-xs">Personal Access Token (PAT)</label>
            <input type="password" value={token} onChange={e => { setToken(e.target.value); setTestResult(null) }}
              placeholder={existing ? '留空保持原 token，输入新值则覆盖' : 'ghp_… 或 fine-grained token'}
              className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer"
              className="text-[10px] mt-1.5 inline-flex items-center gap-1"
              style={{ color: 'var(--accent-light)' }}>
              <ExternalLink size={9} /> 创建 Fine-grained PAT（需 Contents + Pull requests 读写权限）
            </a>
          </div>

          {/* Default repo */}
          <div>
            <label className="label-xs">默认仓库（可选）</label>
            <input value={defaultRepo} onChange={e => setDefaultRepo(e.target.value)}
              placeholder="username/repo-name"
              className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Agent 调用时未指定 repo 则使用此默认值
            </p>
          </div>

          {/* Default branch */}
          <div>
            <label className="label-xs">默认基础分支</label>
            <input value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>

          {/* Test result */}
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

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={testConnection} disabled={testing || !token}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {testing ? <Loader2 size={11} className="animate-spin" /> : null}
              测试连接
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              {saving ? '保存中...' : '保存连接'}
            </button>
          </div>

          <div className="text-[10px] p-2 rounded-lg" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', color: 'var(--text-muted)' }}>
            <p className="text-amber-400 font-semibold mb-1">⚠ 安全提示</p>
            <p>PAT 以明文存储在 Supabase（仅你账号可读，已开启 RLS）。生产环境建议用 Supabase Vault 或 OAuth。</p>
            <p className="mt-1">建议为 Agent 创建专用 PAT，权限仅授予测试仓库。</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Wrench icon imported via lucide-react; not used directly anymore but kept to satisfy ESLint
void Wrench
