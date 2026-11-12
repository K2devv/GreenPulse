/**
 * Which copy of a report the staff detail panel shows.
 *
 * The app holds up to three copies of a report:
 * - `detail`: a full `reports` row fetched for the selected report (staff RLS allows it);
 * - `queue`: full rows from the `staff_report_page` RPC, which returns `reports.*`;
 * - `reports`: the map list, built from the public `community_reports` view plus the viewer's
 *   own `reports` rows (or every row while the admin dashboard is open).
 *
 * A `community_reports` row is redacted: it has no assignment, task, verification or resolution
 * fields, a generalized place label, and coordinates rounded to 3 decimals. Showing it in the
 * staff panel made an assigned report read "No one is assigned yet" after every refresh, so it is
 * never used here.
 */

export type StaffReportCandidate = {
  id: string
  /** `reports.reporter_id`: a string or null on full rows. The community view has no such column. */
  reporterId?: string | null
  assignedTo?: string
  assignedTeamId?: string
}

/**
 * True for a report mapped from a full `reports` row. `community_reports` has no `reporter_id`
 * column, so `toReport()` leaves `reporterId` undefined for it, while full rows carry a string
 * (resident) or null (guest).
 */
export function isFullReportRow(report: Pick<StaffReportCandidate, 'reporterId'>) {
  return report.reporterId !== undefined
}

/**
 * The full copy of the selected report: the fetched detail first, then the staff queue, then a
 * full row from the map list. Returns undefined while only a redacted community copy is known,
 * so the panel shows a loading state instead of wrong staff fields.
 */
export function resolveStaffReport<T extends StaffReportCandidate>(input: {
  id: string | undefined
  detail: T | undefined
  queue: readonly T[]
  reports: readonly T[]
}): T | undefined {
  const { id } = input
  if (!id) return undefined
  if (input.detail?.id === id && isFullReportRow(input.detail)) return input.detail
  const queued = input.queue.find((report) => report.id === id && isFullReportRow(report))
  if (queued) return queued
  return input.reports.find((report) => report.id === id && isFullReportRow(report))
}

/** Whether the viewer is the assigned responder or belongs to the assigned team. */
export function isViewerOnTask(
  report: Pick<StaffReportCandidate, 'assignedTo' | 'assignedTeamId'> | undefined,
  userId: string | undefined,
  teams: ReadonlyArray<{ id: string; memberIds: readonly string[] }>,
) {
  if (!report || !userId) return false
  if (report.assignedTo === userId) return true
  if (!report.assignedTeamId) return false
  return Boolean(teams.find((team) => team.id === report.assignedTeamId)?.memberIds.includes(userId))
}

/**
 * Merges a freshly saved row into the previous copy. The update response has no reporter name
 * (that comes from `profiles`), so the previous name is kept. Every other field comes from the
 * saved row, including fields it clears.
 */
export function mergeSavedReport<T extends { id: string; reporterName?: string }>(previous: T | undefined, saved: T): T {
  if (!previous || previous.id !== saved.id) return saved
  return { ...previous, ...saved, reporterName: saved.reporterName ?? previous.reporterName }
}
