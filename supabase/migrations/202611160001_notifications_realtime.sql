-- Live notification inbox.
--
-- Adds public.notifications to the supabase_realtime publication, so the inbox and its unread
-- badge update the moment a notification is created or read, instead of on the next refresh.
--
-- Realtime applies row level security to what it sends: a subscriber only receives rows they may
-- select. The app also filters its subscription to recipient_id = the signed-in user.
--
-- Adding a table that is already published raises an error, so check first.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'The supabase_realtime publication does not exist; notifications will not update live.';
  elsif not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
