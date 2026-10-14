alter table public.reports
  add column verified_at timestamptz,
  add column verification_note text check (verification_note is null or char_length(verification_note) <= 1000),
  add column duplicate_of uuid references public.reports (id) on delete set null,
  add column assigned_at timestamptz,
  add column due_date date,
  add column task_instructions text check (task_instructions is null or char_length(task_instructions) <= 1000),
  add column task_priority text check (task_priority is null or task_priority in ('Low', 'Medium', 'High')),
  add column resolution_photo_paths text[] not null default '{}' check (cardinality(resolution_photo_paths) <= 5),
  add column resolution_decision text check (resolution_decision is null or resolution_decision in ('approved', 'rejected', 'action_requested')),
  add column resolution_review_note text check (resolution_review_note is null or char_length(resolution_review_note) <= 1000),
  add column resolution_reviewed_by uuid references public.profiles (id) on delete set null,
  add column resolution_reviewed_at timestamptz;

alter table public.reports
  add constraint reports_not_own_duplicate_check check (duplicate_of is null or duplicate_of <> id);

alter table public.reports
  drop constraint if exists reports_status_check;

alter table public.reports
  add constraint reports_status_check check (status in (
    'Submitted', 'Under review', 'Additional information requested', 'Verified',
    'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed', 'Duplicate'
  ));

-- Rejections may now be explained by the verification note instead of the resolution note.
do $$
declare
  existing record;
begin
  for existing in
    select conname from pg_constraint
    where conrelid = 'public.reports'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%Rejected%' and pg_get_constraintdef(oid) like '%resolution_note%'
  loop
    execute format('alter table public.reports drop constraint %I', existing.conname);
  end loop;
end;
$$;

alter table public.reports
  add constraint reports_rejected_note_check check (status <> 'Rejected' or resolution_note is not null or verification_note is not null),
  add constraint reports_duplicate_target_check check (status <> 'Duplicate' or duplicate_of is not null);

create index reports_due_date_idx on public.reports (due_date) where due_date is not null;
create index reports_duplicate_of_idx on public.reports (duplicate_of) where duplicate_of is not null;

grant update (
  category, urgency, verification_note, duplicate_of, due_date, task_instructions, task_priority,
  resolution_photo_paths, resolution_decision, resolution_review_note
) on public.reports to authenticated;

create or replace function public.enforce_report_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_is_admin boolean;
  actor_on_task boolean;
  assignment_changed boolean;
  task_details_changed boolean;
begin
  -- Service role and SQL editor sessions have no end user and are trusted.
  if actor is null then
    return new;
  end if;

  actor_is_admin := (select public.is_admin());
  assignment_changed := old.assigned_to is distinct from new.assigned_to
    or old.assigned_team_id is distinct from new.assigned_team_id;
  task_details_changed := old.due_date is distinct from new.due_date
    or old.task_priority is distinct from new.task_priority
    or old.task_instructions is distinct from new.task_instructions;

  -- These values are always system-managed.
  new.verified_by := old.verified_by;
  new.verified_at := old.verified_at;
  new.assigned_at := old.assigned_at;
  new.resolution_reviewed_by := old.resolution_reviewed_by;
  new.resolution_reviewed_at := old.resolution_reviewed_at;

  if not actor_is_admin then
    if new.category is distinct from old.category
      or new.urgency is distinct from old.urgency
      or new.issue_type is distinct from old.issue_type
      or new.verification_note is distinct from old.verification_note
      or new.duplicate_of is distinct from old.duplicate_of
      or new.resolution_decision is distinct from old.resolution_decision
      or new.resolution_review_note is distinct from old.resolution_review_note
      or assignment_changed or task_details_changed then
      raise exception 'Only administrators can verify reports, assign tasks, or review resolutions.';
    end if;

    actor_on_task := coalesce(new.assigned_to = actor, false) or exists (
      select 1 from public.team_members
      where team_members.team_id = new.assigned_team_id and team_members.profile_id = actor
    );
    if not actor_on_task then
      raise exception 'Only the assigned responder or team can update this task.';
    end if;

    if new.status is distinct from old.status then
      if old.status not in ('Verified', 'In progress', 'Awaiting verification')
        or new.status not in ('In progress', 'Awaiting verification') then
        raise exception 'Responders can only start work or submit a resolution for verification.';
      end if;
    end if;

    if new.status not in ('Verified', 'In progress', 'Awaiting verification') then
      raise exception 'This task is not open for responder updates.';
    end if;
  else
    if new.status is distinct from old.status then
      if new.status = 'Verified' then
        new.verified_by := actor;
        new.verified_at := now();
      elsif new.status = 'Duplicate' and new.duplicate_of is null then
        raise exception 'Choose the original report this one duplicates.';
      end if;
      if new.status in ('Rejected', 'Additional information requested')
        and char_length(btrim(coalesce(new.verification_note, new.resolution_note, ''))) < 8 then
        raise exception 'Add a verification note of at least 8 characters.';
      end if;
      if new.status <> 'Duplicate' and old.status = 'Duplicate' then
        new.duplicate_of := null;
      end if;
    end if;

    if (assignment_changed or task_details_changed)
      and (new.assigned_to is not null or new.assigned_team_id is not null)
      and new.status not in ('Verified', 'In progress', 'Awaiting verification') then
      raise exception 'Reports must be verified before they can be assigned.';
    end if;

    if old.status = 'Awaiting verification' and new.status is distinct from old.status then
      if new.status = 'Resolved' then
        new.resolution_decision := 'approved';
      elsif new.status = 'In progress' then
        if coalesce(new.resolution_decision, '') not in ('rejected', 'action_requested')
          or char_length(btrim(coalesce(new.resolution_review_note, ''))) < 8 then
          raise exception 'Explain what must change before sending a resolution back.';
        end if;
      end if;
      new.resolution_reviewed_by := actor;
      new.resolution_reviewed_at := now();
    end if;
  end if;

  if new.status = 'Awaiting verification' and old.status is distinct from new.status then
    if char_length(btrim(coalesce(new.resolution_note, ''))) < 8 then
      raise exception 'Add response notes of at least 8 characters before submitting a resolution.';
    end if;
    new.resolution_decision := null;
    new.resolution_review_note := null;
    new.resolution_reviewed_by := null;
    new.resolution_reviewed_at := null;
  end if;

  if assignment_changed then
    new.assigned_at := case when new.assigned_to is null and new.assigned_team_id is null then null else now() end;
  end if;

  return new;
end;
$$;

create trigger enforce_report_workflow
  before update on public.reports
  for each row execute procedure public.enforce_report_workflow();

create or replace function public.record_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, new.reporter_id, 'submitted', 'Report submitted');
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'Resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
    elsif old.status = 'Resolved' then
      new.resolved_at := null;
    end if;
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'status_changed', 'Status changed from ' || old.status || ' to ' || new.status);
  end if;

  if old.category is distinct from new.category then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'category_changed', 'Category changed from ' || old.category || ' to ' || new.category);
  end if;

  if old.urgency is distinct from new.urgency then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'urgency_changed', 'Urgency changed from ' || old.urgency || ' to ' || new.urgency);
  end if;

  if old.duplicate_of is distinct from new.duplicate_of and new.duplicate_of is not null then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'marked_duplicate', 'Marked as a duplicate of report ' || upper(left(new.duplicate_of::text, 8)));
  end if;

  if old.verification_note is distinct from new.verification_note and new.verification_note is not null then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'verification_note', 'Verification note: ' || new.verification_note);
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'assignment_changed', case when new.assigned_to is null then 'Assignment removed' else case when old.assigned_to is null then 'Report assigned to a responder' else 'Report reassigned to another responder' end end);
  end if;

  if old.assigned_team_id is distinct from new.assigned_team_id then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'team_assignment_changed', case when new.assigned_team_id is null then 'Team assignment removed' else 'Report assigned to a team' end);
  end if;

  if old.due_date is distinct from new.due_date then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'due_date_changed', case when new.due_date is null then 'Due date cleared' else 'Due date set to ' || to_char(new.due_date, 'Mon DD, YYYY') end);
  end if;

  if old.task_priority is distinct from new.task_priority and new.task_priority is not null then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'task_priority_changed', 'Task priority set to ' || new.task_priority);
  end if;

  if old.task_instructions is distinct from new.task_instructions then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'task_instructions_updated', 'Task instructions updated');
  end if;

  if old.resolution_note is distinct from new.resolution_note then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'resolution_updated', 'Resolution details updated');
  end if;

  if old.resolution_photo_paths is distinct from new.resolution_photo_paths and cardinality(new.resolution_photo_paths) > cardinality(old.resolution_photo_paths) then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'resolution_photos_added', 'After-photos added');
  end if;

  if new.resolution_decision is not null and old.resolution_decision is distinct from new.resolution_decision then
    insert into public.report_events (report_id, actor_id, event_type, message)
    values (new.id, (select auth.uid()), 'resolution_reviewed', case new.resolution_decision
      when 'approved' then 'Resolution approved'
      when 'rejected' then 'Resolution rejected: ' || coalesce(new.resolution_review_note, '')
      else 'Additional action requested: ' || coalesce(new.resolution_review_note, '')
    end);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.notify_resolution_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.resolution_decision is not null
    and old.resolution_decision is distinct from new.resolution_decision
    and new.assigned_to is not null then
    insert into public.notifications (recipient_id, report_id, event_type, title, message)
    values (
      new.assigned_to, new.id, 'resolution_' || new.resolution_decision,
      case new.resolution_decision
        when 'approved' then 'Resolution approved'
        when 'rejected' then 'Resolution sent back'
        else 'Additional action requested'
      end,
      case new.resolution_decision
        when 'approved' then 'Your resolution for "' || new.title || '" was approved.'
        else 'Review feedback for "' || new.title || '": ' || coalesce(new.resolution_review_note, '')
      end
    );
  end if;
  return new;
end;
$$;

create trigger on_resolution_review_notification
  after update on public.reports
  for each row execute procedure public.notify_resolution_review();

create or replace view public.community_reports
with (security_barrier = true)
as
  select reports.id, reports.title, reports.category, reports.issue_type, reports.status, reports.urgency,
         reports.description, reports.location_label, reports.latitude, reports.longitude,
         reports.observed_at, reports.created_at, reports.updated_at,
         case
           when reports.status in ('Verified', 'In progress', 'Resolved') then profiles.display_name
           else null
         end as reporter_display_name
  from public.reports
  join public.profiles on profiles.id = reports.reporter_id
  where reports.status not in ('Rejected', 'Duplicate');

grant select on public.community_reports to anon, authenticated;
