-- DESTRUCTIVE: deletes reports located outside District 5, with their dependent rows.
--
-- Do not run until the owner has reviewed the preview, the backup has been saved
-- (20261112_outside_district5_1_preview_and_backup.sql), and the owner has said
-- "yes, delete". This is a one-off maintenance script, not a migration: it is never part of
-- the migration history and must not be replayed on other projects.
--
-- Safety:
-- - It deletes only the IDs listed in v_expected, and only if that list is exactly the set of
--   reports currently outside the loaded boundaries. If anything changed since the preview
--   (a report moved, a new outside report appeared, boundaries were re-imported), it aborts
--   without deleting.
-- - It refuses to run with fewer than 14 boundary rows (an empty table would make every report
--   "outside").
-- - It refuses when an outside report still has photos in storage. Supabase blocks deleting
--   storage.objects from SQL (storage.protect_delete); remove those files first through the
--   Storage API or dashboard, using the paths in the backup, then rerun.
-- - It refuses when another report is marked as a duplicate of one being deleted
--   (reports.duplicate_of has no ON DELETE action).
-- - Everything runs in one transaction; any exception rolls the whole thing back.
--
-- Cascades (ON DELETE CASCADE on report_id): report_events, notifications,
-- report_sla_escalations, report_followers, report_confirmations, report_resolution_feedback,
-- guest_report_access, community_report_comments, and report_comments when present.
-- environmental_followups.source_report_ids is an array, not a foreign key, so the IDs are
-- removed from it explicitly.

begin;

do $$
declare
  v_expected uuid[] := array[
    'a3af2956-542f-4481-adf1-1384ae715d65'
  ]::uuid[];
  v_actual uuid[];
  v_boundaries integer;
  v_storage_refs integer;
  v_duplicates integer;
  v_deleted integer;
begin
  select count(*) into v_boundaries from public.district5_barangay_boundaries;
  if v_boundaries < 14 then
    raise exception 'Only % District 5 boundary rows are loaded; refusing to classify reports.', v_boundaries;
  end if;

  select coalesce(array_agg(r.id order by r.id), '{}') into v_actual
  from public.reports r
  where not exists (
    select 1 from public.district5_barangay_boundaries b
    where public.district5_polygon_contains(r.latitude, r.longitude, b.geometry_geojson)
  );

  if v_actual is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(v_expected) as x) then
    raise exception 'The set of reports outside District 5 changed since the preview. Expected %, found %. Nothing was deleted.', v_expected, v_actual;
  end if;

  select count(*) into v_storage_refs
  from public.reports r
  join storage.objects s on s.bucket_id = 'report-photos'
    and s.name = any(coalesce(r.photo_paths, '{}') || coalesce(r.resolution_photo_paths, '{}') || coalesce(array[r.photo_path], '{}'))
  where r.id = any(v_expected);
  if v_storage_refs > 0 then
    raise exception '% storage object(s) still belong to these reports. Remove them through the Storage API first.', v_storage_refs;
  end if;

  if to_regclass('public.report_comments') is not null then
    execute 'select count(*) from public.report_comments c join storage.objects s on s.bucket_id = ''report-photos'' and s.name = any(c.photo_paths) where c.report_id = any($1)'
      into v_storage_refs using v_expected;
    if v_storage_refs > 0 then
      raise exception '% comment photo(s) still belong to these reports. Remove them through the Storage API first.', v_storage_refs;
    end if;
  end if;

  select count(*) into v_duplicates from public.reports where duplicate_of = any(v_expected) and not (id = any(v_expected));
  if v_duplicates > 0 then
    raise exception '% other report(s) are marked as duplicates of these reports. Review them first.', v_duplicates;
  end if;

  update public.environmental_followups
  set source_report_ids = array(select unnest(source_report_ids) except select unnest(v_expected))
  where source_report_ids && v_expected;

  delete from public.reports where id = any(v_expected);
  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_expected) then
    raise exception 'Deleted % report(s) but expected %. Rolling back.', v_deleted, cardinality(v_expected);
  end if;

  raise notice 'Deleted % report(s) outside District 5: %', v_deleted, v_expected;
end;
$$;

commit;

-- Afterwards (read-only): expect 0.
-- select count(*) from public.reports r
-- where not exists (select 1 from public.district5_barangay_boundaries b
--   where public.district5_polygon_contains(r.latitude, r.longitude, b.geometry_geojson));
