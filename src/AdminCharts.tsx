import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BarChart3, RotateCcw, Table2, TrendingUp } from 'lucide-react'
import { AnimatedNumber } from './AnimatedNumber'
import type { ChartDatum } from './lib/report-analytics'

type TrendDay = ChartDatum & { date: string }

export function ChartEmpty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return <div className="chart-empty" role="status">{icon ?? <BarChart3 size={20} aria-hidden="true" />}<strong>{title}</strong>{hint && <span>{hint}</span>}</div>
}

export function ChartSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="chart-skeleton" role="status" aria-busy="true"><span className="sr-only">Loading chart…</span>
    {Array.from({ length: rows }, (_, index) => <div className="chart-skeleton-row" aria-hidden="true" key={index}><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line" style={{ width: `${88 - index * 13}%` }} /></div>)}
  </div>
}

function ViewToggle({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  return <button className="chart-view-toggle" type="button" aria-pressed={asTable} onClick={onToggle}>{asTable ? <BarChart3 size={13} /> : <Table2 size={13} />}{asTable ? 'View as chart' : 'View as table'}</button>
}

function ChartTable({ caption, headings, rows }: { caption: string; headings: string[]; rows: ReactNode[][] }) {
  return <div className="chart-table-wrap"><table className="chart-table"><caption className="sr-only">{caption}</caption>
    <thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
    <tbody>{rows.map((cells, index) => <tr key={index}>{cells.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
  </table></div>
}

export function AdminBarChart({ title, description, data, loading = false }: { title: string; description: string; data: ChartDatum[]; loading?: boolean }) {
  const [asTable, setAsTable] = useState(false)
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const maximum = Math.max(1, ...data.map((item) => item.value))
  const empty = !loading && total === 0
  return <article className="analytics-chart" aria-busy={loading}>
    <div className="analytics-chart-heading"><div><strong>{title}</strong><span>{description}</span></div>
      <div className="chart-heading-tools">
        {!loading && !empty && <ViewToggle asTable={asTable} onToggle={() => setAsTable((current) => !current)} />}
        <span className="analytics-total"><b>{loading ? '–' : <AnimatedNumber value={total} />}</b> reports</span>
      </div>
    </div>
    {loading ? <ChartSkeleton /> : empty ? <ChartEmpty title="No reports yet" hint="Counts appear here as soon as reports are submitted." /> : asTable
      ? <ChartTable caption={title} headings={[title.replace(/^Reports by /, '').replace(/^./, (letter) => letter.toUpperCase()), 'Reports', 'Share']} rows={data.map((item) => [item.label, item.value, `${Math.round((item.value / total) * 100)}%`])} />
      : <div className="category-bars" role="list" aria-label={title}>
        {data.map((item, index) => <div className="category-row" role="listitem" key={item.label} aria-label={`${item.label}: ${item.value} reports`} style={{ '--i': index } as CSSProperties}>
          <span title={item.label}>{item.label}</span>
          <i><b style={{ width: `${(item.value / maximum) * 100}%` }} /></i>
          <strong>{item.value}</strong>
        </div>)}
      </div>}
  </article>
}

function formatDay(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, options)
}

const RANGE_PRESETS = [7, 14, 30, 90] as const
type Brush = { from: number; to: number }

export function AdminTrendChart({ daily, loading = false }: { daily: TrendDay[]; loading?: boolean }) {
  const [range, setRange] = useState<(typeof RANGE_PRESETS)[number]>(14)
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null)
  const [brush, setBrush] = useState<Brush | null>(null)
  const [compare, setCompare] = useState(false)
  const [asTable, setAsTable] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const barsRef = useRef<HTMLDivElement>(null)

  const base = Math.max(0, daily.length - range)
  const startAbs = base + (zoom?.start ?? 0)
  const endAbs = base + (zoom?.end ?? range - 1)
  const length = Math.max(0, endAbs - startAbs + 1)
  const data = daily.slice(startAbs, endAbs + 1)
  const previous = startAbs - length >= 0 ? daily.slice(startAbs - length, startAbs) : []
  const periodLabel = zoom ? `${length} selected days` : `last ${length} days`
  const labelStep = length > 45 ? 14 : length > 20 ? 5 : 1
  const showCounts = length <= 14
  const total = data.reduce((sum, day) => sum + day.value, 0)
  const previousTotal = previous.reduce((sum, day) => sum + day.value, 0)
  const showCompare = compare && previous.length === data.length
  const maximum = Math.max(1, ...data.map((day) => day.value), ...(showCompare ? previous.map((day) => day.value) : []))
  const delta = total - previousTotal
  const empty = !loading && total === 0 && previousTotal === 0
  const activeDay = active === null ? undefined : data[active]
  const activePrevious = active === null || !showCompare ? undefined : previous[active]
  const edge = active === null ? '' : active <= 1 ? 'is-start' : active >= data.length - 2 ? 'is-end' : ''
  const dayLabel = (day: TrendDay, index: number) => length <= 14 ? day.label : index % labelStep === 0 ? formatDay(day.date, { month: 'short', day: 'numeric' }) : ''

  const indexAt = (clientX: number) => {
    const rect = barsRef.current?.getBoundingClientRect()
    if (!rect || !rect.width) return 0
    return Math.min(length - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * length)))
  }
  const finishBrush = () => {
    if (brush && brush.from !== brush.to) {
      const start = Math.min(brush.from, brush.to)
      const end = Math.max(brush.from, brush.to)
      setZoom({ start: (zoom?.start ?? 0) + start, end: (zoom?.start ?? 0) + end })
      setActive(null)
    }
    setBrush(null)
  }

  return <article className="analytics-chart admin-trend-chart" aria-busy={loading}>
    <div className="analytics-chart-heading"><div><strong>Reports over time</strong><span>Daily submissions over the {periodLabel}</span></div>
      <div className="chart-heading-tools">
        {!loading && <div className="chart-range" role="group" aria-label="Date range">
          {RANGE_PRESETS.map((preset) => <button key={preset} type="button" aria-pressed={range === preset && !zoom} onClick={() => { setRange(preset); setZoom(null) }}>{preset}d</button>)}
        </div>}
        {!loading && !empty && <>
          {zoom && <button className="chart-view-toggle" type="button" onClick={() => setZoom(null)}><RotateCcw size={13} />Reset zoom</button>}
          <button className="chart-view-toggle" type="button" aria-pressed={compare} onClick={() => setCompare((current) => !current)}><TrendingUp size={13} />Compare previous {length} days</button>
          <ViewToggle asTable={asTable} onToggle={() => setAsTable((current) => !current)} />
        </>}
        <span className="analytics-total"><b>{loading ? '–' : <AnimatedNumber value={total} />}</b> reports{showCompare && <em className={`trend-delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}>{delta === 0 ? 'no change' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} vs previous`}</em>}</span>
      </div>
    </div>
    {loading ? <ChartSkeleton rows={3} /> : empty ? <ChartEmpty icon={<TrendingUp size={20} aria-hidden="true" />} title={`No reports in the ${periodLabel}`} hint="Daily submissions will chart here once reports come in." /> : asTable
      ? <ChartTable caption={`Reports submitted per day over the ${periodLabel}`} headings={showCompare ? ['Date', 'Reports', 'Previous period'] : ['Date', 'Reports']} rows={data.map((day, index) => showCompare ? [formatDay(day.date), day.value, `${previous[index].value} (${formatDay(previous[index].date, { month: 'short', day: 'numeric' })})`] : [formatDay(day.date), day.value])} />
      : <div className="admin-trend-plot" onMouseLeave={() => { setActive(null); finishBrush() }}>
        {activeDay && !brush && <i className="trend-crosshair" style={{ left: `${((active ?? 0) + 0.5) / data.length * 100}%` }} aria-hidden="true" />}
        {brush && <i className="trend-brush" aria-hidden="true" style={{ left: `${Math.min(brush.from, brush.to) / length * 100}%`, width: `${(Math.abs(brush.to - brush.from) + 1) / length * 100}%` }} />}
        {activeDay && !brush && <div className={`trend-tooltip ${edge}`} style={{ left: `${((active ?? 0) + 0.5) / data.length * 100}%` }} role="status">
          <strong>{formatDay(activeDay.date)}</strong>
          <span><b>{activeDay.value}</b> {activeDay.value === 1 ? 'report' : 'reports'}</span>
          {activePrevious && <small>{activePrevious.value} on {formatDay(activePrevious.date, { month: 'short', day: 'numeric' })}</small>}
        </div>}
        <div className="admin-trend-bars" ref={barsRef} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))`, gap: length > 30 ? 1 : undefined }} role="list" aria-label={`Reports submitted per day over the ${periodLabel}`}
          onPointerDown={(event) => { if (event.pointerType === 'mouse' && event.button !== 0) return; const index = indexAt(event.clientX); setBrush({ from: index, to: index }) }}
          onPointerMove={(event) => { if (brush) setBrush({ from: brush.from, to: indexAt(event.clientX) }) }}
          onPointerUp={finishBrush}>
          {data.map((day, index) => <div className={`admin-trend-day ${active === index ? 'is-active' : ''}`} role="listitem" tabIndex={0} key={day.date} aria-label={`${day.date}: ${day.value} reports${showCompare ? `, ${previous[index].value} in the previous period` : ''}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}>
            <small>{showCounts ? day.value || '' : ''}</small>
            <span className="admin-trend-track">
              <b style={{ height: `${Math.max(day.value ? 4 : 0, (day.value / maximum) * 100)}%` }} />
              {showCompare && <em className="trend-previous-mark" style={{ bottom: `${(previous[index].value / maximum) * 100}%` }} />}
            </span>
            <small className="trend-day-label">{dayLabel(day, index)}</small>
          </div>)}
        </div>
        <p className="trend-hint">Drag across the bars to zoom into a period.</p>
      </div>}
    {showCompare && !asTable && !empty && !loading && <p className="trend-legend"><i className="legend-current" />This period<i className="legend-previous" />Same day, previous period</p>}
  </article>
}
