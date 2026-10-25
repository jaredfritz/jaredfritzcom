-- Workout tracker: run only in a dedicated Supabase project.
-- New Data API settings may require explicit table exposure; grants are included.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.workout_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Other',
  favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id,name)
);
create table if not exists public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_on date not null,
  status text not null default 'in_progress' check (status in ('in_progress','completed','deleted')),
  source_key text,
  body_weight_lbs numeric(6,2) check (body_weight_lbs is null or body_weight_lbs between 0 and 1500),
  payload jsonb not null default '{"items":[]}'::jsonb check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key)
);
create index if not exists workout_sessions_owner_date_idx on public.workout_sessions(user_id,performed_on desc);
create index if not exists workout_exercises_owner_idx on public.workout_exercises(user_id);
alter table public.workout_exercises enable row level security;
alter table public.workout_sessions enable row level security;
revoke all on public.workout_exercises, public.workout_sessions from anon;
grant select,insert,update,delete on public.workout_exercises, public.workout_sessions to authenticated;
create policy "exercise select own" on public.workout_exercises for select to authenticated using ((select auth.uid())=user_id);
create policy "exercise insert own" on public.workout_exercises for insert to authenticated with check ((select auth.uid())=user_id);
create policy "exercise update own" on public.workout_exercises for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "exercise delete own" on public.workout_exercises for delete to authenticated using ((select auth.uid())=user_id);
create policy "session select own" on public.workout_sessions for select to authenticated using ((select auth.uid())=user_id);
create policy "session insert own" on public.workout_sessions for insert to authenticated with check ((select auth.uid())=user_id);
create policy "session update own" on public.workout_sessions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "session delete own" on public.workout_sessions for delete to authenticated using ((select auth.uid())=user_id);
