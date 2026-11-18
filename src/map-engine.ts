// MapLibre GL setup shared by both maps. Importing this file loads the map library, so it is
// only imported from the lazily loaded map components.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { constrainDistrictCamera, type CameraRing, type FitCamera } from './lib/map-viewport'

// maplibre-gl 6 is ESM-only and cannot find its worker file inside a bundle, so Vite builds
// the worker as its own asset and the library is told where it is.
maplibregl.setWorkerUrl(workerUrl)

export const mapLib = maplibregl
export const { GPUInitializationError } = maplibregl

/**
 * Holds a map inside District 5 (see useDistrictLock and constrainDistrictCamera): it cannot zoom
 * out past the whole district, and the middle of the view cannot be dragged off the district's
 * outline (`rings`), so the empty area around the district never fills the map. Where the map is
 * wider or taller than the district, the district stays centered on that side. This replaces
 * MapLibre's `maxBounds`, which instead zooms the map in until the view fits inside the bounds.
 * Pass a null lock to release the map.
 */
export function constrainToDistrict(map: maplibregl.Map, lock: Pick<FitCamera, 'zoom' | 'view'> | null, rings: readonly CameraRing[]) {
  map.setTransformConstrain(lock ? (lngLat, zoom) => {
    const { clientWidth, clientHeight } = map.getContainer()
    const camera = constrainDistrictCamera({ center: [lngLat.lng, lngLat.lat], zoom }, clientWidth, clientHeight, lock, rings)
    return { center: new maplibregl.LngLat(camera.center[0], camera.center[1]), zoom: camera.zoom }
  } : null)
}
