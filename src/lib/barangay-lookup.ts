import { DISTRICT_5_BARANGAYS } from './report-filters'

type Position = number[] // GeoJSON order: [longitude, latitude]
type Ring = Position[]
type MultiPolygonCoordinates = Ring[][]

/** One barangay outline. `coordinates` uses GeoJSON MultiPolygon nesting and [longitude, latitude] order. */
export type BarangayBoundary = { barangay: string; coordinates: MultiPolygonCoordinates }

/** How close (in meters) a point outside every outline may be and still count for the nearest barangay. */
export const BOUNDARY_EDGE_TOLERANCE_METERS = 30

const METERS_PER_DEGREE_LATITUDE = 110_574
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111_320

function ringContains(ring: Ring, longitude: number, latitude: number) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[previous]
    if ((y1 > latitude) !== (y2 > latitude) && longitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

export function boundaryContains(boundary: BarangayBoundary, longitude: number, latitude: number) {
  return boundary.coordinates.some(([outer, ...holes]) => outer !== undefined
    && ringContains(outer, longitude, latitude)
    && !holes.some((hole) => ringContains(hole, longitude, latitude)))
}

export function distanceToBoundaryMeters(boundary: BarangayBoundary, longitude: number, latitude: number) {
  // An equirectangular projection is accurate to well under a meter at this scale.
  const xScale = METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * Math.cos(latitude * Math.PI / 180)
  let closest = Infinity
  for (const polygon of boundary.coordinates) for (const ring of polygon) {
    for (let index = 1; index < ring.length; index++) {
      const ax = (ring[index - 1][0] - longitude) * xScale
      const ay = (ring[index - 1][1] - latitude) * METERS_PER_DEGREE_LATITUDE
      const bx = (ring[index][0] - longitude) * xScale
      const by = (ring[index][1] - latitude) * METERS_PER_DEGREE_LATITUDE
      const dx = bx - ax
      const dy = by - ay
      const lengthSquared = dx * dx + dy * dy
      const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0
      closest = Math.min(closest, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return closest
}

/**
 * Returns the barangay whose outline contains the point. A point just outside every outline
 * (for example on a boundary road that the simplified outline cuts slightly short) goes to the
 * nearest barangay within `toleranceMeters`. Anything farther out returns undefined.
 */
export function findBarangayAt(
  [latitude, longitude]: [number, number],
  boundaries: readonly BarangayBoundary[],
  toleranceMeters = BOUNDARY_EDGE_TOLERANCE_METERS,
): string | undefined {
  const containing = boundaries.find((boundary) => boundaryContains(boundary, longitude, latitude))
  if (containing) return containing.barangay
  let nearest: { barangay: string; meters: number } | undefined
  for (const boundary of boundaries) {
    const meters = distanceToBoundaryMeters(boundary, longitude, latitude)
    if (meters <= toleranceMeters && (!nearest || meters < nearest.meters)) nearest = { barangay: boundary.barangay, meters }
  }
  return nearest?.barangay
}

const knownBarangays = new Set<string>(DISTRICT_5_BARANGAYS)

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
}

function isRing(value: unknown): value is Ring {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition)
}

function isPolygon(value: unknown): value is Ring[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRing)
}

/**
 * Converts `district5_barangay_boundaries` rows into lookup boundaries. Rows with an unknown
 * barangay or malformed geometry are skipped.
 */
export function toBarangayBoundaries(rows: ReadonlyArray<{ barangay?: unknown; geometry_geojson?: unknown }>): BarangayBoundary[] {
  return rows.flatMap((row) => {
    if (typeof row.barangay !== 'string' || !knownBarangays.has(row.barangay)) return []
    const geometry = row.geometry_geojson as { type?: unknown; coordinates?: unknown } | null | undefined
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : undefined
    if (!Array.isArray(polygons) || !polygons.length || !polygons.every(isPolygon)) return []
    return [{ barangay: row.barangay, coordinates: polygons }]
  })
}

/** Loads the bundled OpenStreetMap outlines for the 14 District 5 barangays (a separate chunk). */
export async function loadBundledBarangayBoundaries(): Promise<BarangayBoundary[]> {
  const { default: data } = await import('../data/district5-barangays.json')
  return data.barangays.map(({ barangay, coordinates }) => ({ barangay, coordinates }))
}
