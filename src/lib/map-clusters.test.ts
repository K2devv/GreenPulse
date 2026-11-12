import { describe, expect, it } from 'vitest'
import { CLUSTER_MAX_ZOOM, clusterRingGradient, createClusterIndex, spreadCoincident, type MapClusterItem, type MapPoint } from './map-clusters'

type Category = 'Waste' | 'Flooding' | 'Drainage'

const metersBetween = ([latitudeA, longitudeA]: [number, number], [latitudeB, longitudeB]: [number, number]) => {
  const dy = (latitudeA - latitudeB) * 110_574
  const dx = (longitudeA - longitudeB) * 111_320 * Math.cos(latitudeA * Math.PI / 180)
  return Math.hypot(dx, dy)
}

describe('spreadCoincident', () => {
  const shared = { latitude: 14.722, longitude: 121.045 }

  it('leaves a report that has its point to itself where it is', () => {
    const positions = spreadCoincident([{ id: 'a', ...shared }, { id: 'b', latitude: 14.73, longitude: 121.05 }])
    expect(positions.get('a')).toEqual([14.722, 121.045])
    expect(positions.get('b')).toEqual([14.73, 121.05])
  })

  it('fans out reports that share a point so each can be selected', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const positions = spreadCoincident(ids.map((id) => ({ id, ...shared })))
    const placed = ids.map((id) => positions.get(id)!)
    for (let first = 0; first < placed.length; first++) {
      // Still inside the roughly 110 m cell the rounded public coordinate stands for.
      expect(metersBetween(placed[first], [shared.latitude, shared.longitude])).toBeLessThan(45)
      for (let second = first + 1; second < placed.length; second++) {
        expect(metersBetween(placed[first], placed[second])).toBeGreaterThan(14)
      }
    }
  })

  it('keeps a report in place when the order changes or a neighbour is filtered out before it', () => {
    const all = spreadCoincident(['c', 'a', 'b'].map((id) => ({ id, ...shared })))
    const reordered = spreadCoincident(['b', 'c', 'a'].map((id) => ({ id, ...shared })))
    expect(reordered.get('a')).toEqual(all.get('a'))
    expect(reordered.get('c')).toEqual(all.get('c'))
    const withoutLast = spreadCoincident(['a', 'b'].map((id) => ({ id, ...shared })))
    expect(withoutLast.get('a')).toEqual(all.get('a'))
    expect(withoutLast.get('b')).toEqual(all.get('b'))
  })
})

describe('createClusterIndex', () => {
  const points: MapPoint<Category>[] = [
    { id: 'w1', latitude: 14.7200, longitude: 121.0400, category: 'Waste', urgent: true },
    { id: 'w2', latitude: 14.7203, longitude: 121.0403, category: 'Waste', urgent: false },
    { id: 'f1', latitude: 14.7206, longitude: 121.0398, category: 'Flooding', urgent: true },
    { id: 'd1', latitude: 14.7400, longitude: 121.0700, category: 'Drainage', urgent: false },
  ]
  const index = createClusterIndex(points)

  it('groups nearby reports when zoomed out and keeps distant ones apart', () => {
    const items = index.itemsAt(12)
    const clusters = items.filter((item): item is MapClusterItem<Category> => item.kind === 'cluster')
    expect(clusters).toHaveLength(1)
    expect(clusters[0].count).toBe(3)
    expect(clusters[0].urgent).toBe(2)
    expect(new Map(clusters[0].mix)).toEqual(new Map([['Waste', 2], ['Flooding', 1]]))
    expect(items.filter((item) => item.kind === 'point').map((item) => item.id)).toEqual(['d1'])
  })

  it('reports the zoom at which a cluster breaks apart', () => {
    const [cluster] = index.itemsAt(12).filter((item): item is MapClusterItem<Category> => item.kind === 'cluster')
    expect(cluster.expansionZoom).toBeGreaterThan(12)
    expect(cluster.expansionZoom).toBeLessThanOrEqual(CLUSTER_MAX_ZOOM + 1)
    const expanded = index.itemsAt(cluster.expansionZoom)
    expect(expanded.length).toBeGreaterThan(2)
  })

  it('draws every report on its own above the clustering zoom, at fractional zooms too', () => {
    const items = index.itemsAt(CLUSTER_MAX_ZOOM + 1.4)
    expect(items.every((item) => item.kind === 'point')).toBe(true)
    expect(items.map((item) => item.id).sort()).toEqual(['d1', 'f1', 'w1', 'w2'])
  })

  it('limits results to the requested bounds', () => {
    const items = index.itemsAt(18, [121.06, 14.73, 121.08, 14.75])
    expect(items.map((item) => item.id)).toEqual(['d1'])
  })

  it('separates fanned-out reports once zoomed in far enough', () => {
    const shared = ['a', 'b', 'c'].map((id) => ({ id, latitude: 14.722, longitude: 121.045 }))
    const positions = spreadCoincident(shared)
    const spread = createClusterIndex(shared.map(({ id }) => {
      const [latitude, longitude] = positions.get(id)!
      return { id, latitude, longitude, category: 'Waste' as const, urgent: false }
    }))
    expect(spread.itemsAt(13).filter((item) => item.kind === 'cluster')).toHaveLength(1)
    expect(spread.itemsAt(CLUSTER_MAX_ZOOM + 1).filter((item) => item.kind === 'point')).toHaveLength(3)
  })

  it('handles an empty report list', () => {
    expect(createClusterIndex([]).itemsAt(12)).toEqual([])
  })
})

describe('clusterRingGradient', () => {
  const colors: Record<Category, string> = { Waste: '#d77a37', Flooding: '#3986a2', Drainage: '#7f8c42' }
  const order: Category[] = ['Waste', 'Flooding', 'Drainage']

  it('draws one arc per category in the given order, sized by share', () => {
    expect(clusterRingGradient([['Flooding', 1], ['Waste', 3]], colors, order))
      .toBe('conic-gradient(#d77a37 0.00% 75.00%, #3986a2 75.00% 100.00%)')
  })

  it('returns undefined when there is nothing to draw', () => {
    expect(clusterRingGradient([], colors, order)).toBeUndefined()
  })
})
