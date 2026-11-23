import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, ChevronRight, Clock3, MapPin, Search, X, type LucideIcon } from 'lucide-react'
import { EmptyIllustration } from './EmptyIllustration'
import { formatReportId } from './lib/report-filters'
import { t } from './lib/i18n'

export type StatReportRow = {
  id: string
  title: string
  category: string
  status: string
  urgent: boolean
  place: string
  createdLabel: string
  icon: LucideIcon
  /** The category's color, for the row's icon tile. */
  color: string
}

type StatReportsModalProps = {
  icon: LucideIcon
  /** The tile's accent, carried over to the heading. */
  tone: 'leaf' | 'sky' | 'amber' | 'coral'
  eyebrow: string
  title: string
  description: string
  rows: StatReportRow[]
  loading: boolean
  onSelect: (id: string) => void
  onClose: () => void
  /** A secondary action in the footer, such as showing the same reports on the map. */
  action?: { label: string; run: () => void }
}

/** Rows before the search box is worth showing. */
const SEARCH_FROM = 7

/** The reports behind one of the hero's stat tiles, opened from the tile as a dialog. */
export function StatReportsModal({ icon: Icon, tone, eyebrow, title, description, rows, loading, onSelect, onClose, action }: StatReportsModalProps) {
  const [query, setQuery] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  // Keyboard focus moves into the dialog and goes back to the tile when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    // Without scrolling: choosing a report moves the page to that report, not back to the tile.
    return () => opener?.focus({ preventScroll: true })
  }, [])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? rows.filter((row) => `${row.title} ${row.category} ${t(row.category)} ${row.place} ${row.status} ${t(row.status)} ${row.id}`.toLowerCase().includes(needle)) : rows
  }, [query, rows])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`report-modal stat-modal tone-${tone}`} role="dialog" aria-modal="true" aria-labelledby="stat-modal-title" tabIndex={-1} ref={dialogRef}>
      <header className="stat-modal-header">
        <span className="stat-modal-icon" aria-hidden="true"><Icon size={20} /></span>
        <div className="stat-modal-title">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="stat-modal-title">{title}<span className="count-badge">{loading ? '…' : rows.length}</span></h2>
          <p>{description}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={t('Close {title}', { title: title.toLowerCase() })}><X size={19} /></button>
      </header>
      {rows.length >= SEARCH_FROM && <label className="search-box stat-modal-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search these reports')} aria-label={t('Search these reports')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={t('Clear search')}><X size={14} /></button>}</label>}
      <div className="stat-modal-list">
        {loading ? <p className="stat-modal-note" role="status">{t('Loading reports…')}</p> : visible.length === 0 ? <div className="empty-state">
          <EmptyIllustration variant="search" />
          <strong>{rows.length ? t('No matching reports') : t('Nothing here right now')}</strong>
          <span>{rows.length ? t('Try a different search.') : t('Reports will appear here as soon as they match.')}</span>
        </div> : <ul>
          {visible.map((row, index) => <li key={row.id} style={{ '--i': Math.min(index, 12) } as CSSProperties}>
            <button className="stat-row" type="button" onClick={() => onSelect(row.id)} style={{ '--cat': row.color } as CSSProperties}>
              <span className="stat-row-icon" aria-hidden="true"><row.icon size={17} /></span>
              <span className="stat-row-copy">
                <strong>{row.title}</strong>
                <span className="stat-row-meta"><span>{formatReportId(row.id)}</span><span><MapPin size={11} aria-hidden="true" />{row.place}</span><span><Clock3 size={11} aria-hidden="true" />{row.createdLabel}</span></span>
                <span className="stat-row-tags">
                  <span className={`status-pill status-${row.status.toLowerCase().replace(/ /g, '-')}`}><i />{t(row.status)}</span>
                  {row.urgent && <span className="urgency-pill"><AlertTriangle size={11} aria-hidden="true" />{t('Urgent')}</span>}
                </span>
              </span>
              <ChevronRight className="stat-row-go" size={16} aria-hidden="true" />
            </button>
          </li>)}
        </ul>}
      </div>
      <footer className="stat-modal-footer">
        <span>{rows.length ? t('Select a report to open it.') : ''}</span>
        <div>
          {action && rows.length > 0 && <button className="secondary-button" type="button" onClick={action.run}>{action.label}</button>}
          <button className="primary-button" type="button" onClick={onClose}>{t('Done')}</button>
        </div>
      </footer>
    </section>
  </div>
}
