export type ProjectStatus = 'active' | 'maintain' | 'frozen' | 'stopped'
export type ProjectPhase = 'month_1' | 'month_2' | 'month_3'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'paused'
export type TaskPriority = 'must' | 'important' | 'optional'
export type TaskExecutor = 'self' | 'ai' | 'delegate'
export type ChatMode = 'strategy' | 'execution' | 'review'
export type DecisionType = 'stop' | 'continue' | 'pivot'

export interface Project {
  id: string
  user_id: string
  name: string
  status: ProjectStatus
  phase: ProjectPhase
  north_star_metric: string
  north_star_target: string
  north_star_current: string
  monthly_focus: string
  phase_end_date: string
  continue_condition: string
  pivot_condition: string
  stop_condition: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  project_id: string | null
  title: string
  status: TaskStatus
  priority: TaskPriority
  executor: TaskExecutor
  week_number: number
  due_date: string | null
  kpi: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface Conversation {
  id: string
  user_id: string
  mode: ChatMode
  project_id: string | null
  title: string
  created_at: string
}

export interface UserMemory {
  id: string
  user_id: string
  long_term_goal: string
  current_stage: string
  personality_tags: string[]
  risk_preference: string
  strengths: string[]
  weaknesses: string[]
  active_projects: string[]
  frozen_projects: string[]
  current_phase_month: number
  current_phase_week: number
  current_focus: string
  ai_response_style: string
  updated_at: string
}

export interface Decision {
  id: string
  user_id: string
  project_id: string | null
  content: string
  decision_type: DecisionType
  created_at: string
}
