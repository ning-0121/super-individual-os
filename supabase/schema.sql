create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text default '',
  avatar_url text default '',
  role text default 'founder',
  goals text default '',
  personality_style text default '',
  risk_preference text default '稳健',
  current_focus text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  status text default 'active' check (status in ('active','maintain','frozen','stopped')),
  priority text default 'important' check (priority in ('must','important','optional')),
  category text default '',
  north_star_metric text default '',
  north_star_target text default '',
  north_star_current text default '0',
  monthly_focus text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text default '',
  status text default 'todo' check (status in ('todo','in_progress','done','paused')),
  priority text default 'important' check (priority in ('must','important','optional')),
  due_date date,
  assignee text default 'self',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  mode text default 'strategy' check (mode in ('strategy','execution','review')),
  title text default '新对话',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- memories
-- ─────────────────────────────────────────
create table if not exists memories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  memory_type text check (memory_type in (
    'goal','personality','preference','project',
    'decision','risk','failure','success'
  )),
  content text not null,
  importance integer default 3 check (importance between 1 and 5),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────
alter table user_profiles enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table memories enable row level security;

DROP POLICY IF EXISTS "own profile" ON user_profiles;
create policy "own profile" on user_profiles for all using (auth.uid() = id);
DROP POLICY IF EXISTS "own projects" ON projects;
create policy "own projects" on projects for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own tasks" ON tasks;
create policy "own tasks" on tasks for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own conversations" ON conversations;
create policy "own conversations" on conversations for all using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own messages" ON messages;
create policy "own messages" on messages for all
  using (conversation_id in (select id from conversations where user_id = auth.uid()));
DROP POLICY IF EXISTS "own memories" ON memories;
create policy "own memories" on memories for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- auto-create profile on signup
-- ─────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
