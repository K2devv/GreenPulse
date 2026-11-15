import { describe, expect, it } from 'vitest'
import { defaultReportFilters } from './report-filters'
import { ALL_STATUSES, FOLLOWED_UP, OPEN_REPORTS, communityStatusFilter, matchesHeroTile, matchesStatusFilter, staffQuickFilter, type HeroTile } from './report-quick-filters'

describe('matchesStatusFilter', () => {
  it('lets every status through when nothing is filtered', () => {
    expect(matchesStatusFilter('Rejected', ALL_STATUSES)).toBe(true)
  })

  it('treats open reports as everything not resolved, rejected, closed or duplicate', () => {
    expect(['Submitted', 'Under review', 'Verified', 'In progress', 'Awaiting verification'].every((status) => matchesStatusFilter(status, OPEN_REPORTS))).toBe(true)
    expect(['Resolved', 'Rejected', 'Closed', 'Duplicate'].some((status) => matchesStatusFilter(status, OPEN_REPORTS))).toBe(false)
  })

  it('counts verified and in-progress reports as followed up', () => {
    expect(matchesStatusFilter('Verified', FOLLOWED_UP)).toBe(true)
    expect(matchesStatusFilter('In progress', FOLLOWED_UP)).toBe(true)
    expect(matchesStatusFilter('Submitted', FOLLOWED_UP)).toBe(false)
    expect(matchesStatusFilter('Resolved', FOLLOWED_UP)).toBe(false)
  })

  it('matches a single status exactly', () => {
    expect(matchesStatusFilter('Resolved', 'Resolved')).toBe(true)
    expect(matchesStatusFilter('Verified', 'Resolved')).toBe(false)
  })
})

describe('staff quick filters', () => {
  it('resets the other filters so the queue shows what the tile counts', () => {
    expect(staffQuickFilter('urgent')).toEqual({ ...defaultReportFilters, urgency: 'High' })
    expect(staffQuickFilter('resolved')).toEqual({ ...defaultReportFilters, status: 'Resolved' })
    expect(staffQuickFilter('open')).toEqual(defaultReportFilters)
  })
})

describe('hero tiles', () => {
  const reports = [
    { status: 'Submitted', urgency: 'High' },
    { status: 'Verified', urgency: 'Low' },
    { status: 'In progress', urgency: 'High' },
    { status: 'Resolved', urgency: 'High' },
    { status: 'Rejected', urgency: 'Medium' },
  ]
  const count = (tile: HeroTile) => reports.filter((report) => matchesHeroTile(report, tile)).length

  it('counts the reports each tile stands for', () => {
    expect(count('open')).toBe(3)
    expect(count('followed-up')).toBe(2)
    expect(count('all')).toBe(5)
    expect(count('in-progress')).toBe(1)
    expect(count('resolved')).toBe(1)
  })

  it('counts a high-urgency report as urgent only while it is open', () => {
    expect(count('urgent')).toBe(2)
    expect(matchesHeroTile({ status: 'Resolved', urgency: 'High' }, 'urgent')).toBe(false)
  })

  it('maps each community tile to the list filter that shows the same reports', () => {
    for (const tile of ['open', 'followed-up', 'all'] as const) {
      const filter = communityStatusFilter(tile)
      expect(reports.filter((report) => matchesStatusFilter(report.status, filter)).length).toBe(count(tile))
    }
  })
})
