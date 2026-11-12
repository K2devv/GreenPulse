-- Reports located outside District 5: preview and backup. READ-ONLY.
--
-- Run in the Supabase SQL editor before 20261112_outside_district5_2_delete.sql.
-- "Outside" means the report point is in none of the polygons in
-- public.district5_barangay_boundaries (loaded by 202610290004 + 202611120001, or by
-- scripts/import-district5-boundaries.mjs). It uses the same point-in-polygon function the
-- geofence trigger uses, but calls the non-raising district5_polygon_contains so every row is
-- classified instead of the query failing on the first outside point.
--
-- This file never writes. Each query below is independent; run them one at a time.

-- 0. Boundaries must be loaded (expect 14). With 0 rows every report would count as outside.
select count(*) as boundary_rows from public.district5_barangay_boundaries;

-- 1. COUNT
select count(*) as reports_outside_district5
from public.reports r
where not exists (
  select 1 from public.district5_barangay_boundaries b
  where public.district5_polygon_contains(r.latitude, r.longitude, b.geometry_geojson)
);

-- 2. SAMPLE (IDs, stored barangay, status, rounded point, related row counts)
select r.id, r.status, r.barangay as stored_barangay,
  round(r.latitude::numeric, 4) as lat, round(r.longitude::numeric, 4) as lng, r.created_at,
  (select count(*) from public.report_events e where e.report_id = r.id) as events,
  (select count(*) from public.notifications n where n.report_id = r.id) as notifications,
  coalesce(cardinality(r.photo_paths), 0) + (r.photo_path is not null)::int
    + coalesce(cardinality(r.resolution_photo_paths), 0) as photo_refs
from public.reports r
where not exists (
  select 1 from public.district5_barangay_boundaries b
  where public.district5_polygon_contains(r.latitude, r.longitude, b.geometry_geojson)
)
order by r.created_at
limit 50;

-- 3. BACKUP EXPORT: one JSON document per outside report, with every dependent row and all
-- photo/storage references. Save the result (Download → JSON) somewhere access-controlled
-- before deleting. Private report comments are exported by query 4.
with outside as (
  select r.* from public.reports r
  where not exists (
    select 1 from public.district5_barangay_boundaries b
    where public.district5_polygon_contains(r.latitude, r.longitude, b.geometry_geojson)
  )
)
select jsonb_build_object(
  'exported_at', now(),
  'report', to_jsonb(o),
  'report_events', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.report_events x where x.report_id = o.id),
  'notifications', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.notifications x where x.report_id = o.id),
  'report_followers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.report_followers x where x.report_id = o.id),
  'report_confirmations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.report_confirmations x where x.report_id = o.id),
  'report_resolution_feedback', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.report_resolution_feedback x where x.report_id = o.id),
  'report_sla_escalations', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.report_sla_escalations x where x.report_id = o.id),
  'guest_report_access', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.guest_report_access x where x.report_id = o.id),
  'community_report_comments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.community_report_comments x where x.report_id = o.id),
  'environmental_followups_referencing', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.environmental_followups x where o.id = any(x.source_report_ids)),
  'reports_marked_duplicate_of_this', (select coalesce(jsonb_agg(x.id), '[]') from public.reports x where x.duplicate_of = o.id),
  'storage_objects', (
    select coalesce(jsonb_agg(jsonb_build_object('bucket', s.bucket_id, 'name', s.name, 'size', s.metadata->>'size', 'mimetype', s.metadata->>'mimetype')), '[]')
    from storage.objects s
    where s.bucket_id = 'report-photos'
      and s.name = any(coalesce(o.photo_paths, '{}') || coalesce(o.resolution_photo_paths, '{}') || coalesce(array[o.photo_path], '{}'))
  )
) as backup
from outside o
order by o.created_at;

-- 4. BACKUP of private report comments and their photo references. Run only when
-- public.report_comments exists (migration 202610150001 applied); otherwise skip it, there
-- is nothing to export: `select to_regclass('public.report_comments');` returns null.
select to_jsonb(c) as report_comment
from public.report_comments c
where c.report_id in (
  select r.id from public.reports r
  where not exists (
    select 1 from public.district5_barangay_boundaries b
    where public.district5_polygon_contains(r.latitude, r.longitude, b.geometry_geojson)
  )
)
order by c.report_id, c.created_at;
