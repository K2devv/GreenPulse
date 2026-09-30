drop view if exists public.community_reports;

create or replace view public.community_reports
with (security_barrier = true)
as
  select reports.id, reports.title, reports.category, reports.status, reports.urgency,
         reports.description, reports.location_label, reports.latitude, reports.longitude,
         reports.created_at, reports.updated_at, profiles.display_name as reporter_display_name
  from public.reports
  join public.profiles on profiles.id = reports.reporter_id
  where reports.status in ('Verified', 'In progress', 'Resolved');

grant select on public.community_reports to anon, authenticated;