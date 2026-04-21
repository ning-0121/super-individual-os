-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (managed by Supabase Auth, this is a profile extension)
create table if not exists user_memory (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique,
  long_term_goal text default '',
  current_stage text default '早期验证',
  personality_tags text[] default '{}',
  risk_preference text default '稳健',
  strengths text[] default '{}',
  weaknesses text[] default '{}',
  active_projects text[] default '{}',
  frozen_projects text[] default '{}',
  current_phase_month integer default 1,
  current_phase_week integer default 1,
  current_focus text default '',
  ai_response_style text default '先给判断，再给理由',
  updated_at timestamptz default now()
);

-- Projects
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  status text default 'active' check (status in ('active','maintain','frozen','stopped')),
  phase text default 'month_1' check (phase in ('month_1','month_2','month_3')),
  north_star_metric text default '',
  north_star_target text default '',
  north_star_current text default '0',
  monthly_focus text default '',
  phase_end_date date,
  continue_condition text default '',
  pivot_condition text default '',
  stop_condition text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Conversations
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  mode text default 'strategy' check (mode in ('strategy','execution','review')),
  project_id uuid references projects(id) on delete set null,
  title text default '新对话',
  created_at timestamptz default now()
);

-- Messages
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  status text default 'todo' check (status in ('todo','in_progress','done','paused')),
  priority text default 'important' check (priority in ('must','important','optional')),
  executor text default 'self' check (executor in ('self','ai','delegate')),
  week_number integer default 1,
  due_date date,
  kpi text default '',
  created_at timestamptz default now()
);

-- Decisions
create table if not exists decisions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  content text not null,
  decision_type text check (decision_type in ('stop','continue','pivot')),
  created_at timestamptz default now()
);

-- RLS Policies
alter table user_memory enable row level security;
alter table projects enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table tasks enable row level security;
alter table decisions enable row level security;

create policy "Users own their memory" on user_memory for all using (auth.uid() = user_id);
create policy "Users own their projects" on projects for all using (auth.uid() = user_id);
create policy "Users own their conversations" on conversations for all using (auth.uid() = user_id);
create policy "Users own their messages" on messages for all
  using (conversation_id in (select id from conversations where user_id = auth.uid()));
create policy "Users own their tasks" on tasks for all using (auth.uid() = user_id);
create policy "Users own their decisions" on decisions for all using (auth.uid() = user_id);
