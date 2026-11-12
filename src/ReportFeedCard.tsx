import { Fragment, type CSSProperties } from 'react'
import { Check, Clock3, Eye, MapPin, MessageSquare, type LucideIcon } from 'lucide-react'
import { formatReportId } from './lib/report-filters'
import { PROGRESS_STEPS, publicProgressEvents, reportProgressStep } from './lib/report-progress'
import type { ReportEngagement } from './lib/report-engagement'
import { CommunityComments } from './ReportCommunication'

export type FeedCardReport = {
  id: string
  title: string
  category: string
  status: string
  urgency: string
  description: string
  reporterName?: string
}

export type ConfirmState = 'idle' | 'busy' | 'done'

type ReportFeedCardProps = {
  report: FeedCardReport
  icon: LucideIcon
  color: string
  place: string
  createdLabel: string
  selected: boolean
  statusChanged: boolean
  engagement?: ReportEngagement
  canConfirm: boolean
  confirmState: ConfirmState
  userId?: string
  canComment: boolean
  onToggle: () => void
  onConfirm: () => void
  onDiscuss: () => void
  onSignIn: () => void
  onCommentPosted: () => void
}

/** How many of the newest comments an expanded card shows before linking to the full discussion. */
const INLINE_COMMENTS = 3

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function reporterLabel(name: string | undefined) {
  if (!name) return 'a resident'
  return name === 'Guest reporter' ? 'a guest' : name
}

export function ReportFeedCard({ report, icon: Icon, color, place, createdLabel, selected, statusChanged, engagement, canConfirm, confirmState, userId, canComment, onToggle, onConfirm, onDiscuss, onSignIn, onCommentPosted }: ReportFeedCardProps) {
  const step = reportProgressStep(report.status)
  const detailId = `report-detail-${report.id}`
  return <article
    className={`feed-card ${selected ? 'is-selected' : ''}`}
    data-flip-id={report.id}
    data-status={report.status.toLowerCase().replace(/ /g, '-')}
    style={{ '--cat': color } as CSSProperties}
  >
    <button type="button" className="feed-card-main" aria-expanded={selected} aria-controls={selected ? detailId : undefined} onClick={onToggle}>
      <span className="feed-card-tile" aria-hidden="true"><Icon size={20} /></span>
      <span className="feed-card-eyebrow">{report.category}{report.urgency === 'High' && <span className="feed-card-urgent">Urgent</span>}</span>
      <span className="feed-card-id">{formatReportId(report.id)}</span>
      <span className="feed-card-title">{report.title}</span>
      <span className="feed-card-meta">
        <span><MapPin size={13} aria-hidden="true" />{place}</span>
        <span><Clock3 size={13} aria-hidden="true" />{createdLabel}</span>
      </span>
      <span className="feed-card-progress">
        {step !== null && <span className="feed-card-steps" aria-hidden="true">
          {PROGRESS_STEPS.map((label, index) => <Fragment key={label}>
            {index > 0 && <b className={index <= step ? 'is-done' : ''} />}
            <i className={index < step ? 'is-done' : index === step ? 'is-current' : ''} />
          </Fragment>)}
        </span>}
        <span key={report.status} className={`feed-card-status ${statusChanged ? 'pill-changed' : ''}`}>
          {report.status}{step !== null && <span className="sr-only">, step {step + 1} of {PROGRESS_STEPS.length}</span>}
        </span>
      </span>
      {engagement && <span className="feed-card-foot">
        <span><Eye size={14} aria-hidden="true" />{engagement.stillThere} still there</span>
        <span><MessageSquare size={14} aria-hidden="true" />{plural(engagement.comments, 'comment')}</span>
      </span>}
    </button>
    {selected && <div className="feed-card-detail" id={detailId}>
      {report.description && <p>{report.description}</p>}
      <ol className="feed-card-timeline" aria-label="Progress so far">
        <li><strong>Reported</strong> by {reporterLabel(report.reporterName)} · {createdLabel}</li>
        {publicProgressEvents(report.status).map((event) => <li key={event.title}><strong>{event.title}</strong> {event.detail}</li>)}
      </ol>
      {canConfirm && <div className="feed-card-actions">
        <button className={`secondary-button ${confirmState === 'done' ? 'is-confirmed' : ''}`} type="button" disabled={confirmState !== 'idle'} onClick={onConfirm}>
          {confirmState === 'done' ? <><Check size={15} aria-hidden="true" />You confirmed it</> : <><Eye size={15} aria-hidden="true" />{confirmState === 'busy' ? 'Saving…' : 'Still there'}</>}
        </button>
      </div>}
      <section className="feed-card-comments" aria-label={`Comments on ${report.title}`}>
        <h4><MessageSquare size={14} aria-hidden="true" />Comments{engagement ? ` (${engagement.comments})` : ''}</h4>
        <CommunityComments report={report} userId={userId} canComment={canComment} onSignIn={onSignIn} latest={INLINE_COMMENTS} onShowAll={onDiscuss} onPosted={onCommentPosted} compact />
      </section>
    </div>}
  </article>
}
