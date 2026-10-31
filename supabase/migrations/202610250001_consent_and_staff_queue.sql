alter table public.reports
  add column consent_version text,
  add column consent_at timestamptz;

alter table public.reports
  add constraint reports_consent_pair_check
  check ((consent_version is null) = (consent_at is null)),
  add constraint reports_consent_version_check
  check (consent_version is null or consent_version = '2026-10-v1');

create or replace function public.guard_report_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.consent_version is distinct from '2026-10-v1' then
    raise exception 'Please accept the current report visibility notice before submitting.';
  end if;
  new.consent_at := now();
  return new;
end;
$$;

create trigger guard_report_consent_before_insert
  before insert on public.reports
  for each row execute procedure public.guard_report_consent();

create index if not exists reports_created_at_id_idx on public.reports (created_at desc, id);
create index if not exists reports_staff_open_created_idx on public.reports (created_at desc)
  where status not in ('Resolved', 'Rejected', 'Closed', 'Duplicate');
create index if not exists reports_assigned_to_created_idx on public.reports (assigned_to, created_at desc);
create index if not exists reports_assigned_team_created_idx on public.reports (assigned_team_id, created_at desc);

create or replace function public.staff_report_page(
  p_query text default '',
  p_status text default 'open',
  p_resolution text default '',
  p_category text default '',
  p_urgency text default '',
  p_barangay text default '',
  p_assignee text default '',
  p_team text default '',
  p_date_from date default null,
  p_date_to date default null,
  p_page_size integer default 50,
  p_page_offset integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_page_offset integer := greatest(coalesce(p_page_offset, 0), 0);
begin
  if not coalesce((select public.is_staff()), false) then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;

  with matched as (
    select reports.*,
      reporter.display_name as reporter_display_name,
      (reports.escalated_at is not null or
        (reports.category = 'Flooding' and reports.urgency = 'High'
          and reports.status not in ('Resolved', 'Rejected', 'Closed', 'Duplicate'))) as is_escalated
    from public.reports
    left join public.profiles reporter on reporter.id = reports.reporter_id
    left join public.profiles assignee on assignee.id = reports.assigned_to
    left join public.teams on teams.id = reports.assigned_team_id
    where
      (coalesce(p_status, 'open') = 'all'
        or (p_status = 'open' and reports.status not in ('Resolved', 'Rejected', 'Closed', 'Duplicate'))
        or (p_status not in ('all', 'open') and reports.status = p_status))
      and (coalesce(p_category, '') = '' or reports.category = p_category)
      and (coalesce(p_urgency, '') = '' or reports.urgency = p_urgency)
      and (coalesce(p_barangay, '') = ''
        or (p_barangay = 'none' and reports.barangay is null)
        or reports.barangay = p_barangay)
      and (coalesce(p_assignee, '') = ''
        or (p_assignee = 'unassigned' and reports.assigned_to is null)
        or reports.assigned_to::text = p_assignee)
      and (coalesce(p_team, '') = ''
        or (p_team = 'unassigned' and reports.assigned_team_id is null)
        or reports.assigned_team_id::text = p_team)
      and (coalesce(p_resolution, '') = ''
        or (p_resolution = 'unresolved' and reports.status not in ('Awaiting verification', 'Resolved', 'Rejected', 'Closed', 'Duplicate'))
        or (p_resolution = 'awaiting' and reports.status = 'Awaiting verification')
        or (p_resolution = 'resolved' and reports.status = 'Resolved')
        or (p_resolution = 'closed' and reports.status = 'Closed'))
      and (p_date_from is null or reports.created_at >= p_date_from::timestamptz)
      and (p_date_to is null or reports.created_at < (p_date_to + 1)::timestamptz)
      and not exists (
        select 1
        from unnest(string_to_array(lower(trim(coalesce(p_query, ''))), ' ')) as token(value)
        where token.value <> '' and concat_ws(' ',
          reports.id::text,
          upper(left(reports.id::text, 8)),
          reports.title,
          reports.description,
          reports.location_label,
          reports.barangay,
          reports.category,
          reports.issue_type,
          reporter.display_name,
          assignee.display_name,
          teams.name
        ) not ilike '%' || token.value || '%'
      )
  )
  select jsonb_build_object(
    'totalCount', (select count(*) from matched),
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_row) order by page_row.is_escalated desc, page_row.created_at desc, page_row.id)
      from (
        select * from matched
        order by is_escalated desc, created_at desc, id
        limit v_page_size offset v_page_offset
      ) page_row
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.staff_report_page(text, text, text, text, text, text, text, text, date, date, integer, integer) from public, anon;
grant execute on function public.staff_report_page(text, text, text, text, text, text, text, text, date, date, integer, integer) to authenticated;

create table public.response_settings (
  singleton boolean primary key default true check (singleton),
  response_sla_hours smallint not null default 48 check (response_sla_hours between 1 and 720),
  high_urgency_sla_hours smallint not null default 12 check (high_urgency_sla_hours between 1 and 720),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.response_settings (singleton) values (true);
alter table public.response_settings enable row level security;

create policy "Staff can read response settings"
  on public.response_settings for select to authenticated
  using ((select public.is_staff()));

create policy "Admins can update response settings"
  on public.response_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create or replace function public.record_response_settings_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

create trigger record_response_settings_change_before_update
  before update on public.response_settings
  for each row execute procedure public.record_response_settings_change();

revoke all on public.response_settings from anon, authenticated;
grant select on public.response_settings to authenticated;
grant update (response_sla_hours, high_urgency_sla_hours) on public.response_settings to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
    ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end;
$$;
