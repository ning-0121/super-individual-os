'use client'
import { useState, useRef, useEffect, useCallback, use } from 'react'
import ReactMarkdown from 'react-markdown'
import { Plus, Trash2, ChevronRight, Loader2, Send } from 'lucide-react'
import type { AIMode } from '@/lib/claude'
import { MODE_LABELS } from '@/lib/claude'
import type { Conversation, Message, ChatMode } from '@/types'

const MODES: AIMode[] = ['ceo', 'coo', 'growth']

const AI_TO_CHAT_MODE: Record<AIMode, ChatMode> = {
  ceo: 'strategy', coo: 'execution', growth: 'strategy',
}

const QUICK_STARTS = [
  '当前项目最大风险是什么？',
  '帮我拆解未来 14 天的执行计划',
  '哪些任务应该现在开始 vs 哪些应该推迟？',
]

export default function ProjectChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [mode, setMode] = useState<AIMode>('ceo')
  const [conversations, setConvs] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    fetch(`/api/projects/${projectId}/conversations`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setConvs(Array.isArray(d) ? d : []))
  }, [projectId])

  const loadConv = useCallback(async (convId: string) => {
    setActiveId(convId)
    const r = await fetch(`/api/conversations/${convId}/messages`).catch(() => null)
    if (r?.ok) setMessages(await r.json())
    else setMessages([])
  }, [])

  function newConv() { setActiveId(null); setMessages([]) }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput(''); setLoading(true)

    let convId = activeId
    if (!convId) {
      // Create project-bound conversation
      const r = await fetch(`/api/projects/${projectId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: AI_TO_CHAT_MODE[mode], title: content.slice(0, 30) }),
      })
      const conv = await r.json()
      convId = conv.id
      setActiveId(convId)
      setConvs(prev => [conv, ...prev])
    }

    const userMsg: Message = {
      id: Date.now().toString(), conversation_id: convId!,
      role: 'user', content, created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

    const res = await fetch('/api/ai/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, userInput: content, conversationId: convId, messageHistory: history, projectId }),
    })
    if (!res.ok || !res.body) { setLoading(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let aiContent = ''
    setMessages(prev => [...prev, {
      id: (Date.now()+1).toString(), conversation_id: convId!,
      role: 'assistant', content: '', created_at: new Date().toISOString(),
    }])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      aiContent += decoder.decode(value)
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], content: aiContent }
        return next
      })
    }
    setLoading(false)
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left — conversation list */}
      <div className="w-56 border-r border-[var(--border)] flex flex-col shrink-0 glass">
        <div className="p-3 border-b border-[var(--border)]">
          <button onClick={newConv}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={11} /> 新对话
          </button>
        </div>
        <div className="p-2 border-b border-[var(--border)]">
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs mb-0.5"
              style={{
                background: mode === m ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: mode === m ? 'var(--accent-light)' : 'var(--text-secondary)',
                border: `1px solid ${mode === m ? 'var(--border-strong)' : 'transparent'}`,
              }}>
              <span>{MODE_LABELS[m].label}</span>
              {mode === m && <ChevronRight size={10} />}
            </button>
          ))}
        </div>
        <nav className="flex-1 overflow-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>暂无对话</p>
          )}
          {conversations.map(c => (
            <div key={c.id} onClick={() => loadConv(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer text-xs transition-colors
                ${activeId === c.id ? 'bg-white/8 text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-white/5'}`}>
              <span className="truncate flex-1">{c.title}</span>
            </div>
          ))}
        </nav>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">

        <div className="flex-1 overflow-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="max-w-2xl mx-auto mt-8">
              <p className="text-center text-[var(--text-muted)] text-sm mb-1">
                {MODE_LABELS[mode].label} · 项目内对话（自动注入项目上下文）
              </p>
              <p className="text-center text-[10px] mb-6" style={{ color: 'var(--text-muted)' }}>
                Linda 知道这个项目的目标 / 任务 / Agent 输出 / 记忆
              </p>
              <div className="space-y-2">
                {QUICK_STARTS.map(t => (
                  <button key={t} onClick={() => send(t)}
                    className="w-full text-left px-4 py-3 glass glass-hover rounded-xl text-sm"
                    style={{ color: 'var(--text-secondary)' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-xl px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
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
                      <Loader2 size={12} className="animate-spin text-[var(--accent-light)]" />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>AI 分析中...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--border)] p-4 glass shrink-0">
          <div className="flex gap-3">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={`${MODE_LABELS[mode].label}：在「项目」上下文中提问...`}
              rows={2}
              className="flex-1 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              className="px-5 rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
