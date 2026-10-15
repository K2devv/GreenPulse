import { DESCRIPTIVE_NOTE, FOCUS_LABELS, formatDuration, type EnvironmentalSummary } from './report-summary'

// Prefixing risky leading characters stops spreadsheet apps from running user text as a formula.
export function csvCell(value: string | number | undefined) {
  if (value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const csvRow = (cells: (string | number | undefined)[]) => cells.map(csvCell).join(',')

export function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const percent = (value: number) => `${Math.round(value)}%`

function metrics(summary: EnvironmentalSummary): [string, string | number][] {
  return [
    ['Total reports', summary.total],
    ['Resolved reports', summary.resolved],
    ['Resolution rate', percent(summary.resolutionRate)],
    ['Average response time (submitted to assigned)', formatDuration(summary.averageResponseMs)],
    ['Average resolution time', formatDuration(summary.averageResolutionMs)],
    ['Reports in previous period', summary.previousTotal],
  ]
}

function breakdowns(summary: EnvironmentalSummary): [string, { label: string; value: number }[]][] {
  return [
    ['Categories', summary.byCategory],
    ['Status', summary.byStatus],
    ['Urgency', summary.byUrgency],
    ['Barangays', summary.byBarangay],
    ['Top locations', summary.byLocation],
  ]
}

export function buildSummaryCsv(summary: EnvironmentalSummary, generatedAt: Date) {
  const lines: string[] = [
    csvRow(['GreenPulse environmental report']),
    csvRow(['Report type', FOCUS_LABELS[summary.focus]]),
    csvRow(['Period', summary.range.label]),
    csvRow(['Generated', generatedAt.toISOString()]),
    '',
    csvRow(['Summary']),
    ...metrics(summary).map(([label, value]) => csvRow([label, value])),
    '',
    csvRow(['Trends']),
    ...summary.trends.map((trend) => csvRow([trend])),
    csvRow([DESCRIPTIVE_NOTE]),
  ]
  for (const [title, entries] of breakdowns(summary)) {
    lines.push('', csvRow([title, 'Reports']), ...entries.map((entry) => csvRow([entry.label, entry.value])))
  }
  lines.push('', csvRow(['Report ID', 'Title', 'Category', 'Status', 'Urgency', 'Barangay', 'Location', 'Submitted', 'Assigned', 'Resolved']))
  for (const report of summary.rows) {
    lines.push(csvRow([report.id ? report.id.slice(0, 8).toUpperCase() : '', report.title, report.category, report.status, report.urgency, report.barangay, report.location, report.createdAt, report.assignedAt, report.resolvedAt]))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function buildSummaryHtml(summary: EnvironmentalSummary, generatedAt: Date) {
  const table = (title: string, entries: { label: string; value: string | number }[]) => `<h2>${escapeHtml(title)}</h2><table><tbody>${entries.map((entry) => `<tr><td>${escapeHtml(entry.label)}</td><td class="n">${entry.value}</td></tr>`).join('')}</tbody></table>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>GreenPulse environmental report</title><style>
body{font:13px/1.45 system-ui,sans-serif;color:#1e2a22;margin:28px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;color:#2e6947}
p,li{margin:3px 0}table{border-collapse:collapse;width:100%}td,th{padding:4px 6px;border-bottom:1px solid #dde3da;text-align:left;font-size:12px}.n{text-align:right;width:70px}
.note{color:#6a746b;font-size:12px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}</style></head><body>
<h1>GreenPulse environmental report</h1>
<p>${escapeHtml(FOCUS_LABELS[summary.focus])} · ${escapeHtml(summary.range.label)}</p>
<p class="note">Generated ${escapeHtml(generatedAt.toLocaleString())}</p>
${table('Summary', metrics(summary).map(([label, value]) => ({ label, value })))}
<h2>Trends</h2><ul>${summary.trends.map((trend) => `<li>${escapeHtml(trend)}</li>`).join('')}</ul><p class="note">${escapeHtml(DESCRIPTIVE_NOTE)}</p>
<div class="cols"><div>${table('Categories', summary.byCategory)}${table('Status', summary.byStatus)}${table('Urgency', summary.byUrgency)}</div><div>${table('Barangays', summary.byBarangay)}${table('Top locations', summary.byLocation)}</div></div>
</body></html>`
}
