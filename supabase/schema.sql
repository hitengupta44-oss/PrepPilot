-- PrepPilot database schema for Supabase (free tier).
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Every table has Row Level Security: a signed-in user can only see and change their own rows.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  role        text not null,
  level       text not null default '',
  skills      text[] not null default '{}',
  topics      text[] not null default '{}',
  summary     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.interview_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  avg_score       numeric(4,2) not null default 0,
  focus_score     int not null default 100,
  flags           jsonb not null default '[]',
  question_count  int not null default 0,
  created_at      timestamptz not null default now()
);

-- One row per answered question. Topic strength (red / yellow / green) is computed from these.
create table if not exists public.answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  session_id  uuid references public.interview_sessions (id) on delete cascade,
  topic       text not null,
  question    text not null,
  answer      text not null default '',
  score       int not null check (score between 0 and 10),
  verdict     text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists answers_user_topic_idx on public.answers (user_id, topic, created_at desc);

create table if not exists public.roadmaps (
  user_id     uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data        jsonb not null,
  done        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table if not exists public.question_bank (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  topic       text not null,
  question    text not null,
  difficulty  text not null default 'Medium',
  hint        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists bank_user_topic_idx on public.question_bank (user_id, topic);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_user_idx on public.chat_messages (user_id, created_at);

-- Row Level Security -------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.answers            enable row level security;
alter table public.roadmaps           enable row level security;
alter table public.question_bank      enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own sessions" on public.interview_sessions;
create policy "own sessions" on public.interview_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own answers" on public.answers;
create policy "own answers" on public.answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own roadmap" on public.roadmaps;
create policy "own roadmap" on public.roadmaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bank" on public.question_bank;
create policy "own bank" on public.question_bank
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own chat" on public.chat_messages;
create policy "own chat" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
