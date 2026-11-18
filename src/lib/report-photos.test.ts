import { describe, expect, it } from 'vitest'
import { MAX_REPORT_PHOTOS, reportPhotoProblem } from './report-photos'

const jpeg = (size = 1_000) => ({ type: 'image/jpeg', size })

describe('reportPhotoProblem', () => {
  it('accepts JPEG, PNG and WebP photos within the limits', () => {
    expect(reportPhotoProblem([jpeg(), { type: 'image/png', size: 10 }, { type: 'image/webp', size: 10 }], 0, false)).toBeUndefined()
  })

  it('counts the photos already attached', () => {
    expect(reportPhotoProblem([jpeg()], MAX_REPORT_PHOTOS - 1, false)).toBeUndefined()
    expect(reportPhotoProblem([jpeg()], MAX_REPORT_PHOTOS, false)).toBe(`Attach up to ${MAX_REPORT_PHOTOS} report photos.`)
  })

  it('refuses other file types', () => {
    expect(reportPhotoProblem([{ type: 'image/gif', size: 10 }], 0, false)).toMatch(/JPEG, PNG, or WebP/)
  })

  it('allows guests smaller photos than signed-in reporters', () => {
    expect(reportPhotoProblem([jpeg(3_000_000)], 0, false)).toBeUndefined()
    expect(reportPhotoProblem([jpeg(3_000_000)], 0, true)).toBe('Guest report photos must be 2.5 MB or smaller each.')
    expect(reportPhotoProblem([jpeg(6_000_000)], 0, false)).toBe('Each report photo must be 5 MB or smaller.')
  })
})
