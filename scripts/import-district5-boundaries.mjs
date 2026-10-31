import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const sourcePath = process.argv[2] || 'data/district-5-quezon-city.geojson'
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sourceUrl = 'https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/layers'
const expectedBarangays = [
  'Bagbag', 'Capri', 'Fairview', 'Greater Lagro', 'Gulod', 'Kaligayahan',
  'Nagkaisang Nayon', 'North Fairview', 'Novaliches Proper', 'Pasong Putik Proper',
  'San Agustin', 'San Bartolome', 'Santa Lucia', 'Santa Monica',
]
if (!supabaseUrl || !serviceKey) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')

const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const document = JSON.parse(await readFile(sourcePath, 'utf8'))
if (document.type !== 'FeatureCollection' || !Array.isArray(document.features)) throw new Error('The boundary file must be a GeoJSON FeatureCollection.')

const allowed = new Map(expectedBarangays.map((name) => [normalize(name), name]))
const geometries = new Map()
for (const feature of document.features) {
  const properties = feature.properties ?? {}
  if (!normalize(properties.city_name).includes('quezoncity')) continue
  const barangay = allowed.get(normalize(properties.brgy_name))
  if (!barangay) continue
  const geometry = feature.geometry
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) {
    throw new Error(`Missing polygon geometry for ${barangay}.`)
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) for (const ring of polygon) for (const point of ring) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
      || point[0] < 120.9 || point[0] > 121.2 || point[1] < 14.6 || point[1] > 14.9) {
      throw new Error(`Invalid or out-of-area coordinate in ${barangay}.`)
    }
  }
  geometries.set(barangay, [...(geometries.get(barangay) ?? []), ...polygons])
}

const missing = expectedBarangays.filter((name) => !geometries.has(name))
if (missing.length) throw new Error(`The GeoJSON is missing District 5 barangays: ${missing.join(', ')}.`)
const rows = expectedBarangays.map((barangay) => ({
  barangay,
  geometry_geojson: { type: 'MultiPolygon', coordinates: geometries.get(barangay) },
  source_label: 'PSA / GeoRisk indicative barangay boundary layer',
  source_url: sourceUrl,
  source_date: '2016-06-01',
  indicative: true,
  imported_at: new Date().toISOString(),
}))

const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { error } = await supabase.from('district5_barangay_boundaries').upsert(rows, { onConflict: 'barangay' })
if (error) throw new Error(`Could not import the boundaries: ${error.message}`)
console.log(`Imported ${rows.length} indicative barangay polygons to ${supabaseUrl}.`)
console.log('Pilot validation with Quezon City is required before treating these boundaries as authoritative.')
