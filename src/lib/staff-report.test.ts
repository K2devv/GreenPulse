import { describe, expect, it } from 'vitest'
import { toReport, type ReportRow } from './supabase'
import { isFullReportRow, isViewerOnTask, mergeSavedReport, resolveStaffReport } from './staff-report'

const ID = '7d3c2f2e-1a2b-4c5d-8e9f-001122334455'
const RESPONDER = 'responder-1'
const TEAM = 'team-1'

// A full `reports` row, as `select('*')` and `staff_report_page` return it.
const fullRow: ReportRow = {
  id: ID,
  title: 'Clogged drain',
  category: 'Drainage',
  status: 'In progress',
  urgency: 'High',
  description: 'Water backs up after rain.',
  location_label: '12 Exact Street, Barangay Bagbag',
  latitude: 14.695123,
  longitude: 121.031987,
  created_at: '2026-11-10T08:00:00Z',
  barangay: 'Bagbag',
  reporter_id: 'resident-1',
  assigned_to: RESPONDER,
  assigned_team_id: TEAM,
  task_instructions: 'Clear the inlet.',
}

// The same report from the public `community_reports` view (production columns only).
const communityRow = {
  id: ID,
  title: 'Clogged drain',
  category: 'Drainage',
  issue_type: 'Drainage',
  status: 'In progress',
  urgency: 'High',
  description: 'Water backs up after rain.',
  location_label: 'Barangay Bagbag',
  latitude: 14.695,
  longitude: 121.032,
  observed_at: '2026-11-10T08:00:00Z',
  created_at: '2026-11-10T08:00:00Z',
  updated_at: '2026-11-10T09:00:00Z',
  barangay: 'Bagbag',
  reporter_display_name: 'Ana Cruz',
} as ReportRow

const full = toReport(fullRow)
const community = toReport(communityRow)
const unassignedFull = toReport({ ...fullRow, assigned_to: null, assigned_team_id: null })

describe('isFullReportRow', () => {
  it('tells full rows from community rows', () => {
    expect(isFullReportRow(full)).toBe(true)
    expect(isFullReportRow(toReport({ ...fullRow, reporter_id: null }))).toBe(true)
    expect(isFullReportRow(community)).toBe(false)
  })
})

describe('resolveStaffReport', () => {
  it('keeps the assignment when the map list only has the community copy', () => {
    // The old derivation, reports.find() ?? staffQueue.find(), returned the community copy here.
    const resolved = resolveStaffReport({ id: ID, detail: undefined, queue: [full], reports: [community] })
    expect(resolved?.assignedTo).toBe(RESPONDER)
    expect(resolved?.assignedTeamId).toBe(TEAM)
    expect(resolveStaffReport({ id: ID, detail: full, queue: [], reports: [community] })?.assignedTo).toBe(RESPONDER)
  })

  it('still resolves to the assigned row after a Realtime refresh replaces the map list', () => {
    // applyReportUpdate writes the saved row into every list...
    let reports = [{ ...unassignedFull, ...full }]
    let queue = [{ ...unassignedFull, ...full }]
    let detail = mergeSavedReport(unassignedFull, full)
    expect(resolveStaffReport({ id: ID, detail, queue, reports })?.assignedTo).toBe(RESPONDER)
    // ...then the Realtime event reloads `reports` from community_reports.
    reports = [community]
    expect(resolveStaffReport({ id: ID, detail, queue, reports })?.assignedTo).toBe(RESPONDER)
    // ...and the queue and detail are refetched too.
    queue = [full]
    detail = full
    const resolved = resolveStaffReport({ id: ID, detail, queue, reports })
    expect(resolved?.assignedTo).toBe(RESPONDER)
    expect(resolved?.assignedTeamId).toBe(TEAM)
  })

  it('resolves from detail when a filtered queue no longer holds the report', () => {
    // For example "Assigned to: Unassigned" drops the report right after it is assigned.
    expect(resolveStaffReport({ id: ID, detail: full, queue: [], reports: [community] })).toBe(full)
  })

  it('prefers detail over queue over a full map-list row', () => {
    const fromDetail = { ...full, title: 'detail' }
    const fromQueue = { ...full, title: 'queue' }
    const fromReports = { ...full, title: 'reports' }
    expect(resolveStaffReport({ id: ID, detail: fromDetail, queue: [fromQueue], reports: [fromReports] })?.title).toBe('detail')
    expect(resolveStaffReport({ id: ID, detail: undefined, queue: [fromQueue], reports: [fromReports] })?.title).toBe('queue')
    expect(resolveStaffReport({ id: ID, detail: undefined, queue: [], reports: [fromReports] })?.title).toBe('reports')
  })

  it('ignores a detail copy for another report', () => {
    const other = { ...full, id: 'other' }
    expect(resolveStaffReport({ id: ID, detail: other, queue: [], reports: [community] })).toBeUndefined()
  })

  it('never returns the community copy, so the panel waits for the full row', () => {
    expect(resolveStaffReport({ id: ID, detail: undefined, queue: [], reports: [community] })).toBeUndefined()
    expect(resolveStaffReport({ id: ID, detail: community, queue: [community], reports: [community] })).toBeUndefined()
    expect(resolveStaffReport({ id: undefined, detail: full, queue: [full], reports: [full] })).toBeUndefined()
  })

  it('carries the private place label and precise coordinates', () => {
    const resolved = resolveStaffReport({ id: ID, detail: undefined, queue: [full], reports: [community] })
    expect(resolved?.location).toBe('12 Exact Street, Barangay Bagbag')
    expect(resolved?.coordinates).toEqual([14.695123, 121.031987])
  })
})

describe('isViewerOnTask', () => {
  const teams = [{ id: TEAM, memberIds: ['member-1'] }]

  it('is true for the assigned responder and team members of the resolved report', () => {
    const resolved = resolveStaffReport({ id: ID, detail: undefined, queue: [full], reports: [community] })
    expect(isViewerOnTask(resolved, RESPONDER, teams)).toBe(true)
    expect(isViewerOnTask(resolved, 'member-1', teams)).toBe(true)
    expect(isViewerOnTask(resolved, 'someone-else', teams)).toBe(false)
  })

  it('is false on the community copy, which is why it must not be used', () => {
    expect(isViewerOnTask(community, RESPONDER, teams)).toBe(false)
  })

  it('is false without a report or a viewer', () => {
    expect(isViewerOnTask(undefined, RESPONDER, teams)).toBe(false)
    expect(isViewerOnTask(full, undefined, teams)).toBe(false)
  })
})

describe('mergeSavedReport', () => {
  it('keeps the reporter name and takes cleared fields from the saved row', () => {
    const named = { ...full, reporterName: 'Ana Cruz' }
    const unassigned = toReport({ ...fullRow, assigned_to: null, assigned_team_id: null })
    const merged = mergeSavedReport(named, unassigned)
    expect(merged.reporterName).toBe('Ana Cruz')
    expect(merged.assignedTo).toBeUndefined()
    expect(merged.assignedTeamId).toBeUndefined()
  })

  it('returns the saved row when the previous copy is for another report', () => {
    expect(mergeSavedReport({ ...full, id: 'other', reporterName: 'X' }, full)).toBe(full)
  })
})
