-- ══════════════════════════════════════════════════════
-- V2.1b — Manager Reports + Growth Experiments
-- Idempotent. Builds on v2.1-mission-control.sql.
-- ══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. manager_reports — auto-generated summaries per role
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manager_reports (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_id    uuid REFERENCES managers(id) ON DELETE SET NULL,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  system_id     uuid REFERENCES systems(id)  ON DELETE SET NULL,
  role          text NOT NULL,                 -- denormalized for quick filter
  report_period text NOT NULL DEFAULT 'on_demand'
                CHECK (report_period IN ('daily','weekly','on_demand')),
  summary       text DEFAULT '',
  metrics       jsonb DEFAULT '{}',
  source        text DEFAULT 'rule_based'
                CHECK (source IN ('rule_based','llm','manual')),
  generated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mr_user_time   ON manager_reports(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_role        ON manager_reports(role, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_system      ON manager_reports(system_id);

ALTER TABLE manager_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own manager_reports" ON manager_reports;
CREATE POLICY "own manager_reports" ON manager_reports FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 2. growth_experiments — tracked A/B / channel tests
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_experiments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system_id       uuid REFERENCES systems(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  name            text NOT NULL,
  hypothesis      text DEFAULT '',
  channel         text DEFAULT '',
  target_metric   text DEFAULT '',
  baseline_value  text DEFAULT '',
  current_value   text DEFAULT '',
  target_value    text DEFAULT '',
  status          text DEFAULT 'planning'
                  CHECK (status IN ('planning','running','completed','aborted')),
  result_summary  text DEFAULT '',
  next_action     text DEFAULT '',
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ge_system     ON growth_experiments(system_id);
CREATE INDEX IF NOT EXISTS idx_ge_project    ON growth_experiments(project_id);
CREATE INDEX IF NOT EXISTS idx_ge_user_status ON growth_experiments(user_id, status);

ALTER TABLE growth_experiments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own growth_experiments" ON growth_experiments;
CREATE POLICY "own growth_experiments" ON growth_experiments FOR ALL USING (auth.uid() = user_id);
