export type TimedReport = {
  createdAt: string
  verifiedAt?: string
  assignedAt?: string
  startedAt?: string
  resolvedAt?: string
  status?: string
}

export type ResponseStage = { key: 'submitted' | 'verified' | 'assigned' | 'started' | 'resolved'; label: string; at?: string; reached: boolean }

const PAST_VERIFICATION = ['Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Closed']

const ms = (value: string | undefined) => {
  if (!value) return undefined
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? undefined : time
}

export function elapsedMs(from: string | undefined, to: string | undefined) {
  const start = ms(from)
  const end = ms(to)
  return start === undefined || end === undefined || end < start ? undefined : end - start
}

function average(values: (number | undefined)[]) {
  const valid = values.filter((value): value is number => value !== undefined)
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : undefined
}

export type StageEvent = { event_type: string; message: string; created_at: string }

// Earliest time the report entered a status, taken from its history.
function statusTime(events: readonly StageEvent[], status: string) {
  return events
    .filter((event) => event.event_type === 'status_changed' && event.message.endsWith(` to ${status}`))
    .map((event) => event.created_at)
    .sort()[0]
}

export function responseStages(report: TimedReport, events: readonly StageEvent[] = []): ResponseStage[] {
  report = {
    ...report,
    verifiedAt: report.verifiedAt ?? statusTime(events, 'Verified'),
    startedAt: report.startedAt ?? statusTime(events, 'In progress'),
    resolvedAt: report.resolvedAt ?? statusTime(events, 'Resolved'),
  }
  const verified = Boolean(report.verifiedAt) || PAST_VERIFICATION.includes(report.status ?? '')
  return [
    { key: 'submitted', label: 'Submitted', at: report.createdAt, reached: true },
    { key: 'verified', label: 'Verified', at: report.verifiedAt, reached: verified },
    { key: 'assigned', label: 'Assigned', at: report.assignedAt, reached: Boolean(report.assignedAt) },
    { key: 'started', label: 'Response started', at: report.startedAt, reached: Boolean(report.startedAt) },
    { key: 'resolved', label: 'Resolved', at: report.resolvedAt, reached: Boolean(report.resolvedAt) },
  ]
}

export const totalResolutionMs = (report: TimedReport) =>
  report.status === 'Resolved' ? elapsedMs(report.createdAt, report.resolvedAt) : undefined

export function buildResponseTimeMetrics(reports: readonly TimedReport[]) {
  return {
    averageVerificationMs: average(reports.map((report) => elapsedMs(report.createdAt, report.verifiedAt))),
    averageAssignmentMs: average(reports.map((report) => elapsedMs(report.verifiedAt ?? report.createdAt, report.assignedAt))),
    averageResponseMs: average(reports.map((report) => elapsedMs(report.createdAt, report.startedAt))),
    averageResolutionMs: average(reports.map(totalResolutionMs)),
  }
}
