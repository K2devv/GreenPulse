import { describe, expect, it } from 'vitest'
import { toReport, type ReportRow } from './supabase'

describe('toReport', () => {
  it('maps database columns to the community report shape', () => {
    const row: ReportRow = {
      id: 'report-123',
      title: 'Blocked drainage',
      category: 'Drainage',
      status: 'In progress',
      urgency: 'High',
      description: 'Water is collecting beside a blocked drain.',
      location_label: 'Near the community hall',
      latitude: 14.7222,
      longitude: 121.0545,
      created_at: '2026-09-30T08:00:00.000Z',
      photo_path: 'resident-1/photo.webp',
      assigned_to: 'responder-1',
      resolution_note: null,
      reporter_id: 'resident-1',
    }

    expect(toReport(row)).toEqual({
      id: 'report-123',
      title: 'Blocked drainage',
      category: 'Drainage',
      status: 'In progress',
      urgency: 'High',
      description: 'Water is collecting beside a blocked drain.',
      location: 'Near the community hall',
      coordinates: [14.7222, 121.0545],
      createdAt: '2026-09-30T08:00:00.000Z',
      photoPath: 'resident-1/photo.webp',
      assignedTo: 'responder-1',
      resolutionNote: undefined,
      reporterId: 'resident-1',
    })
  })

  it('provides safe defaults for optional location and photo values', () => {
    const row: ReportRow = {
      id: 'report-456',
      title: 'Creek pollution',
      category: 'Water pollution',
      status: 'Submitted',
      urgency: 'Medium',
      description: 'Unusual material is visible on the water.',
      location_label: '',
      latitude: 14.72,
      longitude: 121.05,
      created_at: '2026-09-30T08:00:00.000Z',
    }

    expect(toReport(row)).toMatchObject({ location: 'Community location', photoPath: undefined, assignedTo: undefined })
  })
})