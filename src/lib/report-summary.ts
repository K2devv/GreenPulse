import { t, tn, dateLocale } from './i18n'
export type SummaryReport = {
  id?: string
  title?: string
  category: string
  status: string
  urgency: string
  location: string
  barangay?: string
  createdAt: string
  assignedAt?: string
  resolvedAt?: string
}

export type SummaryPeriod = 'daily' | 'weekly' | 'monthly' | 'custom'
export type SummaryFocus = 'overview' | 'category' | 'barangay' | 'resolution' | 'flood' | 'waste' | 'pollution'
export type SummaryRange = { start: Date; end: Date; label: string }
export type Count = { label: string; value: number }

export const FOCUS_LABELS: Record<SummaryFocus, string> = {
  overview: 'All reports',
  category: 'Category report',
  barangay: 'Barangay report',
  resolution: 'Resolution report',
  flood: 'Flood report',
  waste: 'Waste report',
  pollution: 'Pollution report',
}

export const DESCRIPTIVE_NOTE = 'These figures only describe the reports submitted in this period. They do not explain why numbers changed.'

const DAY_MS = 86_400_000
const FOCUS_CATEGORIES: Partial<Record<SummaryFocus, string[]>> = {
  flood: ['Flooding'],
  waste: ['Waste'],
  pollution: ['Pollution', 'Water pollution', 'Air pollution'],
}
const CATEGORIES = ['Waste', 'Pollution', 'Flooding', 'Drainage', 'Water pollution', 'Air pollution']
const STATUSES = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed', 'Duplicate']
const URGENCIES = ['High', 'Medium', 'Low']

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
const shortDate = (date: Date) => date.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getMonth() === Number(match[2]) - 1 ? date : undefined
}

function describe(start: Date, end: Date, name: string) {
  return `${name} (${start.getTime() === startOfDay(end).getTime() ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`})`
}

export function resolveRange(period: SummaryPeriod, now: Date, custom?: { from: string; to: string }): SummaryRange | { error: string } {
  const today = startOfDay(now)
  if (period === 'daily') return { start: today, end: endOfDay(now), label: describe(today, now, t('Daily report')) }
  if (period === 'weekly') {
    const start = new Date(today)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return { start, end: endOfDay(now), label: describe(start, now, t('Weekly report')) }
  }
  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start, end: endOfDay(now), label: describe(start, now, t('Monthly report')) }
  }
  const from = parseDateKey(custom?.from ?? '')
  const to = parseDateKey(custom?.to ?? '')
  if (!from || !to) return { error: t('Choose both a start and an end date.') }
  if (from > to) return { error: t('The start date must be on or before the end date.') }
  return { start: from, end: endOfDay(to), label: describe(from, to, t('Custom report')) }
}

function count(items: SummaryReport[], labelFor: (report: SummaryReport) => string | undefined, labels?: string[]): Count[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const label = labelFor(item)
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  if (labels) return labels.map((label) => ({ label, value: counts.get(label) ?? 0 }))
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function topLabels(counts: Count[]) {
  const max = Math.max(0, ...counts.map((entry) => entry.value))
  return max ? { max, labels: counts.filter((entry) => entry.value === max).map((entry) => entry.label) } : undefined
}

const joinNames = (names: string[]) => names.length < 3 ? names.join(` ${t('and')} `) : `${names.slice(0, -1).join(', ')}, ${t('and')} ${names[names.length - 1]}`

function averageMs(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined
}

function elapsed(from: string, to: string | undefined) {
  if (!to) return []
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  return Number.isNaN(start) || Number.isNaN(end) || end < start ? [] : [end - start]
}

function matchesFocus(report: SummaryReport, focus: SummaryFocus) {
  const categories = FOCUS_CATEGORIES[focus]
  if (categories) return categories.includes(report.category)
  if (focus === 'resolution') return report.status === 'Resolved' || report.status === 'Closed'
  return true
}

function inRange(report: SummaryReport, start: number, end: number) {
  const created = new Date(report.createdAt).getTime()
  return !Number.isNaN(created) && created >= start && created <= end
}

export function buildEnvironmentalSummary(reports: readonly SummaryReport[], range: SummaryRange, focus: SummaryFocus = 'overview') {
  const start = range.start.getTime()
  const end = range.end.getTime()
  const days = Math.max(1, Math.round((startOfDay(range.end).getTime() - startOfDay(range.start).getTime()) / DAY_MS) + 1)
  const previousStart = new Date(range.start)
  previousStart.setDate(previousStart.getDate() - days)

  const scoped = reports.filter((report) => matchesFocus(report, focus))
  const rows = scoped.filter((report) => inRange(report, start, end)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const previousTotal = scoped.filter((report) => inRange(report, previousStart.getTime(), start - 1)).length

  const byCategory = count(rows, (report) => report.category, CATEGORIES)
  const byBarangay = count(rows, (report) => report.barangay?.trim() || 'No barangay recorded')
  const byLocation = count(rows, (report) => report.location.trim() || 'Unknown location').slice(0, 10)
  const resolved = rows.filter((report) => report.status === 'Resolved').length
  const changePct = previousTotal > 0 ? ((rows.length - previousTotal) / previousTotal) * 100 : undefined

  const trends: string[] = []
  if (!rows.length) {
    trends.push(t('No reports were submitted in this period.'))
  } else {
    if (changePct !== undefined) {
      const rounded = Math.round(Math.abs(changePct))
      const vars = { days, previous: previousTotal, current: rows.length, percent: rounded }
      trends.push(rounded === 0
        ? tn('The number of reports was about the same as the previous {days} day ({previous}).', 'The number of reports was about the same as the previous {days} days ({previous}).', days, vars)
        : changePct > 0
          ? tn('Reports increased by {percent}% compared with the previous {days} day ({previous} to {current}).', 'Reports increased by {percent}% compared with the previous {days} days ({previous} to {current}).', days, vars)
          : tn('Reports decreased by {percent}% compared with the previous {days} day ({previous} to {current}).', 'Reports decreased by {percent}% compared with the previous {days} days ({previous} to {current}).', days, vars))
    } else {
      trends.push(t('There were no reports in the previous period to compare with.'))
    }
    const topCategory = topLabels(byCategory)
    if (topCategory) trends.push(t(topCategory.labels.length > 1 ? '{names} were the most reported categories ({max} of {total}).' : '{names} was the most reported category ({max} of {total}).', { names: joinNames(topCategory.labels.map((label) => t(label))), max: topCategory.max, total: rows.length }))
    const topBarangay = topLabels(byBarangay.filter((entry) => entry.label !== 'No barangay recorded'))
    if (topBarangay) trends.push(t('Barangay {names} had the most reports ({max}).', { names: joinNames(topBarangay.labels), max: topBarangay.max }))
    const wasteBarangay = topLabels(count(rows.filter((report) => report.category === 'Waste'), (report) => report.barangay?.trim() || undefined))
    if (wasteBarangay && focus !== 'waste') trends.push(t('Barangay {names} had the most waste reports ({max}).', { names: joinNames(wasteBarangay.labels), max: wasteBarangay.max }))
    else if (wasteBarangay) trends.push(t('Waste reports were most frequent in Barangay {names} ({max}).', { names: joinNames(wasteBarangay.labels), max: wasteBarangay.max }))
  }

  return {
    range,
    focus,
    days,
    total: rows.length,
    previousTotal,
    changePct,
    resolved,
    resolutionRate: rows.length ? (resolved / rows.length) * 100 : 0,
    averageResponseMs: averageMs(rows.flatMap((report) => elapsed(report.createdAt, report.assignedAt))),
    averageResolutionMs: averageMs(rows.filter((report) => report.status === 'Resolved').flatMap((report) => elapsed(report.createdAt, report.resolvedAt))),
    byCategory,
    byStatus: count(rows, (report) => report.status, STATUSES),
    byUrgency: count(rows, (report) => report.urgency, URGENCIES),
    byBarangay,
    byLocation,
    trends,
    rows,
  }
}

export type EnvironmentalSummary = ReturnType<typeof buildEnvironmentalSummary>

export function formatDuration(ms: number | undefined) {
  if (ms === undefined) return '—'
  if (ms < 3_600_000) return t('{count} min', { count: Math.max(1, Math.round(ms / 60_000)) })
  if (ms < DAY_MS) return t('{count} hr', { count: Math.round(ms / 3_600_000) })
  return t('{count} days', { count: (ms / DAY_MS).toFixed(1) })
}

export function localDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
