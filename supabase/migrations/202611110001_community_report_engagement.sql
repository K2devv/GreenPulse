-- Public engagement counts for community report cards: how many people confirmed an issue is
-- still there, and how many public comments it has. Only aggregate counts leave the database;
-- confirmer identities stay behind the report_confirmations RLS policies.
-- Requires 202610200001_guest_feedback_recurrence.sql and 202611080001_community_report_comments.sql.

create or replace function public.community_report_engagement(report_ids uuid[])
returns table (report_id uuid, still_there integer, comments integer)
language sql
stable
security definer
set search_path = ''
as $$
  select reports.id,
         (select count(*)::integer from public.report_confirmations
           where report_confirmations.report_id = reports.id),
         (select count(*)::integer from public.community_report_comments
           where community_report_comments.report_id = reports.id)
  from public.reports
  where reports.id = any (report_ids[1:500])
    and reports.status not in ('Rejected', 'Duplicate');
$$;

revoke all on function public.community_report_engagement(uuid[]) from public;
grant execute on function public.community_report_engagement(uuid[]) to anon, authenticated;
