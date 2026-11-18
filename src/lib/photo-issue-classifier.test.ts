import { describe, expect, it } from 'vitest'
import labelData from '../data/photo-issue-labels.json'
import fixtures from './photo-issue-classifier.fixtures.json'
import { issueTypesByCategory, isReportCategory } from './report-categories'
import {
  CONFIDENT_GUESS,
  PHOTO_MODEL,
  centerSquare,
  guessPhotoIssue,
  mayDownloadWithoutAsking,
  pickPhotoGuess,
  toModelInput,
  type PhotoIssueLabel,
} from './photo-issue-classifier'

const labels = labelData.labels as PhotoIssueLabel[]

describe('photo issue labels', () => {
  it('were made with the model revision the form downloads', () => {
    expect(PHOTO_MODEL.url).toContain(`/${labelData.model}/resolve/${labelData.revision}/`)
  })

  it('fill in only issue types the form already offers for that category', () => {
    for (const label of labels) {
      expect(label.vector).toHaveLength(512)
      if (label.category === null) {
        expect(label.issueType).toBeUndefined()
        continue
      }
      expect(isReportCategory(label.category)).toBe(true)
      expect(issueTypesByCategory[label.category]).toContain(label.issueType)
    }
  })

  it('cover every intake category and some photos with no issue', () => {
    const categories = new Set(labels.map((label) => label.category))
    for (const category of Object.keys(issueTypesByCategory)) expect(categories).toContain(category)
    expect(categories).toContain(null)
  })
})

// Embeddings of real photos (Wikimedia Commons), made with the same 4-bit model the form uses.
describe('guessPhotoIssue', () => {
  it.each([
    ['dumpedTrash', 'Waste', 'Illegal dumping'],
    ['floodedStreet', 'Flooding', 'Flooded road'],
    ['smokestack', 'Pollution', 'Air pollution'],
    ['trashInDitch', 'Drainage', 'Blocked canal'],
  ] as const)('reads a %s photo as %s', (photo, category, issueType) => {
    const guess = guessPhotoIssue(fixtures[photo], labels)
    expect(guess.category).toBe(category)
    expect(guess.issueType).toBe(issueType)
    expect(guess.confidence).toBeGreaterThan(0.8)
  })

  it.each(['cat', 'cleanStreet'] as const)('suggests nothing for a %s photo', (photo) => {
    const guess = guessPhotoIssue(fixtures[photo], labels)
    expect(guess.category).toBeUndefined()
    expect(guess.confidence).toBeLessThan(0.2)
  })

  it('does not depend on the embedding being unit length', () => {
    const scaled = guessPhotoIssue(fixtures.floodedStreet.map((value) => value * 7), labels)
    const original = guessPhotoIssue(fixtures.floodedStreet, labels)
    expect(scaled.category).toBe(original.category)
    expect(scaled.issueType).toBe(original.issueType)
    expect(scaled.confidence).toBeCloseTo(original.confidence, 10)
  })

  it('leaves the issue type out when no single type leads its category', () => {
    const toy: PhotoIssueLabel[] = [
      { category: 'Waste', issueType: 'Illegal dumping', vector: [1, 0, 0] },
      { category: 'Waste', issueType: 'Plastic waste', vector: [1, 0, 0] },
      { category: 'Waste', issueType: 'Overflowing trash bins', vector: [1, 0, 0] },
      { category: null, vector: [0, 1, 0] },
    ]
    const guess = guessPhotoIssue([1, 0, 0], toy)
    expect(guess.category).toBe('Waste')
    expect(guess.issueType).toBeUndefined()
  })

  it('suggests nothing when the photo matches "no issue" more than any category', () => {
    const toy: PhotoIssueLabel[] = [
      { category: 'Flooding', issueType: 'Flooded road', vector: [1, 0] },
      { category: null, vector: [0, 1] },
    ]
    expect(guessPhotoIssue([0.4, 0.6], toy).category).toBeUndefined()
    expect(guessPhotoIssue([0.6, 0.4], toy).category).toBe('Flooding')
  })

  it('handles empty input', () => {
    expect(guessPhotoIssue([], labels)).toEqual({ confidence: 0 })
    expect(guessPhotoIssue(fixtures.cat, [])).toEqual({ confidence: 0 })
  })
})

describe('pickPhotoGuess', () => {
  it('takes the most confident photo that names a category', () => {
    expect(pickPhotoGuess([
      { confidence: 0.9 },
      { category: 'Waste', issueType: 'Plastic waste', confidence: 0.6 },
      { category: 'Drainage', confidence: 0.7 },
    ])).toEqual({ category: 'Drainage', confidence: 0.7 })
  })

  it('returns nothing when no photo shows an issue', () => {
    expect(pickPhotoGuess([{ confidence: 0.3 }])).toBeUndefined()
    expect(pickPhotoGuess([])).toBeUndefined()
  })

  it('treats a confident guess as final', () => {
    expect(CONFIDENT_GUESS).toBeGreaterThan(0.5)
  })
})

describe('centerSquare', () => {
  it('cuts the middle of a landscape or portrait photo', () => {
    expect(centerSquare(1600, 900)).toEqual({ x: 350, y: 0, size: 900 })
    expect(centerSquare(900, 1600)).toEqual({ x: 0, y: 350, size: 900 })
    expect(centerSquare(500, 500)).toEqual({ x: 0, y: 0, size: 500 })
  })
})

describe('toModelInput', () => {
  it('writes red, green and blue as separate normalized planes', () => {
    // A 2 × 2 image: white, black, pure red, mid grey.
    const rgba = [255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 128, 128, 128, 255]
    const input = toModelInput(rgba, 2)
    expect(input).toHaveLength(12)
    const value = (channel: number, level: number) => (level / 255 - PHOTO_MODEL.mean[channel]) / PHOTO_MODEL.std[channel]
    expect(input[0]).toBeCloseTo(value(0, 255), 5)
    expect(input[1]).toBeCloseTo(value(0, 0), 5)
    expect(input[2]).toBeCloseTo(value(0, 255), 5)
    expect(input[4 + 2]).toBeCloseTo(value(1, 0), 5)
    expect(input[8 + 3]).toBeCloseTo(value(2, 128), 5)
  })

  it('rejects too few pixels', () => {
    expect(() => toModelInput([0, 0, 0, 255], 2)).toThrow()
  })
})

describe('mayDownloadWithoutAsking', () => {
  it('downloads straight away on Wi-Fi, a cable, or a computer', () => {
    expect(mayDownloadWithoutAsking({ type: 'wifi', touchDevice: true })).toBe(true)
    expect(mayDownloadWithoutAsking({ type: 'ethernet', touchDevice: false })).toBe(true)
    expect(mayDownloadWithoutAsking({ touchDevice: false })).toBe(true)
  })

  it('asks first on mobile data, with the data saver on, or on a phone that does not say', () => {
    expect(mayDownloadWithoutAsking({ type: 'cellular', touchDevice: false })).toBe(false)
    expect(mayDownloadWithoutAsking({ type: 'wifi', saveData: true, touchDevice: false })).toBe(false)
    expect(mayDownloadWithoutAsking({ touchDevice: true })).toBe(false)
  })
})
