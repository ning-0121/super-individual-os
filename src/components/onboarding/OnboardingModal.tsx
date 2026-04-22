'use client'
import { useState } from 'react'
import { completeOnboarding, generateResult, OnboardingResult } from '@/services/onboarding'

const GOALS = ['做副业赚钱', '做自己的公司', '提高收入', '管理多个项目', '做内容/IP', '做外贸/电商', '其他']
const PAINS = ['注意力分散', '不知道做什么', '做很多但没有结果', '缺少执行力', '项目太多', '不会销售和增长', '其他']

interface Props { onComplete: () => void }

export default function OnboardingModal({ onComplete }: Props) {
  const [step, setStep]       = useState(1)
  const [goal, setGoal]       = useState('')
  const [pain, setPain]       = useState('')
  const [result, setResult]   = useState<OnboardingResult | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  function goNext() {
    if (step === 3) {
      const r = generateResult(goal || '其他', pain || '其他')
      setResult(r)
      setStep(4)
    } else {
      setStep(s => s + 1)
    }
  }

  async function handleComplete() {
    setSaving(true)
    setError('')
    try {
      await completeOnboarding(
        { goal: goal || '其他', pain: pain || '其他' },
        result!
      )
      onComplete()
    } catch (e) {
      setError('保存失败，请重试')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-8">

        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {[1,2,3,4].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-gray-700'}`} />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <div className="text-2xl mb-1">👋</div>
              <h2 className="text-xl font-semibold text-white mb-3">欢迎来到 Super Individual OS</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                这个系统会帮助你完成<span className="text-white">战略判断</span>、
                <span className="text-white">项目管理</span>、
                <span className="text-white">执行拆解</span>和
                <span className="text-white">长期成长</span>。
              </p>
              <p className="text-gray-500 text-sm mt-3">花 1 分钟回答几个问题，系统会为你生成个性化的起点。</p>
            </div>
            <div className="flex gap-3">
              <button onClick={goNext}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
                开始设置
              </button>
              <button onClick={onComplete}
                className="px-4 py-3 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                跳过
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Goal */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-gray-500 mb-2">第 2 步 · 共 4 步</p>
              <h2 className="text-lg font-semibold text-white mb-1">你现在最重要的目标是什么？</h2>
              <p className="text-gray-500 text-xs">选一个最接近的，可以跳过</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map(g => (
                <button key={g} onClick={() => setGoal(g)}
                  className={`px-4 py-3 rounded-xl text-sm text-left transition-colors border
                    ${goal === g
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'}`}>
                  {g}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={goNext}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
                下一步
              </button>
              <button onClick={goNext} className="px-4 py-3 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                跳过
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Pain */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-gray-500 mb-2">第 3 步 · 共 4 步</p>
              <h2 className="text-lg font-semibold text-white mb-1">你现在最痛苦的问题是什么？</h2>
              <p className="text-gray-500 text-xs">选一个最接近的，可以跳过</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAINS.map(p => (
                <button key={p} onClick={() => setPain(p)}
                  className={`px-4 py-3 rounded-xl text-sm text-left transition-colors border
                    ${pain === p
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={goNext}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
                生成我的起点
              </button>
              <button onClick={goNext} className="px-4 py-3 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                跳过
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 4 && result && (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-gray-500 mb-2">第 4 步 · 你的个性化起点</p>
              <h2 className="text-lg font-semibold text-white">为你生成了以下配置</h2>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">当前唯一目标</p>
                <p className="text-white text-sm font-medium">{result.focus}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">当前阶段</p>
                <p className="text-white text-sm">{result.phase}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-2">本周 3 个最重要任务</p>
                <ul className="space-y-1">
                  {result.topTasks.map((t, i) => (
                    <li key={i} className="text-sm text-gray-200 flex items-start gap-2">
                      <span className="text-blue-400 shrink-0">{i + 1}.</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">推荐第一个项目</p>
                  <p className="text-white text-sm">{result.firstProject}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">推荐 AI 模式</p>
                  <p className="text-white text-sm">{result.aiModeLabel}</p>
                </div>
              </div>
              <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-3">
                <p className="text-xs text-red-400 mb-1">不应该做的事</p>
                <p className="text-sm text-red-300">{result.stopDoing}</p>
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button onClick={handleComplete} disabled={saving}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {saving ? '保存中...' : '进入系统 →'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
