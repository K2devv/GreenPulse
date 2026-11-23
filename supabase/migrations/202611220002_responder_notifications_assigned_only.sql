-- Responders get notifications only about reports assigned to them.
--
-- Until now a responder could also be notified about reports they follow, reports they filed
-- themselves, and reports that were assigned to them before being reassigned to someone else. That
-- mixed other people's work into their inbox. Now:
--
-- 1. A notification for a responder is created only while the report is assigned to that responder,
--    directly (reports.assigned_to) or through their team (reports.assigned_team_id), the same rule
--    that decides which tasks a responder may update. Every notification trigger goes through this
--    one guard, so new notification sources follow the rule too.
-- 2. A responder sees only the notifications for reports currently assigned to them. When a report
--    is reassigned, its earlier notifications leave the old responder's inbox (they are kept, not
--    deleted, and come back if the report is assigned to them again).
--
-- Admins and residents are not affected. Apply after 202611220001_report_photo_visibility.sql.

-- Whether a profile is on a report's task, directly or through the assigned team.
-- Internal: used by the trigger and the read rule below, not callable by clients.
create or replace function public.profile_is_on_report(p_profile_id uuid, p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reports
    where reports.id = p_report_id
      and (
        reports.assigned_to = p_profile_id
        or (reports.assigned_team_id is not null and exists (
          select 1 from public.team_members
          where team_members.team_id = reports.assigned_team_id
            and team_members.profile_id = p_profile_id
        ))
      )
  )
$$;

revoke all on function public.profile_is_on_report(uuid, uuid) from public, anon, authenticated;

-- Drops a new notification addressed to a responder who is not on the report.
create or replace function public.keep_responder_notifications_to_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where profiles.id = new.recipient_id and profiles.role = 'responder')
     and not public.profile_is_on_report(new.recipient_id, new.report_id) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_responder_notifications_to_assignments() from public, anon, authenticated;

drop trigger if exists keep_responder_notifications_to_assignments on public.notifications;
create trigger keep_responder_notifications_to_assignments
  before insert on public.notifications
  for each row execute procedure public.keep_responder_notifications_to_assignments();

-- For the read rule: true unless the signed-in user is a responder who is not on the report.
create or replace function public.notification_report_visible_to_me(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'responder')
    or public.profile_is_on_report((select auth.uid()), p_report_id)
$$;

revoke all on function public.notification_report_visible_to_me(uuid) from public, anon;
grant execute on function public.notification_report_visible_to_me(uuid) to authenticated;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and public.notification_report_visible_to_me(report_id));
