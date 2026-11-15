/** What each hero stat tile counts, and the matching filters for the community list and the staff queue. */

import { defaultReportFilters, type ReportFilters } from './report-filters'
import { isOpenStatus } from './report-workflow'

export const ALL_STATUSES = 'All statuses'
/** Community status filters that cover a group of statuses. They match the hero tiles' labels. */
export const OPEN_REPORTS = 'Open reports'
export const FOLLOWED_UP = 'Verified or assigned'
export const STATUS_GROUP_FILTERS = [OPEN_REPORTS, FOLLOWED_UP] as const

/** A report staff have verified and are acting on. */
export const isFollowedUp = (status: string) => status === 'Verified' || status === 'In progress'

/** Whether a report's status passes the community list's status filter: all, a group, or one status. */
export function matchesStatusFilter(status: string, filter: string): boolean {
  if (filter === ALL_STATUSES) return true
  if (filter === OPEN_REPORTS) return isOpenStatus(status)
  if (filter === FOLLOWED_UP) return isFollowedUp(status)
  return status === filter
}

export type StaffQuickFilter = 'open' | 'urgent' | 'in-progress' | 'resolved'

const STAFF_QUICK_FILTERS: Record<StaffQuickFilter, Partial<ReportFilters>> = {
  open: {},
  urgent: { urgency: 'High' },
  'in-progress': { status: 'In progress' },
  resolved: { status: 'Resolved' },
}

/** The staff queue filters for a tile. Every other filter is reset, so the queue shows what the tile counts. */
export function staffQuickFilter(kind: StaffQuickFilter): ReportFilters {
  return { ...defaultReportFilters, ...STAFF_QUICK_FILTERS[kind] }
}

/** A hero stat tile. The community view shows open, followed-up and all; the staff view shows the quick filters. */
export type HeroTile = StaffQuickFilter | 'followed-up' | 'all'

/** Whether a tile counts this report. The tile's number and the list it opens both come from here. */
export function matchesHeroTile(report: { status: string; urgency: string }, tile: HeroTile): boolean {
  switch (tile) {
    case 'open': return isOpenStatus(report.status)
    case 'urgent': return report.urgency === 'High' && isOpenStatus(report.status)
    case 'in-progress': return report.status === 'In progress'
    case 'resolved': return report.status === 'Resolved'
    case 'followed-up': return isFollowedUp(report.status)
    case 'all': return true
  }
}

/** The community list's status filter that shows the same reports as a tile. */
export function communityStatusFilter(tile: HeroTile): string {
  return tile === 'open' ? OPEN_REPORTS : tile === 'followed-up' ? FOLLOWED_UP : ALL_STATUSES
}
