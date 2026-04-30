import { createClient } from '@/lib/supabase/client'
import type { TaskRun, TaskReview } from '@/types'

const db = () => createClient()

// ── Task Runs ─────────────────────────────────────
export async function getTaskRuns(taskId: string): Promise<TaskRun[]> {
  const { data, error } = await db()
    .from('task_runs')
    .select('*')
    .eq('task_id', taskId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TaskRun[]
}

export async function createTaskRun(input: Partial<TaskRun>): Promise<TaskRun> {
  const { data, error } = await db()
    .from('task_runs')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as TaskRun
}

export async function updateTaskRun(id: string, input: Partial<TaskRun>): Promise<void> {
  const { error } = await db()
    .from('task_runs')
    .update(input)
    .eq('id', id)
  if (error) throw error
}

// ── Task Reviews ──────────────────────────────────
export async function getTaskReviews(taskId: string): Promise<TaskReview[]> {
  const { data, error } = await db()
    .from('task_reviews')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TaskReview[]
}

export async function createTaskReview(input: Partial<TaskReview>): Promise<TaskReview> {
  const { data, error } = await db()
    .from('task_reviews')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as TaskReview
}

export async function getPendingReviews(): Promise<(TaskReview & { task_title?: string })[]> {
  const { data, error } = await db()
    .from('task_reviews')
    .select('*, tasks(title)')
    .eq('review_status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    task_title: (r as { tasks?: { title?: string } }).tasks?.title,
  }))
}
