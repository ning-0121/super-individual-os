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
