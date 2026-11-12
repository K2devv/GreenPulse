import { describe, expect, it } from 'vitest'
import { fitBoundsCamera, pixelsPerMeter, type Bounds } from './map-viewport'

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

describe('pixelsPerMeter', () => {
  it('doubles with each zoom level and grows away from the equator', () => {
    expect(pixelsPerMeter(14.72, 16) / pixelsPerMeter(14.72, 15)).toBeCloseTo(2, 9)
    expect(pixelsPerMeter(14.72, 15)).toBeGreaterThan(pixelsPerMeter(0, 15))
    // One meter is about 0.43 px at zoom 15 in Quezon City.
    expect(pixelsPerMeter(14.72, 15)).toBeCloseTo(0.433, 2)
  })
})
