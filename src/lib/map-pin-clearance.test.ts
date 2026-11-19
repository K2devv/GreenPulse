import { describe, expect, it } from 'vitest'
import { SELECTED_PIN_BOX, clusterBubbleSize, clusterClearance } from './map-pin-clearance'

describe('clusterBubbleSize', () => {
  it('grows with the number of grouped reports', () => {
    expect(clusterBubbleSize(2)).toBe(42)
    expect(clusterBubbleSize(10)).toBe(48)
    expect(clusterBubbleSize(50)).toBe(56)
  })
})

describe('clusterClearance', () => {
  const size = 42
  const clear = SELECTED_PIN_BOX.halfWidth + size / 2 + 6

  it('leaves a bubble alone when it is clear of the pin', () => {
    expect(clusterClearance(80, -30, size)).toEqual([0, 0])
    expect(clusterClearance(0, 60, size)).toEqual([0, 0])
    expect(clusterClearance(0, -120, size)).toEqual([0, 0])
  })

  it('moves a bubble under the pin to the side it was already on', () => {
    expect(clusterClearance(10, 0, size)).toEqual([clear - 10, 0])
    expect(clusterClearance(-10, -30, size)).toEqual([-clear + 10, 0])
  })

  it('moves a bubble centred exactly on the tip to the right', () => {
    expect(clusterClearance(0, 0, size)).toEqual([clear, 0])
  })

  it('leaves the bubble fully beside the pin', () => {
    const [shiftX] = clusterClearance(4, -20, size)
    expect(Math.abs(4 + shiftX)).toBeGreaterThanOrEqual(SELECTED_PIN_BOX.halfWidth + size / 2)
  })
})
