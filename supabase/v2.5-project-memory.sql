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
