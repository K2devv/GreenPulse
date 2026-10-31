-- Run with psql or Supabase SQL Editor after 202610290004_district5_boundary_geofence.sql.
do $$
declare
  v_polygon jsonb := '{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}'::jsonb;
  v_with_hole jsonb := '{"type":"Polygon","coordinates":[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]}'::jsonb;
  v_multipolygon jsonb := '{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,1],[0,0]]],[[[3,3],[4,3],[4,4],[3,4],[3,3]]]]}'::jsonb;
begin
  if not public.district5_polygon_contains(1, 1, v_polygon) then
    raise exception 'Geofence test failed: interior point should match';
  end if;
  if not public.district5_polygon_contains(0, 1, v_polygon) then
    raise exception 'Geofence test failed: boundary edge should match';
  end if;
  if public.district5_polygon_contains(3, 1, v_polygon) then
    raise exception 'Geofence test failed: exterior point should not match';
  end if;
  if public.district5_polygon_contains(2, 2, v_with_hole) then
    raise exception 'Geofence test failed: point in a polygon hole should not match';
  end if;
  if not public.district5_polygon_contains(0.5, 0.5, v_multipolygon)
    or not public.district5_polygon_contains(3.5, 3.5, v_multipolygon) then
    raise exception 'Geofence test failed: MultiPolygon parts should match';
  end if;
end;
$$;
