import { formatReportId } from './report-filters'

export const ASSIGNABLE_STATUSES = ['Verified', 'In progress', 'Awaiting verification']
export const VERIFICATION_STATUSES = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'Rejected', 'Duplicate']
const CLOSED_STATUSES = ['Resolved', 'Rejected', 'Closed', 'Duplicate']
const MIN_NOTE_LENGTH = 8

export type VerificationState = 'Pending Verification' | 'Verified' | 'Rejected' | 'Duplicate' | 'Needs More Information'
export type WorkflowResult = { payload: Record<string, unknown>; error?: undefined } | { error: string; payload?: undefined }

export const isOpenStatus = (status: string) => !CLOSED_STATUSES.includes(status)

export function verificationState(status: string): VerificationState {
  if (status === 'Rejected') return 'Rejected'
  if (status === 'Duplicate') return 'Duplicate'
  if (status === 'Additional information requested') return 'Needs More Information'
  if (status === 'Submitted' || status === 'Under review') return 'Pending Verification'
  return 'Verified'
}

export function isOverdue(report: { status: string; dueDate?: string }, now = new Date()) {
  if (!report.dueDate || !isOpenStatus(report.status)) return false
  return report.dueDate < localDateKey(now)
}

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function resolveReportReference(input: string, reports: readonly { id: string }[], selfId: string) {
  const query = input.trim().replace(/^#/, '').toLowerCase()
  if (!query) return undefined
  return reports.find((report) => report.id !== selfId && (report.id.toLowerCase() === query || formatReportId(report.id).replace('#', '').toLowerCase() === query))?.id
}

const tooShort = (note: string) => note.trim().length < MIN_NOTE_LENGTH
const noteError = (what: string) => `Add ${what} of at least ${MIN_NOTE_LENGTH} characters.`

export type VerificationAction = 'save' | 'verify' | 'needs_info' | 'reject' | 'duplicate'

export function buildVerificationUpdate(input: {
  action: VerificationAction
  note: string
  category: string
  urgency: string
  duplicateOf?: string
  current: { category: string; urgency: string; verificationNote?: string }
}): WorkflowResult {
  const note = input.note.trim()
  if ((input.action === 'reject' || input.action === 'needs_info') && tooShort(note)) {
    return { error: noteError(input.action === 'reject' ? 'a rejection reason' : 'a note describing the information needed') }
  }
  if (input.action === 'duplicate' && !input.duplicateOf) return { error: 'Enter the ID of the original report this one duplicates.' }

  const status = { verify: 'Verified', needs_info: 'Additional information requested', reject: 'Rejected', duplicate: 'Duplicate', save: undefined }[input.action]
  return {
    payload: {
      ...(status ? { status } : {}),
      ...(input.category !== input.current.category ? { category: input.category } : {}),
      ...(input.urgency !== input.current.urgency ? { urgency: input.urgency } : {}),
      ...(note !== (input.current.verificationNote ?? '') || status ? { verification_note: note || null } : {}),
      ...(input.action === 'duplicate' ? { duplicate_of: input.duplicateOf } : {}),
    },
  }
}

export function buildAssignmentUpdate(input: {
  status: string
  responderId: string
  teamId: string
  teamsAvailable: boolean
  priority: string
  dueDate: string
  instructions: string
  currentDueDate?: string
  today?: Date
}): WorkflowResult {
  if (!ASSIGNABLE_STATUSES.includes(input.status)) return { error: 'Verify the report before assigning it.' }
  if (!input.responderId && !input.teamId) return { error: 'Choose a responder or a team to assign this task to.' }
  if (input.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { error: 'Enter a valid due date.' }
    if (input.dueDate !== input.currentDueDate && input.dueDate < localDateKey(input.today ?? new Date())) return { error: 'The due date cannot be in the past.' }
  }
  return {
    payload: {
      assigned_to: input.responderId || null,
      ...(input.teamsAvailable ? { assigned_team_id: input.teamId || null } : {}),
      task_priority: input.priority || null,
      due_date: input.dueDate || null,
      task_instructions: input.instructions.trim() || null,
    },
  }
}

export type ResolutionReviewAction = 'approve' | 'reject' | 'action' | 'close'

export function buildResolutionReview(input: { action: ResolutionReviewAction; note: string }): WorkflowResult {
  const note = input.note.trim()
  if (input.action === 'approve') return { payload: { status: 'Resolved' } }
  if (input.action === 'close') return { payload: { status: 'Closed' } }
  if (tooShort(note)) return { error: noteError('a review note explaining what must change') }
  return {
    payload: {
      status: 'In progress',
      resolution_decision: input.action === 'reject' ? 'rejected' : 'action_requested',
      resolution_review_note: note,
    },
  }
}

export function buildResponderUpdate(input: { action: 'start' | 'save' | 'submit'; note: string; photoPaths?: string[] }): WorkflowResult {
  const note = input.note.trim()
  if (input.action === 'start') return { payload: { status: 'In progress' } }
  if (input.action === 'submit' && tooShort(note)) return { error: noteError('response notes') }
  return {
    payload: {
      ...(input.action === 'submit' ? { status: 'Awaiting verification' } : {}),
      resolution_note: note || null,
      ...(input.photoPaths ? { resolution_photo_paths: input.photoPaths } : {}),
    },
  }
}
