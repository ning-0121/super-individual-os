import { createClient } from '@/lib/supabase/client'
import type { ExecutionUnit } from '@/types'

const db = () => createClient()

export async function getExecutionUnits(): Promise<ExecutionUnit[]> {
  const { data, error } = await db()
    .from('execution_units')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createExecutionUnit(input: Partial<ExecutionUnit>): Promise<ExecutionUnit> {
  const { data, error } = await db()
    .from('execution_units')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExecutionUnit(id: string, input: Partial<ExecutionUnit>): Promise<void> {
  const { error } = await db()
    .from('execution_units')
    .update(input)
    .eq('id', id)
  if (error) throw error
}

export async function deleteExecutionUnit(id: string): Promise<void> {
  const { error } = await db()
    .from('execution_units')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// Seed default units for a new user (call after onboarding)
export async function seedDefaultUnits(userId: string): Promise<void> {
  const supabase = db()
  const { data: existing } = await supabase
    .from('execution_units').select('id').eq('user_id', userId).limit(1)
  if (existing && existing.length > 0) return  // already seeded

  await supabase.from('execution_units').insert([
    {
      user_id: userId, type: 'human', name: '我自己',
      avatar: '👤', description: '需要人工判断或高优先级任务',
      capabilities: ['strategy', 'outreach', 'ops'],
      style_prompt: '', is_active: true,
    },
    {
      user_id: userId, type: 'ai', name: 'Claude AI',
      avatar: '🤖', description: '通用 AI 助手，适合分析、写作、调研',
      capabilities: ['writing', 'research', 'analysis', 'strategy'],
      style_prompt: '', is_active: true,
    },
  ])
}
