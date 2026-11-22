/**
 * Who may see a report's photos. The reporter chooses when submitting:
 * - private (the default): only the reporter, responders and admins;
 * - public: anyone, guests included, but only once staff have verified the report, so an
 *   unreviewed upload never reaches the public map.
 * The database (`report_photos_are_public`, the `community_reports` view) and the private
 * `report-photos` bucket's policies enforce the same rule; this mirrors it for the UI.
 */

import { MAX_REPORT_PHOTOS } from './report-photos'

export type PhotoVisibility = 'private' | 'public'
export type PhotoViewer = { userId?: string; role?: string | null }
export type PhotoSource = {
  reporterId?: string | null
  photoPaths?: readonly string[]
  photoPath?: string
  photoVisibility?: PhotoVisibility
  status?: string
}
/**
 * How a report's photos are shared right now: `private`, `public` (anyone can see them), or
 * `public-after-review` (the reporter chose public, but the report is not verified yet).
 */
export type PhotoSharing = 'private' | 'public' | 'public-after-review'
/** The photo links a viewer may see for one report, and how those photos are shared. */
export type ReportPhotos = { urls: string[]; sharing: PhotoSharing }

/** Statuses in which a public photo is shown to everyone: staff have verified the report. */
export const PUBLIC_PHOTO_STATUSES: readonly string[] = ['Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Closed']

/** How long a signed photo link works. Links are reused until shortly before they expire. */
export const SIGNED_PHOTO_SECONDS = 3600
/** Links are fetched again this long before they would expire. */
export const SIGNED_PHOTO_RENEW_MS = 10 * 60 * 1000

/** Reads a stored visibility; anything but 'public' is private. */
export function toPhotoVisibility(value: unknown): PhotoVisibility {
  return value === 'public' ? 'public' : 'private'
}

export function photoSharing(report: Pick<PhotoSource, 'photoVisibility' | 'status'>): PhotoSharing {
  if (report.photoVisibility !== 'public') return 'private'
  return report.status && PUBLIC_PHOTO_STATUSES.includes(report.status) ? 'public' : 'public-after-review'
}

/** Whether this viewer may see the report's photos at all. */
export function canViewReportPhotos(viewer: PhotoViewer, report: PhotoSource): boolean {
  if (photoSharing(report) === 'public') return true
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
 * The photo paths the app already holds for a report, or undefined when they are unknown. A full
 * row always has `reporterId` set (null for a guest report) and carries every photo. The public copy
 * carries photos only while they are public, so otherwise its empty list means "unknown", not "none".
 */
export function knownPhotoPaths(report: PhotoSource): string[] | undefined {
  if (report.reporterId !== undefined || photoSharing(report) === 'public') return photoPathList(report.photoPaths, report.photoPath)
  return undefined
}
