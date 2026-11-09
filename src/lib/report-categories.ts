export const reportCategories = ['Waste', 'Pollution', 'Flooding', 'Drainage'] as const

export type ReportCategory = typeof reportCategories[number]

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === 'string' && reportCategories.includes(value as ReportCategory)
}
