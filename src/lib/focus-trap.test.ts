import { describe, expect, it } from 'vitest'
import { trappedFocusIndex } from './focus-trap'

describe('trappedFocusIndex', () => {
  it('leaves Tab alone in the middle of the dialog', () => {
    expect(trappedFocusIndex(4, 1, false)).toBeUndefined()
    expect(trappedFocusIndex(4, 2, true)).toBeUndefined()
  })

  it('wraps from the last element to the first, and back', () => {
    expect(trappedFocusIndex(4, 3, false)).toBe(0)
    expect(trappedFocusIndex(4, 0, true)).toBe(3)
  })

  it('pulls focus into the dialog when it is on the page behind it', () => {
    expect(trappedFocusIndex(4, -1, false)).toBe(0)
    expect(trappedFocusIndex(4, -1, true)).toBe(3)
  })

  it('keeps focus on a single element', () => {
    expect(trappedFocusIndex(1, 0, false)).toBe(0)
    expect(trappedFocusIndex(1, 0, true)).toBe(0)
  })

  it('has nowhere to send focus in an empty dialog', () => {
    expect(trappedFocusIndex(0, -1, false)).toBeUndefined()
  })
})
