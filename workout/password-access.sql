-- Service-only password verifier. Provision the password and existing owner separately.
create table public.workout_password_access (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null references auth.users(id),
  password_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.workout_password_access enable row level security;
revoke all on public.workout_password_access from public, anon, authenticated;
grant select, update on public.workout_password_access to service_role;
create function public.check_workout_password(candidate text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  config public.workout_password_access%rowtype;
  current_time_value timestamptz := clock_timestamp();
begin
  select * into config from public.workout_password_access where singleton for update;
  if not found then return jsonb_build_object('status', 'unconfigured'); end if;
  if current_time_value >= config.window_started_at + interval '1 minute' then
    config.attempts := 0;
    config.window_started_at := current_time_value;
  end if;
  if config.attempts >= 5 then
    return jsonb_build_object('status', 'limited');
  end if;
  update public.workout_password_access
    set attempts = config.attempts + 1, window_started_at = config.window_started_at
    where singleton;
  if candidate is null or octet_length(candidate) > 72 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if extensions.crypt(candidate, config.password_hash) <> config.password_hash then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'owner_id', config.owner_id);
end;
$$;
revoke all on function public.check_workout_password(text) from public, anon, authenticated;
grant execute on function public.check_workout_password(text) to service_role;
