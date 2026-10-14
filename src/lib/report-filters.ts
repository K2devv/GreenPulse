export const DISTRICT_5_BARANGAYS = [
  'Bagbag',
  'Capri',
  'Fairview',
  'Greater Lagro',
  'Gulod',
  'Kaligayahan',
  'Nagkaisang Nayon',
  'North Fairview',
  'Novaliches Proper',
  'Pasong Putik Proper',
  'San Agustin',
  'San Bartolome',
  'Santa Lucia',
  'Santa Monica',
] as const

export function detectBarangay(text: string) {
  const lowered = text.toLowerCase()
  return [...DISTRICT_5_BARANGAYS].sort((a, b) => b.length - a.length).find((barangay) => lowered.includes(barangay.toLowerCase()))
}

export const UNASSIGNED = 'unassigned'
export const NO_BARANGAY = 'none'

export type ReportFilters = {
  query: string
  status: string
  category: string
  urgency: string
  barangay: string
  assignee: string
  team: string
  resolution: string
  dateFrom: string
  dateTo: string
}

export const defaultReportFilters: ReportFilters = {
  query: '',
  status: 'open',
  category: '',
  urgency: '',
  barangay: '',
  assignee: '',
  team: '',
  resolution: '',
  dateFrom: '',
  dateTo: '',
}

export type FilterableReport = {
  id: string
  title: string
  description: string
  category: string
  issueType?: string
  status: string
  urgency: string
  location: string
  barangay?: string
  createdAt: string
  reporterName?: string
  assignedTo?: string
  assignedTeamId?: string
}

export type FilterLookup = {
  people: ReadonlyMap<string, string>
  teams: ReadonlyMap<string, string>
}

const closedStatuses = ['Resolved', 'Rejected', 'Closed']
const resolutionStages: Record<string, (status: string) => boolean> = {
  unresolved: (status) => !['Awaiting verification', ...closedStatuses].includes(status),
  awaiting: (status) => status === 'Awaiting verification',
  resolved: (status) => status === 'Resolved',
  closed: (status) => status === 'Closed',
}

export function formatReportId(id: string) {
  return id.length > 12 ? `#${id.slice(0, 8).toUpperCase()}` : id.replace('GP-', '#')
}

export function countActiveFilters(filters: ReportFilters) {
  const { query, status, ...rest } = filters
  return Object.values(rest).filter(Boolean).length + (status !== defaultReportFilters.status ? 1 : 0) + (query.trim() ? 1 : 0)
}

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date.getTime()
}

function endOfDay(value: string) {
  const date = new Date(`${value}T23:59:59.999`)
  return Number.isNaN(date.getTime()) ? undefined : date.getTime()
}

export function filterReports<T extends FilterableReport>(reports: readonly T[], filters: ReportFilters, lookup: FilterLookup): T[] {
  const tokens = filters.query.toLowerCase().split(/\s+/).map((token) => token.replace(/^#/, '')).filter(Boolean)
  const from = filters.dateFrom ? startOfDay(filters.dateFrom) : undefined
  const to = filters.dateTo ? endOfDay(filters.dateTo) : undefined

  return reports.filter((report) => {
    if (filters.status === 'open' ? closedStatuses.includes(report.status) : filters.status !== 'all' && report.status !== filters.status) return false
    if (filters.category && report.category !== filters.category) return false
    if (filters.urgency && report.urgency !== filters.urgency) return false
    if (filters.barangay === NO_BARANGAY ? Boolean(report.barangay) : filters.barangay && report.barangay !== filters.barangay) return false
    if (filters.assignee === UNASSIGNED ? Boolean(report.assignedTo) : filters.assignee && report.assignedTo !== filters.assignee) return false
    if (filters.team === UNASSIGNED ? Boolean(report.assignedTeamId) : filters.team && report.assignedTeamId !== filters.team) return false
    if (filters.resolution && !resolutionStages[filters.resolution]?.(report.status)) return false

    if (from !== undefined || to !== undefined) {
      const created = new Date(report.createdAt).getTime()
      if (Number.isNaN(created) || (from !== undefined && created < from) || (to !== undefined && created > to)) return false
    }

    if (!tokens.length) return true
    const haystack = [
      report.id,
      formatReportId(report.id),
      report.title,
      report.description,
      report.reporterName,
      report.location,
      report.barangay,
      report.category,
      report.issueType,
      report.assignedTo ? lookup.people.get(report.assignedTo) : undefined,
      report.assignedTeamId ? lookup.teams.get(report.assignedTeamId) : undefined,
    ].filter(Boolean).join(' ').toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}
