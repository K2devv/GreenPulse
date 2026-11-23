-- "Still there" confirmations are for responders and admins only. Residents and guests no
-- longer confirm an issue or see how many confirmations it has; their resolution feedback
-- ("It was fixed" / "Still needs attention") on their own reports is unchanged.
-- Requires 202610200001_guest_feedback_recurrence.sql and 202611110001_community_report_engagement.sql.

drop policy if exists "Residents can confirm an open report once" on public.report_confirmations;
drop policy if exists "Staff can confirm an open report once" on public.report_confirmations;

create policy "Staff can confirm an open report once"
  on public.report_confirmations for insert to authenticated
  with check (
    (select public.is_staff())
    and reporter_id = (select auth.uid()) and guest_ip_hash is null
    and exists (select 1 from public.reports where reports.id = report_id
      and reports.status not in ('Resolved', 'Closed', 'Rejected', 'Duplicate'))
  );

-- Comment counts stay public; the "still there" count is 0 for anyone who isn't staff.
create or replace function public.community_report_engagement(report_ids uuid[])
returns table (report_id uuid, still_there integer, comments integer)
language sql
stable
security definer
set search_path = ''
as $$
  select reports.id,
         case when (select public.is_staff()) then
           (select count(*)::integer from public.report_confirmations
             where report_confirmations.report_id = reports.id)
         else 0 end,
         (select count(*)::integer from public.community_report_comments
           where community_report_comments.report_id = reports.id)
  from public.reports
  where reports.id = any (report_ids[1:500])
    and reports.status not in ('Rejected', 'Duplicate');
$$;

revoke all on function public.community_report_engagement(uuid[]) from public;
grant execute on function public.community_report_engagement(uuid[]) to anon, authenticated;
