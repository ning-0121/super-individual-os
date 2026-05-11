-- ══════════════════════════════════════════════════════
-- V2.4 — Approval & Governance Center V1
-- Extends approval_requests with human-facing fields:
-- title, description, risk_label (text), requested_by, explanation,
-- executed_at. Keeps numeric risk_level (0-4) for backward compat.
-- Idempotent.
-- ══════════════════════════════════════════════════════

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS title         text DEFAULT '';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS description   text DEFAULT '';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS risk_label    text DEFAULT 'low';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS requested_by  text DEFAULT 'system';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS explanation   text DEFAULT '';
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS executed_at   timestamptz;

-- Text-coded risk vocabulary
ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_risk_label_check;
ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_risk_label_check
  CHECK (risk_label IN ('low','medium','high','critical'));

-- Extend status check to include 'executed'
ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_status_check;
ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_status_check
  CHECK (status IN ('pending','approved','rejected','executed','expired','cancelled'));

-- Backfill risk_label from numeric risk_level for existing rows
UPDATE approval_requests
SET risk_label = CASE
  WHEN risk_level <= 1 THEN 'low'
  WHEN risk_level  = 2 THEN 'medium'
  WHEN risk_level  = 3 THEN 'high'
  ELSE                       'critical'
END
WHERE risk_label IS NULL OR risk_label = '';

-- Indexes for the inbox UI
CREATE INDEX IF NOT EXISTS idx_ar_user_status_label
  ON approval_requests(user_id, status, risk_label, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_pending
  ON approval_requests(user_id, created_at DESC)
  WHERE status = 'pending';

-- Make sure audit_logs exists (the spec requires it). The base schema
-- already creates it via earlier migrations; this is a safety net.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action       text NOT NULL,
  entity_type  text DEFAULT '',
  entity_id    uuid,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_al_user_time   ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_action      ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit_logs" ON audit_logs;
CREATE POLICY "own audit_logs" ON audit_logs FOR ALL USING (auth.uid() = user_id);
