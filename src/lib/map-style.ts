import type { StyleSpecification } from 'maplibre-gl'
import type { DistrictFeatureCollection } from './district-outline'
import { pixelsPerMeter } from './map-viewport'

export type MapTheme = 'light' | 'dark'
/** 'vector' is the normal OpenFreeMap basemap; 'raster' is the OpenStreetMap fallback used when it is unreachable. */
export type Basemap = 'vector' | 'raster'
export type HeatCell = { latitude: number; longitude: number; count: number }
export type GpsFix = { latitude: number; longitude: number; accuracyMeters: number }

export type MapStyleOptions = {
  theme: MapTheme
  basemap?: Basemap
  /** District mask, outline, barangay borders and labels (see `districtFeatures`). */
  district?: DistrictFeatureCollection | null
  /** Report density cells; leave empty to hide them. */
  heatCells?: readonly HeatCell[]
  gps?: GpsFix | null
  /** Latitude used to turn meters into pixels for the circles. The district is small enough for one value. */
  latitude?: number
}

/** OpenFreeMap serves OpenStreetMap data in the OpenMapTiles schema. Free, no API key. */
export const VECTOR_TILES_URL = 'https://tiles.openfreemap.org/planet'
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
const RASTER_TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const RASTER_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'

export const VECTOR_SOURCE_ID = 'basemap'
const RASTER_SOURCE_ID = 'basemap-raster'
const DISTRICT_SOURCE_ID = 'district'
const HEAT_SOURCE_ID = 'heat'
const GPS_SOURCE_ID = 'gps'

const REGULAR = ['Noto Sans Regular']
const BOLD = ['Noto Sans Bold']
const ITALIC = ['Noto Sans Italic']

type Palette = {
  land: string
  /** Everything outside District 5. Mirrors `--map-void` in styles.css, which shows while the map loads. */
  mask: string
  grass: string
  wood: string
  park: string
  civic: string
  commercial: string
  industrial: string
  water: string
  waterLine: string
  building: string
  buildingLine: string
  road: string
  roadCasing: string
  highway: string
  highwayCasing: string
  path: string
  rail: string
  labelRoad: string
  labelPlace: string
  labelPoi: string
  labelWater: string
  labelHalo: string
  labelBarangay: string
  outline: string
  /** Color of the soft edge around the district, and how strong it is (1 = the light theme's shadow). */
  outlineShadow: string
  shadowStrength: number
  barangayLine: string
  heatLow: string
  heatMid: string
  heatHigh: string
  gps: string
}

export const MAP_COLORS: Record<MapTheme, Palette> = {
  light: {
    land: '#eef1e8',
    mask: '#f9faf6',
    grass: '#dfead4',
    wood: '#d2e3c6',
    park: '#d7e7cc',
    civic: '#ebeadf',
    commercial: '#efece4',
    industrial: '#e8e9e1',
    water: '#c5dde6',
    waterLine: '#b3d2de',
    building: '#e2e5da',
    buildingLine: '#d5d9cc',
    road: '#ffffff',
    roadCasing: '#dadfd2',
    highway: '#fdf1d6',
    highwayCasing: '#e6d6ad',
    path: '#cdd4c5',
    rail: '#c3c9bb',
    labelRoad: '#667267',
    labelPlace: '#48574c',
    labelPoi: '#7a857b',
    labelWater: '#5f8fa1',
    labelHalo: 'rgba(245, 247, 241, 0.92)',
    labelBarangay: '#3f6349',
    outline: '#3f9d63',
    outlineShadow: '#1a3624',
    shadowStrength: 1,
    barangayLine: '#c3d3bc',
    heatLow: '#65a36e',
    heatMid: '#df9638',
    heatHigh: '#c94c3c',
    gps: '#3b82c4',
  },
  dark: {
    land: '#1e2721',
    mask: '#141a16',
    grass: '#22332a',
    wood: '#1f3126',
    park: '#213428',
    civic: '#232c26',
    commercial: '#252b26',
    industrial: '#222a25',
    water: '#15303a',
    waterLine: '#1b3a45',
    building: '#283229',
    buildingLine: '#313c33',
    road: '#36423a',
    roadCasing: '#171d19',
    highway: '#4d4a37',
    highwayCasing: '#171d19',
    path: '#2f3a32',
    rail: '#3b473e',
    labelRoad: '#95a297',
    labelPlace: '#c4cfc5',
    labelPoi: '#84918a',
    labelWater: '#6ea4b6',
    labelHalo: 'rgba(22, 29, 24, 0.9)',
    labelBarangay: '#a9cba9',
    outline: '#6aa874',
    outlineShadow: '#6aa874',
    shadowStrength: 1.5,
    barangayLine: '#35473a',
    heatLow: '#7dbb86',
    heatMid: '#e6a54f',
    heatHigh: '#e0685a',
    gps: '#5b9bd8',
  },
}

// Layers are written as plain objects and checked by the style-spec validator in the unit test,
// because the expression tuple types are too strict to build with helpers.
type Expression = unknown[]
type Layer = { id: string; type: string; [key: string]: unknown }

const name: Expression = ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']]
const isLine: Expression = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]]
const classIn = (...classes: string[]): Expression => ['in', ['get', 'class'], ['literal', classes]]
/** Zoom-interpolated number; pass zoom, value pairs. Widths grow faster when zoomed in. */
const byZoom = (...stops: number[]): Expression => ['interpolate', ['exponential', 1.55], ['zoom'], ...stops]
const linearByZoom = (...stops: number[]): Expression => ['interpolate', ['linear'], ['zoom'], ...stops]
const kind = (value: string): Expression => ['==', ['get', 'kind'], value]

function vectorBasemapLayers(c: Palette): Layer[] {
  const source = VECTOR_SOURCE_ID
  const road = (id: string, classes: string[], color: string, width: Expression, extra: Record<string, unknown> = {}): Layer => ({
    id,
    type: 'line',
    source,
    'source-layer': 'transportation',
    filter: ['all', isLine, classIn(...classes)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': width },
    ...extra,
  })
  const label = (id: string, sourceLayer: string, filter: Expression | undefined, layout: Record<string, unknown>, color: string, extra: Record<string, unknown> = {}): Layer => ({
    id,
    type: 'symbol',
    source,
    'source-layer': sourceLayer,
    ...(filter ? { filter } : {}),
    layout: { 'text-field': name, 'text-font': REGULAR, 'text-size': 11, ...layout },
    paint: { 'text-color': color, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.3 },
    ...extra,
  })
  return [
    {
      id: 'landcover',
      type: 'fill',
      source,
      'source-layer': 'landcover',
      filter: classIn('wood', 'grass', 'farmland', 'wetland', 'sand'),
      paint: { 'fill-color': ['match', ['get', 'class'], ['wood', 'wetland'], c.wood, c.grass], 'fill-antialias': false },
    },
    {
      id: 'landuse',
      type: 'fill',
      source,
      'source-layer': 'landuse',
      filter: classIn('cemetery', 'pitch', 'playground', 'stadium', 'school', 'university', 'college', 'kindergarten', 'hospital', 'commercial', 'retail', 'industrial', 'railway'),
      paint: {
        'fill-color': ['match', ['get', 'class'],
          ['cemetery', 'pitch', 'playground', 'stadium'], c.grass,
          ['school', 'university', 'college', 'kindergarten', 'hospital'], c.civic,
          ['commercial', 'retail'], c.commercial,
          c.industrial],
        'fill-antialias': false,
      },
    },
    { id: 'park', type: 'fill', source, 'source-layer': 'park', paint: { 'fill-color': c.park, 'fill-opacity': 0.6, 'fill-antialias': false } },
    { id: 'water', type: 'fill', source, 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': c.water } },
    {
      id: 'waterway',
      type: 'line',
      source,
      'source-layer': 'waterway',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.waterLine,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'],
          11, ['match', ['get', 'class'], 'river', 1.2, 0.5],
          18, ['match', ['get', 'class'], 'river', 12, 5]],
      },
    },
    {
      id: 'building',
      type: 'fill',
      source,
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': c.building, 'fill-outline-color': c.buildingLine, 'fill-opacity': linearByZoom(14, 0, 15, 1) },
    },
    road('road-path', ['path', 'track'], c.path, byZoom(15, 0.7, 18, 2.4), { minzoom: 15, layout: { 'line-join': 'round' }, paint: { 'line-color': c.path, 'line-width': byZoom(15, 0.7, 18, 2.4), 'line-dasharray': [2, 1.6] } }),
    road('road-service', ['service'], c.road, byZoom(15, 1, 18, 7), { minzoom: 15 }),
    road('road-minor-casing', ['minor'], c.roadCasing, byZoom(12.5, 0.9, 14, 3, 16, 8, 18, 19), { minzoom: 12.5 }),
    road('road-major-casing', ['tertiary', 'secondary', 'primary'], c.roadCasing, byZoom(10, 1.2, 12, 2.6, 14, 5.2, 16, 11, 18, 23)),
    road('road-highway-casing', ['trunk', 'motorway'], c.highwayCasing, byZoom(10, 1.8, 12, 3.6, 14, 6.8, 16, 13, 18, 27)),
    road('road-minor', ['minor'], c.road, byZoom(12.5, 0.4, 14, 1.8, 16, 6, 18, 16), { minzoom: 12.5 }),
    road('road-major', ['tertiary', 'secondary', 'primary'], c.road, byZoom(10, 0.6, 12, 1.6, 14, 3.8, 16, 9, 18, 20)),
    road('road-highway', ['trunk', 'motorway'], c.highway, byZoom(10, 1, 12, 2.4, 14, 5.2, 16, 11, 18, 24)),
    road('rail', ['rail', 'transit'], c.rail, byZoom(11, 0.6, 14, 1.2, 18, 3), { layout: { 'line-join': 'round' } }),
    label('label-waterway', 'waterway', undefined, { 'text-font': ITALIC, 'symbol-placement': 'line', 'text-size': 11, 'text-letter-spacing': 0.08, 'symbol-spacing': 360 }, c.labelWater, { minzoom: 13 }),
    label('label-water', 'water_name', ['==', ['geometry-type'], 'Point'], { 'text-font': ITALIC, 'text-size': 11.5, 'text-max-width': 6 }, c.labelWater),
    label('label-road-minor', 'transportation_name', classIn('minor', 'service'), { 'symbol-placement': 'line', 'text-size': linearByZoom(15, 10, 18, 12), 'symbol-spacing': 280, 'text-letter-spacing': 0.02 }, c.labelRoad, { minzoom: 15 }),
    label('label-road-major', 'transportation_name', classIn('tertiary', 'secondary', 'primary', 'trunk', 'motorway'), { 'symbol-placement': 'line', 'text-size': linearByZoom(12, 9.5, 16, 12.5), 'symbol-spacing': 320, 'text-letter-spacing': 0.02 }, c.labelRoad, { minzoom: 12 }),
    label('label-poi', 'poi', ['<=', ['get', 'rank'], 12], { 'text-size': 10.5, 'text-max-width': 7, 'text-padding': 6 }, c.labelPoi, { minzoom: 15.5 }),
    // Neighbourhood names take over once the barangay names have faded out.
    label('label-place', 'place', classIn('suburb', 'quarter', 'neighbourhood'), { 'text-font': BOLD, 'text-size': linearByZoom(14.5, 11, 17, 13), 'text-max-width': 7, 'text-letter-spacing': 0.03, 'text-padding': 8 }, c.labelPlace, { minzoom: 14.5 }),
  ]
}

function rasterBasemapLayers(theme: MapTheme): Layer[] {
  return [{
    id: 'basemap-raster',
    type: 'raster',
    source: RASTER_SOURCE_ID,
    paint: theme === 'dark'
      ? { 'raster-brightness-max': 0.55, 'raster-saturation': -0.6, 'raster-contrast': 0.1 }
      : { 'raster-saturation': -0.25, 'raster-opacity': 0.94 },
  }]
}

function overlayLayers(c: Palette, latitude: number): Layer[] {
  /** Circle radius that covers `meters` on the ground at every zoom. */
  const metersRadius: Expression = ['interpolate', ['exponential', 2], ['zoom'],
    0, ['*', ['get', 'meters'], pixelsPerMeter(latitude, 0)],
    22, ['*', ['get', 'meters'], pixelsPerMeter(latitude, 22)]]
  const heatColor: Expression = ['match', ['get', 'tier'], 'high', c.heatHigh, 'moderate', c.heatMid, c.heatLow]
  return [
    {
      id: 'district-border',
      type: 'line',
      source: DISTRICT_SOURCE_ID,
      filter: kind('border'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.barangayLine, 'line-width': linearByZoom(11, 0.8, 16, 1.6) },
    },
    { id: 'district-mask', type: 'fill', source: DISTRICT_SOURCE_ID, filter: kind('mask'), paint: { 'fill-color': c.mask } },
    // A soft edge around the district, built from translucent lines of decreasing width, each
    // only slightly blurred. (One wide, heavily blurred line leaves dark spikes at the outline's
    // sharp corners.) The opacity is applied to each layer as a whole, so a line never darkens
    // where it overlaps itself.
    ...[[1, 0.045], [0.74, 0.055], [0.5, 0.065], [0.28, 0.08]].map(([scale, opacity], index): Layer => ({
      id: `district-shadow-${index + 1}`,
      type: 'line',
      source: DISTRICT_SOURCE_ID,
      filter: kind('outline'),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': c.outlineShadow,
        'line-width': linearByZoom(11, 18 * scale, 16, 34 * scale),
        'line-blur': linearByZoom(11, 3 * scale, 16, 5 * scale),
        'line-layer-opacity': opacity * c.shadowStrength,
      },
    })),
    {
      id: 'district-outline',
      type: 'line',
      source: DISTRICT_SOURCE_ID,
      filter: kind('outline'),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': c.outline, 'line-width': linearByZoom(11, 1.6, 16, 3.2) },
    },
    {
      id: 'district-label',
      type: 'symbol',
      source: DISTRICT_SOURCE_ID,
      filter: kind('label'),
      layout: {
        'text-field': ['get', 'name'],
        'text-font': BOLD,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-size': linearByZoom(11, 9, 13, 11.5, 15, 13),
        'text-max-width': 6,
        'text-line-height': 1.15,
        'text-padding': 4,
      },
      paint: {
        'text-color': c.labelBarangay,
        'text-halo-color': c.labelHalo,
        'text-halo-width': 1.4,
        'text-opacity': linearByZoom(14, 1, 14.8, 0),
      },
    },
    {
      id: 'heat-cells',
      type: 'circle',
      source: HEAT_SOURCE_ID,
      paint: {
        'circle-radius': metersRadius,
        'circle-color': heatColor,
        'circle-opacity': 0.26,
        'circle-blur': 0.35,
        'circle-stroke-color': heatColor,
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.4,
      },
    },
    {
      id: 'gps-accuracy',
      type: 'circle',
      source: GPS_SOURCE_ID,
      paint: {
        'circle-radius': metersRadius,
        'circle-color': c.gps,
        'circle-opacity': 0.16,
        'circle-stroke-color': c.gps,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.7,
      },
    },
  ]
}

const emptyCollection = { type: 'FeatureCollection', features: [] }
const pointFeature = (longitude: number, latitude: number, properties: Record<string, unknown>) =>
  ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [longitude, latitude] } })

/** Density tier and circle size for a cell with `count` reports. The legend lists the same thresholds. */
export function heatTier(count: number): { tier: 'low' | 'moderate' | 'high'; meters: number } {
  if (count >= 6) return { tier: 'high', meters: 190 }
  if (count >= 3) return { tier: 'moderate', meters: 140 }
  return { tier: 'low', meters: 95 }
}

/**
 * The complete map style: the basemap in GreenPulse's palette, then the district cut-out,
 * density cells and GPS accuracy circle on top. Light and dark use the same layer ids, so a
 * theme switch only changes colors, and the overlays are part of the style, so they can never
 * be missing while the basemap is swapped.
 */
export function buildMapStyle({ theme, basemap = 'vector', district, heatCells = [], gps, latitude = 14.72 }: MapStyleOptions): StyleSpecification {
  const c = MAP_COLORS[theme]
  const basemapSource = basemap === 'vector'
    ? { [VECTOR_SOURCE_ID]: { type: 'vector', url: VECTOR_TILES_URL } }
    : { [RASTER_SOURCE_ID]: { type: 'raster', tiles: [RASTER_TILES_URL], tileSize: 256, maxzoom: 19, attribution: RASTER_ATTRIBUTION } }
  const style = {
    version: 8,
    name: `GreenPulse ${theme}`,
    glyphs: GLYPHS_URL,
    sources: {
      ...basemapSource,
      [DISTRICT_SOURCE_ID]: { type: 'geojson', data: district ?? emptyCollection, tolerance: 0 },
      [HEAT_SOURCE_ID]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: heatCells.map((cell) => pointFeature(cell.longitude, cell.latitude, heatTier(cell.count))) },
      },
      [GPS_SOURCE_ID]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: gps ? [pointFeature(gps.longitude, gps.latitude, { meters: gps.accuracyMeters })] : [] },
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.land } },
      ...(basemap === 'vector' ? vectorBasemapLayers(c) : rasterBasemapLayers(theme)),
      ...overlayLayers(c, latitude),
    ],
  }
  return style as unknown as StyleSpecification
}
