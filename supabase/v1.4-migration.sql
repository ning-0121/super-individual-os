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
