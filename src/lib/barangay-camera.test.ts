import { afterEach, describe, expect, it, vi } from 'vitest'
import data from '../data/district5-barangays.json'
import { cameraDuration } from '../MapParts'
import { barangayBounds, barangayCamera, BARANGAY_FIT_MAX_ZOOM } from './barangay-camera'
import { loadBundledBarangayBoundaries, type BarangayBoundary } from './barangay-lookup'
import { DISTRICT_5_BARANGAYS } from './report-filters'
import { clampCameraToView, fitBoundsCamera, type Bounds } from './map-viewport'

const square = (west: number, south: number, east: number, north: number) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
const padding = { top: 12, right: 12, bottom: 12, left: 12 }
const district: Bounds = [121.01, 14.69, 121.09, 14.75]

describe('barangayBounds', () => {
  it('covers every part of a MultiPolygon barangay', () => {
    const boundaries: BarangayBoundary[] = [
      { barangay: 'Gulod', coordinates: [square(121.02, 14.7, 121.03, 14.71), square(121.05, 14.72, 121.06, 14.73)] },
      { barangay: 'Capri', coordinates: [square(121.07, 14.69, 121.08, 14.7)] },
    ]
    expect(barangayBounds(boundaries, 'Gulod')).toEqual([121.02, 14.7, 121.06, 14.73])
    expect(barangayBounds(boundaries, 'Capri')).toEqual([121.07, 14.69, 121.08, 14.7])
  })

  it('ignores holes, joins duplicate rows, and returns undefined for an unknown barangay', () => {
    const boundaries: BarangayBoundary[] = [
      { barangay: 'Gulod', coordinates: [[...square(121.02, 14.7, 121.04, 14.72), ...square(121.025, 14.705, 121.03, 14.71)]] },
      { barangay: 'Gulod', coordinates: [square(121.04, 14.7, 121.05, 14.71)] },
    ]
    expect(barangayBounds(boundaries, 'Gulod')).toEqual([121.02, 14.7, 121.05, 14.72])
    expect(barangayBounds(boundaries, 'Fairview')).toBeUndefined()
    expect(barangayBounds([], 'Gulod')).toBeUndefined()
  })

  it('finds a box for every bundled District 5 barangay inside the district', async () => {
    const boundaries = await loadBundledBarangayBoundaries()
    expect(data.barangays).toHaveLength(DISTRICT_5_BARANGAYS.length)
    for (const barangay of DISTRICT_5_BARANGAYS) {
      const bounds = barangayBounds(boundaries, barangay)
      expect(bounds, barangay).toBeDefined()
      const [west, south, east, north] = bounds as Bounds
      expect(west).toBeLessThan(east)
      expect(south).toBeLessThan(north)
      expect(west).toBeGreaterThan(121.0)
      expect(east).toBeLessThan(121.12)
    }
  })
})

describe('clampCameraToView', () => {
  const lock = fitBoundsCamera(district, 800, 500, padding, 18.5)

  it('leaves a camera that is already inside the view alone', () => {
    const camera = { center: lock.center, zoom: lock.zoom + 2 }
    const clamped = clampCameraToView(camera, 800, 500, lock.view, lock.zoom)
    expect(clamped.zoom).toBe(camera.zoom)
    expect(clamped.center[0]).toBeCloseTo(camera.center[0], 8)
    expect(clamped.center[1]).toBeCloseTo(camera.center[1], 8)
  })

  it('raises the zoom to the lock zoom', () => {
    expect(clampCameraToView({ center: lock.center, zoom: 5 }, 800, 500, lock.view, lock.zoom).zoom).toBe(lock.zoom)
  })

  it('pulls a camera near the edge back so the viewport stays inside the view', () => {
    const zoom = lock.zoom + 2
    const clamped = clampCameraToView({ center: [lock.view[2], lock.view[1]], zoom }, 800, 500, lock.view, lock.zoom)
    expect(clamped.zoom).toBe(zoom)
    // Re-measure the viewport at the clamped camera: its corners must sit inside the lock's view.
    const shown = fitBoundsCamera([clamped.center[0] - 1e-9, clamped.center[1] - 1e-9, clamped.center[0] + 1e-9, clamped.center[1] + 1e-9], 800, 500, { top: 0, right: 0, bottom: 0, left: 0 }, zoom)
    expect(shown.zoom).toBeCloseTo(zoom, 3)
    expect(shown.view[0]).toBeGreaterThanOrEqual(lock.view[0] - 1e-6)
    expect(shown.view[2]).toBeLessThanOrEqual(lock.view[2] + 1e-6)
    expect(shown.view[1]).toBeGreaterThanOrEqual(lock.view[1] - 1e-6)
    expect(shown.view[3]).toBeLessThanOrEqual(lock.view[3] + 1e-6)
    expect(clamped.center[0]).toBeLessThan(lock.view[2])
    expect(clamped.center[1]).toBeGreaterThan(lock.view[1])
  })

  it('centers an axis that is larger than the view', () => {
    const clamped = clampCameraToView({ center: [121.0, 14.6], zoom: lock.zoom }, 800, 500, lock.view, lock.zoom)
    expect(clamped.center[0]).toBeCloseTo((lock.view[0] + lock.view[2]) / 2, 6)
  })
})

describe('barangayCamera', () => {
  const lock = fitBoundsCamera(district, 600, 400, padding, 18.5)

  it('zooms in on a barangay inside the district', () => {
    const bounds: Bounds = [121.03, 14.71, 121.045, 14.72]
    const camera = barangayCamera(bounds, 600, 400, padding, lock, 18.5)
    expect(camera.zoom).toBeGreaterThan(lock.zoom)
    expect(camera.center[0]).toBeCloseTo(121.0375, 3)
    expect(camera.center[1]).toBeCloseTo(14.715, 3)
  })

  it('never zooms out past the lock zoom, even for an outline larger than the district', () => {
    const camera = barangayCamera([120.9, 14.6, 121.2, 14.85], 600, 400, padding, lock, 18.5)
    expect(camera.zoom).toBe(lock.zoom)
  })

  it('does not zoom closer than the barangay fit limit', () => {
    const camera = barangayCamera([121.05, 14.71, 121.0502, 14.7102], 600, 400, padding, lock, 18.5)
    expect(camera.zoom).toBe(BARANGAY_FIT_MAX_ZOOM)
  })

  it('keeps a barangay at the district edge inside the pan limit', () => {
    const camera = barangayCamera([121.085, 14.745, 121.0899, 14.7499], 600, 400, padding, lock, 18.5)
    const half = (lock.view[2] - lock.view[0]) / 2 ** (camera.zoom - lock.zoom) / 2
    expect(camera.center[0] + half).toBeLessThanOrEqual(lock.view[2] + 1e-6)
  })
})

describe('cameraDuration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the animation when motion is not reduced', () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(cameraDuration(650)).toBe(650)
  })

  it('jumps when the app switch reduces motion', () => {
    vi.stubGlobal('document', { documentElement: { dataset: { motion: 'reduced' } } })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(cameraDuration(650)).toBe(0)
  })

  it('jumps when the OS prefers reduced motion', () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(cameraDuration(650)).toBe(0)
  })
})
