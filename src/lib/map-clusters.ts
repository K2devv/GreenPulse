import Supercluster from 'supercluster'
import type { Bounds } from './map-viewport'

/** A report as the map sees it. `category` is generic so this file does not depend on the app's unions. */
export type MapPoint<C extends string = string> = {
  id: string
  latitude: number
  longitude: number
  category: C
  /** Open and high urgency. */
  urgent: boolean
}

export type MapClusterItem<C extends string = string> = {
  kind: 'cluster'
  /** Stable for a given set of points and zoom level. */
  id: number
  latitude: number
  longitude: number
  count: number
  /** How many of the grouped reports are open and high urgency. */
  urgent: number
  /** Report count per category, in the order the categories were first met. */
  mix: Array<[C, number]>
  /** The zoom at which this group breaks apart. */
  expansionZoom: number
}
export type MapPointItem = { kind: 'point'; id: string; latitude: number; longitude: number }
export type MapItem<C extends string = string> = MapClusterItem<C> | MapPointItem

export type ClusterIndex<C extends string = string> = {
  /** Clusters and single reports to draw at a zoom level, optionally limited to `bounds`. */
  itemsAt(zoom: number, bounds?: Bounds): MapItem<C>[]
}

/** Pixel radius within which reports merge into one cluster. */
export const CLUSTER_RADIUS = 56
/** Above this zoom every report is drawn on its own. */
export const CLUSTER_MAX_ZOOM = 16

const METERS_PER_DEGREE_LATITUDE = 110_574
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111_320
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const CATEGORY_PREFIX = 'n:'
const WORLD: Bounds = [-180, -85, 180, 85]

/**
 * Public report coordinates are rounded for privacy, so several reports often share one point
 * and could never be told apart on the map. This fans each such group out in a sunflower
 * pattern (neighbours about 20 m apart with the default spacing) around the shared point.
 * A report's position depends only on its id's rank within the group, so it stays put while
 * filters hide and show its neighbours. Returns [latitude, longitude] per report id.
 */
export function spreadCoincident(
  points: ReadonlyArray<{ id: string; latitude: number; longitude: number }>,
  spacingMeters = 11,
): Map<string, [number, number]> {
  const groups = new Map<string, { id: string; latitude: number; longitude: number }[]>()
  for (const point of points) {
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`
    const group = groups.get(key)
    if (group) group.push(point)
    else groups.set(key, [point])
  }
  const positions = new Map<string, [number, number]>()
  for (const group of groups.values()) {
    if (group.length === 1) {
      positions.set(group[0].id, [group[0].latitude, group[0].longitude])
      continue
    }
    const ordered = [...group].sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
    ordered.forEach((point, index) => {
      const radius = spacingMeters * Math.sqrt(index + 0.5)
      const angle = index * GOLDEN_ANGLE
      const latitude = point.latitude + radius * Math.cos(angle) / METERS_PER_DEGREE_LATITUDE
      const longitude = point.longitude + radius * Math.sin(angle) / (METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * Math.cos(point.latitude * Math.PI / 180))
      positions.set(point.id, [latitude, longitude])
    })
  }
  return positions
}

type PointProperties = { id: string; category: string; urgent: boolean }
/** Flat numeric tallies (`urgent`, plus one `n:<category>` key per category) so supercluster can merge them. */
type ClusterTallies = Record<string, number>

/** Groups nearby reports per zoom level and keeps each group's category mix and urgent count. */
export function createClusterIndex<C extends string>(points: ReadonlyArray<MapPoint<C>>): ClusterIndex<C> {
  const index = new Supercluster<PointProperties, ClusterTallies>({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (properties) => ({ urgent: properties.urgent ? 1 : 0, [CATEGORY_PREFIX + properties.category]: 1 }),
    reduce: (accumulated, properties) => {
      for (const key in properties) accumulated[key] = (accumulated[key] ?? 0) + properties[key]
    },
  })
  index.load(points.map((point) => ({
    type: 'Feature' as const,
    properties: { id: point.id, category: point.category, urgent: point.urgent },
    geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
  })))
  return {
    itemsAt(zoom, bounds = WORLD) {
      return index.getClusters(bounds, Math.floor(zoom)).map((feature): MapItem<C> => {
        const [longitude, latitude] = feature.geometry.coordinates
        const properties = feature.properties
        if (!('cluster' in properties)) return { kind: 'point', id: properties.id, latitude, longitude }
        const tallies = properties as unknown as ClusterTallies
        const mix: Array<[C, number]> = []
        for (const key in tallies) {
          if (key.startsWith(CATEGORY_PREFIX)) mix.push([key.slice(CATEGORY_PREFIX.length) as C, tallies[key]])
        }
        return {
          kind: 'cluster',
          id: properties.cluster_id,
          latitude,
          longitude,
          count: properties.point_count,
          urgent: tallies.urgent ?? 0,
          mix,
          expansionZoom: index.getClusterExpansionZoom(properties.cluster_id),
        }
      })
    },
  }
}

/**
 * CSS conic gradient for a cluster's ring: one arc per category, sized by its share and drawn
 * in the order given by `order`. Returns undefined when there is nothing to draw.
 */
export function clusterRingGradient<C extends string>(
  mix: ReadonlyArray<readonly [C, number]>,
  colors: Readonly<Record<C, string>>,
  order: readonly C[],
): string | undefined {
  const counts = new Map(mix)
  const total = order.reduce((sum, category) => sum + (counts.get(category) ?? 0), 0)
  if (!total) return undefined
  let start = 0
  const stops: string[] = []
  for (const category of order) {
    const count = counts.get(category)
    if (!count) continue
    const end = start + count / total * 100
    stops.push(`${colors[category]} ${start.toFixed(2)}% ${end.toFixed(2)}%`)
    start = end
  }
  return `conic-gradient(${stops.join(', ')})`
}
