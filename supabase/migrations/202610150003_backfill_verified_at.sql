-- Reports verified before verified_at existed have a status but no timestamp.
update public.reports
set verified_at = coalesce(
  (select min(created_at) from public.report_events
   where report_events.report_id = reports.id and event_type = 'status_changed'
     and message like '% to Verified'),
  updated_at
)
where verified_at is null
  and status in ('Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Closed');
