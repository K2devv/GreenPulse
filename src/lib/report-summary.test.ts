import { describe, expect, it } from 'vitest'
import { buildSummaryCsv, csvCell, escapeHtml, buildSummaryHtml } from './report-export'
import { buildEnvironmentalSummary, resolveRange, type SummaryReport } from './report-summary'

const now = new Date(2026, 9, 15, 12)
const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString()
const report = (overrides: Partial<SummaryReport> = {}): SummaryReport => ({ category: 'Waste', status: 'Submitted', urgency: 'Medium', location: 'Main road', barangay: 'Bagong Silangan', createdAt: at(14), ...overrides })

describe('resolveRange', () => {
  it('builds daily, weekly, monthly and custom ranges', () => {
    const daily = resolveRange('daily', now)
    const weekly = resolveRange('weekly', now)
    const monthly = resolveRange('monthly', now)
    expect('error' in daily || daily.start.getDate()).toBe(15)
    expect('error' in weekly || weekly.start.getDate()).toBe(12)
    expect('error' in monthly || monthly.start.getDate()).toBe(1)
    expect(resolveRange('custom', now, { from: '2026-10-05', to: '2026-10-01' })).toEqual({ error: 'The start date must be on or before the end date.' })
    expect(resolveRange('custom', now, { from: '', to: '2026-10-01' })).toHaveProperty('error')
    expect(resolveRange('custom', now, { from: '2026-10-01', to: '2026-10-07' })).toMatchObject({ start: new Date(2026, 9, 1) })
  })
})

describe('buildEnvironmentalSummary', () => {
  const range = resolveRange('custom', now, { from: '2026-10-11', to: '2026-10-15' }) as Exclude<ReturnType<typeof resolveRange>, { error: string }>

  it('summarises the period and compares it with the previous one', () => {
    const summary = buildEnvironmentalSummary([
      report(),
      report({ category: 'Flooding', status: 'Resolved', createdAt: at(12), assignedAt: at(12, 11), resolvedAt: at(13, 9) }),
      report({ category: 'Flooding', barangay: 'Payatas', createdAt: at(13) }),
      report({ createdAt: at(8) }),
      report({ createdAt: at(1) }),
    ], range)
    expect(summary).toMatchObject({ total: 3, previousTotal: 1, resolved: 1, days: 5 })
    expect(summary.changePct).toBe(200)
    expect(summary.averageResponseMs).toBe(2 * 3_600_000)
    expect(summary.trends.join(' ')).toContain('increased by 200%')
    expect(summary.trends.join(' ')).toContain('Flooding was the most reported category')
    expect(summary.trends.join(' ')).toContain('Barangay Bagong Silangan had the most waste reports (1)')
  })

  it('applies focus filters and handles empty periods', () => {
    const reports = [report(), report({ category: 'Flooding' })]
    expect(buildEnvironmentalSummary(reports, range, 'flood').total).toBe(1)
    expect(buildEnvironmentalSummary(reports, range, 'resolution').total).toBe(0)
    const empty = buildEnvironmentalSummary([], range)
    expect(empty.trends).toEqual(['No reports were submitted in this period.'])
    expect(empty.changePct).toBeUndefined()
  })
})

describe('exports', () => {
  it('neutralises spreadsheet formulas and escapes csv and html', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell(-3)).toBe('-3')
    expect(escapeHtml('<img onerror="x">')).toBe('&lt;img onerror=&quot;x&quot;&gt;')
  })

  it('includes summary, breakdowns and report rows', () => {
    const range = resolveRange('daily', now) as Exclude<ReturnType<typeof resolveRange>, { error: string }>
    const summary = buildEnvironmentalSummary([report({ title: '<b>Pile</b>', createdAt: at(15) })], range)
    const csv = buildSummaryCsv(summary, now)
    expect(csv).toContain('Total reports,1')
    expect(csv).toContain('Report ID,Title')
    expect(csv).toContain('<b>Pile</b>')
    expect(buildSummaryHtml(summary, now)).toContain('GreenPulse environmental report')
  })
})
