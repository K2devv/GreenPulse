import { describe, expect, it } from 'vitest'
import { badgeCount, filterNotifications, groupNotifications, notificationKind, notificationTime } from './notification-inbox'

// Local time, so day boundaries match the runner's time zone the same way the app's do.
const now = new Date(2026, 10, 12, 15, 0, 0).getTime()
const at = (daysAgo: number, hour: number, minute = 0) => new Date(2026, 10, 12 - daysAgo, hour, minute).toISOString()
const item = (id: number, createdAt: string, readAt: string | null = null) => ({ id, event_type: 'status_changed', created_at: createdAt, read_at: readAt })

describe('notificationKind', () => {
  it('gives escalations and urgent alerts a warning or danger tone', () => {
    expect(notificationKind('sla_escalation_stage_2')).toEqual({ tone: 'danger', icon: 'alert' })
    expect(notificationKind('critical_report')).toEqual({ tone: 'danger', icon: 'alert' })
    expect(notificationKind('sla_escalation_stage_1')).toEqual({ tone: 'warn', icon: 'clock' })
    expect(notificationKind('overdue_task')).toEqual({ tone: 'warn', icon: 'clock' })
    expect(notificationKind('unassigned_report')).toEqual({ tone: 'warn', icon: 'clock' })
  })

  it('maps progress, assignment, message and new report types', () => {
    expect(notificationKind('report_verified')).toEqual({ tone: 'success', icon: 'check' })
    expect(notificationKind('report_resolved').tone).toBe('success')
    expect(notificationKind('report_rejected')).toEqual({ tone: 'danger', icon: 'x' })
    expect(notificationKind('report_assigned')).toEqual({ tone: 'info', icon: 'user' })
    expect(notificationKind('assignment_changed').icon).toBe('user')
    expect(notificationKind('report_status_update')).toEqual({ tone: 'accent', icon: 'message' })
    expect(notificationKind('reporter_replied').icon).toBe('message')
    expect(notificationKind('new_report')).toEqual({ tone: 'info', icon: 'file' })
    expect(notificationKind('resolution_awaiting_verification')).toEqual({ tone: 'info', icon: 'refresh' })
  })

  it('falls back to a neutral bell', () => {
    expect(notificationKind('something_new')).toEqual({ tone: 'neutral', icon: 'bell' })
  })
})

describe('notificationTime', () => {
  it('uses short relative times today', () => {
    expect(notificationTime(new Date(now - 20_000).toISOString(), now)).toBe('Just now')
    expect(notificationTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min')
    expect(notificationTime(at(0, 12), now)).toBe('3 h')
  })

  it('names yesterday and the weekday within a week, then the date', () => {
    expect(notificationTime(at(1, 9), now)).toBe('Yesterday')
    expect(notificationTime(at(3, 9), now)).toBe('Mon')
    expect(notificationTime(at(10, 9), now)).toBe('Nov 2')
    expect(notificationTime(new Date(2025, 11, 30, 9).toISOString(), now)).toBe('Dec 30, 2025')
  })

  it('returns nothing for a bad date and never shows a future time', () => {
    expect(notificationTime('not a date', now)).toBe('')
    expect(notificationTime(new Date(now + 60_000).toISOString(), now)).toBe('Just now')
  })
})

describe('groupNotifications', () => {
  it('splits newest-first notifications into day groups and drops empty ones', () => {
    const groups = groupNotifications([item(1, at(0, 14)), item(2, at(0, 8)), item(3, at(1, 20)), item(4, at(9, 10))], now)
    expect(groups.map((group) => [group.label, group.items.map((entry) => entry.id)])).toEqual([
      ['Today', [1, 2]],
      ['Yesterday', [3]],
      ['Earlier', [4]],
    ])
  })

  it('puts the past week in its own group and a bad date at the end', () => {
    const groups = groupNotifications([item(1, at(4, 10)), item(2, 'bad')], now)
    expect(groups.map((group) => group.key)).toEqual(['week', 'earlier'])
  })
})

describe('filterNotifications and badgeCount', () => {
  it('keeps unread notifications for the Unread tab', () => {
    const items = [item(1, at(0, 9)), item(2, at(0, 8), at(0, 9))]
    expect(filterNotifications(items, 'unread').map((entry) => entry.id)).toEqual([1])
    expect(filterNotifications(items, 'all')).toHaveLength(2)
  })

  it('caps the badge at 99+', () => {
    expect(badgeCount(7)).toBe('7')
    expect(badgeCount(120)).toBe('99+')
    expect(badgeCount(-1)).toBe('0')
  })
})
