import { createClient } from '@/lib/supabase/client'
import { Project } from '@/types'

const db = () => createClient()

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await db()
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createProject(input: Partial<Project>): Promise<Project> {
  const { data, error } = await db()
    .from('projects')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, input: Partial<Project>): Promise<void> {
  const { error } = await db()
    .from('projects')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await db().from('projects').delete().eq('id', id)
  if (error) throw error
}
