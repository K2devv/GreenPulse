import { describe, expect, it } from 'vitest'
import { FITTED, MAX_ZOOM, clampPan, fitSize, panBy, pinchZoom, stepZoom, zoomAt, zoomLabel } from './photo-zoom'

const stage = { width: 800, height: 600 }
const photo = { width: 800, height: 500 }

describe('fitSize', () => {
  it('fits a large photo inside the stage at its own aspect ratio', () => {
    expect(fitSize({ width: 1600, height: 1000 }, stage)).toEqual({ width: 800, height: 500 })
    const tall = fitSize({ width: 900, height: 1400 }, stage)
    expect(tall.width).toBeCloseTo(900 * 600 / 1400)
    expect(tall.height).toBeCloseTo(600)
  })

  it('never enlarges a small photo past its natural size', () => {
    expect(fitSize({ width: 320, height: 240 }, stage)).toEqual({ width: 320, height: 240 })
  })

  it('returns nothing until both sizes are known', () => {
    expect(fitSize({ width: 0, height: 0 }, stage)).toEqual({ width: 0, height: 0 })
    expect(fitSize({ width: 100, height: 100 }, { width: 0, height: 600 })).toEqual({ width: 0, height: 0 })
  })
})

describe('clampPan', () => {
  it('centers a photo that fits along a side', () => {
    expect(clampPan({ scale: 1, x: 40, y: -30 }, photo, stage)).toEqual(FITTED)
  })

  it('stops the zoomed photo at its edges', () => {
    // At 2x the photo is 1600 x 1000: 400 px of room each way across, 200 px up and down.
    expect(clampPan({ scale: 2, x: 900, y: -900 }, photo, stage)).toEqual({ scale: 2, x: 400, y: -200 })
  })

  it('keeps the zoom inside its limits', () => {
    expect(clampPan({ scale: 9, x: 0, y: 0 }, photo, stage).scale).toBe(MAX_ZOOM)
    expect(clampPan({ scale: 0.2, x: 0, y: 0 }, photo, stage).scale).toBe(1)
  })
})

describe('zoomAt', () => {
  it('keeps the point under the pointer in place', () => {
    const point = { x: 200, y: 100 }
    const zoomed = zoomAt(FITTED, 2, point, photo, stage)
    expect(zoomed).toEqual({ scale: 2, x: -200, y: -100 })
    // The photo point that was at (200, 100) is still there: x + scale * (200 / 1) = 200.
    expect(zoomed.x + zoomed.scale * point.x).toBe(point.x)
  })

  it('goes back to the fitted view at the lowest zoom', () => {
    expect(zoomAt({ scale: 3, x: 120, y: 40 }, 1, { x: 0, y: 0 }, photo, stage)).toEqual(FITTED)
  })

  it('clamps the pan after zooming near an edge', () => {
    expect(zoomAt(FITTED, 2, { x: 400, y: 300 }, photo, stage)).toEqual({ scale: 2, x: -400, y: -200 })
  })
})

describe('pinchZoom', () => {
  it('scales with the spread of the fingers around their midpoint', () => {
    expect(pinchZoom(FITTED, { x: 0, y: 0 }, 100, { x: 0, y: 0 }, 250, photo, stage)).toEqual({ scale: 2.5, x: 0, y: 0 })
  })

  it('moves the photo with the fingers', () => {
    const moved = pinchZoom({ scale: 2, x: 0, y: 0 }, { x: 0, y: 0 }, 100, { x: 50, y: -20 }, 100, photo, stage)
    expect(moved).toEqual({ scale: 2, x: 50, y: -20 })
  })

  it('ignores a pinch that started with no spread', () => {
    const start = { scale: 2, x: 10, y: 10 }
    expect(pinchZoom(start, { x: 0, y: 0 }, 0, { x: 0, y: 0 }, 100, photo, stage)).toBe(start)
  })
})

describe('panBy', () => {
  it('drags the zoomed photo and stops at its edges', () => {
    expect(panBy({ scale: 2, x: 0, y: 0 }, 150, 50, photo, stage)).toEqual({ scale: 2, x: 150, y: 50 })
    expect(panBy({ scale: 2, x: 380, y: 0 }, 150, 0, photo, stage)).toEqual({ scale: 2, x: 400, y: 0 })
  })

  it('does not move the fitted photo', () => {
    expect(panBy(FITTED, 150, 50, photo, stage)).toEqual(FITTED)
  })
})

describe('stepZoom', () => {
  it('steps up and down through the zoom levels', () => {
    expect(stepZoom(1, 1)).toBe(1.5)
    expect(stepZoom(1.5, 1)).toBe(2)
    expect(stepZoom(2.5, 1)).toBe(3)
    expect(stepZoom(2.5, -1)).toBe(2)
    expect(stepZoom(1.5, -1)).toBe(1)
  })

  it('stays inside the limits', () => {
    expect(stepZoom(4, 1)).toBe(4)
    expect(stepZoom(1, -1)).toBe(1)
  })
})

describe('zoomLabel', () => {
  it('names the fitted view and rounds the rest', () => {
    expect(zoomLabel(1)).toBe('Fit')
    expect(zoomLabel(1.5)).toBe('1.5×')
    expect(zoomLabel(2)).toBe('2×')
    expect(zoomLabel(2.537)).toBe('2.5×')
  })
})
