import { describe, expect, it } from 'vitest'
import bundled from '../data/district5-barangays.json'
import { findBarangayAt, type BarangayBoundary } from './barangay-lookup'
import { barangayLabelPoint, buildDistrictOutline, dissolveBoundaries, districtFeatures, outlineContains, ringAreaSquareMeters } from './district-outline'
import type { Bounds } from './map-viewport'

const fallbackBounds: Bounds = [121.005, 14.675, 121.105, 14.775]
const square = (west: number, south: number, east: number, north: number) => [[west, south], [east, south], [east, north], [west, north], [west, south]]
const barangay = (name: string, ...rings: number[][][]): BarangayBoundary => ({ barangay: name, coordinates: [rings] })

describe('dissolveBoundaries', () => {
  it('removes the border two neighbours share and keeps one outer ring', () => {
    const dissolved = dissolveBoundaries([barangay('Gulod', square(121, 14.7, 121.01, 14.71)), barangay('Capri', square(121.01, 14.7, 121.02, 14.71))])
    expect(dissolved?.rings).toHaveLength(1)
    // Six corners (the shared border's two ends stay as points on the outline) plus the closing point.
    expect(dissolved?.rings[0]).toHaveLength(7)
    expect(dissolved?.rings[0][0]).toEqual(dissolved?.rings[0][6])
    expect(dissolved?.innerBorders).toEqual([[[121.01, 14.7], [121.01, 14.71]]])
  })

  it('keeps parts that only touch at a corner as separate rings', () => {
    const dissolved = dissolveBoundaries([barangay('Gulod', square(121, 14.7, 121.01, 14.71)), barangay('Capri', square(121.01, 14.71, 121.02, 14.72))])
    expect(dissolved?.rings).toHaveLength(2)
    for (const ring of dissolved?.rings ?? []) expect(ring).toHaveLength(5)
  })

  it('drops slivers where two outlines do not quite meet', () => {
    // Capri's western edge bows 1 m away from Gulod's eastern edge, leaving a thin gap.
    const capri = [[121.01, 14.7], [121.02, 14.7], [121.02, 14.71], [121.01, 14.71], [121.01001, 14.705], [121.01, 14.7]]
    const dissolved = dissolveBoundaries([barangay('Gulod', square(121, 14.7, 121.01, 14.71)), barangay('Capri', capri)])
    expect(dissolved?.rings).toHaveLength(1)
  })

  it('rejects outlines that overlap instead of sharing a border', () => {
    expect(dissolveBoundaries([barangay('Gulod', square(121, 14.7, 121.012, 14.71)), barangay('Capri', square(121.008, 14.7, 121.02, 14.71))])).toBeNull()
  })

  it('rejects empty input', () => {
    expect(dissolveBoundaries([])).toBeNull()
  })
})

describe('buildDistrictOutline', () => {
  const outline = buildDistrictOutline([bundled.barangays], fallbackBounds)

  it('merges the 14 bundled barangays into a single District 5 ring', () => {
    expect(outline.rings).toHaveLength(1)
    expect(outline.rings[0].length).toBeGreaterThan(300)
    expect(outline.rings[0][0]).toEqual(outline.rings[0][outline.rings[0].length - 1])
    expect(outline.barangays).toHaveLength(14)
    expect(outline.innerBorders.length).toBeGreaterThan(400)
  })

  it('covers the same area as the barangays together', () => {
    const summed = bundled.barangays.reduce((total, boundary) => total + boundary.coordinates.reduce((area, polygon) => area + ringAreaSquareMeters(polygon[0]), 0), 0)
    expect(ringAreaSquareMeters(outline.rings[0]) / summed).toBeCloseTo(1, 3)
    // About 28.5 km².
    expect(summed / 1e6).toBeGreaterThan(27)
    expect(summed / 1e6).toBeLessThan(30)
  })

  it('reports bounds that match the ring', () => {
    const [west, south, east, north] = outline.bounds
    expect(west).toBeCloseTo(121.01287, 4)
    expect(south).toBeCloseTo(14.69289, 4)
    expect(east).toBeCloseTo(121.08309, 4)
    expect(north).toBeCloseTo(14.74488, 4)
  })

  it.each([
    ['Bagbag', 14.6968, 121.0263],
    ['Capri', 14.7172, 121.0281],
    ['Fairview', 14.6995, 121.0658],
    ['Greater Lagro', 14.7298, 121.0655],
    ['Gulod', 14.7124, 121.0395],
    ['Kaligayahan', 14.735, 121.0463],
    ['Nagkaisang Nayon', 14.7224, 121.0279],
    ['North Fairview', 14.7109, 121.0611],
    ['Novaliches Proper', 14.7218, 121.0373],
    ['Pasong Putik Proper', 14.741, 121.0703],
    ['San Agustin', 14.7286, 121.0347],
    ['San Bartolome', 14.7088, 121.0253],
    ['Santa Lucia', 14.7069, 121.0503],
    ['Santa Monica', 14.722, 121.045],
  ] as const)('contains a point in %s', (_name, latitude, longitude) => {
    expect(outlineContains(outline, latitude, longitude)).toBe(true)
  })

  it('leaves out neighbouring districts inside the padded map bounds', () => {
    // Saturnina Road, 6th District.
    expect(outlineContains(outline, 14.696, 121.052)).toBe(false)
    expect(outlineContains(outline, 14.68, 121.01)).toBe(false)
  })

  it('prefers the first source that dissolves cleanly', () => {
    const overlapping = [barangay('Gulod', square(121, 14.7, 121.012, 14.71)), barangay('Capri', square(121.008, 14.7, 121.02, 14.71))]
    const fromBundled = buildDistrictOutline([overlapping, bundled.barangays], fallbackBounds)
    expect(fromBundled.barangays).toHaveLength(14)
    const fromFirst = buildDistrictOutline([[barangay('Gulod', square(121, 14.7, 121.01, 14.71))], bundled.barangays], fallbackBounds)
    expect(fromFirst.barangays).toHaveLength(1)
  })

  it('falls back to a rectangle over the given bounds', () => {
    const fallback = buildDistrictOutline([null, undefined, []], fallbackBounds)
    expect(fallback.rings).toEqual([[[121.005, 14.675], [121.105, 14.675], [121.105, 14.775], [121.005, 14.775], [121.005, 14.675]]])
    expect(fallback.bounds).toEqual(fallbackBounds)
    expect(fallback.barangays).toEqual([])
    expect(fallback.innerBorders).toEqual([])
  })
})

describe('barangayLabelPoint', () => {
  it('places every bundled barangay label inside its own barangay', () => {
    for (const boundary of bundled.barangays) {
      const point = barangayLabelPoint(boundary)
      expect(point, boundary.barangay).toBeDefined()
      expect(findBarangayAt([point![1], point![0]], bundled.barangays, 0)).toBe(boundary.barangay)
    }
  })

  it('stays inside an L-shaped outline whose centroid region is empty', () => {
    const lShape = barangay('Gulod', [[121, 14.7], [121.03, 14.7], [121.03, 14.705], [121.005, 14.705], [121.005, 14.73], [121, 14.73], [121, 14.7]])
    const point = barangayLabelPoint(lShape)
    expect(point).toBeDefined()
    expect(findBarangayAt([point![1], point![0]], [lShape], 0)).toBe('Gulod')
  })
})

describe('districtFeatures', () => {
  const outline = buildDistrictOutline([bundled.barangays], fallbackBounds)
  const collection = districtFeatures(outline)
  const ofKind = (kind: string) => collection.features.filter((feature) => feature.properties.kind === kind)

  it('masks the world with the district cut out', () => {
    const [mask] = ofKind('mask')
    expect(mask.geometry.type).toBe('Polygon')
    const rings = mask.geometry.coordinates as number[][][]
    expect(rings).toHaveLength(2)
    expect(rings[0][0]).toEqual([-180, -85])
    expect(rings[1]).toBe(outline.rings[0])
  })

  it('adds the outline, the barangay borders, and one label per barangay', () => {
    expect(ofKind('outline')).toHaveLength(1)
    expect(ofKind('border')).toHaveLength(1)
    expect(ofKind('label').map((feature) => feature.properties.name).sort()).toEqual(bundled.barangays.map((boundary) => boundary.barangay).sort())
  })

  it('omits borders and labels for the rectangle fallback', () => {
    const fallback = districtFeatures(buildDistrictOutline([], fallbackBounds))
    expect(fallback.features.map((feature) => feature.properties.kind)).toEqual(['mask', 'outline'])
  })
})
