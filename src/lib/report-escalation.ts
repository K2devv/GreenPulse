type EscalationInput = { category: string; urgency: string; status: string; escalatedAt?: string }

const CLOSED = ['Resolved', 'Rejected', 'Closed', 'Duplicate']

export const isCriticalFlooding = (report: Pick<EscalationInput, 'category' | 'urgency'>) =>
  report.category === 'Flooding' && report.urgency === 'High'

export const isEscalated = (report: EscalationInput) => Boolean(report.escalatedAt) || isCriticalFlooding(report)

export const needsImmediateAttention = (report: EscalationInput) => isEscalated(report) && !CLOSED.includes(report.status)

// Stable sort that lifts open escalated reports to the top of a queue.
export function prioritizeEscalated<T extends EscalationInput>(reports: readonly T[]): T[] {
  return reports
    .map((report, index) => ({ report, index, flagged: needsImmediateAttention(report) }))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.index - b.index)
    .map(({ report }) => report)
}
