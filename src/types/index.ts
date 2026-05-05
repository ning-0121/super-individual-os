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

// V1.4: 'queued' replaces 'pending', 'succeeded' replaces 'completed'
// Legacy values kept valid for backward compat
export type RunStatus    = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'pending' | 'completed'
export type ReviewStatus = 'pending' | 'approved' | 'revision_required' | 'rejected'

export type ArtifactType = 'code_pr' | 'markdown_doc' | 'json_data' | 'design_spec' | 'research_report' | 'issue' | 'other'

export interface Artifact {
  id: string
  user_id: string
  task_run_id: string | null
  task_id: string | null
  project_id: string | null
  artifact_type: ArtifactType
  title: string
  url: string
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

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
  // V1.9 — Stage Engine
  current_stage?: number
  stage_history?: Array<{ from: number; to: number; outcome: string; ts: string; note?: string }>
  stage_metadata?: Record<string, unknown>
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
  // V1.4
  retry_count: number
  max_retries: number
  parent_run_id: string | null
  error_context: Record<string, unknown>
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
  project_id: string | null      // V1.8: project-scoped conversations
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
  project_id: string | null     // V1.8: project-scoped (NULL = user-level)
  memory_type: MemoryType
  content: string
  importance: number
  created_at: string
}

// ── V2.0 — Manager Layer ───────────────────────────────────────────
export type RiskLevel = 0 | 1 | 2 | 3 | 4

// V2.1 — Mission Control / Automation
export type SystemStatus = 'active' | 'paused' | 'archived'

export interface System {
  id: string
  user_id: string
  name: string
  description: string
  status: SystemStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SystemProject {
  id: string
  user_id: string
  system_id: string
  project_id: string
  role: 'primary' | 'member'
  created_at: string
}

export interface SystemMetric {
  id: string
  user_id: string
  system_id: string
  metric_key: string
  metric_value: Record<string, unknown>
  computed_at: string
}

export type PolicyType = 'auto_approve' | 'ai_manager' | 'human_required' | 'block'

export interface PolicyRule {
  match?: {
    action_type_pattern?: string
    risk_level_min?: number
    risk_level_max?: number
    agent_types?: string[]
    tools_required_any?: string[]
    tools_forbidden_any?: string[]
    cost_max_usd?: number
    risk_flags_any?: string[]
  }
  action: PolicyType
  ai_manager_role?: import('@/types').ManagerRole
  reason?: string
}

export interface ExecutionPolicy {
  id: string
  user_id: string
  project_id: string | null
  scope: 'global' | 'project' | 'manager'
  policy_name: string
  policy_type: PolicyType
  rule: PolicyRule
  priority: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ManagerRole =
  | 'ceo'
  | 'engineering_manager'
  | 'design_manager'
  | 'growth_manager'
  | 'finance_manager'
  | 'qa_manager'
  | 'risk_manager'

export type ManagerDecisionType = 'approve' | 'reject' | 'escalate' | 'request_revision' | 'observe'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'

export interface Manager {
  id: string
  user_id: string
  project_id: string
  role: ManagerRole
  domain: string
  name: string
  avatar: string
  description: string
  authority_level: RiskLevel
  system_prompt: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ManagerPolicy {
  id: string
  manager_id: string
  user_id: string
  policy_type: string
  rule: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface ManagerDecision {
  id: string
  manager_id: string
  user_id: string
  project_id: string
  decision_type: ManagerDecisionType
  target_type: string
  target_id: string | null
  reasoning: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ApproverAction {
  role: ManagerRole
  manager_id: string
  decision: ManagerDecisionType
  ts: string
  reasoning?: string
}

export interface ApprovalRequest {
  id: string
  user_id: string
  project_id: string
  task_id: string | null
  task_run_id: string | null
  action_type: string
  action_payload: Record<string, unknown>
  risk_level: RiskLevel
  required_approvers: ManagerRole[]
  approvers_acted: ApproverAction[]
  status: ApprovalStatus
  classification_reason: string
  expires_at: string | null
  resolved_at: string | null
  created_at: string
}

export interface SystemState {
  id: string
  user_id: string
  project_id: string
  key: string
  value: Record<string, unknown>
  updated_at: string
}

// ── V1.8 — Platform refactor types ──────────────────────────────────
export interface ProjectAgent {
  id: string
  user_id: string
  project_id: string
  execution_unit_id: string
  is_enabled: boolean
  system_prompt_override: string
  tools_allowed_override: string[] | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProjectToolGrant {
  id: string
  user_id: string
  project_id: string
  tool_integration_id: string
  is_enabled: boolean
  default_config_override: Record<string, unknown>
  created_at: string
}

export interface AvatarStateRow {
  id: string
  user_id: string
  project_id: string
  mood: string
  expression: string
  action: string
  outfit: string
  growth_stage: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
