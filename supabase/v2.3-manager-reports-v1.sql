-- ══════════════════════════════════════════════════════
-- V2.3 — Manager Reports V1
-- Extends the existing manager_reports table (added in v2.1b) with
-- structured fields: title, blockers[], risks[], next_actions[],
-- confidence_score, report_type, execution_unit_id, read_at.
-- Idempotent.
-- ══════════════════════════════════════════════════════

-- Add execution_unit_id (FK to existing execution_units; nullable)
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS execution_unit_id uuid REFERENCES execution_units(id) ON DELETE SET NULL;

-- Structured content fields
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS title           text DEFAULT '';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS blockers        jsonb DEFAULT '[]';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS risks           jsonb DEFAULT '[]';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS next_actions    jsonb DEFAULT '[]';
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 0.5;
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS needs_user_intervention boolean DEFAULT false;

-- Read receipts
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS read_at         timestamptz;

-- New report_type column with broader vocabulary than report_period.
-- We keep report_period for backward compatibility.
ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS report_type     text DEFAULT 'daily';

-- Drop any old check constraint, add the new vocabulary
ALTER TABLE manager_reports
  DROP CONSTRAINT IF EXISTS manager_reports_report_type_check;
ALTER TABLE manager_reports
  ADD CONSTRAINT manager_reports_report_type_check
  CHECK (report_type IN ('daily','weekly','project','risk','growth','execution'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mr_unit       ON manager_reports(execution_unit_id);
CREATE INDEX IF NOT EXISTS idx_mr_type_user  ON manager_reports(user_id, report_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_unread     ON manager_reports(user_id, read_at)
  WHERE read_at IS NULL;
