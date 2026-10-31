-- Guest reports remain private to staff unless a reporter presents their
-- high-entropy tracking code to the server-side guest-report endpoint.
alter table public.reports alter column reporter_id drop not null;

create table public.guest_report_access (
  report_id uuid primary key references public.reports (id) on delete cascade,
  access_token_hash text not null unique check (access_token_hash ~ '^[0-9a-f]{64}$'),
  contact_email text check (contact_email is null or (char_length(contact_email) between 3 and 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  last_email_notification_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.guest_report_access enable row level security;
revoke all on public.guest_report_access from anon, authenticated;
grant all on public.guest_report_access to service_role;
grant all on public.reports, public.guest_report_access to service_role;

create table public.guest_report_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index guest_report_attempts_ip_created_idx on public.guest_report_attempts (ip_hash, created_at desc);
create index guest_report_attempts_created_idx on public.guest_report_attempts (created_at);
alter table public.guest_report_attempts enable row level security;
revoke all on public.guest_report_attempts from anon, authenticated;
grant all on public.guest_report_attempts to service_role;

create or replace function public.claim_guest_report_slot(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_hour integer;
  recent_day integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  delete from public.guest_report_attempts where created_at < now() - interval '24 hours';
  select count(*)::integer into recent_hour from public.guest_report_attempts
    where ip_hash = p_ip_hash and created_at >= now() - interval '1 hour';
  select count(*)::integer into recent_day from public.guest_report_attempts
    where ip_hash = p_ip_hash and created_at >= now() - interval '24 hours';
  if recent_hour >= 3 or recent_day >= 8 then return false; end if;
  insert into public.guest_report_attempts (ip_hash) values (p_ip_hash);
  return true;
end;
$$;

revoke all on function public.claim_guest_report_slot(text) from public, anon, authenticated;
grant execute on function public.claim_guest_report_slot(text) to service_role;

create table public.report_confirmations (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete cascade,
  guest_ip_hash text check (guest_ip_hash is null or guest_ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check ((reporter_id is not null) <> (guest_ip_hash is not null))
);

create unique index report_confirmations_report_reporter_idx on public.report_confirmations (report_id, reporter_id) where reporter_id is not null;
create unique index report_confirmations_report_guest_idx on public.report_confirmations (report_id, guest_ip_hash) where guest_ip_hash is not null;
create index report_confirmations_report_idx on public.report_confirmations (report_id, created_at desc);
alter table public.report_confirmations enable row level security;

create policy "Staff and confirming residents can read confirmations"
  on public.report_confirmations for select to authenticated
  using ((select public.is_staff()) or reporter_id = (select auth.uid()));

create policy "Residents can confirm an open report once"
  on public.report_confirmations for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and guest_ip_hash is null
    and exists (select 1 from public.reports where reports.id = report_id
      and reports.status not in ('Resolved', 'Closed', 'Rejected', 'Duplicate'))
  );

grant select, insert on public.report_confirmations to authenticated;
grant usage, select on sequence public.report_confirmations_id_seq to authenticated;
grant all on public.report_confirmations to service_role;
grant usage, select on sequence public.report_confirmations_id_seq to service_role;

create table public.report_followers (
  report_id uuid not null references public.reports (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, profile_id)
);

alter table public.report_followers enable row level security;
create policy "Residents can view their follows and staff can view all"
  on public.report_followers for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_staff()));
create policy "Residents can follow open community reports"
  on public.report_followers for insert to authenticated
  with check (profile_id = (select auth.uid()) and exists (
    select 1 from public.reports where reports.id = report_id
      and reports.status not in ('Rejected', 'Duplicate')
  ));
create policy "Residents can unfollow reports"
  on public.report_followers for delete to authenticated
  using (profile_id = (select auth.uid()));
grant select, insert, delete on public.report_followers to authenticated;

create or replace function public.record_report_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.reports%rowtype;
begin
  select * into target from public.reports where id = new.report_id;
  if target.id is null or target.status in ('Resolved', 'Closed', 'Rejected', 'Duplicate') then
    raise exception 'This report is no longer open for confirmations.';
  end if;
  insert into public.report_events (report_id, actor_id, event_type, message)
  values (new.report_id, new.reporter_id, 'community_confirmation', 'A community member confirmed this issue is still present');
  insert into public.notifications (recipient_id, report_id, event_type, title, message)
  select profiles.id, new.report_id, 'community_confirmation', 'Issue confirmed by a resident',
    'A community member confirmed that "' || target.title || '" is still present.'
  from public.profiles where profiles.role = 'admin';
  if target.assigned_to is not null then
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    values (target.assigned_to, new.report_id, 'community_confirmation', 'Issue confirmed by a resident',
      'A community member confirmed that "' || target.title || '" is still present.');
  end if;
  return new;
end;
$$;

create trigger on_report_confirmation_created
  before insert on public.report_confirmations
  for each row execute procedure public.record_report_confirmation();

create table public.report_resolution_feedback (
  report_id uuid primary key references public.reports (id) on delete cascade,
  feedback text not null check (feedback in ('fixed', 'still_there')),
  message text check (message is null or char_length(message) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.report_resolution_feedback enable row level security;

create policy "Reporters and staff can read resolution feedback"
  on public.report_resolution_feedback for select to authenticated
  using ((select public.is_staff()) or exists (
    select 1 from public.reports where reports.id = report_id and reports.reporter_id = (select auth.uid())
  ));

create policy "Reporters can leave feedback after resolution"
  on public.report_resolution_feedback for insert to authenticated
  with check (exists (
    select 1 from public.reports where reports.id = report_id
      and reports.reporter_id = (select auth.uid()) and reports.status in ('Resolved', 'Closed')
  ));

create policy "Reporters can update their resolution feedback"
  on public.report_resolution_feedback for update to authenticated
  using (exists (
    select 1 from public.reports where reports.id = report_id
      and reports.reporter_id = (select auth.uid()) and reports.status in ('Resolved', 'Closed')
  ))
  with check (exists (
    select 1 from public.reports where reports.id = report_id
      and reports.reporter_id = (select auth.uid()) and reports.status in ('Resolved', 'Closed')
  ));

grant select, insert, update on public.report_resolution_feedback to authenticated;
grant all on public.report_resolution_feedback to service_role;

create or replace function public.record_report_resolution_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.reports%rowtype;
  label text;
begin
  select * into target from public.reports where id = new.report_id;
  if target.id is null or target.status not in ('Resolved', 'Closed') then
    raise exception 'Feedback is available after a report is resolved.';
  end if;
  new.message := nullif(btrim(new.message), '');
  new.updated_at := now();
  label := case new.feedback when 'still_there' then 'Reporter said the issue remains' else 'Reporter confirmed the issue was fixed' end;
  insert into public.report_events (report_id, actor_id, event_type, message)
  values (new.report_id, (select auth.uid()), 'resolution_feedback', label);
  if new.feedback = 'still_there' then
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    select profiles.id, new.report_id, 'resolution_follow_up', 'Resident says issue persists',
      'Review the resident follow-up for "' || target.title || '".'
    from public.profiles where profiles.role = 'admin';
    if target.assigned_to is not null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (target.assigned_to, new.report_id, 'resolution_follow_up', 'Resident says issue persists',
        'Review the resident follow-up for "' || target.title || '".');
    end if;
  end if;
  return new;
end;
$$;

create trigger on_report_resolution_feedback
  before insert or update on public.report_resolution_feedback
  for each row execute procedure public.record_report_resolution_feedback();

-- Guest reports have no profile row, so all reporter-facing notification writes
-- are conditional. Residents who follow a report receive status and assignment updates.
create or replace function public.create_report_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_type text;
  notification_title text;
  notification_message text;
begin
  if tg_op = 'INSERT' then
    if new.reporter_id is not null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.reporter_id, new.id, 'report_submitted', 'Report submitted', 'Your report "' || new.title || '" was submitted.');
    end if;
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    select profiles.id, new.id, 'new_report', 'New report', 'A new report needs review: ' || new.title || '.'
    from public.profiles where profiles.role = 'admin';
    if new.urgency = 'High' then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'critical_report', 'Critical report', 'High-urgency report received: ' || new.title || '.'
      from public.profiles where profiles.role = 'admin';
    end if;
    if new.assigned_to is null and new.assigned_team_id is null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'unassigned_report', 'Unassigned report', 'This report has no responder assigned: ' || new.title || '.'
      from public.profiles where profiles.role = 'admin';
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    notification_type := case new.status
      when 'Verified' then 'report_verified' when 'Rejected' then 'report_rejected'
      when 'Resolved' then 'report_resolved' when 'Closed' then 'report_closed'
      when 'Additional information requested' then 'additional_information_requested'
      when 'Awaiting verification' then 'resolution_awaiting_verification' else 'status_changed' end;
    notification_title := case new.status
      when 'Verified' then 'Report verified' when 'Rejected' then 'Report rejected'
      when 'Resolved' then 'Report resolved' when 'Closed' then 'Report closed'
      when 'Additional information requested' then 'Additional information requested'
      when 'Awaiting verification' then 'Resolution awaiting verification' else 'Report status changed' end;
    notification_message := '"' || new.title || '" is now ' || new.status || '.';
    if new.reporter_id is not null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.reporter_id, new.id, notification_type, notification_title, notification_message);
    end if;
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    select report_followers.profile_id, new.id, notification_type, notification_title, notification_message
    from public.report_followers where report_followers.report_id = new.id
      and report_followers.profile_id is distinct from new.reporter_id;
    if new.status = 'Awaiting verification' then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'resolution_awaiting_verification', 'Resolution awaiting verification', 'Review the proposed resolution for: ' || new.title || '.'
      from public.profiles where profiles.role = 'admin';
    end if;
  end if;

  if old.assigned_to is distinct from new.assigned_to or old.assigned_team_id is distinct from new.assigned_team_id then
    if new.reporter_id is not null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.reporter_id, new.id, 'assignment_changed', 'Report assignment changed', 'The response team for "' || new.title || '" was updated.');
    end if;
    if old.assigned_to is distinct from new.assigned_to and new.assigned_to is not null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.assigned_to, new.id, 'report_assigned', 'Task assigned', 'You have been assigned to: ' || new.title || '.');
    end if;
    if new.assigned_to is null and new.assigned_team_id is null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'unassigned_report', 'Unassigned report', 'This report has no responder or team assigned: ' || new.title || '.'
      from public.profiles where profiles.role = 'admin';
    end if;
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    select report_followers.profile_id, new.id, 'assignment_changed', 'Report assignment changed', 'The response team for "' || new.title || '" was updated.'
    from public.report_followers where report_followers.report_id = new.id
      and report_followers.profile_id is distinct from new.reporter_id
      and report_followers.profile_id is distinct from new.assigned_to;
  end if;
  return new;
end;
$$;

create table public.environmental_followups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  category text not null check (category in ('Waste', 'Pollution', 'Flooding', 'Drainage')),
  barangay text check (barangay is null or char_length(barangay) between 2 and 80),
  location_label text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source_report_ids uuid[] not null check (cardinality(source_report_ids) >= 2),
  status text not null default 'Scheduled' check (status in ('Scheduled', 'Completed', 'Dismissed')),
  assigned_team_id uuid references public.teams (id) on delete set null,
  due_date date,
  completion_note text check (completion_note is null or char_length(completion_note) <= 1000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index environmental_followups_status_due_idx on public.environmental_followups (status, due_date);
alter table public.environmental_followups enable row level security;

create policy "Staff can read environmental follow-ups"
  on public.environmental_followups for select to authenticated
  using ((select public.is_staff()));

create policy "Admins can create environmental follow-ups"
  on public.environmental_followups for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy "Admins can manage environmental follow-ups"
  on public.environmental_followups for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Assigned responders can complete environmental follow-ups"
  on public.environmental_followups for update to authenticated
  using (status = 'Scheduled' and assigned_team_id is not null and exists (
    select 1 from public.team_members where team_members.team_id = assigned_team_id and team_members.profile_id = (select auth.uid())
  ))
  with check (status in ('Scheduled', 'Completed') and assigned_team_id is not null and exists (
    select 1 from public.team_members where team_members.team_id = assigned_team_id and team_members.profile_id = (select auth.uid())
  ));

grant select, insert, update on public.environmental_followups to authenticated;
grant all on public.environmental_followups to service_role;

create or replace function public.guard_environmental_followup_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.is_admin()) then
    new.updated_at := now();
    if new.status = 'Completed' and old.status is distinct from new.status then new.completed_at := now(); end if;
    if new.status <> 'Completed' then new.completed_at := null; end if;
    return new;
  end if;
  if (select auth.uid()) is null or not exists (
    select 1 from public.team_members where team_members.team_id = old.assigned_team_id and team_members.profile_id = (select auth.uid())
  ) or old.status <> 'Scheduled' or old.assigned_team_id is distinct from new.assigned_team_id
     or old.due_date is distinct from new.due_date or old.title is distinct from new.title
     or old.category is distinct from new.category or old.barangay is distinct from new.barangay
     or old.location_label is distinct from new.location_label or old.latitude is distinct from new.latitude
     or old.longitude is distinct from new.longitude or old.source_report_ids is distinct from new.source_report_ids
     or old.created_by is distinct from new.created_by or old.created_at is distinct from new.created_at
     or old.status is not distinct from new.status or new.status <> 'Completed' then
    raise exception 'Only administrators can change or reschedule follow-up tasks.';
  end if;
  new.completed_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_environmental_followup_update
  before update on public.environmental_followups
  for each row execute procedure public.guard_environmental_followup_update();

drop view if exists public.community_reports;
create view public.community_reports
with (security_barrier = true)
as
  select reports.id, reports.title, reports.category, reports.issue_type, reports.status, reports.urgency,
         reports.description, reports.location_label, reports.latitude, reports.longitude,
         reports.observed_at, reports.created_at, reports.updated_at, reports.barangay,
         case
           when reports.reporter_id is null then 'Guest reporter'
           when reports.status in ('Verified', 'In progress', 'Resolved', 'Closed') then profiles.display_name
           else null
         end as reporter_display_name
  from public.reports
  left join public.profiles on profiles.id = reports.reporter_id
  where reports.status not in ('Rejected', 'Duplicate');

grant select on public.community_reports to anon, authenticated;
