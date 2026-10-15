alter table public.reports
  add column started_at timestamptz,
  add column escalated_at timestamptz;

-- Backfill from the existing audit trail where possible.
update public.reports
set started_at = coalesce(
  (select min(created_at) from public.report_events
   where report_events.report_id = reports.id and event_type = 'status_changed'
     and message like '% to In progress'),
  case when status in ('In progress', 'Awaiting verification', 'Resolved') then updated_at end
)
where started_at is null and status in ('In progress', 'Awaiting verification', 'Resolved', 'Closed');

update public.reports
set escalated_at = created_at
where category = 'Flooding' and urgency = 'High';

create index reports_escalated_idx on public.reports (escalated_at desc) where escalated_at is not null;

-- System-managed timestamps: response start and escalation flag.
create or replace function public.track_report_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := null;
    new.escalated_at := case when new.category = 'Flooding' and new.urgency = 'High' then now() end;
    return new;
  end if;

  new.started_at := old.started_at;
  new.escalated_at := old.escalated_at;
  if new.status = 'In progress' and old.status is distinct from new.status and new.started_at is null then
    new.started_at := now();
  end if;
  if new.escalated_at is null and new.category = 'Flooding' and new.urgency = 'High' then
    new.escalated_at := now();
  end if;
  return new;
end;
$$;

create trigger track_report_response
  before insert or update on public.reports
  for each row execute procedure public.track_report_response();

-- Critical flooding reports notify every admin and are recorded in the report history.
create or replace function public.escalate_critical_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.escalated_at is null or (tg_op = 'UPDATE' and old.escalated_at is not null) then
    return new;
  end if;

  insert into public.notifications (recipient_id, report_id, event_type, title, message)
  select profiles.id, new.id, 'escalated_report', 'Critical flooding escalated',
    'Immediate attention needed: ' || new.title || '. Assign a response team.'
  from public.profiles
  where profiles.role = 'admin';

  insert into public.report_events (report_id, actor_id, event_type, message)
  values (new.id, null, 'escalated', 'Escalated for immediate attention (critical flooding)');
  return new;
end;
$$;

create trigger on_report_escalated
  after insert or update on public.reports
  for each row execute procedure public.escalate_critical_report();
