'use client'
import { useState } from 'react'
import {
  Smile, Frown, Angry, AlertCircle, Hand, Heart, Sparkles, Brain,
  Loader2, Send,
} from 'lucide-react'
import type {
  AvatarState, AvatarAction, AvatarExpression, AvatarMood,
  AvatarOutfit, AvatarGrowthStage,
} from '@/lib/avatar/types'
import { OUTFIT_COLORS, MOOD_AURA_COLOR } from '@/lib/avatar/types'
import { suggestFromText, applyLLMOutput } from '@/lib/avatar/llm-driver'

interface Props {
  state: AvatarState
  onChange: (next: AvatarState) => void
}

const ACTIONS: { id: AvatarAction; label: string; icon: typeof Smile }[] = [
  { id: 'idle',  label: '待机', icon: Sparkles },
  { id: 'wave',  label: '挥手', icon: Hand },
  { id: 'nod',   label: '点头', icon: Brain },
  { id: 'happy', label: '高兴', icon: Heart },
  { id: 'sad',   label: '难过', icon: Frown },
]

const EXPRESSIONS: { id: AvatarExpression; label: string; icon: typeof Smile; color: string }[] = [
  { id: 'neutral',   label: '中性', icon: Smile,       color: 'text-slate-400' },
  { id: 'smile',     label: '微笑', icon: Smile,       color: 'text-emerald-400' },
  { id: 'angry',     label: '生气', icon: Angry,       color: 'text-red-400' },
  { id: 'sad',       label: '难过', icon: Frown,       color: 'text-blue-400' },
  { id: 'surprised', label: '惊讶', icon: AlertCircle, color: 'text-amber-400' },
]

const MOODS:        AvatarMood[]        = ['happy', 'neutral', 'sad', 'angry', 'excited', 'tired']
const OUTFITS:      AvatarOutfit[]      = ['default', 'casual', 'formal', 'cyber', 'cozy']
const GROWTH:       AvatarGrowthStage[] = ['seedling', 'youth', 'adult', 'elder']

const MOOD_LABELS: Record<AvatarMood, string> = {
  happy: '愉悦', neutral: '平静', sad: '低落', angry: '愤怒', excited: '兴奋', tired: '疲倦',
}
const OUTFIT_LABELS: Record<AvatarOutfit, string> = {
  default: '默认', casual: '休闲', formal: '正式', cyber: '赛博', cozy: '居家',
}
const GROWTH_LABELS: Record<AvatarGrowthStage, string> = {
  seedling: '雏形', youth: '少年', adult: '成年', elder: '资深',
}

export function AvatarDebugPanel({ state, onChange }: Props) {
  const [prompt, setPrompt]       = useState('')
  const [running, setRunning]     = useState(false)
  const [llmReason, setLlmReason] = useState<string | null>(null)

  function set<K extends keyof AvatarState>(key: K, value: AvatarState[K]) {
    onChange({ ...state, [key]: value })
  }

  // Local heuristic preview
  function previewLocal() {
    const out = suggestFromText(prompt)
    if (Object.keys(out).length === 0) {
      setLlmReason('（未识别关键词）')
      return
    }
    onChange(applyLLMOutput(state, out))
    setLlmReason(`本地启发式：${out.action ?? '—'} / ${out.expression ?? '—'} / ${out.mood ?? '—'}`)
  }

  // Real LLM via API
  async function callLLM() {
    if (!prompt.trim() || running) return
    setRunning(true); setLlmReason(null)
    try {
      const res = await fetch('/api/avatar/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt, current: state }),
      })
      const data = await res.json()
      if (data?.ok && data.output) {
        onChange(applyLLMOutput(state, data.output))
        setLlmReason(data.output.reason ?? '已应用')
      } else {
        setLlmReason('AI 未返回有效状态，已退回本地启发式')
        previewLocal()
      }
    } catch (e) {
      setLlmReason('请求失败：' + (e instanceof Error ? e.message : '未知错误'))
    }
    setRunning(false)
  }

  return (
    <aside className="w-72 border-l border-[var(--border)] flex flex-col shrink-0 overflow-auto"
      style={{ background: 'rgba(7,8,15,0.85)', backdropFilter: 'blur(18px)' }}>

      <div className="p-4 border-b border-[var(--border)]">
        <p className="text-[10px] font-mono tracking-widest uppercase text-pink-400">Auralie Lab</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>调试控制台</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>V1 程序化模型 · VRM/GLB 加载在 V2</p>
      </div>

      <div className="p-4 space-y-4">

        {/* AI prompt driver */}
        <div>
          <label className="label-xs">AI 驱动 / 测试输入</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder='输入文本，AI 会推断玩偶应该的反应。例如："hi！"、"做完了！"、"我有点失望..."'
            rows={3}
            className="w-full rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex gap-1.5 mt-2">
            <button onClick={callLLM} disabled={running || !prompt.trim()}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded transition-all disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {running ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              AI 驱动
            </button>
            <button onClick={previewLocal} disabled={!prompt.trim()}
              className="flex items-center justify-center gap-1 text-[10px] px-3 py-1.5 rounded transition-all disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              本地预览
            </button>
          </div>
          {llmReason && (
            <p className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>↳ {llmReason}</p>
          )}
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Action */}
        <div>
          <label className="label-xs">动作 (action)</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ACTIONS.map(a => {
              const Icon = a.icon
              const active = state.action === a.id
              return (
                <button key={a.id} onClick={() => set('action', a.id)}
                  className="flex flex-col items-center justify-center gap-1 py-2 rounded transition-all"
                  style={{
                    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  }}>
                  <Icon size={12} />
                  <span className="text-[10px]">{a.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Expression */}
        <div>
          <label className="label-xs">表情 (expression)</label>
          <div className="grid grid-cols-3 gap-1.5">
            {EXPRESSIONS.map(e => {
              const Icon = e.icon
              const active = state.expression === e.id
              return (
                <button key={e.id} onClick={() => set('expression', e.id)}
                  className="flex flex-col items-center justify-center gap-1 py-2 rounded transition-all"
                  style={{
                    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? e.color.replace('text-','') : 'var(--text-muted)',
                  }}>
                  <Icon size={12} className={active ? e.color : ''} />
                  <span className="text-[10px]">{e.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Mood */}
        <div>
          <label className="label-xs">情绪 (mood)</label>
          <div className="grid grid-cols-3 gap-1.5">
            {MOODS.map(m => {
              const active = state.mood === m
              return (
                <button key={m} onClick={() => set('mood', m)}
                  className="flex items-center gap-1.5 py-1.5 px-2 rounded text-[10px] transition-all"
                  style={{
                    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                    background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: MOOD_AURA_COLOR[m] }} />
                  {MOOD_LABELS[m]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Outfit */}
        <div>
          <label className="label-xs">服装 (outfit)</label>
          <div className="grid grid-cols-3 gap-1.5">
            {OUTFITS.map(o => {
              const active = state.outfit === o
              const c = OUTFIT_COLORS[o]
              return (
                <button key={o} onClick={() => set('outfit', o)}
                  className="flex items-center gap-1.5 py-1.5 px-2 rounded text-[10px] transition-all"
                  style={{
                    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                    background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  }}>
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.body }} />
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.accent }} />
                  </span>
                  {OUTFIT_LABELS[o]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Growth stage */}
        <div>
          <label className="label-xs">成长阶段 (growth_stage)</label>
          <div className="grid grid-cols-4 gap-1">
            {GROWTH.map(g => {
              const active = state.growth_stage === g
              return (
                <button key={g} onClick={() => set('growth_stage', g)}
                  className="text-[10px] py-1.5 rounded transition-all"
                  style={{
                    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                    background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  }}>
                  {GROWTH_LABELS[g]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* JSON state preview */}
        <div>
          <label className="label-xs">当前状态 (JSON)</label>
          <pre className="text-[9px] font-mono p-2 rounded whitespace-pre-wrap"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
{JSON.stringify(state, null, 2)}
          </pre>
        </div>

      </div>
    </aside>
  )
}
