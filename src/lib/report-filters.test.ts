import { describe, expect, it } from 'vitest'
import { countActiveFilters, detectBarangay, defaultReportFilters, filterReports, formatReportId, NO_BARANGAY, UNASSIGNED, type FilterableReport, type ReportFilters } from './report-filters'

const lookup = {
  people: new Map([['u1', 'Ramon Cruz']]),
  teams: new Map([['t1', 'Drainage Crew']]),
}

function report(overrides: Partial<FilterableReport> = {}): FilterableReport {
  return {
    id: 'a1b21904-3b93-44eb-980d-67f0489ca327',
    title: 'Clogged drain',
    description: 'Water pools after rain',
    category: 'Drainage',
    status: 'Submitted',
    urgency: 'Medium',
    location: 'Commonwealth Ave',
    createdAt: new Date(2026, 9, 6, 9).toISOString(),
    ...overrides,
  }
}

const run = (reports: FilterableReport[], filters: Partial<ReportFilters>) => filterReports(reports, { ...defaultReportFilters, ...filters }, lookup)

describe('filterReports', () => {
  it('hides closed reports by default and shows everything with the all status', () => {
    const reports = [report(), report({ id: 'b', status: 'Resolved' }), report({ id: 'c', status: 'Rejected' })]
    expect(run(reports, {})).toHaveLength(1)
    expect(run(reports, { status: 'all' })).toHaveLength(3)
    expect(run(reports, { status: 'Resolved' }).map((item) => item.id)).toEqual(['b'])
  })

  it('searches id, title, description, reporter, location, barangay, category, and assignees', () => {
    const reports = [report({ reporterName: 'Maria Santos', barangay: 'Bagbag', assignedTo: 'u1', assignedTeamId: 't1' })]
    for (const query of ['a1b21904', '#A1B21904', 'clogged', 'pools', 'maria', 'commonwealth', 'bagbag', 'drainage', 'ramon', 'crew']) {
      expect(run(reports, { query, status: 'all' }), query).toHaveLength(1)
    }
    expect(run(reports, { query: 'maria flooding', status: 'all' })).toHaveLength(0)
  })

  it('filters by category, urgency, and barangay', () => {
    const reports = [report({ barangay: 'Capri' }), report({ id: 'b', category: 'Waste', urgency: 'High' }), report({ id: 'c', barangay: 'Bagbag' })]
    expect(run(reports, { category: 'Waste' }).map((item) => item.id)).toEqual(['b'])
    expect(run(reports, { urgency: 'High' }).map((item) => item.id)).toEqual(['b'])
    expect(run(reports, { barangay: 'Bagbag' }).map((item) => item.id)).toEqual(['c'])
    expect(run(reports, { barangay: NO_BARANGAY }).map((item) => item.id)).toEqual(['b'])
  })

  it('filters by assigned personnel and team, including unassigned', () => {
    const reports = [report({ assignedTo: 'u1', assignedTeamId: 't1' }), report({ id: 'b' })]
    expect(run(reports, { assignee: 'u1' }).map((item) => item.id)).toEqual([reports[0].id])
    expect(run(reports, { assignee: UNASSIGNED }).map((item) => item.id)).toEqual(['b'])
    expect(run(reports, { team: 't1' }).map((item) => item.id)).toEqual([reports[0].id])
    expect(run(reports, { team: UNASSIGNED }).map((item) => item.id)).toEqual(['b'])
  })

  it('filters by resolution stage', () => {
    const reports = [report(), report({ id: 'b', status: 'Awaiting verification' }), report({ id: 'c', status: 'Resolved' }), report({ id: 'd', status: 'Closed' }), report({ id: 'e', status: 'Rejected' })]
    const ids = (resolution: string) => run(reports, { status: 'all', resolution }).map((item) => item.id)
    expect(ids('unresolved')).toEqual([reports[0].id])
    expect(ids('awaiting')).toEqual(['b'])
    expect(ids('resolved')).toEqual(['c'])
    expect(ids('closed')).toEqual(['d'])
  })

  it('filters by an inclusive local date range', () => {
    const reports = [
      report({ id: 'a', createdAt: new Date(2026, 9, 1, 0, 0).toISOString() }),
      report({ id: 'b', createdAt: new Date(2026, 9, 5, 23, 30).toISOString() }),
      report({ id: 'c', createdAt: new Date(2026, 9, 9, 8).toISOString() }),
    ]
    expect(run(reports, { dateFrom: '2026-10-02', dateTo: '2026-10-05' }).map((item) => item.id)).toEqual(['b'])
    expect(run(reports, { dateFrom: '2026-10-05' }).map((item) => item.id)).toEqual(['b', 'c'])
    expect(run(reports, { dateTo: '2026-10-01' }).map((item) => item.id)).toEqual(['a'])
  })
})

describe('helpers', () => {
  it('counts only filters that differ from the defaults', () => {
    expect(countActiveFilters(defaultReportFilters)).toBe(0)
    expect(countActiveFilters({ ...defaultReportFilters, query: ' ', status: 'all', urgency: 'High', dateFrom: '2026-10-01' })).toBe(3)
  })

  it('formats UUIDs as short ids and keeps demo ids readable', () => {
    expect(formatReportId('a1b21904-3b93-44eb-980d-67f0489ca327')).toBe('#A1B21904')
    expect(formatReportId('GP-1048')).toBe('#1048')
  })

  it('detects the most specific barangay mentioned in a place label', () => {
    expect(detectBarangay('Gulod Elementary School, North Fairview, Quezon City')).toBe('North Fairview')
    expect(detectBarangay('Commonwealth Ave, Quezon City')).toBeUndefined()
  })
})
