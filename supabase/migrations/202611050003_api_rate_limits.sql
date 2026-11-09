create table public.api_rate_events (
  id bigint generated always as identity primary key,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now()
);

create index api_rate_events_lookup_idx on public.api_rate_events (action, subject_hash, created_at desc);
alter table public.api_rate_events enable row level security;
revoke all on public.api_rate_events from anon, authenticated;
grant all on public.api_rate_events to service_role;

create or replace function public.claim_api_rate_limit(
  p_subject_hash text,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if p_subject_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  if p_action !~ '^[a-z_]{1,40}$' then return false; end if;
  if p_max_requests < 1 or p_max_requests > 1000 then return false; end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_subject_hash || ':' || p_action, 0));
  delete from public.api_rate_events
    where action = p_action
      and created_at < now() - (p_window_seconds * interval '1 second');
  select count(*)::integer into recent
    from public.api_rate_events
    where subject_hash = p_subject_hash
      and action = p_action
      and created_at >= now() - (p_window_seconds * interval '1 second');
  if recent >= p_max_requests then return false; end if;
  insert into public.api_rate_events (subject_hash, action) values (p_subject_hash, p_action);
  return true;
end;
$$;

revoke all on function public.claim_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_api_rate_limit(text, text, integer, integer) to service_role;
