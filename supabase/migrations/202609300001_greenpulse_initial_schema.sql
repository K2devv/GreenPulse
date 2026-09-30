create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'resident' check (role in ('resident', 'responder', 'admin')),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  category text not null check (category in ('Waste', 'Flooding', 'Water pollution', 'Air pollution', 'Drainage')),
  status text not null default 'Submitted' check (status in ('Submitted', 'Under review', 'Verified', 'In progress', 'Resolved', 'Rejected')),
  urgency text not null default 'Medium' check (urgency in ('Low', 'Medium', 'High')),
  description text not null check (char_length(description) between 8 and 2000),
  location_label text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  photo_path text,
  assigned_to uuid references public.profiles (id) on delete set null,
  verified_by uuid references public.profiles (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (status <> 'Resolved' or resolved_at is not null),
  check (status <> 'Rejected' or resolution_note is not null)
);

create table public.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index reports_status_created_at_idx on public.reports (status, created_at desc);
create index reports_reporter_created_at_idx on public.reports (reporter_id, created_at desc);
create index reports_assigned_to_idx on public.reports (assigned_to) where assigned_to is not null;
create index reports_location_idx on public.reports (latitude, longitude);
create index report_events_report_created_at_idx on public.report_events (report_id, created_at desc);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('responder', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

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

  if old.resolution_note is distinct from new.resolution_note then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'resolution_updated', 'Resolution details updated');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger on_report_change
  before update on public.reports
  for each row execute procedure public.record_report_event();

create trigger on_report_created
  after insert on public.reports
  for each row execute procedure public.record_report_event();

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_events enable row level security;

create policy "Profiles are visible to their owner and staff"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy "Users can update their own display name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

create policy "Residents can submit reports as themselves"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and status = 'Submitted'
    and assigned_to is null and verified_by is null and resolved_at is null
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
  );

create policy "Residents can read their own reports and staff can read all"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_staff()));

create policy "Staff can update reports"
  on public.reports for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "Reporters and staff can read report history"
  on public.report_events for select to authenticated
  using (
    (select public.is_staff()) or exists (
      select 1 from public.reports
      where reports.id = report_events.report_id and reports.reporter_id = (select auth.uid())
    )
  );

grant select, insert on public.reports to authenticated;
grant update (status, assigned_to, verified_by, resolution_note, resolved_at) on public.reports to authenticated;
grant select on public.report_events to authenticated;

create or replace view public.community_reports
with (security_barrier = true)
as
  select id, title, category, status, urgency, description, location_label,
         latitude, longitude, created_at, updated_at
  from public.reports
  where status in ('Verified', 'In progress', 'Resolved');

grant select on public.community_reports to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Residents upload photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners and staff can read report photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_staff()))
  );

create policy "Staff can remove report photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos' and (select public.is_staff()));