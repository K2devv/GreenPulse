import { describe, expect, it } from 'vitest'
import {
  buildAssignmentUpdate,
  buildResolutionReview,
  buildResponderUpdate,
  buildVerificationUpdate,
  isOpenStatus,
  isOverdue,
  resolveReportReference,
  verificationState,
} from './report-workflow'

const current = { category: 'Waste', urgency: 'Medium', verificationNote: '' }
const verification = (overrides: Partial<Parameters<typeof buildVerificationUpdate>[0]>) =>
  buildVerificationUpdate({ action: 'verify', note: '', category: 'Waste', urgency: 'Medium', current, ...overrides })

describe('verificationState', () => {
  it('maps workflow statuses to verification states', () => {
    expect(verificationState('Submitted')).toBe('Pending Verification')
    expect(verificationState('Under review')).toBe('Pending Verification')
    expect(verificationState('Additional information requested')).toBe('Needs More Information')
    expect(verificationState('Rejected')).toBe('Rejected')
    expect(verificationState('Duplicate')).toBe('Duplicate')
    for (const status of ['Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Closed']) expect(verificationState(status)).toBe('Verified')
  })
})

describe('buildVerificationUpdate', () => {
  it('validates a report and only sends changed fields', () => {
    expect(verification({})).toEqual({ payload: { status: 'Verified', verification_note: null } })
    expect(verification({ category: 'Drainage', urgency: 'High', note: ' Confirmed on site ' })).toEqual({
      payload: { status: 'Verified', category: 'Drainage', urgency: 'High', verification_note: 'Confirmed on site' },
    })
  })

  it('requires notes to reject or request more information', () => {
    expect(verification({ action: 'reject', note: 'no' }).error).toMatch(/rejection reason/)
    expect(verification({ action: 'needs_info', note: '' }).error).toMatch(/information needed/)
    expect(verification({ action: 'reject', note: 'Not an environmental concern' }).payload).toMatchObject({ status: 'Rejected' })
    expect(verification({ action: 'needs_info', note: 'Please add a photo of the area' }).payload).toMatchObject({ status: 'Additional information requested' })
  })

  it('requires an original report for duplicates', () => {
    expect(verification({ action: 'duplicate' }).error).toMatch(/original report/)
    expect(verification({ action: 'duplicate', duplicateOf: 'abc' }).payload).toMatchObject({ status: 'Duplicate', duplicate_of: 'abc' })
  })

  it('saves edits without changing the status', () => {
    expect(verification({ action: 'save', urgency: 'Low', note: 'Updated note text' }).payload).toEqual({ urgency: 'Low', verification_note: 'Updated note text' })
  })
})

describe('buildAssignmentUpdate', () => {
  const base = { status: 'Verified', responderId: 'u1', teamId: '', teamsAvailable: true, priority: 'High', dueDate: '2026-10-20', instructions: ' Clear the drain ', today: new Date(2026, 9, 14) }

  it('builds the assignment payload', () => {
    expect(buildAssignmentUpdate(base).payload).toEqual({ assigned_to: 'u1', assigned_team_id: null, task_priority: 'High', due_date: '2026-10-20', task_instructions: 'Clear the drain' })
    expect(buildAssignmentUpdate({ ...base, teamsAvailable: false }).payload).not.toHaveProperty('assigned_team_id')
  })

  it('blocks unverified reports, empty assignments, and past due dates', () => {
    expect(buildAssignmentUpdate({ ...base, status: 'Submitted' }).error).toMatch(/Verify/)
    expect(buildAssignmentUpdate({ ...base, responderId: '' }).error).toMatch(/responder or a team/)
    expect(buildAssignmentUpdate({ ...base, dueDate: '2026-10-01' }).error).toMatch(/past/)
    expect(buildAssignmentUpdate({ ...base, dueDate: '2026-10-01', currentDueDate: '2026-10-01' }).payload).toBeDefined()
    expect(buildAssignmentUpdate({ ...base, teamId: 't1', responderId: '' }).payload).toMatchObject({ assigned_team_id: 't1' })
  })
})

describe('resolution review and responder updates', () => {
  it('approves and closes without a note', () => {
    expect(buildResolutionReview({ action: 'approve', note: '' }).payload).toEqual({ status: 'Resolved' })
    expect(buildResolutionReview({ action: 'close', note: '' }).payload).toEqual({ status: 'Closed' })
  })

  it('sends a resolution back with a required note', () => {
    expect(buildResolutionReview({ action: 'reject', note: 'short' }).error).toBeDefined()
    expect(buildResolutionReview({ action: 'reject', note: 'The drain is still blocked' }).payload).toEqual({
      status: 'In progress', resolution_decision: 'rejected', resolution_review_note: 'The drain is still blocked',
    })
    expect(buildResolutionReview({ action: 'action', note: 'Clean the surrounding area too' }).payload).toMatchObject({ resolution_decision: 'action_requested' })
  })

  it('lets responders start work and submit resolutions with notes', () => {
    expect(buildResponderUpdate({ action: 'start', note: '' }).payload).toEqual({ status: 'In progress' })
    expect(buildResponderUpdate({ action: 'submit', note: 'done' }).error).toBeDefined()
    expect(buildResponderUpdate({ action: 'submit', note: 'Drain cleared and tested', photoPaths: ['u/a.jpg'] }).payload).toEqual({
      status: 'Awaiting verification', resolution_note: 'Drain cleared and tested', resolution_photo_paths: ['u/a.jpg'],
    })
    expect(buildResponderUpdate({ action: 'save', note: '' }).payload).toEqual({ resolution_note: null })
  })
})

describe('helpers', () => {
  it('flags overdue open tasks only', () => {
    const now = new Date(2026, 9, 14)
    expect(isOverdue({ status: 'In progress', dueDate: '2026-10-13' }, now)).toBe(true)
    expect(isOverdue({ status: 'In progress', dueDate: '2026-10-14' }, now)).toBe(false)
    expect(isOverdue({ status: 'Resolved', dueDate: '2026-10-01' }, now)).toBe(false)
    expect(isOverdue({ status: 'In progress' }, now)).toBe(false)
  })

  it('treats resolved, rejected, closed, and duplicate reports as not open', () => {
    expect(['Resolved', 'Rejected', 'Closed', 'Duplicate'].some(isOpenStatus)).toBe(false)
    expect(isOpenStatus('Awaiting verification')).toBe(true)
  })

  it('resolves report references by full or short id, excluding the report itself', () => {
    const reports = [{ id: 'a1b21904-3b93-44eb-980d-67f0489ca327' }, { id: 'ffee0011-0000-4000-8000-000000000000' }]
    expect(resolveReportReference('#a1b21904', reports, 'x')).toBe(reports[0].id)
    expect(resolveReportReference(reports[1].id, reports, 'x')).toBe(reports[1].id)
    expect(resolveReportReference('A1B21904', reports, reports[0].id)).toBeUndefined()
    expect(resolveReportReference('', reports, 'x')).toBeUndefined()
  })
})
