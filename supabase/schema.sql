-- PrepPilot database schema (v2) for Supabase.
-- Safe to run on a NEW project or AGAIN on an existing one: it only creates what's missing and never deletes data.
-- Supabase → SQL Editor → New query → paste this whole file → Run.
--
-- Every table has Row Level Security: a signed-in user can only see and change their own rows.

-- ============================================================ shared helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================ profiles (one per user)
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
alter table public.profiles add column if not exists track             text not null default 'general';
alter table public.profiles add column if not exists headline          text not null default '';
alter table public.profiles add column if not exists years_experience  numeric(4,1) not null default 0;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

alter table public.profiles drop constraint if exists profiles_track_check;
alter table public.profiles add constraint profiles_track_check check (track in
  ('sde','ai_ml','data','product','design','marketing','sales','customer_service','people_ops','finance','general'));

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================ resumes (parsed resume history)
-- Only the structured extraction is stored; the original file and contact details are not.
create table if not exists public.resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  file_name     text not null default '',
  track         text not null default 'general',
  target_role   text not null default '',
  resume_score  int check (resume_score between 0 and 100),
  parsed        jsonb not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists resumes_user_idx on public.resumes (user_id, created_at desc);
-- at most one active resume per user
create unique index if not exists resumes_one_active_idx on public.resumes (user_id) where is_active;

-- ============================================================ interview sessions
create table if not exists public.interview_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  avg_score       numeric(4,2) not null default 0,
  focus_score     int not null default 100,
  flags           jsonb not null default '[]',
  question_count  int not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.interview_sessions add column if not exists track            text not null default 'general';
alter table public.interview_sessions add column if not exists round_type       text not null default 'mixed';
alter table public.interview_sessions add column if not exists status           text not null default 'completed';
alter table public.interview_sessions add column if not exists ended_at         timestamptz;
alter table public.interview_sessions add column if not exists duration_seconds int;
alter table public.interview_sessions add column if not exists recorded_video   boolean not null default false;

alter table public.interview_sessions drop constraint if exists interview_sessions_status_check;
alter table public.interview_sessions add constraint interview_sessions_status_check
  check (status in ('in_progress', 'completed', 'abandoned'));
alter table public.interview_sessions drop constraint if exists interview_sessions_focus_check;
alter table public.interview_sessions add constraint interview_sessions_focus_check
  check (focus_score between 0 and 100);
create index if not exists sessions_user_idx on public.interview_sessions (user_id, created_at desc);

-- ============================================================ answers (one per question)
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
alter table public.answers add column if not exists round_type   text not null default 'technical';
alter table public.answers add column if not exists rubric       jsonb not null default '{}';
alter table public.answers add column if not exists strengths    text[] not null default '{}';
alter table public.answers add column if not exists missed       text[] not null default '{}';
alter table public.answers add column if not exists ideal_answer text not null default '';
alter table public.answers add column if not exists is_follow_up boolean not null default false;
create index if not exists answers_user_topic_idx on public.answers (user_id, topic, created_at desc);
create index if not exists answers_session_idx on public.answers (session_id);

-- ============================================================ roadmap, question bank, chat
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
alter table public.question_bank add column if not exists track text not null default 'general';
create index if not exists bank_user_topic_idx on public.question_bank (user_id, topic);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_user_idx on public.chat_messages (user_id, created_at);

-- ============================================================ per-topic progress view
-- security_invoker = true makes the view respect each table's Row Level Security.
create or replace view public.topic_progress with (security_invoker = true) as
select
  user_id,
  topic,
  count(*)                          as attempts,
  round(avg(score)::numeric, 2)     as avg_score,
  max(created_at)                   as last_practiced
from public.answers
group by user_id, topic;

-- ============================================================ Row Level Security
alter table public.profiles           enable row level security;
alter table public.resumes            enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.answers            enable row level security;
alter table public.roadmaps           enable row level security;
alter table public.question_bank      enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own resumes" on public.resumes;
create policy "own resumes" on public.resumes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
