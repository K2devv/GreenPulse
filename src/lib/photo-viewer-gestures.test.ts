import { describe, expect, it } from 'vitest'
import { DISMISS_DISTANCE, SPLIT_MAX, SPLIT_MIN, clampSplit, dismissProgress, dragAxis, shouldDismiss, splitAfterKey, splitAt } from './photo-viewer-gestures'

describe('dragAxis', () => {
  it('waits until the drag is long enough to tell', () => {
    expect(dragAxis(3, 4)).toBeUndefined()
  })

  it('locks to the direction that moved most', () => {
    expect(dragAxis(30, 8)).toBe('x')
    expect(dragAxis(-30, 8)).toBe('x')
    expect(dragAxis(6, 40)).toBe('y')
    expect(dragAxis(6, -40)).toBe('y')
  })
})

describe('swipe down to close', () => {
  it('fades the viewer as the photo is pulled down', () => {
    expect(dismissProgress(-50)).toBe(0)
    expect(dismissProgress(0)).toBe(0)
    expect(dismissProgress(160)).toBeCloseTo(0.5)
    expect(dismissProgress(900)).toBe(1)
  })

  it('closes after a long enough pull', () => {
    expect(shouldDismiss(DISMISS_DISTANCE, 0)).toBe(true)
    expect(shouldDismiss(DISMISS_DISTANCE - 1, 0.1)).toBe(false)
  })

  it('closes on a quick flick, but not on a nudge', () => {
    expect(shouldDismiss(40, 0.9)).toBe(true)
    expect(shouldDismiss(12, 2)).toBe(false)
  })

  it('never closes on a pull upward', () => {
    expect(shouldDismiss(-200, 3)).toBe(false)
  })
})

describe('slider divider', () => {
  it('follows the pointer across the frame', () => {
    expect(splitAt(150, { left: 100, width: 200 })).toBe(25)
    expect(splitAt(300, { left: 100, width: 200 })).toBe(SPLIT_MAX)
    expect(splitAt(20, { left: 100, width: 200 })).toBe(SPLIT_MIN)
    expect(splitAt(150, { left: 100, width: 0 })).toBe(50)
  })

  it('keeps a sliver of both photos', () => {
    expect(clampSplit(-10)).toBe(SPLIT_MIN)
    expect(clampSplit(140)).toBe(SPLIT_MAX)
    expect(clampSplit(40)).toBe(40)
  })

  it('moves with the arrow keys, further with Shift, and to the edges with Home and End', () => {
    expect(splitAfterKey(50, 'ArrowRight', false)).toBe(55)
    expect(splitAfterKey(50, 'ArrowLeft', false)).toBe(45)
    expect(splitAfterKey(50, 'ArrowUp', true)).toBe(75)
    expect(splitAfterKey(50, 'ArrowDown', true)).toBe(25)
    expect(splitAfterKey(96, 'ArrowRight', false)).toBe(SPLIT_MAX)
    expect(splitAfterKey(50, 'Home', false)).toBe(SPLIT_MIN)
    expect(splitAfterKey(50, 'End', false)).toBe(SPLIT_MAX)
    expect(splitAfterKey(50, 'Enter', false)).toBeUndefined()
  })
})
