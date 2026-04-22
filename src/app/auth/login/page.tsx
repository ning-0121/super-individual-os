'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-white">超级个体 OS</h1>
          <p className="text-sm text-gray-500 mt-1">登录你的账号</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
            placeholder="密码"
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
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600">或</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <button
          onClick={handleGoogle}
          className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm
            font-medium py-3 rounded-xl transition-colors"
        >
          Google 登录
        </button>

        <p className="text-center text-xs text-gray-500 mt-6">
          没有账号？{' '}
          <Link href="/auth/register" className="text-blue-400 hover:text-blue-300">注册</Link>
        </p>
      </div>
    </div>
  )
}
