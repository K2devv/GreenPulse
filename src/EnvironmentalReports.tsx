import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, TrendingUp } from 'lucide-react'
import { buildSummaryCsv, buildSummaryHtml } from './lib/report-export'
import { DESCRIPTIVE_NOTE, FOCUS_LABELS, buildEnvironmentalSummary, formatDuration, localDateInput, resolveRange, type Count, type SummaryFocus, type SummaryPeriod, type SummaryReport } from './lib/report-summary'

const PERIODS: { value: SummaryPeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom range' },
]

function BreakdownTable({ title, entries }: { title: string; entries: Count[] }) {
  const max = Math.max(1, ...entries.map((entry) => entry.value))
  return <article className="analytics-chart summary-table">
    <div className="analytics-chart-heading"><div><strong>{title}</strong></div></div>
    <ul>{entries.map((entry) => <li key={entry.label}><span>{entry.label}</span><i><b style={{ width: `${(entry.value / max) * 100}%` }} /></i><strong>{entry.value}</strong></li>)}</ul>
  </article>
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function printHtml(html: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  frame.srcdoc = html
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 60_000)
  }
  document.body.append(frame)
}

export function EnvironmentalReports({ reports }: { reports: readonly SummaryReport[] }) {
  const [period, setPeriod] = useState<SummaryPeriod>('weekly')
  const [focus, setFocus] = useState<SummaryFocus>('overview')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(() => localDateInput(new Date()))
  const range = useMemo(() => resolveRange(period, new Date(), { from, to }), [period, from, to])
  const summary = useMemo(() => 'error' in range ? undefined : buildEnvironmentalSummary(reports, range, focus), [range, reports, focus])

  const exportName = `greenpulse-${focus}-${localDateInput(new Date())}`

  return <section className="env-reports" aria-label="Environmental reports">
    <div className="analytics-heading">
      <div><p className="eyebrow">ENVIRONMENTAL REPORTS</p><h2>Generate a summary report</h2></div>
      <div className="analytics-heading-actions">
        <button className="secondary-button" type="button" disabled={!summary} onClick={() => summary && printHtml(buildSummaryHtml(summary, new Date()))}><FileText size={14} /> Export PDF</button>
        <button className="secondary-button" type="button" disabled={!summary} onClick={() => summary && download(`${exportName}.csv`, buildSummaryCsv(summary, new Date()), 'text/csv;charset=utf-8')}><FileSpreadsheet size={14} /> Export Excel / CSV</button>
      </div>
    </div>
    <div className="env-controls">
      <label className="filter-field"><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as SummaryPeriod)}>{PERIODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
      <label className="filter-field"><span>Report type</span><select value={focus} onChange={(event) => setFocus(event.target.value as SummaryFocus)}>{(Object.keys(FOCUS_LABELS) as SummaryFocus[]).map((key) => <option key={key} value={key}>{FOCUS_LABELS[key]}</option>)}</select></label>
      {period === 'custom' && <>
        <label className="filter-field"><span>From</span><input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="filter-field"><span>To</span><input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
      </>}
    </div>
    {!summary ? <p className="form-error" role="status">{'error' in range ? range.error : ''}</p> : <>
      <p className="env-period">{summary.range.label} · {FOCUS_LABELS[summary.focus]}</p>
      <div className="admin-metrics-grid env-metrics">
        {[
          { label: 'Total reports', value: summary.total },
          { label: 'Resolution rate', value: `${Math.round(summary.resolutionRate)}%` },
          { label: 'Avg. response time', value: formatDuration(summary.averageResponseMs) },
          { label: 'Avg. resolution time', value: formatDuration(summary.averageResolutionMs) },
        ].map((metric) => <article className="admin-metric" key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></article>)}
      </div>
      <article className="analytics-chart env-trends">
        <div className="analytics-chart-heading"><div><strong>Trends</strong><span>{DESCRIPTIVE_NOTE}</span></div><TrendingUp size={17} /></div>
        <ul>{summary.trends.map((trend) => <li key={trend}>{trend}</li>)}</ul>
      </article>
      <div className="env-tables">
        <BreakdownTable title="Categories" entries={summary.byCategory} />
        <BreakdownTable title="Barangays" entries={summary.byBarangay} />
        <BreakdownTable title="Status" entries={summary.byStatus.filter((entry) => entry.value > 0)} />
        <BreakdownTable title="Urgency" entries={summary.byUrgency} />
        <BreakdownTable title="Top locations" entries={summary.byLocation} />
      </div>
    </>}
  </section>
}
