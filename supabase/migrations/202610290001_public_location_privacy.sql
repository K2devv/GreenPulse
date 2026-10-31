-- Preserve historical consent versions, but require the updated notice for all new reports.
alter table public.reports
  drop constraint reports_consent_version_check,
  add constraint reports_consent_version_check
    check (consent_version is null or consent_version in ('2026-10-v1', '2026-10-v2'));

create or replace function public.guard_report_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.consent_version is distinct from '2026-10-v2' then
    raise exception 'Please accept the current report visibility notice before submitting.';
  end if;
  new.consent_at := now();
  return new;
end;
$$;

drop view if exists public.community_reports;
create view public.community_reports
with (security_barrier = true)
as
  select reports.id,
         reports.title,
         reports.category,
         reports.issue_type,
         reports.status,
         reports.urgency,
         reports.description,
         coalesce('Barangay ' || nullif(reports.barangay, ''), 'District 5, Quezon City') as location_label,
         round(reports.latitude::numeric, 3)::double precision as latitude,
         round(reports.longitude::numeric, 3)::double precision as longitude,
         reports.observed_at,
         reports.created_at,
         reports.updated_at,
         reports.barangay,
         case
           when reports.reporter_id is null then 'Guest reporter'
           when reports.status in ('Verified', 'In progress', 'Resolved', 'Closed') then profiles.display_name
           else null
         end as reporter_display_name
  from public.reports
  left join public.profiles on profiles.id = reports.reporter_id
  where reports.status not in ('Rejected', 'Duplicate');

grant select on public.community_reports to anon, authenticated;
