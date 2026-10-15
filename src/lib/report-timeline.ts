export type TimelineEvent = {
  id: number
  event_type: string
  message: string
  created_at: string
}

export type TimelineEntry = {
  id: number
  label: string
  at: string
}

const STATUS_LABELS: Record<string, string> = {
  Submitted: 'Report submitted',
  'Under review': 'Report under review',
  'Additional information requested': 'Additional information requested',
  Verified: 'Report verified',
  'In progress': 'Response started',
  'Awaiting verification': 'Resolution submitted',
  Resolved: 'Resolution verified',
  Rejected: 'Report rejected',
  Closed: 'Report closed',
  Duplicate: 'Report marked as a duplicate',
}

export function describeEvent(event: Pick<TimelineEvent, 'event_type' | 'message'>) {
  const change = /^Status changed from (.+) to (.+)$/.exec(event.message)
  if (event.event_type === 'status_changed' && change) {
    const [, from, to] = change
    if (to === 'In progress' && from === 'Awaiting verification') return 'Resolution sent back for more work'
    return STATUS_LABELS[to] ?? event.message
  }
  return event.message
}

export function buildTimeline(events: readonly TimelineEvent[]): TimelineEntry[] {
  return [...events]
    .sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime() || first.id - second.id)
    .map((event) => ({ id: event.id, label: describeEvent(event), at: event.created_at }))
}

export function formatTimelineStamp(value: string, locale?: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString(locale, { month: 'long', day: 'numeric' })
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return `${day} – ${time}`
}
