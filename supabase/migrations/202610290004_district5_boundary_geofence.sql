create table public.district5_barangay_boundaries (
  barangay text primary key check (barangay in (
    'Bagbag', 'Capri', 'Fairview', 'Greater Lagro', 'Gulod', 'Kaligayahan',
    'Nagkaisang Nayon', 'North Fairview', 'Novaliches Proper', 'Pasong Putik Proper',
    'San Agustin', 'San Bartolome', 'Santa Lucia', 'Santa Monica'
  )),
  geometry_geojson jsonb not null check (
    geometry_geojson->>'type' in ('Polygon', 'MultiPolygon')
  ),
  source_label text not null,
  source_url text not null,
  source_date date,
  indicative boolean not null default true,
  imported_at timestamptz not null default now()
);

alter table public.district5_barangay_boundaries enable row level security;
create policy "Anyone can read District 5 boundary labels"
  on public.district5_barangay_boundaries for select to anon, authenticated using (true);
grant select on public.district5_barangay_boundaries to anon, authenticated;
grant all on public.district5_barangay_boundaries to service_role;

create or replace function public.district5_point_in_ring(p_latitude double precision, p_longitude double precision, p_ring jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_vertex record;
  v_x double precision;
  v_y double precision;
  v_previous_x double precision;
  v_previous_y double precision;
  v_has_previous boolean := false;
  v_inside boolean := false;
begin
  if jsonb_typeof(p_ring) <> 'array' or jsonb_array_length(p_ring) < 4 then
    return false;
  end if;

  for v_vertex in
    select vertices.point
    from jsonb_array_elements(p_ring) with ordinality as vertices(point, ordinal)
    order by vertices.ordinal
  loop
    v_x := (v_vertex.point->>0)::double precision;
    v_y := (v_vertex.point->>1)::double precision;
    if v_has_previous then
      if abs((v_x - v_previous_x) * (p_latitude - v_previous_y) - (p_longitude - v_previous_x) * (v_y - v_previous_y)) <= 1e-10
        and p_longitude between least(v_previous_x, v_x) - 1e-10 and greatest(v_previous_x, v_x) + 1e-10
        and p_latitude between least(v_previous_y, v_y) - 1e-10 and greatest(v_previous_y, v_y) + 1e-10 then
        return true;
      end if;
      if (v_y > p_latitude) <> (v_previous_y > p_latitude)
        and p_longitude < (v_previous_x - v_x) * (p_latitude - v_y) / (v_previous_y - v_y) + v_x then
        v_inside := not v_inside;
      end if;
    end if;
    v_previous_x := v_x;
    v_previous_y := v_y;
    v_has_previous := true;
  end loop;
  return v_inside;
end;
$$;

create or replace function public.district5_polygon_contains(p_latitude double precision, p_longitude double precision, p_geometry jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_polygon jsonb;
  v_ring jsonb;
  v_inside boolean;
  v_polygons jsonb;
  v_ring_index integer;
begin
  if p_geometry->>'type' = 'Polygon' then
    v_polygons := jsonb_build_array(p_geometry->'coordinates');
  elsif p_geometry->>'type' = 'MultiPolygon' then
    v_polygons := p_geometry->'coordinates';
  else
    return false;
  end if;

  for v_polygon in select value from jsonb_array_elements(v_polygons)
  loop
    if jsonb_array_length(v_polygon) = 0 then continue; end if;
    v_inside := public.district5_point_in_ring(p_latitude, p_longitude, v_polygon->0);
    if not v_inside then continue; end if;
    for v_ring, v_ring_index in
      select rings.value, rings.ordinality::integer
      from jsonb_array_elements(v_polygon) with ordinality as rings(value, ordinality)
      where rings.ordinality > 1
      order by rings.ordinality
    loop
      if public.district5_point_in_ring(p_latitude, p_longitude, v_ring) then
        v_inside := false;
        exit;
      end if;
    end loop;
    if v_inside then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function public.district5_barangay_for_point(p_latitude double precision, p_longitude double precision)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay text;
  v_boundary_count integer;
begin
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  select count(*) into v_boundary_count from public.district5_barangay_boundaries;
  if v_boundary_count = 0 then return null; end if;

  select boundaries.barangay into v_barangay
  from public.district5_barangay_boundaries as boundaries
  where public.district5_polygon_contains(p_latitude, p_longitude, boundaries.geometry_geojson)
  order by boundaries.barangay
  limit 1;
  if v_barangay is null then
    raise exception 'The selected point is outside the loaded District 5 barangay boundaries' using errcode = '22023';
  end if;
  return v_barangay;
end;
$$;

revoke all on function public.district5_barangay_for_point(double precision, double precision) from public;
grant execute on function public.district5_barangay_for_point(double precision, double precision) to anon, authenticated, service_role;

create or replace function public.enforce_district5_report_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay text;
begin
  if not exists (select 1 from public.district5_barangay_boundaries) then
    return new;
  end if;
  v_barangay := public.district5_barangay_for_point(new.latitude, new.longitude);
  new.barangay := v_barangay;
  return new;
end;
$$;

create trigger enforce_district5_report_location_before_write
  before insert or update of latitude, longitude, barangay on public.reports
  for each row execute procedure public.enforce_district5_report_location();
