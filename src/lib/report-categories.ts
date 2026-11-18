export const reportCategories = ['Waste', 'Pollution', 'Flooding', 'Drainage'] as const

export type ReportCategory = typeof reportCategories[number]

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === 'string' && reportCategories.includes(value as ReportCategory)
}

/** Common issue types per category: offered as suggestions in the report form, and filled in from photos. */
export const issueTypesByCategory: Record<ReportCategory, readonly string[]> = {
  Waste: ['Illegal dumping', 'Uncollected garbage', 'Overflowing trash bins', 'Improper waste segregation', 'Plastic waste', 'Hazardous waste', 'Other waste issue'],
  Pollution: ['Air pollution', 'Water pollution', 'Smoke', 'Foul odor', 'Chemical contamination', 'Noise pollution', 'Other pollution'],
  Flooding: ['Flooded road', 'Flooded residential area', 'Rising water', 'Drainage overflow', 'Flash flood', 'Other flooding issue'],
  Drainage: ['Clogged drainage', 'Damaged drainage', 'Blocked canal', 'Overflowing canal', 'Poor drainage', 'Other drainage issue'],
}
