import { describe, expect, it } from 'vitest'
import { publicGuestEvents, publicGuestOutcome } from './guest-tracking'

describe('public guest tracking', () => {
  it('describes the current status without staff notes', () => {
    expect(publicGuestOutcome('Resolved')).toBe('The response team marked this issue resolved.')
    expect(publicGuestOutcome('In progress')).toBe('A response team is working on this report.')
    expect(publicGuestOutcome('Internal note')).toBeNull()
  })

  it('returns submission and status changes only', () => {
    const events = publicGuestEvents([
      { id: 1, event_type: 'submitted', message: 'Report submitted', created_at: '2026-11-01T00:00:00Z' },
      { id: 2, event_type: 'verification_note', message: 'Verification note: duplicate of a private case', created_at: '2026-11-01T01:00:00Z' },
      { id: 3, event_type: 'assignment_changed', message: 'Report assigned to a responder', created_at: '2026-11-01T02:00:00Z' },
      { id: 4, event_type: 'status_changed', message: 'Status changed from Submitted to Verified', created_at: '2026-11-01T03:00:00Z' },
      { id: 5, event_type: 'status_changed', message: 'Status changed from Verified to Resolved. Called the reporter.', created_at: '2026-11-01T04:00:00Z' },
      { id: 6, event_type: 'resolution_updated', message: 'Resolution details updated', created_at: '2026-11-01T05:00:00Z' },
    ])

    expect(events).toEqual([
      { id: 1, event_type: 'submitted', message: 'Report submitted', created_at: '2026-11-01T00:00:00Z' },
      { id: 4, event_type: 'status_changed', message: 'Report verified', created_at: '2026-11-01T03:00:00Z' },
    ])
  })
})
