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
  const supabase = db()
  // RLS on `projects` is `auth.uid() = user_id`, so the insert MUST carry
  // user_id or Postgres rejects it (WITH CHECK fails) and the create silently
  // fails. Stamp it from the current session.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录，请重新登录后再创建项目')

  const { data, error } = await supabase
    .from('projects')
    .insert({ ...input, user_id: user.id })
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
