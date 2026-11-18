import { describe, expect, it } from 'vitest'
import { CONFIDENT_GUESS } from './photo-issue-classifier'
import { MIN_SCAN_MS, SCAN_AGREEING_FRAMES, SCAN_HINT_AFTER, remainingScanTime, scanFrame, scanNeedsHint, startScan, type ScanProgress } from './photo-scan'

describe('scanFrame', () => {
  it('stops at once on a confident frame', () => {
    const guess = { category: 'Flooding' as const, issueType: 'Flooded road', confidence: CONFIDENT_GUESS }
    expect(scanFrame(startScan(), guess).found).toEqual(guess)
  })

  it('waits for a second frame to agree on a less certain guess', () => {
    const unsure = { category: 'Waste' as const, confidence: 0.6 }
    const first = scanFrame(startScan(), unsure)
    expect(first.found).toBeUndefined()
    expect(first.progress).toEqual({ category: 'Waste', streak: 1, checked: 1 })
    const second = scanFrame(first.progress, { ...unsure, issueType: 'Plastic waste' })
    expect(SCAN_AGREEING_FRAMES).toBe(2)
    expect(second.found).toEqual({ category: 'Waste', issueType: 'Plastic waste', confidence: 0.6 })
  })

  it('starts over when the category changes or a frame shows no issue', () => {
    let progress = scanFrame(startScan(), { category: 'Waste', confidence: 0.6 }).progress
    const switched = scanFrame(progress, { category: 'Drainage', confidence: 0.6 })
    expect(switched.found).toBeUndefined()
    expect(switched.progress.streak).toBe(1)
    progress = scanFrame(switched.progress, { confidence: 0.1 }).progress
    expect(progress).toEqual({ streak: 0, checked: 3 })
    expect(scanFrame(progress, { category: 'Drainage', confidence: 0.6 }).found).toBeUndefined()
  })
})

describe('remainingScanTime', () => {
  it('keeps a quick answer on screen for at least one and a half seconds', () => {
    expect(MIN_SCAN_MS).toBeGreaterThanOrEqual(1500)
    expect(remainingScanTime(1_000, 1_000)).toBe(MIN_SCAN_MS)
    expect(remainingScanTime(1_000, 1_600)).toBe(MIN_SCAN_MS - 600)
  })

  it('adds no wait once the scan has run long enough', () => {
    expect(remainingScanTime(0, MIN_SCAN_MS)).toBe(0)
    expect(remainingScanTime(0, MIN_SCAN_MS + 5_000)).toBe(0)
  })
})

describe('scanNeedsHint', () => {
  it('suggests moving closer after several frames without an issue', () => {
    let progress: ScanProgress = startScan()
    for (let frame = 1; frame < SCAN_HINT_AFTER; frame += 1) progress = scanFrame(progress, { confidence: 0.1 }).progress
    expect(scanNeedsHint(progress)).toBe(false)
    expect(scanNeedsHint(scanFrame(progress, { confidence: 0.1 }).progress)).toBe(true)
  })
})
