/**
 * A signed-in reporter may have at most SAME_AREA_REPORT_LIMIT reports at the same spot, and a
 * guest (identified by connection, email, or phone) at most GUEST_SAME_AREA_REPORT_LIMIT. A report
 * counts while it is recent and the issue is not fixed yet, so someone can report the spot again
 * once it is resolved.
 *
 * The same numbers are enforced by the database (`enforce_same_area_report_limit` and
 * `guest_same_area_report_count` in 202611230001_same_area_report_limit.sql; the guest endpoint
 * compares that count with GUEST_SAME_AREA_REPORT_LIMIT). Change them together.
 *
 * The guest endpoint imports this module, so it must not import i18n.ts.
 */

/** How many reports a signed-in reporter may have at the same spot. */
export const SAME_AREA_REPORT_LIMIT = 3
/** How many reports a guest (no account) may have at the same spot. */
export const GUEST_SAME_AREA_REPORT_LIMIT = 2
/** Reports within this distance (in meters) of each other count as the same spot. */
export const SAME_AREA_RADIUS_METERS = 50
/** Only reports from the last this-many days count. */
export const SAME_AREA_WINDOW_DAYS = 30
/** Reports in these statuses no longer count: the issue was dealt with. */
export const SAME_AREA_FINISHED_STATUSES: readonly string[] = ['Resolved', 'Closed']

export const sameAreaLimitMessage = 'You already have 3 reports at this spot. Wait for staff to resolve them, or follow an existing report instead of submitting another.'
export const guestSameAreaLimitMessage = 'You already have 2 reports at this spot. Wait for staff to resolve them, or sign in and follow an existing report instead of submitting another.'

export type AreaLimitReport = {
  coordinates: readonly [number, number]
  createdAt: string
  status: string
}

/** Great-circle distance in meters between two [latitude, longitude] points. */
export function distanceInMeters(first: readonly [number, number], second: readonly [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(second[0] - first[0])
  const longitudeDelta = radians(second[1] - first[1])
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first[0])) * Math.cos(radians(second[0])) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

/** How many of a reporter's own reports count toward the limit at a point. */
export function sameAreaReportCount(ownReports: readonly AreaLimitReport[], point: readonly [number, number], now = new Date()) {
  const cutoff = now.getTime() - SAME_AREA_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return ownReports.filter((report) => !SAME_AREA_FINISHED_STATUSES.includes(report.status)
    && new Date(report.createdAt).getTime() >= cutoff
    && distanceInMeters(report.coordinates, point) <= SAME_AREA_RADIUS_METERS).length
}

/** Whether a reporter has used up their reports at a point, so a new one must be refused. */
export function reachedSameAreaLimit(ownReports: readonly AreaLimitReport[], point: readonly [number, number], options: { guest?: boolean; now?: Date } = {}) {
  const limit = options.guest ? GUEST_SAME_AREA_REPORT_LIMIT : SAME_AREA_REPORT_LIMIT
  return sameAreaReportCount(ownReports, point, options.now) >= limit
}
