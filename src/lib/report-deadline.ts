import { isOpenStatus } from './report-workflow'

export type DeadlineSettings = { response_sla_hours: number; high_urgency_sla_hours: number }
export type DeadlineReport = { status: string; urgency: string; createdAt: string }
export type DeadlineState = { overdue: boolean; soon: boolean; remainingMs: number; label: string }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatCountdown(ms: number) {
  const value = Math.abs(ms)
  const join = (major: number, unit: string, minor: number, minorUnit: string) => minor ? `${major}${unit} ${minor}${minorUnit}` : `${major}${unit}`
  if (value >= DAY) return join(Math.floor(value / DAY), 'd', Math.floor((value % DAY) / HOUR), 'h')
  if (value >= HOUR) return join(Math.floor(value / HOUR), 'h', Math.floor((value % HOUR) / MINUTE), 'm')
  return `${Math.max(1, Math.floor(value / MINUTE))}m`
}

// Mirrors the admin overdue rule: open reports are due after the urgency-specific response window.
export function reportDeadline(report: DeadlineReport, settings: DeadlineSettings, now = Date.now()): DeadlineState | undefined {
  if (!isOpenStatus(report.status)) return undefined
  const created = new Date(report.createdAt).getTime()
  if (Number.isNaN(created)) return undefined
  const windowMs = (report.urgency === 'High' ? settings.high_urgency_sla_hours : settings.response_sla_hours) * HOUR
  const remainingMs = created + windowMs - now
  const overdue = remainingMs <= 0
  const soon = !overdue && remainingMs <= Math.min(windowMs * 0.25, 4 * HOUR)
  return { overdue, soon, remainingMs, label: overdue ? `Overdue ${formatCountdown(remainingMs)}` : `Due in ${formatCountdown(remainingMs)}` }
}
