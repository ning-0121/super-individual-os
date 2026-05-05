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
