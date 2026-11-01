import { describe, expect, it } from 'vitest'
import { buildReportAnalytics, DAILY_HISTORY_DAYS, type AnalyticsReport } from './report-analytics'

const now = new Date(2026, 9, 7, 12)

function report(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    category: 'Waste',
    status: 'Submitted',
    urgency: 'Medium',
    location: 'Main road',
    createdAt: new Date(2026, 9, 6, 9).toISOString(),
    ...overrides,
  }
}

describe('buildReportAnalytics', () => {
  it('counts workflow states, assignments, urgency, and date periods', () => {
    const reports = [
      report(),
      report({ status: 'Verified', assignedTo: 'responder-1', urgency: 'High' }),
      report({ status: 'Resolved', assignedTo: 'responder-2', resolvedAt: new Date(2026, 9, 6, 11).toISOString() }),
      report({ status: 'Rejected', createdAt: new Date(2026, 8, 20).toISOString() }),
      report({ status: 'Closed', createdAt: 'not a date' }),
    ]

    const analytics = buildReportAnalytics(reports, now)

    expect(analytics).toMatchObject({
      total: 5,
      pending: 1,
      verified: 1,
      assigned: 2,
      inProgress: 0,
      resolved: 1,
      closed: 1,
      rejected: 1,
      critical: 1,
      thisWeek: 3,
      thisMonth: 3,
      resolutionRate: 20,
    })
    expect(analytics.averageResolutionMs).toBe(2 * 60 * 60 * 1000)
  })

  it('groups chart data and limits locations to the five most common plus other', () => {
    const reports = [
      report({ category: 'Waste', location: 'First street' }),
      report({ category: 'Flooding', location: 'First street' }),
      ...['Second', 'Third', 'Fourth', 'Fifth', 'Sixth'].map((location) => report({ location })),
    ]

    const analytics = buildReportAnalytics(reports, now)

    expect(analytics.byCategory.find(({ label }) => label === 'Flooding')?.value).toBe(1)
    expect(analytics.byUrgency.find(({ label }) => label === 'Medium')?.value).toBe(7)
    expect(analytics.byLocation).toEqual([
      { label: 'First street', value: 2 },
      { label: 'Second', value: 1 },
      { label: 'Third', value: 1 },
      { label: 'Fourth', value: 1 },
      { label: 'Fifth', value: 1 },
      { label: 'Other locations', value: 1 },
    ])
  })

  it('returns zero-safe metrics and omits average time without valid resolution dates', () => {
    const analytics = buildReportAnalytics([], now)

    expect(analytics.total).toBe(0)
    expect(analytics.resolutionRate).toBe(0)
    expect(analytics.averageResolutionMs).toBeUndefined()
    expect(analytics.overTime).toHaveLength(14)
    expect(analytics.overTime.every(({ value }) => value === 0)).toBe(true)
  })

  it('builds the 14 days before the current window for comparison', () => {
    const analytics = buildReportAnalytics([
      report({ createdAt: new Date(2026, 9, 6, 9).toISOString() }),
      report({ createdAt: new Date(2026, 8, 20, 9).toISOString() }),
      report({ createdAt: new Date(2026, 8, 20, 15).toISOString() }),
    ], now)

    expect(analytics.previousOverTime).toHaveLength(14)
    expect(analytics.overTime.reduce((sum, day) => sum + day.value, 0)).toBe(1)
    expect(analytics.previousOverTime.reduce((sum, day) => sum + day.value, 0)).toBe(2)
    expect(analytics.previousOverTime[13]?.date).toBe('2026-09-23')
  })

  it('exposes a long daily history that ends with the current window', () => {
    const analytics = buildReportAnalytics([
      report({ createdAt: new Date(2026, 9, 6, 9).toISOString() }),
      report({ createdAt: new Date(2026, 6, 1, 9).toISOString() }),
    ], now)

    expect(analytics.daily).toHaveLength(DAILY_HISTORY_DAYS)
    expect(analytics.daily.slice(-14)).toEqual(analytics.overTime)
    expect(analytics.daily.reduce((sum, day) => sum + day.value, 0)).toBe(2)
  })
})
