/** Geographic bounds as [west, south, east, north] in degrees. */
export type Bounds = [west: number, south: number, east: number, north: number]
export type Padding = { top: number; right: number; bottom: number; left: number }
export type FitCamera = {
  /** Camera center as [longitude, latitude]. */
  center: [number, number]
  zoom: number
  /** What the viewport shows at that center and zoom. */
  view: Bounds
}

/** MapLibre's world is 512 px wide at zoom 0 (one zoom level below Leaflet's 256 px convention). */
const WORLD_SIZE = 512
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686

const mercatorX = (longitude: number) => (longitude + 180) / 360
const mercatorY = (latitude: number) => {
  const sine = Math.sin(latitude * Math.PI / 180)
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)
}
const longitudeFromX = (x: number) => x * 360 - 180
const latitudeFromY = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI

/**
 * The camera that shows `bounds` as large as possible inside a `width` x `height` viewport,
 * keeping `padding` clear on each side, plus the geographic extent that camera displays.
 * The map uses `zoom` as its minimum zoom and `view` as its pan limit, so the viewport can
 * never leave the district.
 */
export function fitBoundsCamera(bounds: Bounds, width: number, height: number, padding: Padding, maxZoom = 22): FitCamera {
  const [west, south, east, north] = bounds
  const left = mercatorX(west)
  const right = mercatorX(east)
  const top = mercatorY(north)
  const bottom = mercatorY(south)
  const availableWidth = Math.max(1, width - padding.left - padding.right)
  const availableHeight = Math.max(1, height - padding.top - padding.bottom)
  const spanX = Math.max(right - left, 1e-9)
  const spanY = Math.max(bottom - top, 1e-9)
  const zoom = Math.min(maxZoom, Math.log2(Math.min(availableWidth / spanX, availableHeight / spanY) / WORLD_SIZE))
  const worldSize = WORLD_SIZE * 2 ** zoom
  // The bounds sit in the middle of the padded area, so the camera center shifts by half the padding imbalance.
  const centerX = (left + right) / 2 * worldSize + (padding.right - padding.left) / 2
  const centerY = (top + bottom) / 2 * worldSize + (padding.bottom - padding.top) / 2
  return {
    center: [longitudeFromX(centerX / worldSize), latitudeFromY(centerY / worldSize)],
    zoom,
    view: [
      longitudeFromX((centerX - width / 2) / worldSize),
      latitudeFromY((centerY + height / 2) / worldSize),
      longitudeFromX((centerX + width / 2) / worldSize),
      latitudeFromY((centerY - height / 2) / worldSize),
    ],
  }
}

/** How many screen pixels one meter on the ground covers at a latitude and zoom. */
export function pixelsPerMeter(latitude: number, zoom: number) {
  return WORLD_SIZE * 2 ** zoom / (EARTH_CIRCUMFERENCE_METERS * Math.cos(latitude * Math.PI / 180))
}

/**
 * Moves a camera so the viewport stays inside `view` (the map's pan limit) and does not zoom out
 * past `minZoom`. When the viewport is larger than `view` on an axis, that axis is centered, which
 * is what MapLibre does with `maxBounds`. Returns the camera the map will actually settle on.
 */
export function clampCameraToView(
  camera: Pick<FitCamera, 'center' | 'zoom'>,
  width: number,
  height: number,
  view: Bounds,
  minZoom: number,
): Pick<FitCamera, 'center' | 'zoom'> {
  const zoom = Math.max(camera.zoom, minZoom)
  const worldSize = WORLD_SIZE * 2 ** zoom
  const halfWidth = width / 2 / worldSize
  const halfHeight = height / 2 / worldSize
  const clampAxis = (value: number, low: number, high: number, half: number) => (high - low <= 2 * half ? (low + high) / 2 : Math.min(Math.max(value, low + half), high - half))
  const x = clampAxis(mercatorX(camera.center[0]), mercatorX(view[0]), mercatorX(view[2]), halfWidth)
  // Mercator y grows southward, so the view's north edge is the smaller value.
  const y = clampAxis(mercatorY(camera.center[1]), mercatorY(view[3]), mercatorY(view[1]), halfHeight)
  return { center: [longitudeFromX(x), latitudeFromY(y)], zoom }
}
