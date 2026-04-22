'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { AIMode, MODE_LABELS } from '@/lib/claude'
import { Conversation, Message } from '@/types'
import { getConversations, createConversation, getMessages, deleteConversation } from '@/services/conversations'

const MODES: AIMode[] = ['ceo', 'coo', 'growth']

const QUICK_STARTS: { text: string; mode: AIMode }[] = [
  { text: '我应该先做什么？帮我判断项目优先级', mode: 'ceo' },
  { text: '帮我拆解未来 90 天的执行计划',       mode: 'coo' },
  { text: '分析我现在的资源应该如何配置',         mode: 'ceo' },
]

export default function ChatPage() {
  const [mode, setMode]             = useState<AIMode>('ceo')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { getConversations().then(setConversations).catch(console.error) }, [])

  const loadConversation = useCallback(async (id: string) => {
    setLoadingHistory(true)
    setActiveId(id)
    const msgs = await getMessages(id)
    setMessages(msgs)
    setLoadingHistory(false)
  }, [])

  function newConversation() { setActiveId(null); setMessages([]) }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeId === id) newConversation()
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    setLoading(true)

    let convId = activeId
    if (!convId) {
      const conv = await createConversation(mode as unknown as import('@/types').ChatMode, content)
      convId = conv.id
      setActiveId(convId)
      setConversations(prev => [conv, ...prev])
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      conversation_id: convId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    // Build history for context (last 10 messages)
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

    const res = await fetch('/api/ai/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, userInput: content, conversationId: convId, messageHistory: history }),
    })

    if (!res.ok) { setLoading(false); return }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let aiContent = ''
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      conversation_id: convId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
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

  return (
    <div className="flex h-screen">
      {/* Sidebar: conversation list */}
      <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-800">
          <h1 className="text-sm font-semibold text-gray-200 px-2 mb-2">超级个体 OS</h1>
          <button onClick={newConversation}
            className="w-full text-xs px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
            + 新对话
          </button>
        </div>
        <nav className="flex-1 overflow-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-600 px-3 py-4 text-center">暂无对话</p>
          )}
          {conversations.map(c => (
            <div key={c.id} onClick={() => loadConversation(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
                ${activeId === c.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
              <span className="truncate flex-1 text-xs">{c.title}</span>
              <button onClick={e => handleDelete(c.id, e)}
                className="hidden group-hover:block text-gray-600 hover:text-red-400 ml-1 shrink-0 text-xs">✕</button>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 space-y-0.5">
          {[
            { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
            { href: '/projects',  label: '项目',      icon: '◈' },
            { href: '/tasks',     label: '执行看板',   icon: '◻' },
            { href: '/settings',  label: '设置',       icon: '◉' },
          ].map(item => (
            <a key={item.href} href={item.href}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800/50 transition-colors">
              <span>{item.icon}</span>{item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mode switcher */}
        <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-2 shrink-0">
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap
                ${mode === m ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {MODE_LABELS[m].label}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-600 truncate">
            {MODE_LABELS[mode].desc}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
          {loadingHistory && <p className="text-center text-gray-600 text-sm mt-16">加载中...</p>}

          {!loadingHistory && messages.length === 0 && (
            <div className="max-w-2xl mx-auto mt-8">
              <p className="text-gray-600 text-sm text-center mb-6">
                {MODE_LABELS[mode].label} 模式 · 选择快捷入口或直接输入
              </p>
              <div className="space-y-2">
                {QUICK_STARTS.map(({ text, mode: m }) => (
                  <button key={text}
                    onClick={() => { setMode(m); send(text) }}
                    className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700
                      hover:border-gray-600 rounded-xl text-sm text-gray-300 hover:text-white transition-colors group">
                    <span className="text-gray-500 text-xs mr-2">{MODE_LABELS[m].label}</span>
                    {text}
                    <span className="text-gray-600 ml-2 group-hover:text-gray-400">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-xl px-4 py-3 rounded-xl text-sm bg-blue-600 text-white">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-3xl w-full">
                  {msg.content ? (
                    <div className="prose prose-invert prose-sm max-w-none
                      prose-headings:text-white prose-headings:font-semibold
                      prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2
                      prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1
                      prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-1
                      prose-li:text-gray-300 prose-li:my-0.5
                      prose-strong:text-white
                      prose-table:text-sm prose-table:border-collapse
                      prose-th:bg-gray-800 prose-th:text-gray-300 prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-gray-700
                      prose-td:text-gray-300 prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-700
                      prose-code:text-blue-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
                      bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                      <span className="text-gray-500 text-sm animate-pulse">正在分析...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-4 shrink-0">
          <div className="flex gap-3">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={`${MODE_LABELS[mode].label}：输入你的问题或项目情况...`}
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white
                placeholder-gray-600 resize-none focus:outline-none focus:border-gray-600" />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              className="px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-xl transition-colors">
              {loading ? '...' : '发送'}
            </button>
          </div>
          <p className="text-xs text-gray-700 mt-2 px-1">Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>
    </div>
  )
}
