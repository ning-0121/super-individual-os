-- ══════════════════════════════════════════════════════
-- V1.9 — Stage Engine: 11-stage business lifecycle
-- Idempotent
-- ══════════════════════════════════════════════════════

-- 1. Add stage tracking to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_stage   int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stage_history   jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS stage_metadata  jsonb DEFAULT '{}';

-- Backfill existing projects to stage 1
UPDATE projects SET current_stage = 1 WHERE current_stage IS NULL;

-- 2. Stage-aware agent grants (project_agents allowed_stages)
ALTER TABLE project_agents
  ADD COLUMN IF NOT EXISTS allowed_stages jsonb;   -- NULL = all stages

-- 3. Index for stage queries
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(current_stage);
