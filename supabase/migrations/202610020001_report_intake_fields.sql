drop view if exists public.community_reports;

alter table public.reports
  drop constraint if exists reports_category_check;

alter table public.reports
  add column issue_type text not null default 'Other issue',
  add column observed_at timestamptz not null default now(),
  add column additional_info text,
  add column photo_paths text[] not null default '{}';

update public.reports
set issue_type = category
where category in ('Air pollution', 'Water pollution');

update public.reports
set category = 'Pollution'
where category in ('Air pollution', 'Water pollution');

alter table public.reports
  add constraint reports_category_check check (category in ('Waste', 'Pollution', 'Flooding', 'Drainage')),
  add constraint reports_issue_type_check check (char_length(issue_type) between 1 and 80),
  add constraint reports_additional_info_check check (additional_info is null or char_length(additional_info) <= 2000),
  add constraint reports_photo_paths_count_check check (cardinality(photo_paths) <= 5);

update public.reports
set photo_paths = array[photo_path]
where photo_path is not null and cardinality(photo_paths) = 0;

drop policy if exists "Residents can submit reports as themselves" on public.reports;
create policy "Residents can submit reports as themselves"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and status = 'Submitted'
    and assigned_to is null and verified_by is null and resolved_at is null
    and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
    and not exists (
      select 1 from unnest(photo_paths) as paths(path)
      where paths.path not like (select auth.uid())::text || '/%'
    )
  );

create policy "Residents can remove unattached report photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.reports
      where reporter_id = (select auth.uid())
        and (photo_path = storage.objects.name or storage.objects.name = any(photo_paths))
    )
  );

create or replace view public.community_reports
with (security_barrier = true)
as
  select reports.id, reports.title, reports.category, reports.issue_type, reports.status, reports.urgency,
         reports.description, reports.location_label, reports.latitude, reports.longitude,
         reports.observed_at, reports.created_at, reports.updated_at,
         case
           when reports.status in ('Verified', 'In progress', 'Resolved') then profiles.display_name
           else null
         end as reporter_display_name
  from public.reports
  join public.profiles on profiles.id = reports.reporter_id
  where reports.status <> 'Rejected';

grant select on public.community_reports to anon, authenticated;