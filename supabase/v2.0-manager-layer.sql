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
