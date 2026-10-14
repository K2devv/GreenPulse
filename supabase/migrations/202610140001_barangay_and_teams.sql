create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);

create unique index teams_name_unique_idx on public.teams (lower(btrim(name)));

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);

create index team_members_profile_idx on public.team_members (profile_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Staff can read teams"
  on public.teams for select to authenticated
  using ((select public.is_staff()));

create policy "Admins can manage teams"
  on public.teams for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Staff can read team members"
  on public.team_members for select to authenticated
  using ((select public.is_staff()));

create policy "Admins can manage team members"
  on public.team_members for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;

alter table public.reports
  add column barangay text check (barangay is null or char_length(barangay) between 2 and 80),
  add column assigned_team_id uuid references public.teams (id) on delete set null;

create index reports_barangay_idx on public.reports (barangay) where barangay is not null;
create index reports_assigned_team_idx on public.reports (assigned_team_id) where assigned_team_id is not null;

grant update (assigned_team_id) on public.reports to authenticated;

drop policy if exists "Residents can submit reports as themselves" on public.reports;
create policy "Residents can submit reports as themselves"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and status = 'Submitted'
    and assigned_to is null and assigned_team_id is null and verified_by is null and resolved_at is null
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
    and not exists (
      select 1 from unnest(photo_paths) as paths(path)
      where paths.path not like (select auth.uid())::text || '/%'
    )
  );

create or replace function public.record_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, new.reporter_id, 'submitted', 'Report submitted');
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'Resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
    elsif old.status = 'Resolved' then
      new.resolved_at := null;
    end if;
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'status_changed', 'Status changed from ' || old.status || ' to ' || new.status);
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'assignment_changed', case when new.assigned_to is null then 'Assignment removed' else 'Report assigned to a responder' end);
  end if;

  if old.assigned_team_id is distinct from new.assigned_team_id then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'team_assignment_changed', case when new.assigned_team_id is null then 'Team assignment removed' else 'Report assigned to a team' end);
  end if;

  if old.resolution_note is distinct from new.resolution_note then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'resolution_updated', 'Resolution details updated');
  end if;

  new.updated_at := now();
  return new;
end;
$$;
