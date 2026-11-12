import { Check, Clock3 } from 'lucide-react'
import { escalationReport, orderEscalations, type SlaEscalation } from './lib/sla-escalations'

const formatEscalatedAt = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type EscalationListProps = {
  items: readonly SlaEscalation[]
  limit: number
  emptyText: string
  canAcknowledge: (item: SlaEscalation) => boolean
  onAcknowledge: (item: SlaEscalation) => void
  /** Opens the escalated report; the title becomes a link-style button when given. */
  onOpen?: (reportId: string) => void
}

/** Deadline escalations: open ones first, each with its stage, report, time, and an acknowledge action. */
export function EscalationList({ items, limit, emptyText, canAcknowledge, onAcknowledge, onOpen }: EscalationListProps) {
  const shown = orderEscalations(items).slice(0, limit)
  if (!shown.length) return <p className="workflow-hint">{emptyText}</p>
  return <ul className="escalation-list">
    {shown.map((item) => {
      const report = escalationReport(item)
      const title = report?.title || 'Untitled report'
      const acknowledged = Boolean(item.acknowledged_at)
      return <li key={`${item.report_id}-${item.stage}`} className={`escalation-item stage-${item.stage >= 2 ? 2 : 1}${acknowledged ? ' is-acknowledged' : ''}`}>
        <span className="escalation-stage">Stage {item.stage}</span>
        <span className="escalation-body">
          {onOpen
            ? <button className="escalation-title" type="button" onClick={() => onOpen(item.report_id)}>{title}</button>
            : <strong className="escalation-title">{title}</strong>}
          <small className="escalation-meta"><Clock3 size={12} aria-hidden="true" />Escalated {formatEscalatedAt(item.escalated_at)}{report?.status ? ` · ${report.status}` : ''}</small>
        </span>
        {acknowledged
          ? <span className="escalation-done"><Check size={13} aria-hidden="true" />Acknowledged</span>
          : canAcknowledge(item)
            ? <button className="secondary-button escalation-action" type="button" onClick={() => onAcknowledge(item)}>Acknowledge</button>
            : <span className="escalation-waiting">Needs acknowledgement</span>}
      </li>
    })}
  </ul>
}
