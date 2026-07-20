-- ─────────────────────────────────────────
-- execution_units: human / ai / agent executors
-- ─────────────────────────────────────────
create table if not exists execution_units (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  type          text not null check (type in ('human', 'ai', 'agent')),
  name          text not null,
  avatar        text default '🤖',
  description   text default '',
  capabilities  jsonb default '[]',   -- ['writing','coding','research','strategy','ops','outreach']
  style_prompt  text default '',      -- injected into Claude system prompt for 'agent' type
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- Bind tasks to an execution unit
alter table tasks
  add column if not exists execution_unit_id uuid references execution_units(id) on delete set null;

-- RLS
alter table execution_units enable row level security;
DROP POLICY IF EXISTS "own execution_units" ON execution_units;
create policy "own execution_units" on execution_units for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Default units seeded per user via trigger
-- (Call manually or via onboarding instead)
-- ─────────────────────────────────────────
