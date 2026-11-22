import { useState } from 'react'
import { Check, ChevronDown, Clock3 } from 'lucide-react'
import { escalationReport, orderEscalations, type SlaEscalation } from './lib/sla-escalations'
import { t, dateLocale } from './lib/i18n'

const formatEscalatedAt = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type EscalationListProps = {
  items: readonly SlaEscalation[]
  limit: number
  emptyText: string
  canAcknowledge: (item: SlaEscalation) => boolean
  onAcknowledge: (item: SlaEscalation) => void
  /** Opens the escalated report; the title becomes a link-style button when given. */
  onOpen?: (reportId: string) => void
  /** Keeps acknowledged escalations behind a "Show acknowledged" toggle, so open ones stand out. */
  collapseAcknowledged?: boolean
}

/** Deadline escalations: open ones first, each with its stage, report, time, and an acknowledge action. */
export function EscalationList({ items, limit, emptyText, canAcknowledge, onAcknowledge, onOpen, collapseAcknowledged = false }: EscalationListProps) {
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const ordered = orderEscalations(items).slice(0, limit)
  if (!ordered.length) return <p className="workflow-hint">{emptyText}</p>
  const acknowledgedCount = ordered.filter((item) => item.acknowledged_at).length
  const hideAcknowledged = collapseAcknowledged && !showAcknowledged
  const shown = hideAcknowledged ? ordered.filter((item) => !item.acknowledged_at) : ordered
  return <>
    {shown.length > 0 ? <ul className="escalation-list">
      {shown.map((item) => {
        const report = escalationReport(item)
        const title = report?.title || t('Untitled report')
        const acknowledged = Boolean(item.acknowledged_at)
        return <li key={`${item.report_id}-${item.stage}`} className={`escalation-item stage-${item.stage >= 2 ? 2 : 1}${acknowledged ? ' is-acknowledged' : ''}`}>
          <span className="escalation-stage">{t('Stage {stage}', { stage: item.stage })}</span>
          <span className="escalation-body">
            {onOpen
              ? <button className="escalation-title" type="button" onClick={() => onOpen(item.report_id)}>{title}</button>
              : <strong className="escalation-title">{title}</strong>}
            <small className="escalation-meta"><Clock3 size={12} aria-hidden="true" />{t('Escalated {time}', { time: formatEscalatedAt(item.escalated_at) })}{report?.status ? ` · ${t(report.status)}` : ''}</small>
          </span>
          {acknowledged
            ? <span className="escalation-done"><Check size={13} aria-hidden="true" />{t('Acknowledged')}</span>
            : canAcknowledge(item)
              ? <button className="secondary-button escalation-action" type="button" onClick={() => onAcknowledge(item)}>{t('Acknowledge')}</button>
              : <span className="escalation-waiting">{t('Needs acknowledgement')}</span>}
        </li>
      })}
    </ul> : <p className="workflow-hint">{t('Every escalation has been acknowledged.')}</p>}
    {collapseAcknowledged && acknowledgedCount > 0 && <button className="text-button escalation-toggle" type="button" aria-expanded={showAcknowledged} onClick={() => setShowAcknowledged((current) => !current)}>
      <ChevronDown size={14} aria-hidden="true" />{showAcknowledged ? t('Hide acknowledged') : t('Show {count} acknowledged', { count: acknowledgedCount })}
    </button>}
  </>
}
