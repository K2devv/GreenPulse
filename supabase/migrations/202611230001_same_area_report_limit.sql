-- One reporter may have at most 3 reports at the same spot (within 50 m), counting reports from
-- the last 30 days that are not Resolved or Closed yet. Mirrors src/lib/report-area-limit.ts;
-- change the numbers there and here together.
--
-- Signed-in reporters: a before-insert trigger on reports refuses the fourth (errcode GP429).
-- Guests have no account, so the guest endpoint asks guest_same_area_report_count() first and
-- counts reports from the same connection, email address, or phone number.

create or replace function public.distance_in_meters(
  p_latitude_one double precision, p_longitude_one double precision,
  p_latitude_two double precision, p_longitude_two double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(p_latitude_two - p_latitude_one) / 2), 2)
    + cos(radians(p_latitude_one)) * cos(radians(p_latitude_two)) * power(sin(radians(p_longitude_two - p_longitude_one) / 2), 2)
  )))
$$;

-- Reports near a point that still count toward the limit. The box (about 55 m by 65 m) lets the
-- index narrow the rows before the exact distance is measured.
create or replace function public.report_counts_toward_area_limit(
  p_report public.reports, p_latitude double precision, p_longitude double precision)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_report.status not in ('Resolved', 'Closed')
    and p_report.created_at >= now() - interval '30 days'
    and p_report.latitude between p_latitude - 0.0005 and p_latitude + 0.0005
    and p_report.longitude between p_longitude - 0.0006 and p_longitude + 0.0006
    and public.distance_in_meters(p_report.latitude, p_report.longitude, p_latitude, p_longitude) <= 50
$$;

revoke all on function public.distance_in_meters(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_counts_toward_area_limit(public.reports, double precision, double precision) from public, anon, authenticated;

create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc) where reporter_id is not null;

create or replace function public.enforce_same_area_report_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.reporter_id is null then return new; end if;
  -- Two submissions from one reporter at once must not both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('same-area-report:' || new.reporter_id::text, 0));
  select count(*)::integer into v_count from public.reports r
    where r.reporter_id = new.reporter_id
      and r.id <> new.id
      and public.report_counts_toward_area_limit(r, new.latitude, new.longitude);
  if v_count >= 3 then
    raise exception 'You already have 3 reports at this spot. Wait for staff to resolve them, or follow an existing report instead of submitting another.'
      using errcode = 'GP429';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_same_area_report_limit_before_insert on public.reports;
create trigger enforce_same_area_report_limit_before_insert
  before insert on public.reports
  for each row execute procedure public.enforce_same_area_report_limit();

-- Guests: remember which connection sent each report (a keyed hash, like guest_report_attempts).
alter table public.guest_report_access
  add column if not exists guest_ip_hash text check (guest_ip_hash is null or guest_ip_hash ~ '^[0-9a-f]{64}$');
create index if not exists guest_report_access_ip_hash_idx on public.guest_report_access (guest_ip_hash) where guest_ip_hash is not null;
create index if not exists guest_report_access_email_idx on public.guest_report_access (contact_email) where contact_email is not null;
create index if not exists guest_report_access_phone_idx on public.guest_report_access (contact_phone) where contact_phone is not null;

create or replace function public.guest_same_area_report_count(
  p_ip_hash text, p_email text, p_phone text, p_latitude double precision, p_longitude double precision)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(distinct r.id)::integer into v_count
    from public.guest_report_access a
    join public.reports r on r.id = a.report_id
    where (a.guest_ip_hash = p_ip_hash
        or (nullif(p_email, '') is not null and a.contact_email = lower(p_email))
        or (nullif(p_phone, '') is not null and a.contact_phone = p_phone))
      and public.report_counts_toward_area_limit(r, p_latitude, p_longitude);
  return v_count;
end;
$$;

revoke all on function public.guest_same_area_report_count(text, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.guest_same_area_report_count(text, text, text, double precision, double precision) to service_role;
