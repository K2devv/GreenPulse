create or replace function public.raise_report_sla_escalation(p_report_id uuid, p_stage smallint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_inserted uuid;
  v_urgency text;
begin
  if p_stage not in (1, 2) then
    raise exception 'Invalid escalation stage';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.status in ('Resolved', 'Rejected', 'Closed', 'Duplicate') then
    return false;
  end if;

  insert into public.report_sla_escalations (report_id, stage)
  values (p_report_id, p_stage)
  on conflict (report_id, stage) do nothing
  returning report_id into v_inserted;
  if v_inserted is null then
    return false;
  end if;

  v_urgency := case when v_report.urgency = 'High' then 'high-urgency ' else '' end;
  insert into public.notifications (recipient_id, report_id, event_type, title, message)
  select profiles.id, v_report.id, 'sla_escalation_stage_' || p_stage,
    case when p_stage = 1 then 'Response deadline missed' else 'Escalated response deadline missed' end,
    case when p_stage = 1
      then 'The ' || v_urgency || 'response deadline has passed for ' || chr(34) || v_report.title || chr(34) || '. Review or assign this report.'
      else 'This report is still open after the second escalation window: ' || chr(34) || v_report.title || chr(34) || '. A supervisor should review the assignment and response plan.'
    end
  from public.profiles
  where profiles.role = 'admin'
    or (p_stage = 1 and (
      profiles.id = v_report.assigned_to
      or exists (
        select 1 from public.team_members
        where team_members.team_id = v_report.assigned_team_id
          and team_members.profile_id = profiles.id
      )
    ));

  insert into public.report_events (report_id, actor_id, event_type, message)
  values (v_report.id, null, 'sla_escalated',
    'Escalation stage ' || p_stage || ' raised: ' || case when p_stage = 1 then 'response deadline passed' else 'second escalation window passed' end);
  return true;
end;
$$;

revoke all on function public.raise_report_sla_escalation(uuid, smallint) from public, anon, authenticated;
grant execute on function public.raise_report_sla_escalation(uuid, smallint) to service_role;

create or replace function public.admin_pilot_outcomes()
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

  with reopened as (
    select distinct report_id
    from public.report_events
    where event_type = 'status_changed'
      and message ~ '^Status changed from (Resolved|Closed) to (In progress|Under review|Additional information requested|Verified)$'
  ), by_barangay as (
    select coalesce(nullif(btrim(reports.barangay), ''), 'No barangay recorded') as label,
      count(*)::integer as reports,
      count(*) filter (where reports.status in ('Resolved', 'Closed'))::integer as resolved,
      count(*) filter (where reopened.report_id is not null)::integer as reopened,
      avg(extract(epoch from (reports.started_at - reports.created_at)) * 1000)
        filter (where reports.started_at >= reports.created_at) as average_first_response_ms,
      avg(extract(epoch from (reports.resolved_at - reports.created_at)) * 1000)
        filter (where reports.resolved_at >= reports.created_at) as average_resolution_ms
    from public.reports
    left join reopened on reopened.report_id = reports.id
    group by 1
  )
  select jsonb_build_object(
    'totalReports', (select count(*)::integer from public.reports),
    'reopenedReports', (select count(*)::integer from reopened),
    'byBarangay', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', label, 'reports', reports, 'resolved', resolved, 'reopened', reopened,
        'averageFirstResponseMs', average_first_response_ms,
        'averageResolutionMs', average_resolution_ms
      ) order by reports desc, label)
      from by_barangay
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_pilot_outcomes() from public, anon;
grant execute on function public.admin_pilot_outcomes() to authenticated;

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
      coalesce(notifications.email_sent_at, notifications.email_last_attempt_at) as attempted_at
    from public.notifications
    join public.reports on reports.id = notifications.report_id
    where notifications.email_sent_at is not null or notifications.email_last_attempt_at is not null or notifications.email_last_error is not null
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
    into v_result from (select * from failures limit 50) failures;
  return v_result;
end;
$$;

revoke all on function public.admin_notification_delivery_history() from public, anon;
grant execute on function public.admin_notification_delivery_history() to authenticated;

alter table public.reports add column client_submission_id uuid unique;
alter table public.guest_report_access add column client_submission_id uuid unique;
