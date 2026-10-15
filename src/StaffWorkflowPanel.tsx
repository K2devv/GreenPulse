import { useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarDays, Camera, Check, ClipboardCheck, MapPin, ShieldCheck, UserRound, Users, X } from 'lucide-react'
import type { Team } from './lib/supabase'
import { formatDuration } from './lib/report-summary'
import { elapsedMs, responseStages, type StageEvent } from './lib/report-response-times'
import { needsImmediateAttention } from './lib/report-escalation'
import { formatReportId } from './lib/report-filters'
import {
  ASSIGNABLE_STATUSES,
  VERIFICATION_STATUSES,
  buildAssignmentUpdate,
  buildResolutionReview,
  buildResponderUpdate,
  buildVerificationUpdate,
  isOverdue,
  resolveReportReference,
  verificationState,
  type ResolutionReviewAction,
  type VerificationAction,
  type WorkflowResult,
} from './lib/report-workflow'

export type PanelReport = {
  id: string
  category: string
  urgency: string
  status: string
  coordinates: [number, number]
  assignedTo?: string
  assignedTeamId?: string
  resolutionNote?: string
  verifiedBy?: string
  verifiedAt?: string
  verificationNote?: string
  duplicateOf?: string
  assignedAt?: string
  dueDate?: string
  taskInstructions?: string
  taskPriority?: string
  resolutionPhotoPaths?: string[]
  resolutionDecision?: string
  resolutionReviewNote?: string
  resolutionReviewedBy?: string
  resolutionReviewedAt?: string
  createdAt?: string
  startedAt?: string
  resolvedAt?: string
  escalatedAt?: string
}

type PanelUser = { id: string; display_name: string; role: string }

export type StaffWorkflowPanelProps = {
  report: PanelReport
  role: 'responder' | 'admin'
  userId: string
  staffUsers: PanelUser[]
  teams: Team[]
  allReports: readonly { id: string; title: string }[]
  originalPhotoUrls: string[]
  resolutionPhotoUrls: string[]
  events?: StageEvent[]
  onSubmit: (payload: Record<string, unknown>, options?: { resolutionFiles?: File[] }) => Promise<string | undefined>
}

const categories = ['Waste', 'Pollution', 'Flooding', 'Drainage']
const MAX_RESOLUTION_PHOTOS = 5
const decisionLabels: Record<string, string> = { approved: 'Resolution approved', rejected: 'Resolution rejected', action_requested: 'Additional action requested' }

const formatDate = (value?: string) => value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
const formatDateTime = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function WorkflowCard({ step, title, icon, badge, children }: { step: number; title: string; icon: ReactNode; badge?: ReactNode; children: ReactNode }) {
  return <section className="workflow-card" aria-label={title}>
    <div className="workflow-card-heading"><h4><span>{step}</span>{icon}{title}</h4>{badge}</div>
    {children}
  </section>
}

function PhotoStrip({ urls, label }: { urls: string[]; label: string }) {
  if (!urls.length) return null
  return <div className="photo-strip" aria-label={label}>{urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} /></a>)}</div>
}

export function StaffWorkflowPanel({ report, role, userId, staffUsers, teams, allReports, originalPhotoUrls, resolutionPhotoUrls, events, onSubmit }: StaffWorkflowPanelProps) {
  const isAdmin = role === 'admin'
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ card: string; text: string; ok: boolean }>()
  const verificationForm = useRef<HTMLFormElement>(null)
  const assignmentForm = useRef<HTMLFormElement>(null)
  const resolutionForm = useRef<HTMLFormElement>(null)

  const state = verificationState(report.status)
  const nameOf = (id?: string) => id ? (staffUsers.find((user) => user.id === id)?.display_name || 'Unnamed staff member') : undefined
  const teamName = teams.find((team) => team.id === report.assignedTeamId)?.name
  const onTask = report.assignedTo === userId || Boolean(report.assignedTeamId && teams.find((team) => team.id === report.assignedTeamId)?.memberIds.includes(userId))
  const canAssign = ASSIGNABLE_STATUSES.includes(report.status)
  const assigned = Boolean(report.assignedTo || report.assignedTeamId)
  const duplicateOfReport = allReports.find((candidate) => candidate.id === report.duplicateOf)
  const overdue = isOverdue(report)
  const signature = [report.id, report.status, report.category, report.urgency, report.assignedTo, report.assignedTeamId, report.dueDate, report.taskPriority, report.taskInstructions, report.verificationNote, report.resolutionNote, report.resolutionDecision, report.resolutionPhotoPaths?.length].join('|')

  async function run(card: string, result: WorkflowResult, options?: { resolutionFiles?: File[] }) {
    if (result.error !== undefined) {
      setFeedback({ card, text: result.error, ok: false })
      return
    }
    setBusy(true)
    setFeedback(undefined)
    const error = await onSubmit(result.payload, options)
    setBusy(false)
    setFeedback({ card, text: error ?? 'Saved. The report timeline has been updated.', ok: !error })
  }

  function submitVerification(action: VerificationAction) {
    const form = verificationForm.current
    if (!form) return
    const data = new FormData(form)
    const duplicateInput = String(data.get('duplicate_of') ?? '').trim()
    const duplicateOf = resolveReportReference(duplicateInput, allReports, report.id)
    if (action === 'duplicate' && duplicateInput && !duplicateOf) {
      setFeedback({ card: 'verification', text: 'No other report was found with that ID.', ok: false })
      return
    }
    void run('verification', buildVerificationUpdate({
      action,
      note: String(data.get('verification_note') ?? ''),
      category: String(data.get('category')),
      urgency: String(data.get('urgency')),
      duplicateOf,
      current: { category: report.category, urgency: report.urgency, verificationNote: report.verificationNote },
    }))
  }

  function submitAssignment() {
    const form = assignmentForm.current
    if (!form) return
    const data = new FormData(form)
    void run('assignment', buildAssignmentUpdate({
      status: report.status,
      responderId: String(data.get('assigned_to') ?? ''),
      teamId: String(data.get('assigned_team_id') ?? ''),
      teamsAvailable: teams.length > 0,
      priority: String(data.get('task_priority') ?? ''),
      dueDate: String(data.get('due_date') ?? ''),
      instructions: String(data.get('task_instructions') ?? ''),
      currentDueDate: report.dueDate,
    }))
  }

  function submitReview(action: ResolutionReviewAction) {
    const note = String(new FormData(resolutionForm.current ?? undefined).get('review_note') ?? '')
    void run('resolution', buildResolutionReview({ action, note }))
  }

  function submitResponse(action: 'start' | 'save' | 'submit') {
    const data = new FormData(resolutionForm.current ?? undefined)
    const files = Array.from((resolutionForm.current?.elements.namedItem('after_photos') as HTMLInputElement | null)?.files ?? [])
    const existing = report.resolutionPhotoPaths ?? []
    if (files.length > MAX_RESOLUTION_PHOTOS - existing.length) {
      setFeedback({ card: 'resolution', text: `You can attach up to ${MAX_RESOLUTION_PHOTOS} after-photos in total.`, ok: false })
      return
    }
    void run('resolution', buildResponderUpdate({ action, note: String(data.get('response_note') ?? '') }), { resolutionFiles: files })
  }

  const message = (card: string) => feedback?.card === card && <p className={feedback.ok ? 'workflow-success' : 'form-error'} role="status">{feedback.text}</p>

  const verificationBadge = <span className={`vstate vstate-${state.toLowerCase().replace(/ /g, '-')}`}>{state}</span>

  const stages = report.createdAt ? responseStages({ ...report, createdAt: report.createdAt }, events) : []
  const escalation = needsImmediateAttention({ ...report, escalatedAt: report.escalatedAt })

  return <div className="workflow-panels">
    {escalation && <p className="escalation-banner" role="alert"><AlertTriangle size={14} /> Critical flooding: needs immediate attention. Verify, assign a response team, and track it to resolution.</p>}
    {stages.length > 0 && <ol className="response-stages" aria-label="Response time tracking">
      {stages.map((stage) => <li key={stage.key} className={stage.reached ? 'reached' : ''}>
        <span>{stage.label}</span><small>{stage.at ? formatDateTime(stage.at) : stage.reached ? 'Time not recorded' : 'Pending'}</small>
      </li>)}
      {report.resolvedAt && report.createdAt && <li className="reached total"><span>Total</span><small>{formatDuration(elapsedMs(report.createdAt, report.resolvedAt))}</small></li>}
    </ol>}
    <WorkflowCard step={1} title="Verification" icon={<ShieldCheck size={15} />} badge={verificationBadge}>
      {report.verifiedAt && <p className="workflow-meta"><Check size={12} /> Verified by {nameOf(report.verifiedBy) ?? 'staff'} · {formatDate(report.verifiedAt)}</p>}
      {report.status === 'Duplicate' && <p className="workflow-meta"><AlertTriangle size={12} /> Duplicate of {report.duplicateOf ? formatReportId(report.duplicateOf) : 'another report'}{duplicateOfReport ? ` · ${duplicateOfReport.title}` : ''}</p>}
      <a className="workflow-meta workflow-link" href={`https://www.openstreetmap.org/?mlat=${report.coordinates[0]}&mlon=${report.coordinates[1]}#map=18/${report.coordinates[0]}/${report.coordinates[1]}`} target="_blank" rel="noreferrer"><MapPin size={12} /> Check the location on the map</a>
      <PhotoStrip urls={originalPhotoUrls} label="Report photo" />
      {isAdmin ? <form className="workflow-grid" ref={verificationForm} key={`v-${signature}`} onSubmit={(event) => event.preventDefault()}>
        <label className="field-label">Category<select name="category" defaultValue={report.category}>{[...new Set([...categories, report.category])].map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="field-label">Urgency<select name="urgency" defaultValue={report.urgency}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label className="field-label workflow-wide">Verification notes<textarea name="verification_note" rows={2} maxLength={1000} defaultValue={report.verificationNote ?? ''} placeholder="Required to reject or request more information" /></label>
        <label className="field-label workflow-wide">Original report (for duplicates)<input name="duplicate_of" list="duplicate-candidates" placeholder="Report ID, e.g. A1B21904" defaultValue={report.duplicateOf ? formatReportId(report.duplicateOf) : ''} /></label>
        <datalist id="duplicate-candidates">{allReports.filter((candidate) => candidate.id !== report.id).slice(0, 300).map((candidate) => <option key={candidate.id} value={formatReportId(candidate.id).replace('#', '')}>{candidate.title}</option>)}</datalist>
        {message('verification')}
        <div className="workflow-actions workflow-wide">
          <button className="primary-button" type="button" disabled={busy || !VERIFICATION_STATUSES.includes(report.status)} onClick={() => submitVerification('verify')}><Check size={14} /> Validate report</button>
          <button className="secondary-button" type="button" disabled={busy || !VERIFICATION_STATUSES.includes(report.status)} onClick={() => submitVerification('needs_info')}>Request information</button>
          <button className="secondary-button" type="button" disabled={busy || !VERIFICATION_STATUSES.includes(report.status)} onClick={() => submitVerification('duplicate')}>Mark duplicate</button>
          <button className="secondary-button button-danger" type="button" disabled={busy || !VERIFICATION_STATUSES.includes(report.status)} onClick={() => submitVerification('reject')}><X size={14} /> Reject</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => submitVerification('save')}>Save changes only</button>
        </div>
        {!VERIFICATION_STATUSES.includes(report.status) && <p className="workflow-hint workflow-wide">Verification is locked once work on the task has started.</p>}
      </form> : <>
        <p className="workflow-meta">{report.category} · {report.urgency} urgency</p>
        {report.verificationNote && <p className="workflow-note-text">{report.verificationNote}</p>}
      </>}
    </WorkflowCard>

    <WorkflowCard step={2} title="Task assignment" icon={<ClipboardCheck size={15} />} badge={<span className={`status-pill status-${report.status.toLowerCase().replace(/ /g, '-')}`}><i />{report.status}</span>}>
      {assigned ? <div className="meta-chips">
        {report.assignedTo && <span className="meta-chip"><UserRound size={12} />{nameOf(report.assignedTo)}</span>}
        {report.assignedTeamId && <span className="meta-chip"><Users size={12} />{teamName ?? 'Assigned team'}</span>}
        {report.taskPriority && <span className="meta-chip">Priority: {report.taskPriority}</span>}
        {report.dueDate && <span className={`meta-chip ${overdue ? 'meta-chip-alert' : ''}`}><CalendarDays size={12} />Due {formatDate(report.dueDate)}{overdue ? ' · Overdue' : ''}</span>}
        {report.assignedAt && <span className="meta-chip">Assigned {formatDate(report.assignedAt)}</span>}
      </div> : <p className="workflow-hint">No one is assigned yet.</p>}
      {report.taskInstructions && <p className="workflow-note-text"><strong>Instructions</strong>{report.taskInstructions}</p>}
      {isAdmin && <form className="workflow-grid" ref={assignmentForm} key={`a-${signature}`} onSubmit={(event) => event.preventDefault()}>
        <label className="field-label">Assign responder<select name="assigned_to" defaultValue={report.assignedTo ?? ''} disabled={!canAssign}><option value="">No responder</option>{staffUsers.map((user) => <option key={user.id} value={user.id}>{user.display_name || 'Unnamed staff member'} · {user.role === 'admin' ? 'Admin' : 'Responder'}</option>)}</select></label>
        {teams.length > 0 && <label className="field-label">Assign team<select name="assigned_team_id" defaultValue={report.assignedTeamId ?? ''} disabled={!canAssign}><option value="">No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
        <label className="field-label">Task priority<select name="task_priority" defaultValue={report.taskPriority ?? report.urgency} disabled={!canAssign}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label className="field-label">Due date<input type="date" name="due_date" defaultValue={report.dueDate ?? ''} disabled={!canAssign} /></label>
        <label className="field-label workflow-wide">Task instructions<textarea name="task_instructions" rows={2} maxLength={1000} defaultValue={report.taskInstructions ?? ''} disabled={!canAssign} placeholder="What should the responder do, and what should they report back?" /></label>
        {message('assignment')}
        <div className="workflow-actions workflow-wide">
          <button className="primary-button" type="button" disabled={busy || !canAssign} onClick={submitAssignment}>{assigned ? 'Reassign task' : 'Assign task'}</button>
          {!canAssign && <p className="workflow-hint">Reports must be verified before they can be assigned.</p>}
        </div>
      </form>}
    </WorkflowCard>

    <WorkflowCard step={3} title="Resolution" icon={<Check size={15} />}>
      {report.resolutionNote && <p className="workflow-note-text"><strong>Response notes</strong>{report.resolutionNote}</p>}
      <PhotoStrip urls={resolutionPhotoUrls} label="After-photo" />
      {report.resolutionDecision && <p className={`review-callout review-${report.resolutionDecision}`}><strong>{decisionLabels[report.resolutionDecision]}</strong>{report.resolutionReviewNote && <span>{report.resolutionReviewNote}</span>}<small>{nameOf(report.resolutionReviewedBy) ?? 'Administrator'}{report.resolutionReviewedAt ? ` · ${formatDate(report.resolutionReviewedAt)}` : ''}</small></p>}
      <form className="workflow-grid" ref={resolutionForm} key={`r-${signature}`} onSubmit={(event) => event.preventDefault()}>
        {isAdmin && report.status === 'Awaiting verification' && <>
          <p className="workflow-hint workflow-wide">The responder reports this task as done. Review the notes and after-photos before approving.</p>
          <label className="field-label workflow-wide">Review notes<textarea name="review_note" rows={2} maxLength={1000} placeholder="Required to reject or request more action" /></label>
          {message('resolution')}
          <div className="workflow-actions workflow-wide">
            <button className="primary-button" type="button" disabled={busy} onClick={() => submitReview('approve')}><Check size={14} /> Approve resolution</button>
            <button className="secondary-button button-danger" type="button" disabled={busy} onClick={() => submitReview('reject')}>Reject resolution</button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => submitReview('action')}>Request additional action</button>
          </div>
        </>}
        {isAdmin && report.status === 'Resolved' && <>
          <p className="workflow-hint workflow-wide">The resolution is approved. Close the report to complete the cycle.</p>
          {message('resolution')}
          <div className="workflow-actions workflow-wide"><button className="primary-button" type="button" disabled={busy} onClick={() => submitReview('close')}>Close report</button></div>
        </>}
        {isAdmin && !['Awaiting verification', 'Resolved'].includes(report.status) && <p className="workflow-hint workflow-wide">{report.status === 'Closed' ? 'This report is closed.' : 'Resolutions appear here for review once a responder submits them.'}</p>}
        {!isAdmin && onTask && ['Verified', 'In progress'].includes(report.status) && <>
          {report.status === 'Verified' && <div className="workflow-actions workflow-wide"><button className="secondary-button" type="button" disabled={busy} onClick={() => submitResponse('start')}>Start work</button></div>}
          <label className="field-label workflow-wide">Response notes<textarea name="response_note" rows={3} maxLength={1000} defaultValue={report.resolutionNote ?? ''} placeholder="Describe what was done. Required to submit the resolution." /></label>
          <label className="upload-button workflow-wide"><Camera size={14} /> Add after-photos<input name="after_photos" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>
          {message('resolution')}
          <div className="workflow-actions workflow-wide">
            <button className="primary-button" type="button" disabled={busy} onClick={() => submitResponse('submit')}>Submit for verification</button>
            <button className="text-button" type="button" disabled={busy} onClick={() => submitResponse('save')}>Save notes</button>
          </div>
        </>}
        {!isAdmin && !(onTask && ['Verified', 'In progress'].includes(report.status)) && <p className="workflow-hint workflow-wide">{report.status === 'Awaiting verification' ? 'Submitted. An administrator will review your resolution.' : onTask ? 'There is nothing to update on this task right now.' : 'Only the assigned responder or team can update this task.'}</p>}
      </form>
    </WorkflowCard>
  </div>
}
