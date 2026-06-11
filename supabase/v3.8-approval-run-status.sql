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
