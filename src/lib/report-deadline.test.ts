import { describe, expect, it } from 'vitest'
import { formatCountdown, reportDeadline } from './report-deadline'

const settings = { response_sla_hours: 48, high_urgency_sla_hours: 12 }
const now = new Date('2026-11-01T12:00:00Z').getTime()
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString()

describe('formatCountdown', () => {
  it('formats days, hours and minutes', () => {
    expect(formatCountdown(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h')
    expect(formatCountdown(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m')
    expect(formatCountdown(-10_000)).toBe('1m')
  })
})

describe('reportDeadline', () => {
  it('uses the standard window for normal urgency', () => {
    const state = reportDeadline({ status: 'Submitted', urgency: 'Medium', createdAt: hoursAgo(10) }, settings, now)
    expect(state).toMatchObject({ overdue: false, soon: false, label: 'Due in 1d 14h' })
  })

  it('uses the shorter high-urgency window and flags overdue reports', () => {
    const state = reportDeadline({ status: 'Under review', urgency: 'High', createdAt: hoursAgo(15) }, settings, now)
    expect(state).toMatchObject({ overdue: true, label: 'Overdue 3h' })
  })

  it('flags reports close to their deadline', () => {
    const state = reportDeadline({ status: 'Submitted', urgency: 'High', createdAt: hoursAgo(10) }, settings, now)
    expect(state).toMatchObject({ overdue: false, soon: true, label: 'Due in 2h' })
  })

  it('ignores closed reports and invalid dates', () => {
    expect(reportDeadline({ status: 'Resolved', urgency: 'High', createdAt: hoursAgo(40) }, settings, now)).toBeUndefined()
    expect(reportDeadline({ status: 'Submitted', urgency: 'Low', createdAt: 'nope' }, settings, now)).toBeUndefined()
  })
})
