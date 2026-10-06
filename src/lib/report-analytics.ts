export type AnalyticsReport = {
  category: string
  status: string
  urgency: string
  location: string
  createdAt: string
  assignedTo?: string
  resolvedAt?: string
}

export type ChartDatum = {
  label: string
  value: number
}

const pendingStatuses = new Set([
  'Submitted',
  'Under review',
  'Additional information requested',
  'Awaiting verification',
])

function validDate(value: string | undefined) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function countBy<T>(items: T[], labelFor: (item: T) => string, labels: string[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const label = labelFor(item)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return labels.map((label) => ({ label, value: counts.get(label) ?? 0 }))
}

export function buildReportAnalytics(reports: AnalyticsReport[], now = new Date()) {
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const datedReports = reports.flatMap((report) => {
    const createdAt = validDate(report.createdAt)
    return createdAt ? [{ report, createdAt }] : []
  })

  const dates = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (13 - index))
    const key = localDateKey(date)
    return {
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      value: datedReports.filter(({ createdAt }) => localDateKey(createdAt) === key).length,
      date: key,
    }
  })

  const resolvedDurations = reports.flatMap((report) => {
    if (report.status !== 'Resolved') return []
    const createdAt = validDate(report.createdAt)
    const resolvedAt = validDate(report.resolvedAt)
    if (!createdAt || !resolvedAt || resolvedAt < createdAt) return []
    return [resolvedAt.getTime() - createdAt.getTime()]
  })

  const locations = new Map<string, number>()
  for (const report of reports) {
    const label = report.location.trim() || 'Unknown location'
    locations.set(label, (locations.get(label) ?? 0) + 1)
  }
  const sortedLocations = [...locations].sort((first, second) => second[1] - first[1])
  const topLocations = sortedLocations.slice(0, 5).map(([label, value]) => ({ label, value }))
  if (sortedLocations.length > 5) {
    topLocations.push({
      label: 'Other locations',
      value: sortedLocations.slice(5).reduce((total, [, count]) => total + count, 0),
    })
  }

  const statusCounts = countBy(reports, (report) => report.status, [
    'Submitted',
    'Under review',
    'Additional information requested',
    'Verified',
    'In progress',
    'Awaiting verification',
    'Resolved',
    'Rejected',
    'Closed',
  ])

  return {
    total: reports.length,
    pending: reports.filter((report) => pendingStatuses.has(report.status)).length,
    verified: reports.filter((report) => report.status === 'Verified').length,
    assigned: reports.filter((report) => Boolean(report.assignedTo)).length,
    inProgress: reports.filter((report) => report.status === 'In progress').length,
    resolved: reports.filter((report) => report.status === 'Resolved').length,
    closed: reports.filter((report) => report.status === 'Closed').length,
    rejected: reports.filter((report) => report.status === 'Rejected').length,
    critical: reports.filter((report) => report.urgency === 'High').length,
    thisWeek: datedReports.filter(({ createdAt }) => createdAt >= weekStart && createdAt <= now).length,
    thisMonth: datedReports.filter(({ createdAt }) => createdAt >= monthStart && createdAt <= now).length,
    byCategory: countBy(reports, (report) => report.category, ['Waste', 'Pollution', 'Flooding', 'Drainage', 'Water pollution', 'Air pollution']),
    byStatus: statusCounts,
    byUrgency: countBy(reports, (report) => report.urgency, ['High', 'Medium', 'Low']),
    overTime: dates,
    byLocation: topLocations,
    resolutionRate: reports.length ? (reports.filter((report) => report.status === 'Resolved').length / reports.length) * 100 : 0,
    averageResolutionMs: resolvedDurations.length
      ? resolvedDurations.reduce((total, duration) => total + duration, 0) / resolvedDurations.length
      : undefined,
  }
}
