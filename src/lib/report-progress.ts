/** The public five-step progress track shown on community report cards. */
export const PROGRESS_STEPS = ['Submitted', 'Verified', 'In progress', 'Awaiting verification', 'Resolved'] as const

const STEP_BY_STATUS = new Map<string, number>([
  ['Submitted', 0],
  ['Under review', 0],
  ['Additional information requested', 0],
  ['Verified', 1],
  ['In progress', 2],
  ['Awaiting verification', 3],
  ['Resolved', 4],
  ['Closed', 4],
])

/** Position of a status on the progress track, or null for statuses that sit off it (Rejected, Duplicate). */
export function reportProgressStep(status: string): number | null {
  return STEP_BY_STATUS.get(status) ?? null
}

export type ProgressEvent = { title: string; detail: string }

/**
 * Plain-language milestones a member of the public can see, derived from the status alone.
 * The "Reported" entry is left to the caller because it needs the reporter label and time.
 */
export function publicProgressEvents(status: string): ProgressEvent[] {
  const step = reportProgressStep(status)
  if (step === null) {
    return [status === 'Duplicate'
      ? { title: 'Marked as a duplicate', detail: 'of another report' }
      : { title: status, detail: 'by the District 5 desk' }]
  }
  const events: ProgressEvent[] = []
  if (status === 'Under review') events.push({ title: 'Under review', detail: 'by the District 5 desk' })
  if (status === 'Additional information requested') events.push({ title: 'More information requested', detail: 'from the reporter' })
  if (step >= 1) events.push({ title: 'Verified', detail: 'by the District 5 desk' })
  if (step >= 2) events.push({ title: 'Response started', detail: 'by the assigned team' })
  if (step >= 3) events.push({ title: 'Work done', detail: 'waiting for staff to confirm' })
  if (status === 'Resolved') events.push({ title: 'Resolved', detail: 'after staff review' })
  if (status === 'Closed') events.push({ title: 'Closed', detail: 'by the District 5 desk' })
  return events
}
