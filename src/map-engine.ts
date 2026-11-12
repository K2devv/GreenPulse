// MapLibre GL setup shared by both maps. Importing this file loads the map library, so it is
// only imported from the lazily loaded map components.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// maplibre-gl 6 is ESM-only and cannot find its worker file inside a bundle, so Vite builds
// the worker as its own asset and the library is told where it is.
maplibregl.setWorkerUrl(workerUrl)

export const mapLib = maplibregl
export const { GPUInitializationError } = maplibregl
