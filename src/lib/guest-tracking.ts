import { describeEvent, type TimelineEvent } from './report-timeline'

const reportStatuses = new Set([
  'Submitted',
  'Under review',
  'Additional information requested',
  'Verified',
  'In progress',
  'Awaiting verification',
  'Resolved',
  'Rejected',
  'Closed',
  'Duplicate',
])

const publicOutcomes: Record<string, string> = {
  Submitted: 'Your report was received and is waiting for review.',
  'Under review': 'Your report is being reviewed.',
  'Additional information requested': 'The review team asked for more information.',
  Verified: 'Your report was accepted.',
  'In progress': 'A response team is working on this report.',
  'Awaiting verification': 'The response team submitted their work for review.',
  Resolved: 'The response team marked this issue resolved.',
  Rejected: 'This report was not accepted.',
  Closed: 'This report is closed.',
  Duplicate: 'This report was marked as a duplicate of another report.',
}

export function publicGuestOutcome(status: string) {
  return publicOutcomes[status] ?? null
}

export function publicGuestEvents(events: readonly TimelineEvent[]) {
  return events.flatMap((event) => {
    if (typeof event.message !== 'string') return []
    if (event.event_type === 'submitted') {
      return [{ id: event.id, event_type: 'submitted', message: 'Report submitted', created_at: event.created_at }]
    }
    if (event.event_type !== 'status_changed') return []
    const change = /^Status changed from (.+) to (.+)$/.exec(event.message)
    if (!change || !reportStatuses.has(change[1]) || !reportStatuses.has(change[2])) return []
    return [{ id: event.id, event_type: 'status_changed', message: describeEvent(event), created_at: event.created_at }]
  })
}
