export type ProjectStatus = 'active' | 'maintain' | 'frozen' | 'stopped'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'paused'
export type TaskPriority = 'must' | 'important' | 'optional'
export type ChatMode = 'strategy' | 'execution' | 'review'
export type MemoryType = 'goal' | 'personality' | 'preference' | 'project' | 'decision' | 'risk' | 'failure' | 'success'
export type ExecutionUnitType = 'human' | 'ai' | 'agent'
export type Capability = 'writing' | 'coding' | 'research' | 'strategy' | 'ops' | 'outreach' | 'design' | 'analysis'

export interface ExecutionUnit {
  id: string
  user_id: string
  type: ExecutionUnitType
  name: string
  avatar: string
  description: string
  capabilities: Capability[]
  style_prompt: string
  is_active: boolean
  created_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url: string
  role: string
  goals: string
  personality_style: string
  risk_preference: string
  current_focus: string
  onboarding_completed: boolean
  onboarding_goal: string
  onboarding_pain: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string
  status: ProjectStatus
  priority: TaskPriority
  category: string
  north_star_metric: string
  north_star_target: string
  north_star_current: string
  monthly_focus: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  project_id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  assignee: string
  execution_unit_id: string | null
  execution_unit?: ExecutionUnit   // joined
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  user_id: string
  mode: ChatMode
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface Memory {
  id: string
  user_id: string
  memory_type: MemoryType
  content: string
  importance: number
  created_at: string
}
