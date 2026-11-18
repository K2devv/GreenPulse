-- Reports assigned before assigned_at existed (202610140002) have an assignee or team but no
-- timestamp, so the staff progress strip shows "Assigned: Pending" and response-time averages skip
-- them. The workflow trigger sets assigned_at to the time of the latest assignment change, so take
-- the newest timeline event that assigned someone, falling back to updated_at as the verified_at
-- backfill (202610150003) does. Run from the SQL editor: the workflow trigger leaves sessions with
-- no signed-in user alone, and changing only assigned_at records no timeline event or notification.
--
-- One exception is skipped: track_report_response escalates any high-urgency flooding report that
-- has no escalated_at on its next update, which would notify every admin today. Such a report
-- (only possible if it predates 202610150002) keeps its empty assigned_at.
update public.reports
set assigned_at = coalesce(
  (select max(created_at) from public.report_events
   where report_events.report_id = reports.id
     and event_type in ('assignment_changed', 'team_assignment_changed')
     and message not like '%removed'),
  updated_at
)
where assigned_at is null
  and (assigned_to is not null or assigned_team_id is not null)
  and not (escalated_at is null and category = 'Flooding' and urgency = 'High');
