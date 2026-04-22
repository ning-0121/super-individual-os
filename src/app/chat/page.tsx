'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ChatMode, Conversation, Message } from '@/types'
import { getConversations, createConversation, getMessages, saveMessage, deleteConversation } from '@/services/conversations'

const modes: { value: ChatMode; label: string; desc: string }[] = [
  { value: 'strategy', label: '战略顾问', desc: '优先级判断、Stop/Continue/Pivot' },
  { value: 'execution', label: '执行拆解', desc: '目标拆解、任务计划、验收标准' },
  { value: 'review', label: '复盘分析', desc: '偏差归因、下轮修正方向' },
]

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('strategy')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    getConversations().then(setConversations).catch(console.error)
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    setLoadingHistory(true)
    setActiveId(id)
    const msgs = await getMessages(id)
    setMessages(msgs)
    setLoadingHistory(false)
  }, [])

  function newConversation() {
    setActiveId(null)
    setMessages([])
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeId === id) newConversation()
  }

  async function send() {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setLoading(true)

    let convId = activeId
    if (!convId) {
      const conv = await createConversation(mode, text)
      convId = conv.id
      setActiveId(convId)
      setConversations(prev => [conv, ...prev])
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      conversation_id: convId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    await saveMessage(convId, 'user', text)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        mode,
        conversationId: convId,
      }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let content = ''
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      conversation_id: convId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantMsg])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      content += decoder.decode(value)
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...assistantMsg, content }
        return next
      })
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen">
      {/* Left: conversation list */}
      <div className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-800">
          <h1 className="text-sm font-semibold text-gray-200 px-2 mb-2">超级个体 OS</h1>
          <button
            onClick={newConversation}
            className="w-full text-xs px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            + 新对话
          </button>
        </div>
        <nav className="flex-1 overflow-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-600 px-3 py-4 text-center">暂无对话</p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
                ${activeId === c.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button
                onClick={e => handleDelete(c.id, e)}
                className="hidden group-hover:block text-gray-600 hover:text-red-400 ml-1 shrink-0"
              >✕</button>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 space-y-1">
          {[
            { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
            { href: '/projects', label: '项目', icon: '◈' },
            { href: '/tasks', label: '执行看板', icon: '◻' },
            { href: '/settings', label: '设置', icon: '◉' },
          ].map(item => (
            <a key={item.href} href={item.href}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800/50 transition-colors">
              <span>{item.icon}</span>{item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Right: chat */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-800 px-6 py-3 flex gap-2">
          {modes.map(m => (
            <button key={m.value} onClick={() => setMode(m.value)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors
                ${mode === m.value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {m.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-600 self-center">
            {modes.find(m => m.value === mode)?.desc}
          </span>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {loadingHistory && <p className="text-center text-gray-600 text-sm mt-16">加载中...</p>}
          {!loadingHistory && messages.length === 0 && (
            <div className="mt-12 max-w-lg mx-auto">
              <p className="text-center text-gray-600 text-sm mb-6">
                {modes.find(m => m.value === mode)?.label} 模式 · 选择快捷入口或直接输入
              </p>
              <div className="space-y-2">
                {[
                  { text: '帮我判断应该先做什么', mode: 'strategy' as const },
                  { text: '帮我拆解未来 90 天计划', mode: 'execution' as const },
                  { text: '帮我分析我的项目优先级', mode: 'strategy' as const },
                ].map(({ text, mode: m }) => (
                  <button key={text}
                    onClick={() => { setMode(m); setInput(text) }}
                    className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700
                      hover:border-gray-600 rounded-xl text-sm text-gray-300 hover:text-white transition-colors">
                    {text} →
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl px-4 py-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed
                ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'}`}>
                {msg.content || <span className="text-gray-500 animate-pulse">思考中...</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-800 p-4">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="输入你的问题或项目情况..."
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white
                placeholder-gray-500 resize-none focus:outline-none focus:border-gray-600"
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-xl transition-colors">
              发送
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 px-1">Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>
    </div>
  )
}
