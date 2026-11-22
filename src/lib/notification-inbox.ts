import { t, dateLocale } from './i18n'
/** How the notification inbox labels, groups and dates notifications. */

export type NotificationTone = 'danger' | 'warn' | 'success' | 'info' | 'accent' | 'neutral'
export type NotificationIcon = 'alert' | 'clock' | 'check' | 'x' | 'user' | 'message' | 'file' | 'refresh' | 'bell'

export type InboxItem = { id: number | string; event_type: string; created_at: string; read_at: string | null }

const KINDS: Array<[RegExp, NotificationTone, NotificationIcon]> = [
  [/^(sla_escalation_stage_2|critical_report)$/, 'danger', 'alert'],
  [/^(sla_escalation_stage_\d+|sla_escalated|overdue_task|unassigned_report)$/, 'warn', 'clock'],
  [/^report_rejected$/, 'danger', 'x'],
  [/^(report_verified|report_resolved|report_closed|resolution_reviewed|resolution_feedback)$/, 'success', 'check'],
  [/^(report_assigned|assignment_changed)$/, 'info', 'user'],
  [/^(report_comment|reporter_replied|additional_information_requested|report_status_update)$/, 'accent', 'message'],
  [/^(new_report|report_submitted)$/, 'info', 'file'],
  [/^(status_changed|resolution_\w+)$/, 'info', 'refresh'],
]

/** The tone and icon for a notification's event type. */
export function notificationKind(eventType: string): { tone: NotificationTone; icon: NotificationIcon } {
  const match = KINDS.find(([pattern]) => pattern.test(eventType))
  return match ? { tone: match[1], icon: match[2] } : { tone: 'neutral', icon: 'bell' }
}

const DAY = 24 * 60 * 60 * 1000

function startOfDay(time: number) {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** "Just now", "5 min", "3 h", "Yesterday", "Mon", "Nov 2", or "Nov 2, 2025" for another year. */
export function notificationTime(createdAt: string, now: number): string {
  const time = Date.parse(createdAt)
  if (Number.isNaN(time)) return ''
  const elapsed = Math.max(0, now - time)
  if (elapsed < 60_000) return t('Just now')
  if (elapsed < 60 * 60_000) return t('{count} min', { count: Math.floor(elapsed / 60_000) })
  const today = startOfDay(now)
  if (time >= today) return t('{count} h', { count: Math.floor(elapsed / (60 * 60_000)) })
  if (time >= today - DAY) return t('Yesterday')
  const date = new Date(time)
  if (time >= today - 6 * DAY) return date.toLocaleDateString(dateLocale() ?? 'en-US', { weekday: 'short' })
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(dateLocale() ?? 'en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export type NotificationGroup<T> = { key: 'today' | 'yesterday' | 'week' | 'earlier'; label: string; items: T[] }

/** Splits notifications (already newest first) into Today, Yesterday, This week and Earlier. Empty groups are left out. */
export function groupNotifications<T extends InboxItem>(items: readonly T[], now: number): NotificationGroup<T>[] {
  const today = startOfDay(now)
  const groups: NotificationGroup<T>[] = [
    { key: 'today', label: t('Today'), items: [] },
    { key: 'yesterday', label: t('Yesterday'), items: [] },
    { key: 'week', label: t('This week'), items: [] },
    { key: 'earlier', label: t('Earlier'), items: [] },
  ]
  for (const item of items) {
    const time = Date.parse(item.created_at)
    const group = Number.isNaN(time) ? groups[3]
      : time >= today ? groups[0]
        : time >= today - DAY ? groups[1]
          : time >= today - 6 * DAY ? groups[2]
            : groups[3]
    group.items.push(item)
  }
  return groups.filter((group) => group.items.length > 0)
}

export type NotificationFilter = 'all' | 'unread'

export function filterNotifications<T extends InboxItem>(items: readonly T[], filter: NotificationFilter): T[] {
  return filter === 'unread' ? items.filter((item) => !item.read_at) : [...items]
}

/** The badge text: the count, capped at 99+. */
export function badgeCount(unread: number): string {
  return unread > 99 ? '99+' : String(Math.max(0, unread))
}

/**
 * Keeps notifications the user has just read marked as read. A list fetched before the read mark
 * reached the server still says "unread"; without this the badge would count them again.
 */
export function withPendingReads<T extends { id: number | string; read_at: string | null }>(rows: readonly T[], pending: ReadonlyMap<number | string, string>): T[] {
  if (pending.size === 0) return [...rows]
  return rows.map((row) => {
    const readAt = row.read_at === null ? pending.get(row.id) : undefined
    return readAt ? { ...row, read_at: readAt } : row
  })
}

