import { describe, expect, it } from 'vitest'
import bundled from '../data/district5-barangays.json'
import { findBarangayAt, loadBundledBarangayBoundaries, toBarangayBoundaries, type BarangayBoundary } from './barangay-lookup'
import { DISTRICT_5_BARANGAYS } from './report-filters'

const square = (west: number, south: number, east: number, north: number) => [[west, south], [east, south], [east, north], [west, north], [west, south]]

const synthetic: BarangayBoundary[] = [
  // A square with a hole in the middle, plus a detached second part.
  { barangay: 'Gulod', coordinates: [[square(121.0, 14.7, 121.01, 14.71), square(121.004, 14.704, 121.006, 14.706)], [square(121.03, 14.7, 121.04, 14.71)]] },
  { barangay: 'Capri', coordinates: [[square(121.01, 14.7, 121.02, 14.71)]] },
]

describe('findBarangayAt', () => {
  it('finds the outline that contains a point, honoring holes and multipolygon parts', () => {
    expect(findBarangayAt([14.701, 121.001], synthetic)).toBe('Gulod')
    expect(findBarangayAt([14.705, 121.015], synthetic)).toBe('Capri')
    expect(findBarangayAt([14.705, 121.035], synthetic)).toBe('Gulod')
    expect(findBarangayAt([14.705, 121.005], synthetic, 0)).toBeUndefined()
  })

  it('assigns points just outside an outline to the nearest barangay within the tolerance', () => {
    // About 11 m south of Capri's southern edge.
    expect(findBarangayAt([14.6999, 121.015], synthetic)).toBe('Capri')
    // About 110 m away from every outline.
    expect(findBarangayAt([14.699, 121.025], synthetic)).toBeUndefined()
    expect(findBarangayAt([14.6999, 121.015], synthetic, 5)).toBeUndefined()
  })

  it('returns undefined when no boundaries are loaded', () => {
    expect(findBarangayAt([14.7222, 121.0545], [])).toBeUndefined()
  })
})

describe('toBarangayBoundaries', () => {
  it('accepts Polygon and MultiPolygon rows for District 5 barangays only', () => {
    const boundaries = toBarangayBoundaries([
      { barangay: 'Capri', geometry_geojson: { type: 'Polygon', coordinates: [square(121.01, 14.7, 121.02, 14.71)] } },
      { barangay: 'Gulod', geometry_geojson: { type: 'MultiPolygon', coordinates: [[square(121.0, 14.7, 121.01, 14.71)]] } },
      { barangay: 'Payatas', geometry_geojson: { type: 'Polygon', coordinates: [square(121.1, 14.7, 121.11, 14.71)] } },
      { barangay: 'Bagbag', geometry_geojson: { type: 'Polygon', coordinates: [[[121, 14.7], [121.01, 14.7]]] } },
      { barangay: 'Fairview', geometry_geojson: null },
    ])
    expect(boundaries.map((boundary) => boundary.barangay)).toEqual(['Capri', 'Gulod'])
    expect(findBarangayAt([14.705, 121.015], boundaries)).toBe('Capri')
  })
})

describe('bundled District 5 boundaries', () => {
  const boundaries = bundled.barangays

  it('covers exactly the 14 District 5 barangays', () => {
    expect(boundaries.map((boundary) => boundary.barangay).sort()).toEqual([...DISTRICT_5_BARANGAYS].sort())
  })

  it.each([
    ['Bagbag', [14.6968, 121.0263]],
    ['Capri', [14.7172, 121.0281]],
    ['Fairview', [14.6995, 121.0658]],
    ['Greater Lagro', [14.7298, 121.0655]],
    ['Gulod', [14.7124, 121.0395]],
    ['Kaligayahan', [14.735, 121.0463]],
    ['Nagkaisang Nayon', [14.7224, 121.0279]],
    ['North Fairview', [14.7109, 121.0611]],
    ['Novaliches Proper', [14.7218, 121.0373]],
    ['Pasong Putik Proper', [14.741, 121.0703]],
    ['San Agustin', [14.7286, 121.0347]],
    ['San Bartolome', [14.7088, 121.0253]],
    ['Santa Lucia', [14.7069, 121.0503]],
    ['Santa Monica', [14.722, 121.045]],
  ] as const)('places an interior point in %s', (barangay, point) => {
    expect(findBarangayAt([point[0], point[1]], boundaries)).toBe(barangay)
  })

  it('resolves a street search result even when its label names no barangay', () => {
    // Photon labels this "Palmanova Road, Casa Milan, Novaliches, Quezon City".
    expect(findBarangayAt([14.7222, 121.0545], boundaries)).toBe('Greater Lagro')
  })

  it('does not assign a barangay to points in neighboring districts', () => {
    // Saturnina Road, 6th District, inside the padded District 5 map bounds.
    expect(findBarangayAt([14.696, 121.052], boundaries)).toBeUndefined()
  })

  it('loads the same outlines lazily for the report form', async () => {
    const loaded = await loadBundledBarangayBoundaries()
    expect(loaded).toHaveLength(14)
    expect(findBarangayAt([14.7109, 121.0611], loaded)).toBe('North Fairview')
  })
})
