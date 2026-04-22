import { createClient } from '@/lib/supabase/client'
import { Task, TaskStatus } from '@/types'

const db = () => createClient()

export async function getTasks(projectId?: string): Promise<Task[]> {
  let query = db().from('tasks').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createTask(input: Partial<Task>): Promise<Task> {
  const { data, error } = await db()
    .from('tasks')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await db()
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateTask(id: string, input: Partial<Task>): Promise<void> {
  const { error } = await db()
    .from('tasks')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await db().from('tasks').delete().eq('id', id)
  if (error) throw error
}
