import { describe, expect, it } from 'vitest'
import { distanceInMeters, reachedSameAreaLimit, sameAreaReportCount, type AreaLimitReport } from './report-area-limit'

const now = new Date('2026-11-23T08:00:00Z')
const spot: [number, number] = [14.7005, 121.0451]
// About 22 m north of the spot, and about 110 m north.
const nearby: [number, number] = [14.7007, 121.0451]
const farther: [number, number] = [14.7015, 121.0451]

function report(overrides: Partial<AreaLimitReport> = {}): AreaLimitReport {
  return { coordinates: spot, createdAt: '2026-11-20T08:00:00Z', status: 'Submitted', ...overrides }
}

describe('same-area report limit', () => {
  it('measures distance in meters', () => {
    expect(distanceInMeters(spot, nearby)).toBeGreaterThan(20)
    expect(distanceInMeters(spot, nearby)).toBeLessThan(25)
    expect(distanceInMeters(spot, spot)).toBe(0)
  })

  it('lets a signed-in reporter add a third report at a spot and refuses a fourth', () => {
    expect(reachedSameAreaLimit([report(), report()], spot, { now })).toBe(false)
    expect(reachedSameAreaLimit([report(), report({ coordinates: nearby }), report()], spot, { now })).toBe(true)
  })

  it('lets a guest add a second report at a spot and refuses a third', () => {
    expect(reachedSameAreaLimit([report()], spot, { guest: true, now })).toBe(false)
    expect(reachedSameAreaLimit([report(), report({ coordinates: nearby })], spot, { guest: true, now })).toBe(true)
  })

  it('counts only reports within 50 meters', () => {
    expect(sameAreaReportCount([report(), report({ coordinates: nearby }), report({ coordinates: farther })], spot, now)).toBe(2)
  })

  it('stops counting reports once they are resolved or closed', () => {
    const reports = [report({ status: 'Resolved' }), report({ status: 'Closed' }), report({ status: 'In progress' }), report({ status: 'Rejected' })]
    expect(sameAreaReportCount(reports, spot, now)).toBe(2)
  })

  it('stops counting reports older than 30 days', () => {
    expect(sameAreaReportCount([report({ createdAt: '2026-10-20T08:00:00Z' }), report({ createdAt: '2026-10-30T08:00:00Z' })], spot, now)).toBe(1)
  })
})
