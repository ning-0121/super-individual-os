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
