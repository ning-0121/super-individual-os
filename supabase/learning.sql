-- ─────────────────────────────────────────
-- decision_logs: every AI strategic judgment
-- ─────────────────────────────────────────
create table if not exists decision_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  conversation_id   uuid references conversations(id) on delete set null,
  mode              text,
  detected_mode     text,
  user_input        text not null,
  ai_output         text default '',
  risk_flags        jsonb default '[]',
  context_ids       jsonb default '{}',
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- execution_logs: action items extracted from AI output
-- ─────────────────────────────────────────
create table if not exists execution_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  decision_log_id   uuid references decision_logs(id) on delete cascade,
  action_item       text not null,
  timeframe         text default 'general', -- 7days / 30days / 90days / general
  status            text default 'pending' check (status in ('pending','done','skipped')),
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- outcome_logs: user feedback on AI judgments
-- ─────────────────────────────────────────
create table if not exists outcome_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  decision_log_id   uuid references decision_logs(id) on delete cascade,
  feedback          text check (feedback in ('helpful','neutral','not_helpful')),
  note              text default '',
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- learning_patterns: aggregated insight per user
-- ─────────────────────────────────────────
create table if not exists learning_patterns (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete cascade,
  pattern_type      text not null, -- mode_helpfulness / top_risk / action_completion
  pattern_key       text not null,
  pattern_value     jsonb not null default '{}',
  updated_at        timestamptz default now(),
  unique (user_id, pattern_type, pattern_key)
);

-- RLS
alter table decision_logs     enable row level security;
alter table execution_logs    enable row level security;
alter table outcome_logs      enable row level security;
alter table learning_patterns enable row level security;

DROP POLICY IF EXISTS "own decision_logs" ON decision_logs;
create policy "own decision_logs"     on decision_logs     for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own execution_logs" ON execution_logs;
create policy "own execution_logs"    on execution_logs    for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own outcome_logs" ON outcome_logs;
create policy "own outcome_logs"      on outcome_logs      for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own learning_patterns" ON learning_patterns;
create policy "own learning_patterns" on learning_patterns for all using (auth.uid() = user_id);
