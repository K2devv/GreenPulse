/**
 * Who may see a report's photos. Reporters are told their uploaded photos stay private (see
 * `publicConsent` in ui-copy), so only staff and the reporter themselves ever get them; the
 * database and the private `report-photos` bucket enforce the same rule.
 */

import { MAX_REPORT_PHOTOS } from './report-photos'

export type PhotoViewer = { userId?: string; role?: string | null }
export type PhotoSource = { reporterId?: string | null; photoPaths?: readonly string[]; photoPath?: string }

/** How long a signed photo link works. Links are reused until shortly before they expire. */
export const SIGNED_PHOTO_SECONDS = 3600
/** Links are fetched again this long before they would expire. */
export const SIGNED_PHOTO_RENEW_MS = 10 * 60 * 1000

/** Whether this viewer may see the report's photos at all. Signed-out visitors never may. */
export function canViewReportPhotos(viewer: PhotoViewer, report: PhotoSource): boolean {
  if (!viewer.userId) return false
  if (viewer.role === 'admin' || viewer.role === 'responder') return true
  return Boolean(report.reporterId) && report.reporterId === viewer.userId
}

/** A report's photo paths, each once and at most MAX_REPORT_PHOTOS, from the list and the older single-path column. */
export function photoPathList(paths?: readonly (string | null)[] | null, legacyPath?: string | null): string[] {
  const all = [...(paths ?? []), ...(legacyPath ? [legacyPath] : [])].filter((path): path is string => Boolean(path))
  return [...new Set(all)].slice(0, MAX_REPORT_PHOTOS)
}

/**
 * The photo paths the app already holds for a report, or undefined when only its public copy is
 * loaded. The public copy never carries photos, so its empty list means "unknown", not "none".
 * A full row always has `reporterId` set (null for a guest report).
 */
export function knownPhotoPaths(report: PhotoSource): string[] | undefined {
  if (report.reporterId === undefined) return undefined
  return photoPathList(report.photoPaths, report.photoPath)
}
