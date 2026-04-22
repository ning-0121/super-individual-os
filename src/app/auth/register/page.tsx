'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
  }

  if (done) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-white font-medium mb-2">验证邮件已发送</p>
        <p className="text-sm text-gray-400">请检查 {email} 并点击验证链接</p>
        <Link href="/auth/login" className="text-blue-400 text-sm mt-4 block">返回登录</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-white">超级个体 OS</h1>
          <p className="text-sm text-gray-500 mt-1">创建账号</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white
              placeholder-gray-500 focus:outline-none focus:border-gray-500"
          />
          <input
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white
              placeholder-gray-500 focus:outline-none focus:border-gray-500"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm
              font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
        <p className="text-center text-xs text-gray-500 mt-6">
          已有账号？{' '}
          <Link href="/auth/login" className="text-blue-400 hover:text-blue-300">登录</Link>
        </p>
      </div>
    </div>
  )
}
