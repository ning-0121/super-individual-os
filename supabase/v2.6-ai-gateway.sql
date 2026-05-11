-- ══════════════════════════════════════════════════════
-- V2.6 — AI Gateway / Model Router V1
-- - model_registry: catalog of available models (provider, cost, caps)
-- - extends model_runs with cost + fallback fields
-- Idempotent.
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_registry (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider                 text NOT NULL CHECK (provider IN ('anthropic','openai','gemini','deepseek','local','mock')),
  model_name               text NOT NULL,                  -- canonical id used in API calls
  display_name             text NOT NULL,
  cost_input_usd_per_1m    numeric DEFAULT 0,              -- $/M input tokens
  cost_output_usd_per_1m   numeric DEFAULT 0,              -- $/M output tokens
  context_window           int DEFAULT 200000,
  supports_streaming       boolean DEFAULT true,
  is_enabled               boolean DEFAULT true,
  is_default_for_stage     jsonb DEFAULT '[]',             -- ['engineering','qa',...]
  notes                    text DEFAULT '',
  sort_order               int DEFAULT 100,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  UNIQUE (provider, model_name)
);

CREATE INDEX IF NOT EXISTS idx_mreg_provider ON model_registry(provider);
CREATE INDEX IF NOT EXISTS idx_mreg_enabled  ON model_registry(is_enabled, sort_order);

-- Public read for authenticated users (it's a catalog, not user-scoped).
ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read model_registry" ON model_registry;
CREATE POLICY "read model_registry" ON model_registry FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────
-- Seed common models. Costs as of mid-2025 (override per env if needed).
-- ─────────────────────────────────────────────────
INSERT INTO model_registry
  (provider, model_name, display_name, cost_input_usd_per_1m, cost_output_usd_per_1m, context_window, supports_streaming, is_enabled, is_default_for_stage, sort_order)
VALUES
  ('anthropic', 'claude-sonnet-4-6',        'Claude Sonnet 4.6',     3,     15,    200000, true, true,
   '["engineering","architecture","debug","migration_draft"]'::jsonb, 10),
  ('anthropic', 'claude-3-5-haiku-latest',  'Claude Haiku 3.5',      0.8,   4,     200000, true, true, '[]'::jsonb, 20),
  ('openai',    'gpt-4o',                   'OpenAI GPT-4o',         2.5,   10,    128000, true, true,
   '["qa","review","risk","migration_qa","research","growth","content"]'::jsonb, 30),
  ('openai',    'gpt-4o-mini',              'OpenAI GPT-4o mini',    0.15,  0.6,   128000, true, true, '[]'::jsonb, 40),
  ('gemini',    'gemini-1.5-pro',           'Gemini 1.5 Pro',        1.25,  5,     1000000, true, false, '[]'::jsonb, 50),
  ('mock',      'mock-echo',                'Mock (test only)',      0,     0,     1000000, false, false, '[]'::jsonb, 999)
ON CONFLICT (provider, model_name) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  cost_input_usd_per_1m  = EXCLUDED.cost_input_usd_per_1m,
  cost_output_usd_per_1m = EXCLUDED.cost_output_usd_per_1m,
  context_window         = EXCLUDED.context_window,
  is_default_for_stage   = EXCLUDED.is_default_for_stage,
  updated_at             = now();

-- ─────────────────────────────────────────────────
-- Extend model_runs with cost + fallback bookkeeping
-- ─────────────────────────────────────────────────
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS cost_usd_estimated  numeric DEFAULT 0;
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS fallback_used       boolean DEFAULT false;
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS primary_provider    text;     -- when fallback_used = true
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS primary_model       text;
ALTER TABLE model_runs ADD COLUMN IF NOT EXISTS metadata            jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_mr_cost_time ON model_runs(user_id, created_at DESC);
