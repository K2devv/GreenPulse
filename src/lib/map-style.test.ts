import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import bundled from '../data/district5-barangays.json'
import { buildDistrictOutline, districtFeatures } from './district-outline'
import { buildMapStyle, heatTier, MAP_COLORS, VECTOR_SOURCE_ID, type MapStyleOptions } from './map-style'

const district = districtFeatures(buildDistrictOutline([bundled.barangays], [121.005, 14.675, 121.105, 14.775]))
const full: Omit<MapStyleOptions, 'theme'> = {
  district,
  heatCells: [{ latitude: 14.722, longitude: 121.045, count: 7 }, { latitude: 14.71, longitude: 121.03, count: 1 }],
  gps: { latitude: 14.72, longitude: 121.05, accuracyMeters: 55 },
}
const layerIds = (options: MapStyleOptions) => buildMapStyle(options).layers.map((layer) => layer.id)
const errorsOf = (options: MapStyleOptions) => validateStyleMin(buildMapStyle(options)).map((error) => error.message)

describe('buildMapStyle', () => {
  it.each([
    ['light vector', { theme: 'light', basemap: 'vector' }],
    ['dark vector', { theme: 'dark', basemap: 'vector' }],
    ['light raster fallback', { theme: 'light', basemap: 'raster' }],
    ['dark raster fallback', { theme: 'dark', basemap: 'raster' }],
  ] as const)('produces a valid MapLibre style: %s', (_label, options) => {
    expect(errorsOf({ ...full, ...options })).toEqual([])
    expect(errorsOf(options)).toEqual([])
  })

  it('uses the same layers in light and dark so a theme switch only repaints', () => {
    expect(layerIds({ ...full, theme: 'dark' })).toEqual(layerIds({ ...full, theme: 'light' }))
    expect(layerIds({ ...full, theme: 'dark', basemap: 'raster' })).toEqual(layerIds({ ...full, theme: 'light', basemap: 'raster' }))
  })

  it('draws the district mask above every basemap layer, with the outline and labels above the mask', () => {
    const style = buildMapStyle({ ...full, theme: 'light' })
    const ids = style.layers.map((layer) => layer.id)
    const lastBasemapLayer = Math.max(...style.layers.map((layer, index) => ('source' in layer && layer.source === VECTOR_SOURCE_ID ? index : -1)))
    expect(ids.indexOf('district-mask')).toBeGreaterThan(lastBasemapLayer)
    expect(ids.indexOf('district-border')).toBeLessThan(ids.indexOf('district-mask'))
    expect(ids.indexOf('district-outline')).toBeGreaterThan(ids.indexOf('district-shadow-4'))
    expect(ids.indexOf('district-shadow-1')).toBeGreaterThan(ids.indexOf('district-mask'))
    expect(ids.indexOf('district-label')).toBeGreaterThan(ids.indexOf('district-outline'))
  })

  it('keeps the overlays when the basemap falls back to raster tiles', () => {
    const ids = layerIds({ ...full, theme: 'light', basemap: 'raster' })
    expect(ids).toEqual(expect.arrayContaining(['basemap-raster', 'district-mask', 'district-outline', 'district-label', 'heat-cells', 'gps-accuracy']))
    expect(ids).not.toContain('road-major')
  })

  it('fills the mask with the theme color the page uses around the map', () => {
    for (const theme of ['light', 'dark'] as const) {
      const mask = buildMapStyle({ theme }).layers.find((layer) => layer.id === 'district-mask')
      expect(mask && 'paint' in mask ? mask.paint : undefined).toEqual({ 'fill-color': MAP_COLORS[theme].mask })
    }
  })

  it('writes density cells and the GPS fix into their sources', () => {
    const style = buildMapStyle({ ...full, theme: 'light' })
    const heat = style.sources.heat as { data: { features: Array<{ properties: unknown; geometry: { coordinates: number[] } }> } }
    expect(heat.data.features.map((feature) => feature.properties)).toEqual([{ tier: 'high', meters: 190 }, { tier: 'low', meters: 95 }])
    expect(heat.data.features[0].geometry.coordinates).toEqual([121.045, 14.722])
    const gps = style.sources.gps as { data: { features: Array<{ properties: unknown }> } }
    expect(gps.data.features.map((feature) => feature.properties)).toEqual([{ meters: 55 }])
    const empty = buildMapStyle({ theme: 'light' })
    expect((empty.sources.heat as { data: { features: unknown[] } }).data.features).toEqual([])
    expect((empty.sources.gps as { data: { features: unknown[] } }).data.features).toEqual([])
  })
})

describe('heatTier', () => {
  it('matches the legend thresholds', () => {
    expect([1, 2, 3, 5, 6, 20].map((count) => heatTier(count).tier)).toEqual(['low', 'low', 'moderate', 'moderate', 'high', 'high'])
  })
})
