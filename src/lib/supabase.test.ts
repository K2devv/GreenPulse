import { describe, expect, it } from 'vitest'
import { attachReporterNames, reporterIdsOf, toReport, type ReportRow } from './supabase'

describe('toReport', () => {
  it('maps database columns to the community report shape', () => {
    const row: ReportRow = {
      id: 'report-123',
      title: 'Blocked drainage',
      category: 'Drainage',
      issue_type: 'Clogged drainage',
      status: 'In progress',
      urgency: 'High',
      description: 'Water is collecting beside a blocked drain.',
      location_label: 'Near the community hall',
      latitude: 14.7222,
      longitude: 121.0545,
      created_at: '2026-09-30T08:00:00.000Z',
      observed_at: '2026-09-30T07:30:00.000Z',
      additional_info: 'Water is spreading toward the sidewalk.',
      photo_path: 'resident-1/photo.webp',
      photo_paths: ['resident-1/photo.webp', 'resident-1/second-photo.png'],
      assigned_to: 'responder-1',
      resolution_note: null,
      reporter_id: 'resident-1',
    }

    expect(toReport(row)).toEqual({
      id: 'report-123',
      title: 'Blocked drainage',
      category: 'Drainage',
      issueType: 'Clogged drainage',
      status: 'In progress',
      urgency: 'High',
      description: 'Water is collecting beside a blocked drain.',
      location: 'Near the community hall',
      coordinates: [14.7222, 121.0545],
      createdAt: '2026-09-30T08:00:00.000Z',
      observedAt: '2026-09-30T07:30:00.000Z',
      additionalInfo: 'Water is spreading toward the sidewalk.',
      photoPath: 'resident-1/photo.webp',
      photoPaths: ['resident-1/photo.webp', 'resident-1/second-photo.png'],
      assignedTo: 'responder-1',
      resolutionNote: undefined,
      resolvedAt: undefined,
      resolutionPhotoPaths: [],
      reporterId: 'resident-1',
    })
  })

  it('provides safe defaults for optional location and photo values', () => {
    const row: ReportRow = {
      id: 'report-456',
      title: 'Creek pollution',
      category: 'Pollution',
      status: 'Submitted',
      urgency: 'Medium',
      description: 'Unusual material is visible on the water.',
      location_label: '',
      latitude: 14.72,
      longitude: 121.05,
      created_at: '2026-09-30T08:00:00.000Z',
    }

    expect(toReport(row)).toMatchObject({ location: 'Community location', photoPath: undefined, photoPaths: [], assignedTo: undefined, observedAt: row.created_at })
  })
})
describe('attachReporterNames', () => {
  const base = { title: 'Report', category: 'Waste', status: 'Submitted', urgency: 'Low', description: 'Something to report.', location_label: 'Near the hall', latitude: 14.72, longitude: 121.05, created_at: '2026-11-12T08:00:00.000Z' } as const
  const rows: ReportRow[] = [
    { ...base, id: 'a', reporter_id: 'user-1' },
    { ...base, id: 'b', reporter_id: 'user-2' },
    { ...base, id: 'c', reporter_id: 'user-1' },
    { ...base, id: 'd', reporter_id: null },
  ]

  it('lists each reporter once and skips guest reports', () => {
    expect(reporterIdsOf(rows)).toEqual(['user-1', 'user-2'])
  })

  it('adds the reporter name that toReport reads', () => {
    const named = attachReporterNames(rows, [{ id: 'user-1', display_name: 'Ana Cruz' }])
    expect(named.map((row) => toReport(row).reporterName)).toEqual(['Ana Cruz', undefined, 'Ana Cruz', 'Guest reporter'])
    // Rows without a matching profile are returned unchanged.
    expect(named[1]).toBe(rows[1])
  })
})
