import { describe, expect, it } from 'vitest'
import { FITTED, MAX_ZOOM, centerOn, clampPan, fitSize, panBy, pinchZoom, quarterTurns, rotatedSize, stepZoom, visibleRegion, zoomAt, zoomLabel } from './photo-zoom'

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

describe('rotation', () => {
  it('counts quarter turns from 0 to 3, however far it has turned', () => {
    expect([0, 1, 2, 3, 4, 5, 9, -1].map(quarterTurns)).toEqual([0, 1, 2, 3, 0, 1, 1, 3])
  })

  it('swaps width and height on odd turns', () => {
    expect(rotatedSize({ width: 1600, height: 900 }, 1)).toEqual({ width: 900, height: 1600 })
    expect(rotatedSize({ width: 1600, height: 900 }, 2)).toEqual({ width: 1600, height: 900 })
    expect(rotatedSize({ width: 1600, height: 900 }, 7)).toEqual({ width: 900, height: 1600 })
  })
})

describe('visibleRegion', () => {
  it('shows the whole photo when it is fitted', () => {
    expect(visibleRegion(FITTED, photo, stage)).toEqual({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('shows the middle half at 2x', () => {
    // At 2x the 800 x 500 photo is 1600 x 1000; the 800 x 600 stage sees x 25%–75%, y 20%–80%.
    const region = visibleRegion({ scale: 2, x: 0, y: 0 }, photo, stage)
    expect(region.left).toBeCloseTo(0.25)
    expect(region.width).toBeCloseTo(0.5)
    expect(region.top).toBeCloseTo(0.2)
    expect(region.height).toBeCloseTo(0.6)
  })

  it('follows the pan', () => {
    // Moving the photo 400 px right at 2x shows its left half.
    const region = visibleRegion({ scale: 2, x: 400, y: 0 }, photo, stage)
    expect(region.left).toBeCloseTo(0)
    expect(region.width).toBeCloseTo(0.5)
  })
})

describe('centerOn', () => {
  it('brings the chosen point of the photo to the middle', () => {
    const centered = centerOn({ scale: 2, x: 0, y: 0 }, { x: 0.375, y: 0.5 }, photo, stage)
    expect(centered.scale).toBe(2)
    expect(centered.x).toBe(200)
    expect(centered.y).toBeCloseTo(0)
  })

  it('stops at the edges', () => {
    expect(centerOn({ scale: 2, x: 0, y: 0 }, { x: 0, y: 1 }, photo, stage)).toEqual({ scale: 2, x: 400, y: -200 })
  })

  it('leaves the fitted photo centered', () => {
    expect(centerOn(FITTED, { x: 0.1, y: 0.9 }, photo, stage)).toEqual(FITTED)
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
