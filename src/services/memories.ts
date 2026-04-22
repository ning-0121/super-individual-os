import { createClient } from '@/lib/supabase/client'
import { Memory, MemoryType } from '@/types'

const db = () => createClient()

export async function getMemories(type?: MemoryType): Promise<Memory[]> {
  let query = db().from('memories').select('*').order('importance', { ascending: false })
  if (type) query = query.eq('memory_type', type)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function saveMemory(input: Omit<Memory, 'id' | 'user_id' | 'created_at'>): Promise<Memory> {
  const { data, error } = await db()
    .from('memories')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await db().from('memories').delete().eq('id', id)
  if (error) throw error
}
