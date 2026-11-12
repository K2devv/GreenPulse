import type { Feature, FeatureCollection, LineString, MultiLineString, Point, Polygon } from 'geojson'
import { boundaryContains, distanceToBoundaryMeters, type BarangayBoundary } from './barangay-lookup'
import type { Bounds } from './map-viewport'

/** A [longitude, latitude] position, GeoJSON order. */
export type LngLat = [number, number]
/** A closed ring: the first position is repeated at the end. */
export type OutlineRing = LngLat[]
export type BorderSegment = [LngLat, LngLat]

export type DistrictOutline = {
  /** Outer edge of the district. Normally one ring; more only if the district has detached parts. */
  rings: OutlineRing[]
  bounds: Bounds
  /** Borders shared by two barangays, as two-point segments. Empty for the bounding-box fallback. */
  innerBorders: BorderSegment[]
  /** The barangays the outline was built from. Empty for the bounding-box fallback. */
  barangays: readonly BarangayBoundary[]
}

export type DistrictFeatureKind = 'mask' | 'outline' | 'border' | 'label'
export type DistrictFeatureProperties = { kind: DistrictFeatureKind; name?: string }
export type DistrictFeatureCollection = FeatureCollection<Polygon | LineString | MultiLineString | Point, DistrictFeatureProperties>

const METERS_PER_DEGREE_LATITUDE = 110_574
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111_320
/** Vertices closer than about 0.1 m are treated as the same point. */
const VERTEX_PRECISION = 6
/** Rings smaller than this share of the largest ring are slivers where two outlines do not quite meet. */
const MIN_RING_SHARE = 0.005
/** How far the dissolved area may differ from the summed barangay areas before the result is rejected. */
const AREA_TOLERANCE = 0.02
/** How close (in meters) two separate parts of the outline may run before they count as an unmerged border. */
const PART_SEPARATION_METERS = 15
/** Web Mercator cannot show the poles, so the mask stops just short of them. */
const WORLD_RING: OutlineRing = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]

type Vertex = { key: string; position: LngLat }
/** How many outlines run along a segment from `a` to `b` (forward) and from `b` to `a` (backward). */
type EdgeTally = { a: Vertex; b: Vertex; forward: number; backward: number }
/** A boundary edge, directed so the covered area lies on its left. */
type DirectedEdge = { from: Vertex; to: Vertex; used: boolean }

/** Signed area in square meters: positive for a counterclockwise ring (equirectangular approximation). */
function signedRingArea(ring: ReadonlyArray<readonly number[]>): number {
  if (ring.length < 3) return 0
  const xScale = METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * Math.cos(ring[0][1] * Math.PI / 180)
  let doubled = 0
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    doubled += ring[previous][0] * xScale * ring[index][1] * METERS_PER_DEGREE_LATITUDE
      - ring[index][0] * xScale * ring[previous][1] * METERS_PER_DEGREE_LATITUDE
  }
  return doubled / 2
}

/** Area enclosed by a ring, in square meters. */
export function ringAreaSquareMeters(ring: ReadonlyArray<readonly number[]>): number {
  return Math.abs(signedRingArea(ring))
}

function ringContainsPoint(ring: ReadonlyArray<readonly number[]>, longitude: number, latitude: number) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[previous]
    if ((y1 > latitude) !== (y2 > latitude) && longitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

/** Whether a point lies inside the district outline. */
export function outlineContains(outline: Pick<DistrictOutline, 'rings'>, latitude: number, longitude: number) {
  return outline.rings.some((ring) => ringContainsPoint(ring, longitude, latitude))
}

function boundsOfRings(rings: ReadonlyArray<ReadonlyArray<readonly number[]>>): Bounds {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const ring of rings) {
    for (const [longitude, latitude] of ring) {
      if (longitude < west) west = longitude
      if (longitude > east) east = longitude
      if (latitude < south) south = latitude
      if (latitude > north) north = latitude
    }
  }
  return [west, south, east, north]
}

/**
 * Where several boundary edges leave a vertex, take the first one counterclockwise from the
 * way we came. With the covered area on the left of every edge, that keeps the same uncovered
 * region on the right, so the walk follows one boundary instead of jumping between them.
 */
function pickNextEdge(candidates: DirectedEdge[], previous: Vertex, current: Vertex): DirectedEdge | undefined {
  const open = candidates.filter((edge) => !edge.used)
  if (open.length <= 1) return open[0]
  const xScale = Math.cos(current.position[1] * Math.PI / 180)
  const backX = (previous.position[0] - current.position[0]) * xScale
  const backY = previous.position[1] - current.position[1]
  let best: { edge: DirectedEdge; angle: number } | undefined
  for (const edge of open) {
    const outX = (edge.to.position[0] - current.position[0]) * xScale
    const outY = edge.to.position[1] - current.position[1]
    let angle = Math.atan2(backX * outY - backY * outX, backX * outX + backY * outY)
    if (angle <= 0) angle += 2 * Math.PI
    if (!best || angle < best.angle) best = { edge, angle }
  }
  return best?.edge
}

/** Cuts a closed walk that passes through a vertex more than once into simple loops. */
function splitAtRepeats(walk: Vertex[]): Vertex[][] {
  const loops: Vertex[][] = []
  const path: Vertex[] = []
  const indexInPath = new Map<Vertex, number>()
  for (const vertex of walk) {
    const seenAt = indexInPath.get(vertex)
    if (seenAt !== undefined) {
      const loop = path.splice(seenAt)
      for (const member of loop) indexInPath.delete(member)
      loops.push(loop)
    }
    indexInPath.set(vertex, path.length)
    path.push(vertex)
  }
  if (path.length) loops.push(path)
  return loops.filter((loop) => loop.length >= 3)
}

function countVerticesInOrNear(ring: OutlineRing, other: OutlineRing) {
  const otherBoundary: BarangayBoundary = { barangay: '', coordinates: [[other]] }
  let count = 0
  // The closing point repeats the first, so it is skipped.
  for (let index = 0; index < ring.length - 1; index++) {
    const [longitude, latitude] = ring[index]
    if (ringContainsPoint(other, longitude, latitude) || distanceToBoundaryMeters(otherBoundary, longitude, latitude) <= PART_SEPARATION_METERS) count += 1
  }
  return count
}

function ringsConflict(first: OutlineRing, second: OutlineRing) {
  const a = boundsOfRings([first])
  const b = boundsOfRings([second])
  const margin = 0.001
  if (a[0] > b[2] + margin || b[0] > a[2] + margin || a[1] > b[3] + margin || b[1] > a[3] + margin) return false
  // Two parts that meet at a single corner contribute one vertex each.
  return countVerticesInOrNear(first, second) + countVerticesInOrNear(second, first) > 2
}

/**
 * Merges barangay outlines into the outline of the area they cover together.
 *
 * Neighbouring barangays trace their shared border with the same points in opposite
 * directions, so those edges cancel out and the edges left over form the outer boundary.
 * Thin gaps where two outlines do not quite meet are closed. Returns null when the outlines
 * do not fit together (they overlap, leave a large gap, or run alongside each other without
 * sharing points), so the caller can fall back to another source.
 */
export function dissolveBoundaries(boundaries: readonly BarangayBoundary[]): Pick<DistrictOutline, 'rings' | 'innerBorders'> | null {
  const vertices = new Map<string, Vertex>()
  const tallies = new Map<string, EdgeTally>()
  let coveredArea = 0
  const vertexAt = (position: readonly number[]) => {
    const key = `${position[0].toFixed(VERTEX_PRECISION)},${position[1].toFixed(VERTEX_PRECISION)}`
    let vertex = vertices.get(key)
    if (!vertex) {
      vertex = { key, position: [position[0], position[1]] }
      vertices.set(key, vertex)
    }
    return vertex
  }
  const addEdge = (from: readonly number[], to: readonly number[]) => {
    const start = vertexAt(from)
    const end = vertexAt(to)
    if (start === end) return
    const isForward = start.key < end.key
    const key = isForward ? `${start.key}|${end.key}` : `${end.key}|${start.key}`
    let tally = tallies.get(key)
    if (!tally) {
      tally = isForward ? { a: start, b: end, forward: 0, backward: 0 } : { a: end, b: start, forward: 0, backward: 0 }
      tallies.set(key, tally)
    }
    if (isForward) tally.forward += 1
    else tally.backward += 1
  }
  for (const boundary of boundaries) {
    for (const polygon of boundary.coordinates) {
      polygon.forEach((ring, ringIndex) => {
        if (ring.length < 3) return
        const signedArea = signedRingArea(ring)
        const isHole = ringIndex > 0
        coveredArea += (isHole ? -1 : 1) * Math.abs(signedArea)
        // Walk outer rings counterclockwise and holes clockwise, so the covered side is always on the left.
        const points = (signedArea < 0) !== isHole ? [...ring].reverse() : ring
        for (let index = 1; index < points.length; index++) addEdge(points[index - 1], points[index])
        addEdge(points[points.length - 1], points[0])
      })
    }
  }
  if (!(coveredArea > 0)) return null

  const outerEdges: DirectedEdge[] = []
  const innerBorders: BorderSegment[] = []
  for (const tally of tallies.values()) {
    const net = tally.forward - tally.backward
    if (net === 0) innerBorders.push([tally.a.position, tally.b.position])
    else if (net === 1) outerEdges.push({ from: tally.a, to: tally.b, used: false })
    else if (net === -1) outerEdges.push({ from: tally.b, to: tally.a, used: false })
    // Two outlines running the same way along one edge cover the same ground.
    else return null
  }
  const leaving = new Map<Vertex, DirectedEdge[]>()
  const balance = new Map<Vertex, number>()
  for (const edge of outerEdges) {
    const list = leaving.get(edge.from)
    if (list) list.push(edge)
    else leaving.set(edge.from, [edge])
    balance.set(edge.from, (balance.get(edge.from) ?? 0) + 1)
    balance.set(edge.to, (balance.get(edge.to) ?? 0) - 1)
  }
  // A closed boundary leaves every vertex as often as it enters it.
  for (const difference of balance.values()) if (difference !== 0) return null

  const outerRings: { ring: OutlineRing; area: number }[] = []
  let largestGap = 0
  for (const start of outerEdges) {
    if (start.used) continue
    const walk: Vertex[] = [start.from]
    let edge = start
    for (;;) {
      edge.used = true
      if (edge.to === start.from) break
      walk.push(edge.to)
      const next = pickNextEdge(leaving.get(edge.to) ?? [], edge.from, edge.to)
      if (!next) return null
      edge = next
    }
    for (const loop of splitAtRepeats(walk)) {
      const ring: OutlineRing = loop.map((vertex) => vertex.position)
      ring.push(ring[0])
      const signedArea = signedRingArea(ring)
      // Counterclockwise loops surround covered ground; clockwise loops surround a gap in it.
      if (signedArea > 0) outerRings.push({ ring, area: signedArea })
      else largestGap = Math.max(largestGap, -signedArea)
    }
  }
  outerRings.sort((first, second) => second.area - first.area)
  const largest = outerRings[0]?.area ?? 0
  if (!(largest > 0) || largestGap >= largest * MIN_RING_SHARE) return null

  const rings: OutlineRing[] = []
  let keptArea = 0
  for (const { ring, area } of outerRings) {
    if (area < largest * MIN_RING_SHARE) break
    rings.push(ring)
    keptArea += area
  }
  // Separate parts may touch at a corner, but parts that overlap, nest, or run alongside each
  // other mean the borders were not shared, and the mask polygon would be invalid.
  for (let first = 0; first < rings.length; first++) {
    for (let second = first + 1; second < rings.length; second++) {
      if (ringsConflict(rings[first], rings[second])) return null
    }
  }
  if (Math.abs(keptArea - coveredArea) / coveredArea > AREA_TOLERANCE) return null
  return { rings, innerBorders }
}

/**
 * Builds the district outline from the first set of barangay boundaries that dissolves cleanly
 * (pass the preferred source first), or a plain rectangle over `fallbackBounds` when none does.
 */
export function buildDistrictOutline(
  candidates: ReadonlyArray<readonly BarangayBoundary[] | null | undefined>,
  fallbackBounds: Bounds,
): DistrictOutline {
  for (const boundaries of candidates) {
    if (!boundaries?.length) continue
    const dissolved = dissolveBoundaries(boundaries)
    if (dissolved) return { ...dissolved, bounds: boundsOfRings(dissolved.rings), barangays: boundaries }
  }
  const [west, south, east, north] = fallbackBounds
  return {
    rings: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    bounds: fallbackBounds,
    innerBorders: [],
    barangays: [],
  }
}

/**
 * A point well inside a barangay for its name label: the grid cell farthest from the outline.
 * (The centroid of an L-shaped barangay can fall outside it.)
 */
export function barangayLabelPoint(boundary: BarangayBoundary, gridSize = 20): LngLat | undefined {
  const [west, south, east, north] = boundsOfRings(boundary.coordinates.flat())
  if (!Number.isFinite(west)) return undefined
  let best: { point: LngLat; meters: number } | undefined
  for (let column = 0; column < gridSize; column++) {
    for (let row = 0; row < gridSize; row++) {
      const longitude = west + (column + 0.5) / gridSize * (east - west)
      const latitude = south + (row + 0.5) / gridSize * (north - south)
      if (!boundaryContains(boundary, longitude, latitude)) continue
      const meters = distanceToBoundaryMeters(boundary, longitude, latitude)
      if (!best || meters > best.meters) best = { point: [longitude, latitude], meters }
    }
  }
  return best?.point
}

/**
 * Map features for the district: a mask covering everything outside it (the world with the
 * district cut out), its outline, the borders between barangays, and one label point per barangay.
 */
export function districtFeatures(outline: DistrictOutline): DistrictFeatureCollection {
  const feature = <G extends Polygon | LineString | MultiLineString | Point>(geometry: G, properties: DistrictFeatureProperties): Feature<G, DistrictFeatureProperties> =>
    ({ type: 'Feature', properties, geometry })
  const features: DistrictFeatureCollection['features'] = [
    feature({ type: 'Polygon', coordinates: [WORLD_RING, ...outline.rings] }, { kind: 'mask' }),
    ...outline.rings.map((ring) => feature({ type: 'LineString', coordinates: ring }, { kind: 'outline' })),
  ]
  if (outline.innerBorders.length) features.push(feature({ type: 'MultiLineString', coordinates: outline.innerBorders }, { kind: 'border' }))
  for (const boundary of outline.barangays) {
    const point = barangayLabelPoint(boundary)
    if (point) features.push(feature({ type: 'Point', coordinates: point }, { kind: 'label', name: boundary.barangay }))
  }
  return { type: 'FeatureCollection', features }
}
