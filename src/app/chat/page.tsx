'use client'
import { useState, useRef, useEffect } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ChatMode } from '@/types'

const modes: { value: ChatMode; label: string; desc: string }[] = [
  { value: 'strategy', label: '战略顾问', desc: '优先级判断、Stop/Continue/Pivot' },
  { value: 'execution', label: '执行拆解', desc: '目标拆解、任务计划、验收标准' },
  { value: 'review', label: '复盘分析', desc: '偏差归因、下轮修正方向' },
]

interface Message { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('strategy')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...messages, userMsg], mode }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let content = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      content += decoder.decode(value)
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content }
        return next
      })
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">

        {/* Mode Switcher */}
        <div className="border-b border-gray-800 px-6 py-3 flex gap-2">
          {modes.map(m => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors
                ${mode === m.value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {m.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-600 self-center">
            {modes.find(m => m.value === mode)?.desc}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-600 mt-16 text-sm">
              当前模式：{modes.find(m => m.value === mode)?.label}<br />
              <span className="text-xs">发送消息开始对话</span>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl px-4 py-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'}`}>
                {msg.content || <span className="text-gray-500 animate-pulse">思考中...</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-4">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }}}
              placeholder="输入你的问题或项目情况..."
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white
                placeholder-gray-500 resize-none focus:outline-none focus:border-gray-600"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                text-white text-sm rounded-xl transition-colors"
            >
              发送
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 px-1">Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>
    </div>
  )
}
