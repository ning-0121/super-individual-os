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
