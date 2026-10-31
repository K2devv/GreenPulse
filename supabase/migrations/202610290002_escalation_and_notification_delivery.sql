alter table public.response_settings
  add column second_escalation_multiplier smallint not null default 2
    check (second_escalation_multiplier between 2 and 10);

alter table public.notifications
  add column email_attempt_count smallint not null default 0 check (email_attempt_count >= 0),
  add column email_last_attempt_at timestamptz,
  add column email_last_error text check (email_last_error is null or char_length(email_last_error) <= 500),
  add column email_delivery_status text not null default 'pending' check (email_delivery_status in ('pending', 'sent', 'failed', 'suppressed'));

update public.notifications set email_delivery_status = case when email_sent_at is null then 'pending' else 'sent' end;

alter table public.guest_report_access
  add column last_email_notification_event_id bigint references public.report_events (id) on delete set null,
  add column guest_email_attempt_count smallint not null default 0 check (guest_email_attempt_count >= 0),
  add column guest_email_last_attempt_at timestamptz,
  add column guest_email_last_error text check (guest_email_last_error is null or char_length(guest_email_last_error) <= 500),
  add column guest_email_delivery_status text not null default 'pending' check (guest_email_delivery_status in ('pending', 'sent', 'failed'));

update public.guest_report_access
set guest_email_delivery_status = 'sent'
where last_email_notification_at is not null and guest_email_last_attempt_at is null;

create table public.report_sla_escalations (
  report_id uuid not null references public.reports (id) on delete cascade,
  stage smallint not null check (stage in (1, 2)),
  escalated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  primary key (report_id, stage),
  check ((acknowledged_at is null) = (acknowledged_by is null))
);

create index report_sla_escalations_unacknowledged_idx
  on public.report_sla_escalations (escalated_at desc) where acknowledged_at is null;

alter table public.report_sla_escalations enable row level security;
create policy "Staff can read SLA escalations"
  on public.report_sla_escalations for select to authenticated
  using ((select public.is_staff()));
create policy "Admins or assigned responders can acknowledge SLA escalations"
  on public.report_sla_escalations for update to authenticated
  using (
    (select public.is_admin()) or exists (
      select 1 from public.reports
      where reports.id = report_sla_escalations.report_id
        and (reports.assigned_to = (select auth.uid()) or exists (
          select 1 from public.team_members
          where team_members.team_id = reports.assigned_team_id
            and team_members.profile_id = (select auth.uid())
        ))
    )
  )
  with check (
    acknowledged_at is not null and acknowledged_by = (select auth.uid())
    and ((select public.is_admin()) or exists (
      select 1 from public.reports
      where reports.id = report_sla_escalations.report_id
        and (reports.assigned_to = (select auth.uid()) or exists (
          select 1 from public.team_members
          where team_members.team_id = reports.assigned_team_id
            and team_members.profile_id = (select auth.uid())
        ))
    ))
  );
grant select, update (acknowledged_at, acknowledged_by) on public.report_sla_escalations to authenticated;
grant update (second_escalation_multiplier) on public.response_settings to authenticated;

drop policy if exists "Admins can review notification delivery" on public.notifications;
create policy "Admins can review notification delivery"
  on public.notifications for select to authenticated
  using ((select public.is_admin()));
grant select on public.notifications to authenticated;
