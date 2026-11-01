-- Bring older databases up to the notification-delivery schema used by /api/send-notification-emails.
alter table public.notifications
  add column if not exists email_attempt_count smallint not null default 0 check (email_attempt_count >= 0),
  add column if not exists email_last_attempt_at timestamptz,
  add column if not exists email_last_error text check (email_last_error is null or char_length(email_last_error) <= 500),
  add column if not exists email_delivery_status text not null default 'pending' check (email_delivery_status in ('pending', 'sent', 'failed', 'suppressed'));

update public.notifications
set email_delivery_status = 'sent'
where email_sent_at is not null and email_delivery_status = 'pending';

alter table public.guest_report_access
  add column if not exists last_email_notification_event_id bigint references public.report_events (id) on delete set null,
  add column if not exists guest_email_attempt_count smallint not null default 0 check (guest_email_attempt_count >= 0),
  add column if not exists guest_email_last_attempt_at timestamptz,
  add column if not exists guest_email_last_error text check (guest_email_last_error is null or char_length(guest_email_last_error) <= 500),
  add column if not exists guest_email_delivery_status text not null default 'pending' check (guest_email_delivery_status in ('pending', 'sent', 'failed'));

update public.guest_report_access
set guest_email_delivery_status = 'sent'
where last_email_notification_at is not null and guest_email_last_attempt_at is null and guest_email_delivery_status = 'pending';

-- Also list alerts that were never attempted so admins can deliver them with Retry.
create or replace function public.admin_notification_delivery_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  with failures as (
    select 'notification:' || notifications.id::text as id, notifications.report_id,
      reports.title, notifications.email_attempt_count as attempts,
      notifications.email_last_error as last_error, 'Resident/staff alert'::text as channel,
      case notifications.email_delivery_status when 'sent' then 'Sent' when 'suppressed' then 'Suppressed' when 'failed' then 'Failed' else 'Pending' end as status,
      coalesce(notifications.email_sent_at, notifications.email_last_attempt_at, notifications.created_at) as attempted_at
    from public.notifications
    join public.reports on reports.id = notifications.report_id
    where notifications.email_sent_at is not null or notifications.email_last_attempt_at is not null
      or notifications.email_last_error is not null or notifications.email_delivery_status = 'pending'
    union all
    select 'guest:' || guest_report_access.report_id::text as id, guest_report_access.report_id,
      reports.title, guest_report_access.guest_email_attempt_count as attempts,
      guest_report_access.guest_email_last_error as last_error, 'Guest update'::text as channel,
      case guest_report_access.guest_email_delivery_status when 'sent' then 'Sent' when 'failed' then 'Failed' else 'Pending' end as status,
      coalesce(guest_report_access.guest_email_last_attempt_at, guest_report_access.last_email_notification_at) as attempted_at
    from public.guest_report_access
    join public.reports on reports.id = guest_report_access.report_id
    where guest_report_access.guest_email_last_attempt_at is not null or guest_report_access.last_email_notification_at is not null
  )
  select coalesce(jsonb_agg(to_jsonb(failures) order by attempted_at desc nulls last), '[]'::jsonb)
    into v_result from (select * from failures order by attempted_at desc nulls last limit 50) failures;
  return v_result;
end;
$$;

revoke all on function public.admin_notification_delivery_history() from public, anon;
grant execute on function public.admin_notification_delivery_history() to authenticated;

-- The email endpoint runs with the service role and needs explicit table access.
grant select, update on public.notifications to service_role;
grant select on public.report_events to service_role;
grant select, update on public.guest_report_access to service_role;
grant select on public.profiles to service_role;
