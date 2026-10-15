create table public.report_comments (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  author_role text not null check (author_role in ('resident', 'responder', 'admin')),
  kind text not null check (kind in ('comment', 'info_request', 'reply')),
  message text not null check (char_length(message) between 1 and 1000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  created_at timestamptz not null default now()
);

create index report_comments_report_created_at_idx on public.report_comments (report_id, created_at);

alter table public.report_comments enable row level security;

create policy "Reporters and staff can read report comments"
  on public.report_comments for select to authenticated
  using (
    (select public.is_staff()) or exists (
      select 1 from public.reports
      where reports.id = report_comments.report_id and reports.reporter_id = (select auth.uid())
    )
  );

create policy "Reporters and staff can post report comments"
  on public.report_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and ((select public.is_staff()) or exists (
      select 1 from public.reports
      where reports.id = report_comments.report_id and reports.reporter_id = (select auth.uid())
    ))
  );

grant select on public.report_comments to authenticated;
grant insert (report_id, kind, message, photo_paths) on public.report_comments to authenticated;

-- Author identity and permissions are decided here, never by the client.
create or replace function public.prepare_report_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  actor_name text;
  target record;
  actor_on_task boolean;
begin
  if actor is null then
    return new;
  end if;

  select role, display_name into actor_role, actor_name from public.profiles where id = actor;
  select reporter_id, assigned_to, assigned_team_id, status into target from public.reports where id = new.report_id;
  if actor_role is null or target is null then
    raise exception 'This report is not available.';
  end if;

  new.author_id := actor;
  new.author_role := actor_role;
  new.author_name := coalesce(nullif(btrim(actor_name), ''), case actor_role when 'resident' then 'Reporter' when 'admin' then 'Administrator' else 'Responder' end);
  new.message := btrim(new.message);

  if actor_role = 'resident' then
    if target.reporter_id <> actor then
      raise exception 'You can only reply to your own reports.';
    end if;
    if new.kind <> 'reply' then
      raise exception 'Reporters can only post replies.';
    end if;
    if target.status in ('Closed', 'Rejected', 'Duplicate') then
      raise exception 'This report is closed to new replies.';
    end if;
    if exists (select 1 from unnest(new.photo_paths) as path where path not like actor::text || '/%') then
      raise exception 'Photos must be uploaded to your own folder.';
    end if;
  else
    if new.kind = 'reply' then
      raise exception 'Staff cannot post reporter replies.';
    end if;
    if cardinality(new.photo_paths) > 0 then
      raise exception 'Only reporters can attach photos to a reply.';
    end if;
    if actor_role = 'responder' then
      actor_on_task := coalesce(target.assigned_to = actor, false) or exists (
        select 1 from public.team_members
        where team_members.team_id = target.assigned_team_id and team_members.profile_id = actor
      );
      if not actor_on_task then
        raise exception 'Only the assigned responder or team can comment on this report.';
      end if;
      if new.kind <> 'comment' then
        raise exception 'Only administrators can request additional information.';
      end if;
    elsif new.kind = 'info_request' and target.status in ('Closed', 'Rejected', 'Duplicate', 'Resolved') then
      raise exception 'Information cannot be requested on a finished report.';
    end if;
  end if;

  return new;
end;
$$;

create trigger prepare_report_comment
  before insert on public.report_comments
  for each row execute procedure public.prepare_report_comment();

create or replace function public.record_report_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  event_label text;
  notice_title text;
begin
  select reports.title, reports.reporter_id, reports.assigned_to into target from public.reports where reports.id = new.report_id;

  event_label := case
    when new.kind = 'info_request' then 'Additional information requested from the reporter'
    when new.kind = 'reply' then 'Reporter replied' || case when cardinality(new.photo_paths) > 0 then ' with ' || cardinality(new.photo_paths) || ' photo(s)' else '' end
    when new.author_role = 'admin' then 'Admin comment added'
    else 'Responder comment added'
  end;

  insert into public.report_events (report_id, actor_id, event_type, message)
  values (new.report_id, new.author_id, case new.kind when 'info_request' then 'information_requested' when 'reply' then 'reporter_replied' else 'comment_added' end, event_label);

  notice_title := case new.kind
    when 'info_request' then 'Additional information requested'
    when 'reply' then 'Reporter replied'
    else 'New comment on your report'
  end;

  insert into public.notifications (recipient_id, report_id, event_type, title, message)
  select recipients.id, new.report_id,
    case new.kind when 'info_request' then 'additional_information_requested' when 'reply' then 'reporter_replied' else 'report_comment' end,
    notice_title,
    '"' || target.title || '": ' || left(new.message, 140)
  from (
    select target.reporter_id as id where new.kind <> 'reply'
    union
    select profiles.id from public.profiles where profiles.role = 'admin' and new.kind in ('reply', 'comment') and new.author_role <> 'admin'
    union
    select target.assigned_to where target.assigned_to is not null and new.author_role <> 'responder' and new.kind <> 'info_request' and new.kind <> 'reply'
    union
    select target.assigned_to where target.assigned_to is not null and new.kind = 'reply'
  ) as recipients
  where recipients.id is not null and recipients.id is distinct from new.author_id;

  return new;
end;
$$;

create trigger on_report_comment_created
  after insert on public.report_comments
  for each row execute procedure public.record_report_comment();
