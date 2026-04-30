'use client'
import Sidebar from '@/components/layout/Sidebar'
import { Wrench, CheckCircle2, XCircle, Clock } from 'lucide-react'

type Tool = {
  name: string
  type: string
  description: string
  status: 'connected' | 'coming_soon' | 'disconnected'
  agents: string[]
}

const TOOLS: Tool[] = [
  { name: 'Claude API',   type: 'AI',       description: 'Anthropic Claude — 核心推理引擎',                status: 'connected',    agents: ['全部 Agent'] },
  { name: 'Supabase',     type: 'Database', description: '数据库、Auth、实时功能',                          status: 'connected',    agents: ['Engineering', 'DevOps'] },
  { name: 'Vercel',       type: 'Deploy',   description: '前端部署与托管',                                 status: 'connected',    agents: ['DevOps'] },
  { name: 'GitHub',       type: 'Code',     description: '代码仓库与版本管理',                             status: 'coming_soon',  agents: ['Engineering', 'DevOps', 'QA'] },
  { name: 'Cursor',       type: 'IDE',      description: 'AI 辅助编码工具',                               status: 'coming_soon',  agents: ['Engineering'] },
  { name: 'Figma',        type: 'Design',   description: 'UI/UX 原型与设计',                              status: 'coming_soon',  agents: ['Design', 'Product'] },
  { name: 'Notion',       type: 'Docs',     description: '文档管理与知识库',                               status: 'coming_soon',  agents: ['Research', 'Product', 'Growth'] },
  { name: 'Slack',        type: 'Comms',    description: '团队沟通与通知',                                 status: 'coming_soon',  agents: ['全部 Agent'] },
  { name: 'Gmail',        type: 'Email',    description: '邮件收发与外联自动化',                            status: 'coming_soon',  agents: ['Growth'] },
  { name: 'Google Cal',   type: 'Calendar', description: '日程管理',                                      status: 'coming_soon',  agents: ['Strategic'] },
  { name: 'Blender',      type: '3D',       description: '3D 建模与动画渲染',                             status: 'coming_soon',  agents: ['3D Avatar'] },
  { name: 'Three.js',     type: '3D/Web',   description: 'Web 3D 实时渲染',                              status: 'coming_soon',  agents: ['3D Avatar', 'Engineering'] },
  { name: 'OpenAI API',   type: 'AI',       description: 'GPT-4o — 备用推理引擎',                         status: 'coming_soon',  agents: ['全部 Agent'] },
  { name: 'Gemini API',   type: 'AI',       description: 'Google Gemini — 多模态能力',                    status: 'coming_soon',  agents: ['Research', '3D Avatar'] },
  { name: 'Claude Code',  type: 'CLI',      description: 'Claude Code CLI — 本地代码执行',                 status: 'coming_soon',  agents: ['Engineering', 'DevOps'] },
]

const STATUS_META = {
  connected:    { label: '已连接',  color: 'text-emerald-400', icon: CheckCircle2, bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' },
  coming_soon:  { label: '即将支持', color: 'text-amber-400',  icon: Clock,        bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
  disconnected: { label: '未连接',  color: 'text-slate-400',  icon: XCircle,      bg: 'transparent',           border: 'var(--border)' },
}

export default function ToolsPage() {
  const connected = TOOLS.filter(t => t.status === 'connected').length

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
            {connected} / {TOOLS.length} 已连接
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-3 gap-4 max-w-5xl">
            {TOOLS.map(tool => {
              const meta = STATUS_META[tool.status]
              const StatusIcon = meta.icon
              return (
                <div key={tool.name} className="glass rounded-xl p-4 group">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{tool.name}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        {tool.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1" style={{ color: meta.color }}>
                      <StatusIcon size={11} />
                      <span className="text-[9px]">{meta.label}</span>
                    </div>
                  </div>
                  <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{tool.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {tool.agents.map(a => (
                      <span key={a} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--border)', color: 'var(--accent-light)' }}>
                        {a}
                      </span>
                    ))}
                  </div>
                  {tool.status === 'coming_soon' && (
                    <button className="mt-3 w-full text-[10px] py-1.5 rounded-lg transition-colors opacity-50 cursor-not-allowed"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      即将支持
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="glass rounded-xl p-5 mt-6 max-w-5xl">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Tool Layer 架构</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              工具层通过 MCP（Model Context Protocol）或 API 与 Agent 集成。每个 Agent 只能访问被授权的工具。
              即将支持 Claude MCP 标准，允许 Agent 直接调用 Cursor、GitHub、Figma 等外部工具完成真实任务。
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
