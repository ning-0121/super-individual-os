// ── Scalar types ──────────────────────────────────────────────────
export type ProjectStatus   = 'active' | 'maintain' | 'frozen' | 'stopped'
export type TaskStatus      = 'todo' | 'in_progress' | 'done' | 'paused'
export type TaskPriority    = 'must' | 'important' | 'optional'
export type ChatMode        = 'strategy' | 'execution' | 'review'
export type MemoryType      = 'goal' | 'personality' | 'preference' | 'project' | 'decision' | 'risk' | 'failure' | 'success'
export type ExecutionUnitType = 'human' | 'ai' | 'agent' | 'tool'
export type Capability      = 'writing' | 'coding' | 'research' | 'strategy' | 'ops' | 'outreach' | 'design' | 'analysis'

// Multi-Agent additions
export type AgentType =
  | 'strategic' | 'product' | 'engineering' | 'research'
  | 'growth' | 'finance' | 'legal' | 'design' | '3d_avatar'
  | 'qa' | 'devops' | 'orchestrator' | 'general'

export type WorkflowStatus =
  | 'draft' | 'planned' | 'assigned' | 'running' | 'blocked'
  | 'submitted' | 'under_review' | 'revision_required' | 'approved'
  | 'completed' | 'archived'

export type TaskType =
  | 'feature' | 'research' | 'design' | 'engineering' | 'content'
  | 'review' | 'deployment' | 'analysis' | 'planning' | 'general'

export type RunStatus    = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ReviewStatus = 'pending' | 'approved' | 'revision_required' | 'rejected'

// ── Core entities ──────────────────────────────────────────────────
export interface ExecutionUnit {
  id: string
  user_id: string
  type: ExecutionUnitType
  agent_type: AgentType
  role: string
  name: string
  avatar: string
  description: string
  capabilities: Capability[]
  style_prompt: string
  system_prompt: string
  tools_allowed: string[]
  is_active: boolean
  created_at: string
  updated_at?: string
  // joined
  agent_profile?: AgentProfile
}

export interface AgentProfile {
  id: string
  execution_unit_id: string
  agent_type: AgentType
  expertise_tags: string[]
  input_format: string
  output_format: string
  quality_checklist: string[]
  escalation_rules: string
  default_model: string
  memory_scope: string
  tasks_completed: number
  tasks_revised: number
  avg_score: number
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
  goal_statement: string
  plan_generated: boolean
  owner_unit_id: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  project_id: string | null
  parent_task_id: string | null
  title: string
  description: string
  status: TaskStatus
  workflow_status: WorkflowStatus
  task_type: TaskType
  priority: TaskPriority
  due_date: string | null
  completed_at: string | null
  assignee: string
  execution_unit_id: string | null
  assigned_unit_id: string | null
  requested_agent_type: AgentType | ''
  expected_output: string
  acceptance_criteria: string
  context_payload: Record<string, unknown>
  tool_requirements: string[]
  created_at: string
  updated_at: string
  // joined
  execution_unit?: ExecutionUnit
  subtasks?: Task[]
}

export interface TaskRun {
  id: string
  task_id: string
  assigned_unit_id: string | null
  user_id: string
  run_status: RunStatus
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown>
  reasoning_summary: string
  tool_calls: unknown[]
  error_message: string
  started_at: string
  finished_at: string | null
}

export interface TaskReview {
  id: string
  task_id: string
  reviewer_unit_id: string | null
  user_id: string
  review_status: ReviewStatus
  score: number
  comments: string
  revision_instructions: string
  created_at: string
}

export interface AgentMessage {
  id: string
  project_id: string | null
  task_id: string | null
  from_unit_id: string | null
  to_unit_id: string | null
  user_id: string
  message_type: string
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ToolIntegration {
  id: string
  user_id: string
  tool_name: string
  tool_type: string
  auth_status: 'connected' | 'disconnected' | 'error'
  config: Record<string, unknown>
  allowed_agent_types: string[]
  is_active: boolean
  created_at: string
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
