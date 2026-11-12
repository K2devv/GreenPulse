// Regenerates src/data/district5-barangays.json, the barangay polygons the report form
// uses to fill in the barangay from the pinned location.
//
// Source: OpenStreetMap barangay boundary relations (admin_level 10), fetched through
// Nominatim. OSM data is © OpenStreetMap contributors, available under the ODbL.
// Nominatim allows at most one request per second, so this takes about 20 seconds.
//
// Usage: node scripts/fetch-district5-osm-boundaries.mjs [output path]
import { writeFile } from 'node:fs/promises'

const outputPath = process.argv[2] || 'src/data/district5-barangays.json'
const barangays = [
  'Bagbag', 'Capri', 'Fairview', 'Greater Lagro', 'Gulod', 'Kaligayahan',
  'Nagkaisang Nayon', 'North Fairview', 'Novaliches Proper', 'Pasong Putik Proper',
  'San Agustin', 'San Bartolome', 'Santa Lucia', 'Santa Monica',
]
// Nominatim simplifies the outline server-side (degrees, about 2 m), then coordinates are
// rounded to 5 decimals (about 1 m). That keeps the file small without moving any edge noticeably.
const SIMPLIFY_DEGREES = 0.00002
const PRECISION = 5
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (value) => Number(value.toFixed(PRECISION))

function cleanRing(ring) {
  const points = []
  for (const [longitude, latitude] of ring) {
    const point = [round(longitude), round(latitude)]
    const previous = points.at(-1)
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point)
  }
  const [first] = points
  const last = points.at(-1)
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first])
  if (points.length < 4) throw new Error('A boundary ring collapsed after rounding.')
  return points
}

const features = []
for (const barangay of barangays) {
  const parameters = new URLSearchParams({
    q: `${barangay}, Quezon City, Philippines`,
    format: 'jsonv2',
    limit: '5',
    polygon_geojson: '1',
    polygon_threshold: String(SIMPLIFY_DEGREES),
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${parameters}`, {
    headers: { 'User-Agent': 'GreenPulse boundary maintenance script' },
  })
  if (!response.ok) throw new Error(`Nominatim returned ${response.status} for ${barangay}.`)
  const results = await response.json()
  const match = results.find((result) => result.category === 'boundary'
    && result.osm_type === 'relation'
    && /5th District/.test(result.display_name)
    && /Quezon City/.test(result.display_name)
    && ['Polygon', 'MultiPolygon'].includes(result.geojson?.type))
  if (!match) throw new Error(`No District 5 boundary relation was found for ${barangay}.`)
  const polygons = match.geojson.type === 'Polygon' ? [match.geojson.coordinates] : match.geojson.coordinates
  features.push({ barangay, osmRelation: match.osm_id, coordinates: polygons.map((polygon) => polygon.map(cleanRing)) })
  console.log(`${barangay}: relation ${match.osm_id}`)
  await sleep(1100)
}

const document = {
  source: 'OpenStreetMap barangay boundaries (admin_level 10) via Nominatim',
  attribution: '© OpenStreetMap contributors, ODbL',
  retrieved: new Date().toISOString().slice(0, 10),
  barangays: features,
}
await writeFile(outputPath, `${JSON.stringify(document)}\n`)
console.log(`Wrote ${features.length} barangay boundaries to ${outputPath}.`)
