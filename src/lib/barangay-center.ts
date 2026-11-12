import { boundaryContains, distanceToBoundaryMeters, type BarangayBoundary } from './barangay-lookup'

type Ring = number[][] // [longitude, latitude] pairs

const GRID_STEPS = 24
const REFINE_ROUNDS = 3
/** Candidates within this share of the deepest point count as equally deep; the one nearest the centroid wins. */
const DEPTH_TOLERANCE = 0.85
const METERS_PER_DEGREE_LATITUDE = 110_574
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111_320

function ringArea(ring: Ring) {
  let twiceArea = 0
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    twiceArea += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1]
  }
  return twiceArea / 2
}

function ringCentroid(ring: Ring): [number, number] {
  const area = ringArea(ring)
  if (!area) {
    const count = ring.length || 1
    return [ring.reduce((sum, point) => sum + point[0], 0) / count, ring.reduce((sum, point) => sum + point[1], 0) / count]
  }
  let x = 0
  let y = 0
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const cross = ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1]
    x += (ring[previous][0] + ring[index][0]) * cross
    y += (ring[previous][1] + ring[index][1]) * cross
  }
  return [x / (6 * area), y / (6 * area)]
}

/**
 * A point well inside one barangay, as [latitude, longitude] rounded to 6 decimals, for placing the
 * report pin when the reporter picks that barangay. It is the barangay's visual center: the point
 * of its largest part that lies deepest inside the outline (farthest from every edge), preferring
 * the one nearest the centroid among near-equal candidates. Unlike the centroid or the middle of the
 * bounding box, it is always inside the outline, even for crescent or L-shaped barangays.
 * Returns undefined when the barangay has no outline.
 */
export function barangayPinPoint(boundaries: readonly BarangayBoundary[], barangay: string): [number, number] | undefined {
  const boundary = boundaries.find((candidate) => candidate.barangay === barangay)
  const largest = boundary?.coordinates
    .filter((polygon) => polygon[0]?.length >= 4)
    .reduce<Ring[] | undefined>((best, polygon) => !best || Math.abs(ringArea(polygon[0])) > Math.abs(ringArea(best[0])) ? polygon : best, undefined)
  if (!largest) return undefined
  const part: BarangayBoundary = { barangay, coordinates: [largest] }
  const outer = largest[0]
  const [centroidLongitude, centroidLatitude] = ringCentroid(outer)
  const xScale = METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * Math.cos(centroidLatitude * Math.PI / 180)

  const candidates: Array<{ longitude: number; latitude: number; depth: number }> = []
  let deepest: { longitude: number; latitude: number; depth: number } | undefined
  const consider = (longitude: number, latitude: number) => {
    if (!boundaryContains(part, longitude, latitude)) return
    const candidate = { longitude, latitude, depth: distanceToBoundaryMeters(part, longitude, latitude) }
    candidates.push(candidate)
    if (!deepest || candidate.depth > deepest.depth) deepest = candidate
  }

  consider(centroidLongitude, centroidLatitude)
  let west = Math.min(...outer.map((point) => point[0]))
  let east = Math.max(...outer.map((point) => point[0]))
  let south = Math.min(...outer.map((point) => point[1]))
  let north = Math.max(...outer.map((point) => point[1]))
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    const stepX = (east - west) / GRID_STEPS
    const stepY = (north - south) / GRID_STEPS
    for (let column = 0; column < GRID_STEPS; column++) {
      for (let row = 0; row < GRID_STEPS; row++) consider(west + (column + 0.5) * stepX, south + (row + 0.5) * stepY)
    }
    if (!deepest) break
    // Look again, more finely, around the deepest point so far.
    west = deepest.longitude - 2 * stepX
    east = deepest.longitude + 2 * stepX
    south = deepest.latitude - 2 * stepY
    north = deepest.latitude + 2 * stepY
  }
  if (!deepest) return undefined

  const minimumDepth = deepest.depth * DEPTH_TOLERANCE
  const distanceToCentroid = (candidate: { longitude: number; latitude: number }) => Math.hypot(
    (candidate.longitude - centroidLongitude) * xScale,
    (candidate.latitude - centroidLatitude) * METERS_PER_DEGREE_LATITUDE,
  )
  const chosen = candidates
    .filter((candidate) => candidate.depth >= minimumDepth)
    .reduce((best, candidate) => distanceToCentroid(candidate) < distanceToCentroid(best) ? candidate : best, deepest)
  return [Number(chosen.latitude.toFixed(6)), Number(chosen.longitude.toFixed(6))]
}
