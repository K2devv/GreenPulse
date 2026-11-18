import { describe, expect, it } from 'vitest'
import { clampCameraToView, constrainDistrictCamera, districtLockCamera, fitBoundsCamera, nearestPointInRings, pixelsPerMeter, type Bounds } from './map-viewport'

const district: Bounds = [121.01287, 14.69289, 121.08309, 14.74488]
const noPadding = { top: 0, right: 0, bottom: 0, left: 0 }

describe('fitBoundsCamera', () => {
  it('centers the bounds and shows all of them', () => {
    const camera = fitBoundsCamera(district, 800, 500, noPadding)
    expect(camera.center[0]).toBeCloseTo((district[0] + district[2]) / 2, 5)
    expect(camera.center[1]).toBeCloseTo((district[1] + district[3]) / 2, 3)
    const [west, south, east, north] = camera.view
    expect(west).toBeLessThanOrEqual(district[0] + 1e-9)
    expect(south).toBeLessThanOrEqual(district[1] + 1e-9)
    expect(east).toBeGreaterThanOrEqual(district[2] - 1e-9)
    expect(north).toBeGreaterThanOrEqual(district[3] - 1e-9)
  })

  it('fits the limiting dimension exactly', () => {
    // The district is wider than it is tall, so a tall viewport is limited by its width.
    const tall = fitBoundsCamera(district, 400, 900, noPadding)
    expect(tall.view[0]).toBeCloseTo(district[0], 6)
    expect(tall.view[2]).toBeCloseTo(district[2], 6)
    const wide = fitBoundsCamera(district, 1600, 400, noPadding)
    expect(wide.view[1]).toBeCloseTo(district[1], 6)
    expect(wide.view[3]).toBeCloseTo(district[3], 6)
  })

  it('gains one zoom level when the viewport doubles', () => {
    const small = fitBoundsCamera(district, 400, 300, noPadding)
    const large = fitBoundsCamera(district, 800, 600, noPadding)
    expect(large.zoom - small.zoom).toBeCloseTo(1, 6)
  })

  it('keeps the padded sides clear and shifts the center to match', () => {
    const padded = fitBoundsCamera(district, 800, 500, { top: 80, right: 20, bottom: 20, left: 20 })
    const plain = fitBoundsCamera(district, 800, 500, noPadding)
    expect(padded.zoom).toBeLessThan(plain.zoom)
    // More padding on top moves the camera north, which pushes the district down the screen.
    expect(padded.center[1]).toBeGreaterThan(plain.center[1])
    expect(padded.view[3]).toBeGreaterThan(district[3])
  })

  it('respects the maximum zoom for tiny bounds', () => {
    const point: Bounds = [121.05, 14.72, 121.05, 14.72]
    expect(fitBoundsCamera(point, 800, 500, noPadding, 18).zoom).toBe(18)
  })
})

describe('districtLockCamera', () => {
  // The part of the map a camera shows, as [west, south, east, north].
  const shown = (camera: { center: [number, number]; zoom: number }, width: number, height: number) =>
    fitBoundsCamera([camera.center[0], camera.center[1], camera.center[0], camera.center[1]], width, height, noPadding, camera.zoom).view
  const margin = 10

  it.each([[742, 440], [351, 428], [400, 900], [1600, 400]])('shows the whole district as large as it fits in a %i x %i map', (width, height) => {
    const lock = districtLockCamera(district, width, height, margin)
    const [west, south, east, north] = shown(lock, width, height)
    expect(west).toBeLessThanOrEqual(district[0])
    expect(south).toBeLessThanOrEqual(district[1])
    expect(east).toBeGreaterThanOrEqual(district[2])
    expect(north).toBeGreaterThanOrEqual(district[3])
    // Tighter than a fit with more room around it, so the district is no smaller than it needs to be.
    expect(lock.zoom).toBeGreaterThan(fitBoundsCamera(district, width, height, { top: 64, right: 24, bottom: 46, left: 24 }).zoom - 1e-9)
    expect(lock.zoom).toBeCloseTo(fitBoundsCamera(district, width, height, { top: margin, right: margin, bottom: margin, left: margin }).zoom, 9)
  })

  it('lets a zoomed-in map be dragged to the district edges and no further', () => {
    const lock = districtLockCamera(district, 742, 440, margin)
    const [west, south, east, north] = lock.view
    expect(west).toBeLessThan(district[0])
    expect(east).toBeGreaterThan(district[2])
    expect(south).toBeLessThan(district[1])
    expect(north).toBeGreaterThan(district[3])
    // The pan limit is only the margin wider than the district.
    expect(district[0] - west).toBeLessThan((district[2] - district[0]) * 0.05)

    const zoomedIn = lock.zoom + 2
    const pushed = clampCameraToView({ center: [121.2, 14.9], zoom: zoomedIn }, 742, 440, lock.view, lock.zoom)
    const [shownWest, shownSouth, shownEast, shownNorth] = shown(pushed, 742, 440)
    expect(shownEast).toBeCloseTo(east, 9)
    expect(shownNorth).toBeCloseTo(north, 6)
    expect(shownWest).toBeGreaterThan(west)
    expect(shownSouth).toBeGreaterThan(south)
  })

  it('does not zoom out past the whole district', () => {
    const lock = districtLockCamera(district, 742, 440, margin)
    expect(clampCameraToView({ center: lock.center, zoom: lock.zoom - 3 }, 742, 440, lock.view, lock.zoom).zoom).toBe(lock.zoom)
  })
})

// An L-shaped district: the bounding box's north-east corner lies outside it.
const lShape = [[121.01, 14.69], [121.08, 14.69], [121.08, 14.71], [121.03, 14.71], [121.03, 14.75], [121.01, 14.75], [121.01, 14.69]]

describe('nearestPointInRings', () => {
  it('keeps a point inside the district where it is', () => {
    expect(nearestPointInRings([121.02, 14.70], [lShape])).toEqual([121.02, 14.70])
  })

  it('moves a point in the empty corner onto the closest edge', () => {
    const [longitude, latitude] = nearestPointInRings([121.06, 14.74], [lShape])
    // The closest edge is the top of the L's foot (latitude 14.71) or the side of its upright (longitude 121.03).
    const onFoot = Math.abs(latitude - 14.71) < 1e-6 && longitude >= 121.03 - 1e-9
    const onUpright = Math.abs(longitude - 121.03) < 1e-9 && latitude >= 14.71 - 1e-6
    expect(onFoot || onUpright).toBe(true)
  })

  it('leaves the point alone when there is no outline', () => {
    expect(nearestPointInRings([121.06, 14.74], [])).toEqual([121.06, 14.74])
  })
})

describe('constrainDistrictCamera', () => {
  const bounds: Bounds = [121.01, 14.69, 121.08, 14.75]

  it('keeps the middle of a zoomed-in map over the district', () => {
    const lock = districtLockCamera(bounds, 742, 440, 10)
    const camera = constrainDistrictCamera({ center: [121.065, 14.74], zoom: lock.zoom + 3 }, 742, 440, lock, [lShape])
    expect(camera.zoom).toBe(lock.zoom + 3)
    const [longitude, latitude] = camera.center
    expect(longitude <= 121.03 + 1e-9 || latitude <= 14.71 + 1e-6).toBe(true)
  })

  it('shows the whole district, centered, at the lowest zoom', () => {
    const lock = districtLockCamera(bounds, 742, 440, 10)
    const camera = constrainDistrictCamera({ center: [121.065, 14.74], zoom: lock.zoom - 2 }, 742, 440, lock, [lShape])
    expect(camera.zoom).toBe(lock.zoom)
    expect(camera.center[0]).toBeCloseTo(lock.center[0], 9)
    expect(camera.center[1]).toBeCloseTo(lock.center[1], 6)
  })
})

describe('pixelsPerMeter', () => {
  it('doubles with each zoom level and grows away from the equator', () => {
    expect(pixelsPerMeter(14.72, 16) / pixelsPerMeter(14.72, 15)).toBeCloseTo(2, 9)
    expect(pixelsPerMeter(14.72, 15)).toBeGreaterThan(pixelsPerMeter(0, 15))
    // One meter is about 0.43 px at zoom 15 in Quezon City.
    expect(pixelsPerMeter(14.72, 15)).toBeCloseTo(0.433, 2)
  })
})
