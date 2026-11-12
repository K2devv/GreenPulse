/** Deadline (SLA) escalation rows as the staff views list them. */

export type EscalationReport = { title: string; status: string; assigned_to: string | null; assigned_team_id: string | null }

export type SlaEscalation = {
  report_id: string
  stage: number
  escalated_at: string
  acknowledged_at: string | null
  /** PostgREST returns the joined report as an object or a one-item array. */
  report?: EscalationReport | EscalationReport[] | null
}

/** The joined report of an escalation, whichever shape PostgREST returned. */
export function escalationReport(item: Pick<SlaEscalation, 'report'>): EscalationReport | undefined {
  const report = Array.isArray(item.report) ? item.report[0] : item.report
  return report ?? undefined
}

/** Admins handle every escalation; responders handle those on reports assigned to them or their team. */
export function canHandleEscalation(
  item: Pick<SlaEscalation, 'report'>,
  viewer: { role: string; userId?: string; teams: ReadonlyArray<{ id: string; memberIds: readonly string[] }> },
) {
  if (viewer.role === 'admin') return true
  const report = escalationReport(item)
  if (!report || !viewer.userId) return false
  if (report.assigned_to === viewer.userId) return true
  return Boolean(report.assigned_team_id && viewer.teams.find((team) => team.id === report.assigned_team_id)?.memberIds.includes(viewer.userId))
}

/** Open escalations first, then the later stage, then the most recent. */
export function orderEscalations<T extends Pick<SlaEscalation, 'stage' | 'escalated_at' | 'acknowledged_at'>>(items: readonly T[]): T[] {
  const time = (value: string) => {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return [...items].sort((first, second) =>
    Number(Boolean(first.acknowledged_at)) - Number(Boolean(second.acknowledged_at))
    || second.stage - first.stage
    || time(second.escalated_at) - time(first.escalated_at))
}
