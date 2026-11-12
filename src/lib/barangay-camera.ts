import type { BarangayBoundary } from './barangay-lookup'
import { clampCameraToView, fitBoundsCamera, type Bounds, type FitCamera, type Padding } from './map-viewport'

/** The closest zoom used when fitting a barangay, so a tiny outline does not zoom in past street level. */
export const BARANGAY_FIT_MAX_ZOOM = 17

/** The [west, south, east, north] box around one barangay's outline (every part of a MultiPolygon), or undefined if it has none. */
export function barangayBounds(boundaries: readonly BarangayBoundary[], barangay: string): Bounds | undefined {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const boundary of boundaries) {
    if (boundary.barangay !== barangay) continue
    for (const polygon of boundary.coordinates) for (const ring of polygon) for (const [longitude, latitude] of ring) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
      if (longitude < west) west = longitude
      if (longitude > east) east = longitude
      if (latitude < south) south = latitude
      if (latitude > north) north = latitude
    }
  }
  return Number.isFinite(west) ? [west, south, east, north] : undefined
}

/**
 * The camera that shows a barangay in a `width` x `height` map, kept inside the district lock:
 * never zoomed out past the lock's zoom and never panned so the viewport leaves `lock.view`.
 */
export function barangayCamera(
  bounds: Bounds,
  width: number,
  height: number,
  padding: Padding,
  lock: Pick<FitCamera, 'zoom' | 'view'>,
  maxZoom: number,
): Pick<FitCamera, 'center' | 'zoom'> {
  const fit = fitBoundsCamera(bounds, width, height, padding, Math.min(maxZoom, BARANGAY_FIT_MAX_ZOOM))
  return clampCameraToView(fit, width, height, lock.view, lock.zoom)
}
