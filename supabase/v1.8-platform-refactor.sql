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
