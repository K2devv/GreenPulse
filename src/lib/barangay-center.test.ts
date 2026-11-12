import { describe, expect, it } from 'vitest'
import { barangayPinPoint } from './barangay-center'
import { boundaryContains, distanceToBoundaryMeters, findBarangayAt, loadBundledBarangayBoundaries, type BarangayBoundary } from './barangay-lookup'
import { DISTRICT_5_BARANGAYS } from './report-filters'

const square = (west: number, south: number, east: number, north: number) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]]

describe('barangayPinPoint', () => {
  it('puts the pin in the middle of a simple outline', () => {
    const [latitude, longitude] = barangayPinPoint([{ barangay: 'Gulod', coordinates: [square(121.02, 14.7, 121.04, 14.72)] }], 'Gulod')!
    expect(latitude).toBeCloseTo(14.71, 3)
    expect(longitude).toBeCloseTo(121.03, 3)
  })

  it('stays near the middle of a long outline instead of drifting to one end', () => {
    const [latitude, longitude] = barangayPinPoint([{ barangay: 'Capri', coordinates: [square(121.0, 14.7, 121.08, 14.71)] }], 'Capri')!
    expect(latitude).toBeCloseTo(14.705, 3)
    expect(Math.abs(longitude - 121.04)).toBeLessThan(0.006)
  })

  it('stays inside a U-shaped outline whose centroid falls outside it', () => {
    // A U open to the north: the centroid sits in the empty middle of the U.
    const outline: BarangayBoundary = {
      barangay: 'Bagbag',
      coordinates: [[[[121.0, 14.7], [121.03, 14.7], [121.03, 14.73], [121.02, 14.73], [121.02, 14.71], [121.01, 14.71], [121.01, 14.73], [121.0, 14.73], [121.0, 14.7]]]],
    }
    expect(boundaryContains(outline, 121.015, 14.718)).toBe(false)
    const [latitude, longitude] = barangayPinPoint([outline], 'Bagbag')!
    expect(boundaryContains(outline, longitude, latitude)).toBe(true)
    expect(distanceToBoundaryMeters(outline, longitude, latitude)).toBeGreaterThan(300)
  })

  it('avoids a hole in the outline', () => {
    const withHole: BarangayBoundary = {
      barangay: 'Santa Lucia',
      coordinates: [[square(121.0, 14.7, 121.04, 14.74)[0], square(121.015, 14.715, 121.025, 14.725)[0]]],
    }
    const [latitude, longitude] = barangayPinPoint([withHole], 'Santa Lucia')!
    expect(boundaryContains(withHole, longitude, latitude)).toBe(true)
  })

  it('uses the largest part of a MultiPolygon barangay', () => {
    const outline: BarangayBoundary = { barangay: 'Fairview', coordinates: [square(121.0, 14.7, 121.002, 14.702), square(121.05, 14.72, 121.07, 14.74)] }
    const [latitude, longitude] = barangayPinPoint([outline], 'Fairview')!
    expect(latitude).toBeCloseTo(14.73, 2)
    expect(longitude).toBeCloseTo(121.06, 2)
  })

  it('returns undefined for a barangay without an outline', () => {
    expect(barangayPinPoint([{ barangay: 'Gulod', coordinates: [square(121.02, 14.7, 121.04, 14.72)] }], 'Capri')).toBeUndefined()
    expect(barangayPinPoint([], 'Capri')).toBeUndefined()
  })

  it('places the pin well inside each bundled District 5 barangay', async () => {
    const boundaries = await loadBundledBarangayBoundaries()
    for (const barangay of DISTRICT_5_BARANGAYS) {
      const point = barangayPinPoint(boundaries, barangay)
      expect(point, barangay).toBeDefined()
      const [latitude, longitude] = point!
      // Inside its own outline with no edge tolerance, so the form's barangay autofill agrees.
      expect(findBarangayAt(point!, boundaries, 0), barangay).toBe(barangay)
      const own = boundaries.find((boundary) => boundary.barangay === barangay)!
      expect(distanceToBoundaryMeters(own, longitude, latitude), barangay).toBeGreaterThan(40)
    }
  })
})
