alter table public.reports
  drop constraint if exists reports_status_check;

alter table public.reports
  add constraint reports_status_check check (status in (
    'Submitted', 'Under review', 'Additional information requested', 'Verified',
    'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed'
  ));

alter table public.profiles
  add column if not exists email_notifications boolean not null default true;

grant update (email_notifications) on public.profiles to authenticated;

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_sent_at timestamptz
);

create index notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_email_pending_idx
  on public.notifications (report_id, created_at)
  where email_sent_at is null;

alter table public.notifications enable row level security;

create policy "Users can read their own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Users can mark their own notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.create_report_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_type text;
  notification_title text;
  notification_message text;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    values (
      new.reporter_id, new.id, 'report_submitted', 'Report submitted',
      'Your report "' || new.title || '" was submitted.'
    );

    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    select profiles.id, new.id, 'new_report', 'New report',
      'A new report needs review: ' || new.title || '.'
    from public.profiles
    where profiles.role = 'admin';

    if new.urgency = 'High' then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'critical_report', 'Critical report',
        'High-urgency report received: ' || new.title || '.'
      from public.profiles
      where profiles.role = 'admin';
    end if;

    if new.assigned_to is null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'unassigned_report', 'Unassigned report',
        'This report has no responder assigned: ' || new.title || '.'
      from public.profiles
      where profiles.role = 'admin';
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    notification_type := case new.status
      when 'Verified' then 'report_verified'
      when 'Rejected' then 'report_rejected'
      when 'Resolved' then 'report_resolved'
      when 'Closed' then 'report_closed'
      when 'Additional information requested' then 'additional_information_requested'
      when 'Awaiting verification' then 'resolution_awaiting_verification'
      else 'status_changed'
    end;
    notification_title := case new.status
      when 'Verified' then 'Report verified'
      when 'Rejected' then 'Report rejected'
      when 'Resolved' then 'Report resolved'
      when 'Closed' then 'Report closed'
      when 'Additional information requested' then 'Additional information requested'
      when 'Awaiting verification' then 'Resolution awaiting verification'
      else 'Report status changed'
    end;
    notification_message := '"' || new.title || '" is now ' || new.status || '.';

    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    values (new.reporter_id, new.id, notification_type, notification_title, notification_message);

    if new.status = 'Awaiting verification' then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'resolution_awaiting_verification', 'Resolution awaiting verification',
        'Review the proposed resolution for: ' || new.title || '.'
      from public.profiles
      where profiles.role = 'admin';
    end if;
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    if new.assigned_to is not null then
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.reporter_id, new.id, 'report_assigned', 'Report assigned',
        'A responder has been assigned to "' || new.title || '".');

      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.assigned_to, new.id, 'report_assigned', 'Task assigned',
        'You have been assigned to: ' || new.title || '.');
    else
      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      values (new.reporter_id, new.id, 'assignment_changed', 'Assignment changed',
        'The responder assignment for "' || new.title || '" was removed.');

      insert into public.notifications (recipient_id, report_id, event_type, title, message)
      select profiles.id, new.id, 'unassigned_report', 'Unassigned report',
        'This report has no responder assigned: ' || new.title || '.'
      from public.profiles
      where profiles.role = 'admin';
    end if;
  end if;

  return new;
end;
$$;

create trigger on_report_notifications
  after insert or update on public.reports
  for each row execute procedure public.create_report_notifications();