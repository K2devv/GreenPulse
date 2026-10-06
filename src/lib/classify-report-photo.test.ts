import { describe, expect, it } from 'vitest'
import { isReportCategory, issueTypesByCategory, reportCategories } from './classify-report-photo'

describe('isReportCategory', () => {
  it('accepts each report category', () => {
    for (const category of reportCategories) expect(isReportCategory(category)).toBe(true)
  })

  it('provides the expected issue types for each category', () => {
    expect(Object.keys(issueTypesByCategory)).toEqual(reportCategories)
    expect(issueTypesByCategory.Waste).toContain('Illegal dumping')
    expect(issueTypesByCategory.Pollution).toContain('Noise pollution')
    expect(issueTypesByCategory.Flooding).toContain('Flash flood')
    expect(issueTypesByCategory.Drainage).toContain('Blocked canal')
    expect(issueTypesByCategory.Drainage).toContain('Other drainage issue')
  })

  it('rejects unknown and non-string model output', () => {
    expect(isReportCategory('Storm')).toBe(false)
    expect(isReportCategory(null)).toBe(false)
    expect(isReportCategory({ category: 'Flooding' })).toBe(false)
  })
})