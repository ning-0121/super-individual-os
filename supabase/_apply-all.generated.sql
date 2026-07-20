-- ============================================================
-- 全量 schema 重建脚本 (自动生成) —— 用于「新环境 / 灾备重建」
--
-- ⚠ 不要拿它去灌现有生产库 (ref haspowjrsmikogirtxyi)!
--   现有生产库是历史上手工演化出来的，schema 已与这些 .sql 文件分叉
--   (例如某些表缺后加的列)。对着它跑本脚本会报 42703 之类列不存在错误。
--   现有生产库 app 健康运行，无需重灌 —— 详见项目记忆 prod-db-drift。
--
-- 适用: 全新的空 Supabase 项目，一次建全所有表/RLS/索引。
-- 顺序: 显式依赖顺序 (不依赖文件 mtime)。
-- 幂等: 全部 IF NOT EXISTS / DROP+CREATE。
-- ============================================================

-- >>> schema.sql
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text default '',
  avatar_url text default '',
  role text default 'founder',
  goals text default '',
  personality_style text default '',
  risk_preference text default '稳健',
  current_focus text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  status text default 'active' check (status in ('active','maintain','frozen','stopped')),
  priority text default 'important' check (priority in ('must','important','optional')),
  category text default '',
  north_star_metric text default '',
  north_star_target text default '',
  north_star_current text default '0',
  monthly_focus text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text default '',
  status text default 'todo' check (status in ('todo','in_progress','done','paused')),
  priority text default 'important' check (priority in ('must','important','optional')),
  due_date date,
  assignee text default 'self',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  mode text default 'strategy' check (mode in ('strategy','execution','review')),
  title text default '新对话',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- memories
-- ─────────────────────────────────────────
create table if not exists memories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  memory_type text check (memory_type in (
    'goal','personality','preference','project',
    'decision','risk','failure','success'
  )),
  content text not null,
  importance integer default 3 check (importance between 1 and 5),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────
alter table user_profiles enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table memories enable row level security;

DROP POLICY IF EXISTS "own profile" ON user_profiles;
create policy "own profile" on user_profiles for all using (auth.uid() = id);
DROP POLICY IF EXISTS "own projects" ON projects;
create policy "own projects" on projects for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own tasks" ON tasks;
create policy "own tasks" on tasks for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own conversations" ON conversations;
create policy "own conversations" on conversations for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own messages" ON messages;
create policy "own messages" on messages for all
  using (conversation_id in (select id from conversations where user_id = auth.uid()));
DROP POLICY IF EXISTS "own memories" ON memories;
create policy "own memories" on memories for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- auto-create profile on signup
-- ─────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- >>> onboarding.sql
-- Add onboarding fields to user_profiles
alter table user_profiles
  add column if not exists onboarding_completed boolean default false,
  add column if not exists onboarding_goal text default '',
  add column if not exists onboarding_pain text default '';


-- >>> learning.sql
-- ─────────────────────────────────────────
-- decision_logs: every AI strategic judgment
-- ─────────────────────────────────────────
create table if not exists decision_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  conversation_id   uuid references conversations(id) on delete set null,
  mode              text,
  detected_mode     text,
  user_input        text not null,
  ai_output         text default '',
  risk_flags        jsonb default '[]',
  context_ids       jsonb default '{}',
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- execution_logs: action items extracted from AI output
-- ─────────────────────────────────────────
create table if not exists execution_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  decision_log_id   uuid references decision_logs(id) on delete cascade,
  action_item       text not null,
  timeframe         text default 'general', -- 7days / 30days / 90days / general
  status            text default 'pending' check (status in ('pending','done','skipped')),
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- outcome_logs: user feedback on AI judgments
-- ─────────────────────────────────────────
create table if not exists outcome_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  decision_log_id   uuid references decision_logs(id) on delete cascade,
  feedback          text check (feedback in ('helpful','neutral','not_helpful')),
  note              text default '',
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- learning_patterns: aggregated insight per user
-- ─────────────────────────────────────────
create table if not exists learning_patterns (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  pattern_type      text not null, -- mode_helpfulness / top_risk / action_completion
  pattern_key       text not null,
  pattern_value     jsonb not null default '{}',
  updated_at        timestamptz default now(),
  unique (user_id, pattern_type, pattern_key)
);

-- RLS
alter table decision_logs     enable row level security;
alter table execution_logs    enable row level security;
alter table outcome_logs      enable row level security;
alter table learning_patterns enable row level security;

DROP POLICY IF EXISTS "own decision_logs" ON decision_logs;
create policy "own decision_logs"     on decision_logs     for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own execution_logs" ON execution_logs;
create policy "own execution_logs"    on execution_logs    for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own outcome_logs" ON outcome_logs;
create policy "own outcome_logs"      on outcome_logs      for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own learning_patterns" ON learning_patterns;
create policy "own learning_patterns" on learning_patterns for all using (auth.uid() = user_id);


-- >>> execution-units.sql
-- ─────────────────────────────────────────
-- execution_units: human / ai / agent executors
-- ─────────────────────────────────────────
create table if not exists execution_units (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  type          text not null check (type in ('human', 'ai', 'agent')),
  name          text not null,
  avatar        text default '🤖',
  description   text default '',
  capabilities  jsonb default '[]',   -- ['writing','coding','research','strategy','ops','outreach']
  style_prompt  text default '',      -- injected into Claude system prompt for 'agent' type
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- Bind tasks to an execution unit
alter table tasks
  add column if not exists execution_unit_id uuid references execution_units(id) on delete set null;

-- RLS
alter table execution_units enable row level security;
DROP POLICY IF EXISTS "own execution_units" ON execution_units;
create policy "own execution_units" on execution_units for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Default units seeded per user via trigger
-- (Call manually or via onboarding instead)
-- ─────────────────────────────────────────


-- >>> multi-agent-v1.sql
-- ══════════════════════════════════════════════════════
-- Multi-Agent Execution OS — V1 Migration
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. Extend execution_units
-- ─────────────────────────────────────────
ALTER TABLE execution_units
  ADD COLUMN IF NOT EXISTS agent_type    text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS role          text DEFAULT 'executor',
  ADD COLUMN IF NOT EXISTS system_prompt text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tools_allowed jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

-- ─────────────────────────────────────────
-- 2. Extend tasks
-- ─────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id       uuid REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_unit_id     uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_type            text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS requested_agent_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS workflow_status      text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS expected_output      text DEFAULT '',
  ADD COLUMN IF NOT EXISTS acceptance_criteria  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS context_payload      jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_requirements    jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS completed_at         timestamptz;

-- ─────────────────────────────────────────
-- 3. Extend projects
-- ─────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS owner_unit_id    uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_statement   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS plan_generated   boolean DEFAULT false;

-- ─────────────────────────────────────────
-- 4. agent_profiles (extended metadata per agent)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_profiles (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_unit_id   uuid REFERENCES execution_units(id) ON DELETE CASCADE,
  agent_type          text NOT NULL,
  expertise_tags      jsonb DEFAULT '[]',
  input_format        text DEFAULT '',
  output_format       text DEFAULT '',
  quality_checklist   jsonb DEFAULT '[]',
  escalation_rules    text DEFAULT '',
  default_model       text DEFAULT 'claude-sonnet-4-6',
  memory_scope        text DEFAULT 'project',
  tasks_completed     int DEFAULT 0,
  tasks_revised       int DEFAULT 0,
  avg_score           numeric(3,1) DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 5. task_runs (execution records)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_runs (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id           uuid REFERENCES tasks(id) ON DELETE CASCADE,
  assigned_unit_id  uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  run_status        text DEFAULT 'pending' CHECK (run_status IN ('pending','running','completed','failed','cancelled')),
  input_payload     jsonb DEFAULT '{}',
  output_payload    jsonb DEFAULT '{}',
  reasoning_summary text DEFAULT '',
  tool_calls        jsonb DEFAULT '[]',
  error_message     text DEFAULT '',
  started_at        timestamptz DEFAULT now(),
  finished_at       timestamptz
);

-- ─────────────────────────────────────────
-- 6. task_reviews (review gate)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_reviews (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id               uuid REFERENCES tasks(id) ON DELETE CASCADE,
  reviewer_unit_id      uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  review_status         text DEFAULT 'pending' CHECK (review_status IN ('pending','approved','revision_required','rejected')),
  score                 int DEFAULT 0 CHECK (score BETWEEN 0 AND 10),
  comments              text DEFAULT '',
  revision_instructions text DEFAULT '',
  created_at            timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 7. agent_messages (inter-agent communication log)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_messages (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id       uuid REFERENCES tasks(id) ON DELETE CASCADE,
  from_unit_id  uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  to_unit_id    uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type  text DEFAULT 'info',  -- info / request / response / escalation / review
  content       text NOT NULL,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 8. tool_integrations (external tool registry)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_integrations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name           text NOT NULL,
  tool_type           text DEFAULT 'api',  -- api / sdk / mcp / webhook
  auth_status         text DEFAULT 'disconnected' CHECK (auth_status IN ('connected','disconnected','error')),
  config              jsonb DEFAULT '{}',
  allowed_agent_types jsonb DEFAULT '[]',
  is_active           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────
ALTER TABLE agent_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_integrations ENABLE ROW LEVEL SECURITY;

-- Postgres does not support IF NOT EXISTS on CREATE POLICY — use DROP+CREATE
-- to stay idempotent (matches the convention in every other migration).
DROP POLICY IF EXISTS "own agent_profiles" ON agent_profiles;
CREATE POLICY "own agent_profiles"    ON agent_profiles    FOR ALL USING (
  EXISTS (SELECT 1 FROM execution_units eu WHERE eu.id = execution_unit_id AND eu.user_id = auth.uid())
);
DROP POLICY IF EXISTS "own task_runs" ON task_runs;
CREATE POLICY "own task_runs"         ON task_runs         FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own task_reviews" ON task_reviews;
CREATE POLICY "own task_reviews"      ON task_reviews      FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own agent_messages" ON agent_messages;
CREATE POLICY "own agent_messages"    ON agent_messages    FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own tool_integrations" ON tool_integrations;
CREATE POLICY "own tool_integrations" ON tool_integrations FOR ALL USING (auth.uid() = user_id);


-- >>> v1.4-migration.sql
-- ══════════════════════════════════════════════════════
-- V1.4 — Run Control + Artifacts + Dependency Gate
-- Safe to re-run: idempotent guards everywhere
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. Extend task_runs with control fields
-- ─────────────────────────────────────────
ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS retry_count    int  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries    int  DEFAULT 3,
  ADD COLUMN IF NOT EXISTS parent_run_id  uuid REFERENCES task_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error_context  jsonb DEFAULT '{}';

-- ─────────────────────────────────────────
-- 2. Migrate run_status values:
--    pending    → queued
--    completed  → succeeded
-- ─────────────────────────────────────────
UPDATE task_runs SET run_status = 'queued'    WHERE run_status = 'pending';
UPDATE task_runs SET run_status = 'succeeded' WHERE run_status = 'completed';

-- Drop old constraint, add new one that accepts both legacy + new values
-- (legacy kept for safety in case of rollback)
ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS task_runs_run_status_check;
ALTER TABLE task_runs ADD CONSTRAINT task_runs_run_status_check
  CHECK (run_status IN ('queued','running','succeeded','failed','cancelled','pending','completed'));

-- ─────────────────────────────────────────
-- 3. Artifacts table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artifacts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  task_run_id     uuid REFERENCES task_runs(id) ON DELETE CASCADE,
  task_id         uuid REFERENCES tasks(id) ON DELETE SET NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  artifact_type   text NOT NULL CHECK (artifact_type IN (
    'code_pr','markdown_doc','json_data','design_spec','research_report','issue','other'
  )),
  title           text NOT NULL,
  url             text DEFAULT '',
  content         text DEFAULT '',
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project    ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task_run   ON artifacts(task_run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_user       ON artifacts(user_id);

-- RLS
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own artifacts" ON artifacts;
CREATE POLICY "own artifacts" ON artifacts FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 4. Helpful index for run-lock queries
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_task_runs_active
  ON task_runs(task_id, run_status)
  WHERE run_status IN ('queued','running');


-- >>> v1.6-migration.sql
-- ══════════════════════════════════════════════════════
-- V1.6 — Audit Logs (idempotent)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    text NOT NULL,                  -- e.g. 'tool_integration.create', 'task_run.start'
  resource_type text DEFAULT '',                -- 'tool_integration' | 'task_run' | 'task_review' | 'tool_call'
  resource_id   uuid,
  metadata      jsonb DEFAULT '{}',
  ip_address    text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_time  ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_logs(resource_type, resource_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit_logs" ON audit_logs;
CREATE POLICY "own audit_logs" ON audit_logs FOR ALL USING (auth.uid() = user_id);


-- >>> v1.8-platform-refactor.sql
-- ══════════════════════════════════════════════════════
-- V1.8 — Platform Refactor: Project Workspace
-- All data scoped to projects (with backward-compat NULL for legacy rows)
-- Idempotent
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. Add project_id to existing tables (nullable for backward compat)
-- ─────────────────────────────────────────
ALTER TABLE conversations  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE memories       ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE decision_logs  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE audit_logs     ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────
-- 2. project_agents — per-project Agent enable/override
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_agents (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id             uuid REFERENCES projects(id) ON DELETE CASCADE,
  execution_unit_id      uuid REFERENCES execution_units(id) ON DELETE CASCADE,
  is_enabled             boolean DEFAULT true,
  system_prompt_override text DEFAULT '',
  tools_allowed_override jsonb,                   -- NULL = inherit from execution_unit
  settings               jsonb DEFAULT '{}',
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  UNIQUE (project_id, execution_unit_id)
);

-- ─────────────────────────────────────────
-- 3. project_tool_grants — per-project tool access
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tool_grants (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id               uuid REFERENCES projects(id) ON DELETE CASCADE,
  tool_integration_id      uuid REFERENCES tool_integrations(id) ON DELETE CASCADE,
  is_enabled               boolean DEFAULT true,
  default_config_override  jsonb DEFAULT '{}',
  created_at               timestamptz DEFAULT now(),
  UNIQUE (project_id, tool_integration_id)
);

-- ─────────────────────────────────────────
-- 4. avatar_states — per (user, project) Avatar persistence
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avatar_states (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  mood          text DEFAULT 'neutral',
  expression    text DEFAULT 'neutral',
  action        text DEFAULT 'idle',
  outfit        text DEFAULT 'default',
  growth_stage  text DEFAULT 'youth',
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, project_id)
);

-- ─────────────────────────────────────────
-- 5. Indexes for project-scoped queries
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_project      ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_project ON decision_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project    ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_pa_project             ON project_agents(project_id);
CREATE INDEX IF NOT EXISTS idx_ptg_project            ON project_tool_grants(project_id);
CREATE INDEX IF NOT EXISTS idx_avatar_user_project   ON avatar_states(user_id, project_id);

-- ─────────────────────────────────────────
-- 6. RLS on new tables
-- ─────────────────────────────────────────
ALTER TABLE project_agents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tool_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_states        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own project_agents" ON project_agents;
CREATE POLICY "own project_agents" ON project_agents FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own project_tool_grants" ON project_tool_grants;
CREATE POLICY "own project_tool_grants" ON project_tool_grants FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own avatar_states" ON avatar_states;
CREATE POLICY "own avatar_states" ON avatar_states FOR ALL USING (auth.uid() = user_id);


-- >>> v1.9-stage-engine.sql
-- ══════════════════════════════════════════════════════
-- V1.9 — Stage Engine: 11-stage business lifecycle
-- Idempotent
-- ══════════════════════════════════════════════════════

-- 1. Add stage tracking to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_stage   int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stage_history   jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS stage_metadata  jsonb DEFAULT '{}';

-- Backfill existing projects to stage 1
UPDATE projects SET current_stage = 1 WHERE current_stage IS NULL;

-- 2. Stage-aware agent grants (project_agents allowed_stages)
ALTER TABLE project_agents
  ADD COLUMN IF NOT EXISTS allowed_stages jsonb;   -- NULL = all stages

-- 3. Index for stage queries
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(current_stage);


-- >>> v2.0-manager-layer.sql
-- ══════════════════════════════════════════════════════
-- V2.0 Phase 1 — Manager Layer
-- Middle management between CEO/Linda and execution agents.
-- Idempotent.
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. managers — decision-making nodes per (project, role)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS managers (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  role            text NOT NULL,           -- 'ceo' | 'engineering_manager' | 'design_manager' | 'growth_manager' | 'finance_manager' | 'qa_manager' | 'risk_manager'
  domain          text DEFAULT '',         -- 'engineering', 'design', etc. (for routing)
  name            text NOT NULL,
  avatar          text DEFAULT '🧑‍💼',
  description     text DEFAULT '',
  authority_level int  DEFAULT 2 CHECK (authority_level BETWEEN 0 AND 4),
  system_prompt   text DEFAULT '',         -- future: AI-driven manager
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (project_id, role)
);

-- ─────────────────────────────────────────
-- 2. manager_policies — rules a manager enforces
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manager_policies (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id  uuid REFERENCES managers(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_type text NOT NULL,               -- 'risk_threshold' | 'cost_cap' | 'requires_qa' | 'auto_approve_pattern' | 'block_pattern'
  rule        jsonb NOT NULL,              -- { max_cost_usd, patterns_allow, patterns_block, ... }
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. manager_decisions — audit of manager actions
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manager_decisions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id    uuid REFERENCES managers(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  decision_type text NOT NULL CHECK (decision_type IN ('approve','reject','escalate','request_revision','observe')),
  target_type   text NOT NULL,             -- 'approval_request' | 'task_run' | 'task' | 'artifact'
  target_id     uuid,
  reasoning     text DEFAULT '',
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 4. approval_requests — gated dispatch records
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id         uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id            uuid REFERENCES tasks(id) ON DELETE CASCADE,
  task_run_id        uuid REFERENCES task_runs(id) ON DELETE SET NULL,
  action_type        text NOT NULL,        -- 'task.run' | 'tool.github.createPullRequest' | etc.
  action_payload     jsonb NOT NULL DEFAULT '{}',
  risk_level         int  NOT NULL CHECK (risk_level BETWEEN 0 AND 4),
  required_approvers jsonb NOT NULL DEFAULT '[]',  -- ['engineering_manager', 'qa_manager']
  approvers_acted    jsonb DEFAULT '[]',           -- [{ role, manager_id, decision, ts, reasoning }]
  status             text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  classification_reason text DEFAULT '',
  expires_at         timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 5. system_state — project-scoped key/value store for managers
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_state (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, key)
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_managers_project    ON managers(project_id);
CREATE INDEX IF NOT EXISTS idx_managers_user       ON managers(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_manager          ON manager_policies(manager_id);
CREATE INDEX IF NOT EXISTS idx_md_project_time     ON manager_decisions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_md_manager_time     ON manager_decisions(manager_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_status           ON approval_requests(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_project          ON approval_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_task             ON approval_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_ss_project_key      ON system_state(project_id, key);

-- ─────────────────────────────────────────
-- RLS — own-project access
-- ─────────────────────────────────────────
ALTER TABLE managers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_policies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_decisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_state       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own managers" ON managers;
CREATE POLICY "own managers" ON managers FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own manager_policies" ON manager_policies;
CREATE POLICY "own manager_policies" ON manager_policies FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own manager_decisions" ON manager_decisions;
CREATE POLICY "own manager_decisions" ON manager_decisions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own approval_requests" ON approval_requests;
CREATE POLICY "own approval_requests" ON approval_requests FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own system_state" ON system_state;
CREATE POLICY "own system_state" ON system_state FOR ALL USING (auth.uid() = user_id);


-- >>> v2.1-mission-control.sql
-- ══════════════════════════════════════════════════════
-- V2.1 — Mission Control + Automation Layer
-- - systems / system_projects / system_metrics
-- - execution_policies (auto-approval rules)
-- Idempotent.
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. systems — top-level grouping above projects
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS systems (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text DEFAULT '',
  status       text DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 2. system_projects — many-to-many link
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_projects (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system_id   uuid REFERENCES systems(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  role        text DEFAULT 'member',          -- 'primary' | 'member'
  created_at  timestamptz DEFAULT now(),
  UNIQUE (system_id, project_id)
);

-- ─────────────────────────────────────────
-- 3. system_metrics — aggregated KPIs
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_metrics (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system_id   uuid REFERENCES systems(id) ON DELETE CASCADE,
  metric_key  text NOT NULL,                 -- e.g. 'auto_approval_rate', 'task_throughput_7d'
  metric_value jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz DEFAULT now(),
  UNIQUE (system_id, metric_key)
);

-- ─────────────────────────────────────────
-- 4. execution_policies — auto-approval rules
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_policies (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,    -- NULL = applies to all projects
  scope       text DEFAULT 'global' CHECK (scope IN ('global','project','manager')),
  policy_name text NOT NULL,
  policy_type text NOT NULL CHECK (policy_type IN ('auto_approve','ai_manager','human_required','block')),
  rule        jsonb NOT NULL DEFAULT '{}',
  priority    int  DEFAULT 50,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_systems_user           ON systems(user_id);
CREATE INDEX IF NOT EXISTS idx_sp_system              ON system_projects(system_id);
CREATE INDEX IF NOT EXISTS idx_sp_project             ON system_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_sm_system              ON system_metrics(system_id);
CREATE INDEX IF NOT EXISTS idx_ep_user_priority      ON execution_policies(user_id, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ep_project             ON execution_policies(project_id);

-- ─────────────────────────────────────────
-- RLS — own-data access
-- ─────────────────────────────────────────
ALTER TABLE systems            ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own systems" ON systems;
CREATE POLICY "own systems" ON systems FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own system_projects" ON system_projects;
CREATE POLICY "own system_projects" ON system_projects FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own system_metrics" ON system_metrics;
CREATE POLICY "own system_metrics" ON system_metrics FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own execution_policies" ON execution_policies;
CREATE POLICY "own execution_policies" ON execution_policies FOR ALL USING (auth.uid() = user_id);


-- >>> v2.1b-systems-extras.sql
-- ══════════════════════════════════════════════════════
-- V2.1b — Manager Reports + Growth Experiments
-- Idempotent. Builds on v2.1-mission-control.sql.
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. manager_reports — auto-generated summaries per role
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manager_reports (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_id    uuid REFERENCES managers(id) ON DELETE SET NULL,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  system_id     uuid REFERENCES systems(id)  ON DELETE SET NULL,
  role          text NOT NULL,                 -- denormalized for quick filter
  report_period text NOT NULL DEFAULT 'on_demand'
                CHECK (report_period IN ('daily','weekly','on_demand')),
  summary       text DEFAULT '',
  metrics       jsonb DEFAULT '{}',
  source        text DEFAULT 'rule_based'
                CHECK (source IN ('rule_based','llm','manual')),
  generated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mr_user_time   ON manager_reports(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_role        ON manager_reports(role, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_system      ON manager_reports(system_id);

ALTER TABLE manager_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own manager_reports" ON manager_reports;
CREATE POLICY "own manager_reports" ON manager_reports FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 2. growth_experiments — tracked A/B / channel tests
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_experiments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system_id       uuid REFERENCES systems(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  name            text NOT NULL,
  hypothesis      text DEFAULT '',
  channel         text DEFAULT '',
  target_metric   text DEFAULT '',
  baseline_value  text DEFAULT '',
  current_value   text DEFAULT '',
  target_value    text DEFAULT '',
  status          text DEFAULT 'planning'
                  CHECK (status IN ('planning','running','completed','aborted')),
  result_summary  text DEFAULT '',
  next_action     text DEFAULT '',
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ge_system     ON growth_experiments(system_id);
CREATE INDEX IF NOT EXISTS idx_ge_project    ON growth_experiments(project_id);
CREATE INDEX IF NOT EXISTS idx_ge_user_status ON growth_experiments(user_id, status);

ALTER TABLE growth_experiments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own growth_experiments" ON growth_experiments;
CREATE POLICY "own growth_experiments" ON growth_experiments FOR ALL USING (auth.uid() = user_id);


-- >>> v2.2-tool-autonomy.sql
-- ══════════════════════════════════════════════════════
-- V2.2 — Tool Autonomy Layer
-- - tool_capabilities (declarative risk + approver matrix)
-- - tool_runs         (every tool call, success / blocked / fail)
-- - model_runs        (every LLM call, with provider + token usage)
-- - local_agent_sessions (reserved interface — desktop client v0)
-- Idempotent.
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. tool_capabilities — declarative registry
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_capabilities (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool            text NOT NULL,                                    -- 'github' | 'vercel' | 'supabase' | 'local_agent'
  action          text NOT NULL,                                    -- 'github.pr.create' etc (full canonical)
  short_action    text NOT NULL,                                    -- e.g. 'pr.create'
  risk_level      int NOT NULL CHECK (risk_level BETWEEN 0 AND 4),
  manager_role    text,                                             -- 'engineering_manager' | 'qa_manager' | null
  require_qa      boolean NOT NULL DEFAULT false,
  require_ceo     boolean NOT NULL DEFAULT false,
  description     text DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (action)
);

CREATE INDEX IF NOT EXISTS idx_tc_tool        ON tool_capabilities(tool);
CREATE INDEX IF NOT EXISTS idx_tc_risk        ON tool_capabilities(risk_level);

ALTER TABLE tool_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read tool_capabilities" ON tool_capabilities;
-- Public-read for authenticated users (it's a static catalog)
CREATE POLICY "read tool_capabilities" ON tool_capabilities FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────
-- 2. tool_runs — every executed tool call
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_runs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  task_run_id     uuid REFERENCES task_runs(id) ON DELETE SET NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  tool            text NOT NULL,
  action          text NOT NULL,
  params          jsonb DEFAULT '{}',
  result          jsonb DEFAULT '{}',
  status          text NOT NULL CHECK (status IN ('success','error','blocked','pending_approval')),
  risk_level      int NOT NULL DEFAULT 0,
  required_approvers text[] DEFAULT '{}',
  approval_id     uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
  duration_ms     int DEFAULT 0,
  error_message   text,
  started_at      timestamptz DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tr_user_time   ON tool_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_tool        ON tool_runs(tool, action);
CREATE INDEX IF NOT EXISTS idx_tr_status      ON tool_runs(status);
CREATE INDEX IF NOT EXISTS idx_tr_task_run    ON tool_runs(task_run_id);

ALTER TABLE tool_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tool_runs" ON tool_runs;
CREATE POLICY "own tool_runs" ON tool_runs FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 3. model_runs — every LLM call (audit + cost)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_runs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  task_run_id     uuid REFERENCES task_runs(id) ON DELETE SET NULL,
  provider        text NOT NULL CHECK (provider IN ('anthropic','openai','gemini','local')),
  model           text NOT NULL,
  agent_type      text,
  task_kind       text,
  reason          text DEFAULT '',
  input_tokens    int DEFAULT 0,
  output_tokens   int DEFAULT 0,
  duration_ms     int DEFAULT 0,
  status          text NOT NULL CHECK (status IN ('success','error','blocked')),
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mr_user_time   ON model_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_provider    ON model_runs(provider);

ALTER TABLE model_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own model_runs" ON model_runs;
CREATE POLICY "own model_runs" ON model_runs FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 4. local_agent_sessions — reserved interface
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_agent_sessions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_token     text NOT NULL UNIQUE,                  -- random opaque token (server-issued)
  hostname        text DEFAULT '',
  os              text DEFAULT '',
  cursor_version  text DEFAULT '',
  capabilities    text[] DEFAULT '{}',
  status          text NOT NULL DEFAULT 'registered'
                  CHECK (status IN ('registered','active','idle','disconnected','revoked')),
  last_heartbeat  timestamptz DEFAULT now(),
  registered_at   timestamptz DEFAULT now(),
  revoked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_las_user        ON local_agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_las_status      ON local_agent_sessions(status);

ALTER TABLE local_agent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own local_agent_sessions" ON local_agent_sessions;
CREATE POLICY "own local_agent_sessions" ON local_agent_sessions FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 5. Seed tool_capabilities (idempotent upserts)
-- ─────────────────────────────────────────
INSERT INTO tool_capabilities (tool, action, short_action, risk_level, manager_role, require_qa, require_ceo, description)
VALUES
  -- GitHub
  ('github', 'github.repo.list',          'repo.list',          0, NULL,                  false, false, 'List accessible repositories'),
  ('github', 'github.file.read',          'file.read',          0, NULL,                  false, false, 'Read file from repo'),
  ('github', 'github.branch.list',        'branch.list',        0, NULL,                  false, false, 'List branches'),
  ('github', 'github.branch.create',      'branch.create',      1, NULL,                  false, false, 'Create new branch'),
  ('github', 'github.issue.create',       'issue.create',       1, NULL,                  false, false, 'Create new issue'),
  ('github', 'github.pr.comment',         'pr.comment',         1, NULL,                  false, false, 'Comment on a PR'),
  ('github', 'github.pr.diff',            'pr.diff',            0, NULL,                  false, false, 'Read PR diff'),
  ('github', 'github.file.write',         'file.write',         2, 'engineering_manager', true,  false, 'Write file via PR; main branch forbidden'),
  ('github', 'github.pr.create',          'pr.create',          2, 'engineering_manager', true,  false, 'Open pull request — CTO + QA must both approve'),
  ('github', 'github.pr.merge',           'pr.merge',           4, NULL,                  false, true,  'Merge pull request — CEO only'),

  -- Vercel
  ('vercel', 'vercel.project.list',         'project.list',        0, NULL,                  false, false, 'List Vercel projects'),
  ('vercel', 'vercel.deployment.list',      'deployment.list',     0, NULL,                  false, false, 'List recent deployments'),
  ('vercel', 'vercel.deployment.status',    'deployment.status',   0, NULL,                  false, false, 'Read deployment status'),
  ('vercel', 'vercel.deploy.preview',       'deploy.preview',      2, 'engineering_manager', true,  false, 'Trigger preview deploy'),
  ('vercel', 'vercel.deploy.production',    'deploy.production',   4, NULL,                  false, true,  'Trigger production deploy — CEO only'),
  ('vercel', 'vercel.env.update',           'env.update',          4, NULL,                  false, true,  'Modify env vars — CEO only'),

  -- Supabase
  ('supabase', 'supabase.schema.read',                  'schema.read',                  0, NULL,                  false, false, 'Read schema metadata'),
  ('supabase', 'supabase.sql.validate',                 'sql.validate',                 1, NULL,                  false, false, 'Static SQL safety check'),
  ('supabase', 'supabase.migration.create',             'migration.create',             2, 'engineering_manager', true,  false, 'Create migration file (forward)'),
  ('supabase', 'supabase.migration.verify',             'migration.verify',             2, 'qa_manager',          false, false, 'Verify migration applied correctly'),
  ('supabase', 'supabase.migration.apply_staging',      'migration.apply_staging',      3, 'engineering_manager', true,  false, 'Apply migration to staging'),
  ('supabase', 'supabase.migration.apply_production',   'migration.apply_production',   4, NULL,                  false, true,  'Apply migration to production — CEO only'),
  ('supabase', 'supabase.destructive_sql',              'destructive_sql',              4, NULL,                  false, true,  'Any destructive SQL pattern — CEO only'),

  -- Local Agent
  ('local_agent', 'local_agent.status',          'status',          0, NULL,                  false, false, 'Health/status of registered local agent'),
  ('local_agent', 'local_agent.repo.read',       'repo.read',       1, NULL,                  false, false, 'Read local repository file'),
  ('local_agent', 'local_agent.command.run',     'command.run',     3, 'engineering_manager', true,  false, 'Run shell command on user machine'),
  ('local_agent', 'local_agent.cursor.invoke',   'cursor.invoke',   3, 'engineering_manager', true,  false, 'Invoke Cursor edit/refactor')
ON CONFLICT (action) DO UPDATE SET
  short_action  = EXCLUDED.short_action,
  risk_level    = EXCLUDED.risk_level,
  manager_role  = EXCLUDED.manager_role,
  require_qa    = EXCLUDED.require_qa,
  require_ceo   = EXCLUDED.require_ceo,
  description   = EXCLUDED.description,
  is_active     = true;


-- >>> v2.3-manager-reports-v1.sql
-- ══════════════════════════════════════════════════════
-- V2.3 — Manager Reports V1
-- Extends the existing manager_reports table (added in v2.1b) with
-- structured fields: title, blockers[], risks[], next_actions[],
-- confidence_score, report_type, execution_unit_id, read_at.
-- Idempotent.
-- ══════════════════════════════════════════════════════

-- Add execution_unit_id (FK to existing execution_units; nullable)
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS execution_unit_id uuid REFERENCES execution_units(id) ON DELETE SET NULL;

-- Structured content fields
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS title           text DEFAULT '';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS blockers        jsonb DEFAULT '[]';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS risks           jsonb DEFAULT '[]';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS next_actions    jsonb DEFAULT '[]';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 0.5;
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS needs_user_intervention boolean DEFAULT false;

-- Read receipts
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS read_at         timestamptz;

-- New report_type column with broader vocabulary than report_period.
-- We keep report_period for backward compatibility.
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS report_type     text DEFAULT 'daily';

-- Drop any old check constraint, add the new vocabulary
ALTER TABLE manager_reports
  DROP CONSTRAINT IF EXISTS manager_reports_report_type_check;
ALTER TABLE manager_reports
  ADD CONSTRAINT manager_reports_report_type_check
  CHECK (report_type IN ('daily','weekly','project','risk','growth','execution'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mr_unit       ON manager_reports(execution_unit_id);
CREATE INDEX IF NOT EXISTS idx_mr_type_user  ON manager_reports(user_id, report_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_unread     ON manager_reports(user_id, read_at)
  WHERE read_at IS NULL;


-- >>> v2.4-approval-governance.sql
-- ══════════════════════════════════════════════════════
-- V2.4 — Approval & Governance Center V1
-- Extends approval_requests with human-facing fields:
-- title, description, risk_label (text), requested_by, explanation,
-- executed_at. Keeps numeric risk_level (0-4) for backward compat.
-- Idempotent.
-- ══════════════════════════════════════════════════════

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS title         text DEFAULT '';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS description   text DEFAULT '';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS risk_label    text DEFAULT 'low';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS requested_by  text DEFAULT 'system';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS explanation   text DEFAULT '';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS executed_at   timestamptz;

-- Text-coded risk vocabulary
ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_risk_label_check;
ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_risk_label_check
  CHECK (risk_label IN ('low','medium','high','critical'));

-- Extend status check to include 'executed'
ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_status_check;
ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_status_check
  CHECK (status IN ('pending','approved','rejected','executed','expired','cancelled'));

-- Backfill risk_label from numeric risk_level for existing rows
UPDATE approval_requests
SET risk_label = CASE
  WHEN risk_level <= 1 THEN 'low'
  WHEN risk_level  = 2 THEN 'medium'
  WHEN risk_level  = 3 THEN 'high'
  ELSE                       'critical'
END
WHERE risk_label IS NULL OR risk_label = '';

-- Indexes for the inbox UI
CREATE INDEX IF NOT EXISTS idx_ar_user_status_label
  ON approval_requests(user_id, status, risk_label, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_pending
  ON approval_requests(user_id, created_at DESC)
  WHERE status = 'pending';

-- Make sure audit_logs exists (the spec requires it). The base schema
-- already creates it via earlier migrations; this is a safety net.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action       text NOT NULL,
  entity_type  text DEFAULT '',
  entity_id    uuid,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_al_user_time   ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_action      ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit_logs" ON audit_logs;
CREATE POLICY "own audit_logs" ON audit_logs FOR ALL USING (auth.uid() = user_id);


-- >>> v2.5-project-memory.sql
-- ══════════════════════════════════════════════════════
-- V2.5 — Project Memory Kernel + Project Context Lock
-- - project_contexts: one row per project, locked context for AI
-- - project_activity_logs: timeline of project events
-- Idempotent.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_contexts (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id               uuid REFERENCES projects(id)  ON DELETE CASCADE,
  project_goal             text DEFAULT '',
  current_stage            text DEFAULT '',
  current_focus            text DEFAULT '',
  tech_stack               jsonb DEFAULT '{}',
  key_decisions            jsonb DEFAULT '[]',
  completed_items          jsonb DEFAULT '[]',
  blockers                 jsonb DEFAULT '[]',
  next_actions             jsonb DEFAULT '[]',
  forbidden_changes        jsonb DEFAULT '[]',
  important_files          jsonb DEFAULT '[]',
  database_notes           jsonb DEFAULT '{}',
  deployment_notes         jsonb DEFAULT '[]',
  active_workflow_id       uuid,
  owner_execution_unit_id  uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  last_ai_summary          text DEFAULT '',
  context_version          integer DEFAULT 1,
  locked                   boolean DEFAULT false,
  locked_at                timestamptz,
  updated_at               timestamptz DEFAULT now(),
  created_at               timestamptz DEFAULT now(),
  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_pc_user_project ON project_contexts(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_pc_locked       ON project_contexts(user_id, locked) WHERE locked = true;

ALTER TABLE project_contexts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project_contexts" ON project_contexts;
CREATE POLICY "own project_contexts" ON project_contexts FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- project_activity_logs — timeline of all events
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_activity_logs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  activity_type text NOT NULL
                CHECK (activity_type IN (
                  'decision','code_change','deployment','bug',
                  'workflow_update','task_update','manager_report',
                  'ai_summary','risk','approval','context_update'
                )),
  title         text DEFAULT '',
  summary       text DEFAULT '',
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pal_user_project_time ON project_activity_logs(user_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_activity_type      ON project_activity_logs(activity_type);

ALTER TABLE project_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project_activity_logs" ON project_activity_logs;
CREATE POLICY "own project_activity_logs" ON project_activity_logs FOR ALL USING (auth.uid() = user_id);


-- >>> v2.6-ai-gateway.sql
-- ══════════════════════════════════════════════════════
-- V2.6 — AI Gateway / Model Router V1
-- - model_registry: catalog of available models (provider, cost, caps)
-- - extends model_runs with cost + fallback fields
-- Idempotent.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_registry (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider                 text NOT NULL CHECK (provider IN ('anthropic','openai','gemini','deepseek','local','mock')),
  model_name               text NOT NULL,                  -- canonical id used in API calls
  display_name             text NOT NULL,
  cost_input_usd_per_1m    numeric DEFAULT 0,              -- $/M input tokens
  cost_output_usd_per_1m   numeric DEFAULT 0,              -- $/M output tokens
  context_window           int DEFAULT 200000,
  supports_streaming       boolean DEFAULT true,
  is_enabled               boolean DEFAULT true,
  is_default_for_stage     jsonb DEFAULT '[]',             -- ['engineering','qa',...]
  notes                    text DEFAULT '',
  sort_order               int DEFAULT 100,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  UNIQUE (provider, model_name)
);

CREATE INDEX IF NOT EXISTS idx_mreg_provider ON model_registry(provider);
CREATE INDEX IF NOT EXISTS idx_mreg_enabled  ON model_registry(is_enabled, sort_order);

-- Public read for authenticated users (it's a catalog, not user-scoped).
ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read model_registry" ON model_registry;
CREATE POLICY "read model_registry" ON model_registry FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────
-- Seed common models. Costs as of mid-2025 (override per env if needed).
-- ─────────────────────────────────────────────────
INSERT INTO model_registry
  (provider, model_name, display_name, cost_input_usd_per_1m, cost_output_usd_per_1m, context_window, supports_streaming, is_enabled, is_default_for_stage, sort_order)
VALUES
  ('anthropic', 'claude-sonnet-4-6',        'Claude Sonnet 4.6',     3,     15,    200000, true, true,
   '["engineering","architecture","debug","migration_draft"]'::jsonb, 10),
  ('anthropic', 'claude-3-5-haiku-latest',  'Claude Haiku 3.5',      0.8,   4,     200000, true, true, '[]'::jsonb, 20),
  ('openai',    'gpt-4o',                   'OpenAI GPT-4o',         2.5,   10,    128000, true, true,
   '["qa","review","risk","migration_qa","research","growth","content"]'::jsonb, 30),
  ('openai',    'gpt-4o-mini',              'OpenAI GPT-4o mini',    0.15,  0.6,   128000, true, true, '[]'::jsonb, 40),
  ('gemini',    'gemini-1.5-pro',           'Gemini 1.5 Pro',        1.25,  5,     1000000, true, false, '[]'::jsonb, 50),
  ('mock',      'mock-echo',                'Mock (test only)',      0,     0,     1000000, false, false, '[]'::jsonb, 999)
ON CONFLICT (provider, model_name) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  cost_input_usd_per_1m  = EXCLUDED.cost_input_usd_per_1m,
  cost_output_usd_per_1m = EXCLUDED.cost_output_usd_per_1m,
  context_window         = EXCLUDED.context_window,
  is_default_for_stage   = EXCLUDED.is_default_for_stage,
  updated_at             = now();

-- ─────────────────────────────────────────────────
-- Extend model_runs with cost + fallback bookkeeping
-- ─────────────────────────────────────────────────
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS cost_usd_estimated  numeric DEFAULT 0;
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS fallback_used       boolean DEFAULT false;
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS primary_provider    text;     -- when fallback_used = true
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS primary_model       text;
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS metadata            jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_mr_cost_time ON model_runs(user_id, created_at DESC);


-- >>> v2.8-workflow-runtime.sql
-- ══════════════════════════════════════════════════════
-- V2.8 — Workflow Runtime Engine V1
-- Tables: workflows, workflow_steps, workflow_runs, workflow_step_runs
-- Goal: deterministic, resumable workflow execution with audit.
-- Idempotent.
-- ══════════════════════════════════════════════════════

-- 1. workflows — the template / definition
CREATE TABLE IF NOT EXISTS workflows (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text DEFAULT '',
  status        text DEFAULT 'draft'
                CHECK (status IN ('draft','active','archived')),
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_user_project ON workflows(user_id, project_id);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own workflows" ON workflows;
CREATE POLICY "own workflows" ON workflows FOR ALL USING (auth.uid() = user_id);

-- 2. workflow_steps — DAG nodes (depends_on is the edge set)
CREATE TABLE IF NOT EXISTS workflow_steps (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id   uuid REFERENCES workflows(id) ON DELETE CASCADE,
  step_key      text NOT NULL,                            -- short id used in depends_on
  name          text NOT NULL,
  description   text DEFAULT '',
  step_type     text DEFAULT 'task'
                CHECK (step_type IN ('task','approval','manual','auto')),
  -- DAG: array of step_keys this step depends on
  depends_on    jsonb DEFAULT '[]',
  -- Execution targets
  assigned_unit_id uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  manager_role  text,                                      -- e.g. 'engineering_manager' for approval steps
  -- Retry policy
  max_attempts  int DEFAULT 3,
  -- Approval gate
  requires_approval boolean DEFAULT false,
  approval_role text,                                      -- ceo / engineering_manager / qa_manager etc.
  metadata      jsonb DEFAULT '{}',
  sort_order    int DEFAULT 100,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (workflow_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_wfs_workflow ON workflow_steps(workflow_id, sort_order);

ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own workflow_steps" ON workflow_steps;
CREATE POLICY "own workflow_steps" ON workflow_steps FOR ALL USING (auth.uid() = user_id);

-- 3. workflow_runs — one execution of a workflow
CREATE TABLE IF NOT EXISTS workflow_runs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id   uuid REFERENCES workflows(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','blocked_approval','succeeded','failed','cancelled')),
  current_step_keys jsonb DEFAULT '[]',                    -- steps currently running
  completed_step_keys jsonb DEFAULT '[]',
  failed_step_keys  jsonb DEFAULT '[]',
  bottleneck_step_key text,                                -- the step currently blocking progress
  owner_unit_id uuid REFERENCES execution_units(id) ON DELETE SET NULL,
  eta_at        timestamptz,                               -- predicted completion (heuristic)
  started_at    timestamptz,
  finished_at   timestamptz,
  error_message text,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wfr_user_status   ON workflow_runs(user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wfr_workflow      ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wfr_active        ON workflow_runs(user_id, started_at DESC)
  WHERE status IN ('running','blocked_approval','pending');

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own workflow_runs" ON workflow_runs;
CREATE POLICY "own workflow_runs" ON workflow_runs FOR ALL USING (auth.uid() = user_id);

-- 4. workflow_step_runs — one execution of one step (per run)
CREATE TABLE IF NOT EXISTS workflow_step_runs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id uuid REFERENCES workflow_steps(id) ON DELETE CASCADE,
  step_key      text NOT NULL,
  status        text NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting','ready','running','blocked_approval','succeeded','failed','escalated','skipped')),
  attempt       int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 3,
  task_id       uuid REFERENCES tasks(id) ON DELETE SET NULL,
  approval_id   uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
  started_at    timestamptz,
  finished_at   timestamptz,
  next_retry_at timestamptz,
  result        jsonb DEFAULT '{}',
  error_message text,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wsr_run    ON workflow_step_runs(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_wsr_status ON workflow_step_runs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wsr_retry  ON workflow_step_runs(next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

ALTER TABLE workflow_step_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own workflow_step_runs" ON workflow_step_runs;
CREATE POLICY "own workflow_step_runs" ON workflow_step_runs FOR ALL USING (auth.uid() = user_id);


-- >>> v3.8-approval-run-status.sql
-- ─────────────────────────────────────────────────
-- V3.8 — Allow task_runs.run_status = 'blocked_approval'
-- When runAgentLoop hits a high-risk tool call, the run is paused pending
-- human approval. Extend the CHECK constraint to permit that state.
-- Idempotent: safe to run multiple times.
-- ─────────────────────────────────────────────────

ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS task_runs_run_status_check;

ALTER TABLE task_runs ADD CONSTRAINT task_runs_run_status_check
  CHECK (run_status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled', 'blocked_approval'
  ));

-- Helpful index for the "waiting on me" views.
CREATE INDEX IF NOT EXISTS idx_task_runs_blocked
  ON task_runs(user_id, run_status)
  WHERE run_status = 'blocked_approval';

