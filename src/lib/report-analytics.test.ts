import { describe, expect, it } from 'vitest'
import { buildReportAnalytics, type AnalyticsReport } from './report-analytics'

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
})
