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
