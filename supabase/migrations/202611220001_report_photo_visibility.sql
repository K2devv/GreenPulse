-- Reporters choose who can see their report photos:
--   private: only the reporter, responders and admins (what every photo was until now)
--   public:  anyone, guests included, once staff have verified the report
-- Existing reports stay private. Public photos wait for verification so an unreviewed upload never
-- reaches the public map, the same rule as reporter names.

alter table public.reports
  add column photo_visibility text not null default 'private'
    check (photo_visibility in ('private', 'public'));

-- Whether a report's photos are shown to everyone: the reporter made them public and staff verified
-- the report. Rejected, duplicate and not-yet-reviewed reports never show photos publicly.
create or replace function public.report_photos_are_public(visibility text, report_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select visibility = 'public'
    and report_status in ('Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Closed');
$$;

grant execute on function public.report_photos_are_public(text, text) to anon, authenticated;

-- Notice v3 explains the photo choice. v2 promised that photos stay private, so it still covers a
-- private submission (an older copy of the app sends v2), but a public photo needs v3.
alter table public.reports
  drop constraint reports_consent_version_check,
  add constraint reports_consent_version_check
    check (consent_version is null or consent_version in ('2026-10-v1', '2026-10-v2', '2026-11-v3'));

create or replace function public.guard_report_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.consent_version is null or new.consent_version not in ('2026-10-v2', '2026-11-v3') then
    raise exception 'Please accept the current report visibility notice before submitting.';
  end if;
  if new.photo_visibility = 'public' and new.consent_version <> '2026-11-v3' then
    raise exception 'Please accept the current report visibility notice before making photos public.';
  end if;
  new.consent_at := now();
  return new;
end;
$$;

-- After submission only an admin may change the choice, and only to hide the photos (for example a
-- photo that shows a face or a plate number). Nobody can make a reporter's private photo public.
create or replace function public.guard_report_photo_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_visibility is not distinct from old.photo_visibility then
    return new;
  end if;
  -- Service role and SQL editor sessions have no end user and are trusted.
  if (select auth.uid()) is null then
    return new;
  end if;
  if not coalesce((select public.is_admin()), false) or new.photo_visibility <> 'private' then
    raise exception 'Only administrators can change photo visibility, and only to make photos private.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_report_photo_visibility_before_update
  before update of photo_visibility on public.reports
  for each row execute procedure public.guard_report_photo_visibility();

create or replace function public.record_report_photo_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_visibility is distinct from old.photo_visibility then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (
      new.id,
      (select auth.uid()),
      'photo_visibility_changed',
      case when new.photo_visibility = 'private' then 'Report photos made private' else 'Report photos made public' end
    );
  end if;
  return null;
end;
$$;

create trigger record_report_photo_visibility_after_update
  after update of photo_visibility on public.reports
  for each row execute procedure public.record_report_photo_visibility();

grant update (photo_visibility) on public.reports to authenticated;

-- The public view carries the photo choice, and the photo paths only while the photos are public.
-- Columns are appended so `create or replace` keeps the view's existing shape and grants.
create or replace view public.community_reports
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
         end as reporter_display_name,
         reports.photo_visibility,
         case
           when public.report_photos_are_public(reports.photo_visibility, reports.status) then reports.photo_paths
           else '{}'::text[]
         end as photo_paths
  from public.reports
  left join public.profiles on profiles.id = reports.reporter_id
  where reports.status not in ('Rejected', 'Duplicate');

grant select on public.community_reports to anon, authenticated;

-- Storage: anyone may read (and so sign links to) a photo that belongs to a report whose photos are
-- public. Every other report photo keeps the owner-and-staff policy from the initial schema.
create index reports_public_photo_paths_idx
  on public.reports using gin (photo_paths)
  where photo_visibility = 'public';

create or replace function public.is_public_report_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports
    where reports.photo_visibility = 'public'
      and public.report_photos_are_public(reports.photo_visibility, reports.status)
      and reports.photo_paths @> array[object_name]
  );
$$;

revoke all on function public.is_public_report_photo(text) from public;
grant execute on function public.is_public_report_photo(text) to anon, authenticated;

create policy "Anyone can read public report photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'report-photos' and public.is_public_report_photo(name));
