'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { AlertTriangle, Brain, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { AIMode } from '@/lib/claude'
import { MODE_LABELS } from '@/lib/claude'
import type { DecisionSignal } from '@/lib/ai/decision-engine'
import { RiskBadge } from '@/components/ui/risk-badge'
import { Conversation, Message } from '@/types'
import { getConversations, createConversation, getMessages, deleteConversation } from '@/services/conversations'

const MODES: AIMode[] = ['ceo', 'coo', 'growth']

const QUICK_STARTS: { text: string; mode: AIMode }[] = [
  { text: '我应该先做什么？帮我判断现在的优先级', mode: 'ceo' },
  { text: '帮我拆解未来 90 天的执行计划',          mode: 'coo' },
  { text: '如果只能押注一个方向，我该选哪个？',     mode: 'ceo' },
]

export default function ChatPage() {
  const [mode, setMode]           = useState<AIMode>('ceo')
  const [conversations, setConvs] = useState<Conversation[]>([])
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)
  const [signal, setSignal]       = useState<DecisionSignal | null>(null)
  const [showCtx, setShowCtx]     = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { getConversations().then(setConvs).catch(console.error) }, [])

  const loadConv = useCallback(async (id: string) => {
    setLoadingHist(true); setActiveId(id)
    setMessages(await getMessages(id))
    setLoadingHist(false)
  }, [])

  function newConv() { setActiveId(null); setMessages([]); setSignal(null) }

  async function delConv(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteConversation(id)
    setConvs(prev => prev.filter(c => c.id !== id))
    if (activeId === id) newConv()
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput(''); setLoading(true)

    let convId = activeId
    if (!convId) {
      const conv = await createConversation(mode as unknown as import('@/types').ChatMode, content)
      convId = conv.id
      setActiveId(convId)
      setConvs(prev => [conv, ...prev])
    }

    const userMsg: Message = {
      id: Date.now().toString(), conversation_id: convId,
      role: 'user', content, created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

    const res = await fetch('/api/ai/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, userInput: content, conversationId: convId, messageHistory: history }),
    })

    if (!res.ok) { setLoading(false); return }

    // Read decision signal from header
    try {
      const sig = res.headers.get('X-Decision-Signal')
      if (sig) setSignal(JSON.parse(sig))
    } catch {}

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let aiContent = ''
    const aiMsg: Message = {
      id: (Date.now()+1).toString(), conversation_id: convId,
      role: 'assistant', content: '', created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, aiMsg])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      aiContent += decoder.decode(value)
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...aiMsg, content: aiContent }
        return next
      })
    }
    setLoading(false)
  }

  const modeColors: Record<AIMode, string> = {
    ceo: 'text-[var(--accent-light)] border-[var(--accent)]',
    coo: 'text-cyan-400 border-cyan-500',
    growth: 'text-emerald-400 border-emerald-500',
  }
  const modeActive: Record<AIMode, string> = {
    ceo: 'bg-indigo-950/60 text-[var(--accent-light)] border border-[var(--border-strong)]',
    coo: 'bg-cyan-950/50 text-cyan-400 border border-cyan-900',
    growth: 'bg-emerald-950/50 text-emerald-400 border border-emerald-900',
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* ── Left: conversation list ── */}
      <div className="w-52 border-r border-[var(--border)] flex flex-col glass shrink-0">
        <div className="p-3 border-b border-[var(--border)]">
          <p className="text-xs font-mono text-[var(--accent-light)] tracking-widest px-2 mb-2">SUPER OS</p>
          <button onClick={newConv}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={12} /> 新对话
          </button>
        </div>

        {/* Mode picker */}
        <div className="p-2 border-b border-[var(--border)]">
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs mb-0.5 transition-all
                ${mode === m ? modeActive[m] : 'text-[var(--text-secondary)] hover:bg-white/5'}`}>
              <span>{MODE_LABELS[m].label}</span>
              {mode === m && <ChevronRight size={10} />}
            </button>
          ))}
        </div>

        {/* Conv list */}
        <nav className="flex-1 overflow-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-[10px] text-[var(--text-muted)] text-center py-4">暂无对话</p>
          )}
          {conversations.map(c => (
            <div key={c.id} onClick={() => loadConv(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors
                ${activeId === c.id ? 'bg-white/8 text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-secondary)]'}`}>
              <span className="truncate flex-1">{c.title}</span>
              <button onClick={e => delConv(c.id, e)}
                className="hidden group-hover:flex items-center text-[var(--text-muted)] hover:text-red-400 transition-colors">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </nav>

        {/* Nav links */}
        <div className="p-2 border-t border-[var(--border)] space-y-0.5">
          {[
            { href: '/dashboard', label: 'Command Center' },
            { href: '/projects',  label: 'Portfolio' },
            { href: '/tasks',     label: 'Execution Board' },
            { href: '/settings',  label: 'Second Brain' },
          ].map(item => (
            <a key={item.href} href={item.href}
              className="block px-3 py-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-white/5 transition-colors">
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Middle: main chat ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between glass shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full border ${modeColors[mode]}`} style={{ background: 'rgba(0,0,0,0.3)' }}>
              {MODE_LABELS[mode].label}
            </span>
            <span className="text-xs text-[var(--text-muted)]">{MODE_LABELS[mode].desc}</span>
          </div>
          <button onClick={() => setShowCtx(!showCtx)}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
            <Brain size={10} /> Context {showCtx ? '▶' : '◀'}
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-6 py-6 space-y-5">
          {loadingHist && <p className="text-center text-[var(--text-muted)] text-sm mt-16">加载历史...</p>}

          {!loadingHist && messages.length === 0 && (
            <div className="max-w-2xl mx-auto mt-8">
              <p className="text-center text-[var(--text-muted)] text-sm mb-6">
                {MODE_LABELS[mode].label} · 选择快捷入口或直接输入
              </p>
              <div className="space-y-2">
                {QUICK_STARTS.map(({ text, mode: m }) => (
                  <button key={text} onClick={() => { setMode(m); send(text) }}
                    className="w-full text-left px-4 py-3.5 glass glass-hover rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
                    <span className="text-[10px] text-[var(--text-muted)] mr-2 uppercase">{MODE_LABELS[m].label}</span>
                    {text}
                    <span className="text-[var(--text-muted)] ml-2 group-hover:text-[var(--accent-light)]">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-xl px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-3xl w-full">
                  {msg.content ? (
                    <div className="glass rounded-xl p-5 ai-prose">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="glass rounded-xl p-5 flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                        ))}
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">AI 分析中...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] p-4 glass shrink-0">
          <div className="flex gap-3">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={`${MODE_LABELS[mode].label}：输入问题或项目情况...`}
              rows={2}
              className="flex-1 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              className="px-5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {loading ? '···' : '发送'}
            </button>
          </div>
          <p className="text-[10px] mt-2 px-1" style={{ color: 'var(--text-muted)' }}>Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>

      {/* ── Right: Context Engine panel ── */}
      {showCtx && (
        <div className="w-64 border-l border-[var(--border)] glass flex flex-col shrink-0 overflow-auto">
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <Brain size={12} className="text-violet-400" />
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Context Engine</span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>AI 本次调用的上下文信号</p>
          </div>

          <div className="p-4 space-y-4 flex-1">
            {/* Decision Signal */}
            {signal ? (
              <>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Decision Signal</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>检测模式</span>
                      <span className={`font-mono ${modeColors[signal.detectedMode as AIMode] || 'text-[var(--text-secondary)]'}`}>
                        {signal.detectedMode.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>追问上限</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{signal.maxFollowUpQuestions} 个</span>
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      {signal.currentStage}
                    </div>
                  </div>
                </div>

                {signal.riskFlags.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <AlertTriangle size={9} className="text-amber-400" /> Risk Flags
                    </p>
                    <div className="space-y-1.5">
                      {signal.riskFlags.map(r => (
                        <div key={r.code} className={`text-[10px] px-2 py-1.5 rounded border risk-${r.severity} flex items-center gap-1.5`}>
                          <span>{r.severity === 'high' ? '⚠' : '◎'}</span>
                          <span className="font-medium">{r.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Required Blocks</p>
                  <div className="space-y-1">
                    {signal.requiredOutputBlocks.map(b => (
                      <div key={b} className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <span className="text-emerald-500">✓</span> {b}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>发送消息后</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>显示上下文分析</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
