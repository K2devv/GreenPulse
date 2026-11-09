create table public.community_report_comments (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null default 'Community member',
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index community_report_comments_report_created_at_idx
  on public.community_report_comments (report_id, created_at);

alter table public.community_report_comments enable row level security;

create or replace function public.is_community_report_visible(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reports
    where reports.id = target_report_id
      and reports.status not in ('Rejected', 'Duplicate')
  );
$$;

revoke all on function public.is_community_report_visible(uuid) from public;
grant execute on function public.is_community_report_visible(uuid) to anon, authenticated;

create policy "Anyone can read comments on public map reports"
  on public.community_report_comments for select to anon, authenticated
  using (public.is_community_report_visible(report_id));

create policy "Residents can post comments on public map reports"
  on public.community_report_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_community_report_visible(report_id)
  );

grant select (id, report_id, author_name, message, created_at)
  on public.community_report_comments to anon, authenticated;
grant insert (report_id, message) on public.community_report_comments to authenticated;

create or replace function public.prepare_community_report_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  report_status text;
begin
  if actor is null then
    raise exception 'Sign in to post a community comment.';
  end if;

  select profiles.role into actor_role
  from public.profiles
  where profiles.id = actor;
  if actor_role is distinct from 'resident' then
    raise exception 'Public comments are for resident accounts.';
  end if;

  select reports.status into report_status
  from public.reports
  where reports.id = new.report_id;
  if report_status is null or report_status in ('Closed', 'Rejected', 'Duplicate') then
    raise exception 'This report is closed to new comments.';
  end if;

  new.author_id := actor;
  new.author_name := 'Community member';
  new.message := btrim(new.message);
  if char_length(new.message) < 1 or char_length(new.message) > 1000 then
    raise exception 'Comments must be between 1 and 1000 characters.';
  end if;

  return new;
end;
$$;

create trigger prepare_community_report_comment
  before insert on public.community_report_comments
  for each row execute procedure public.prepare_community_report_comment();

create or replace function public.notify_staff_of_community_report_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  select reports.title, reports.assigned_to, reports.assigned_team_id
  into target
  from public.reports
  where reports.id = new.report_id;

  insert into public.report_events (report_id, actor_id, event_type, message)
  values (new.report_id, new.author_id, 'community_comment_added', 'A community member added a public comment.');

  insert into public.notifications (recipient_id, report_id, event_type, title, message)
  select recipients.id, new.report_id, 'community_comment', 'New community comment',
    '"' || target.title || '" has a new public comment.'
  from (
    select profiles.id
    from public.profiles
    where profiles.role = 'admin'
    union
    select target.assigned_to
    where target.assigned_to is not null
    union
    select team_members.profile_id
    from public.team_members
    where team_members.team_id = target.assigned_team_id
  ) as recipients
  where recipients.id is distinct from new.author_id;

  return new;
end;
$$;

create trigger on_community_report_comment_created
  after insert on public.community_report_comments
  for each row execute procedure public.notify_staff_of_community_report_comment();
