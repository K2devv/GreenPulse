import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, MessageSquare, Send, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { buildTimeline, formatTimelineStamp, type TimelineEvent } from './lib/report-timeline'
import { MAX_COMMENT_LENGTH, MAX_REPLY_PHOTOS, allowedCommentKinds, buildCommentInsert, commentLabel, type CommentKind, type ReportComment, type ViewerRole } from './lib/report-comments'

export function ReportTimeline({ events }: { events: readonly TimelineEvent[] }) {
  const entries = buildTimeline(events)
  return <div className="event-history report-timeline"><h4>Report timeline</h4>
    {entries.length ? <ol>{entries.map((entry) => <li className="event-item" key={entry.id}><span className="event-mark" /><span><small>{formatTimelineStamp(entry.at)}</small><strong>{entry.label}</strong></span></li>)}</ol> : <p>No history entries yet.</p>}
  </div>
}

type ConversationProps = {
  reportId: string
  status: string
  viewerRole: ViewerRole
  userId: string
  isReporter: boolean
  isOnTask: boolean
  onPosted?: () => void
}

const COMMENT_FIELDS = 'id, author_name, author_role, kind, message, photo_paths, created_at'
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }

export function ReportConversation({ reportId, status, viewerRole, userId, isReporter, isOnTask, onPosted }: ConversationProps) {
  const [comments, setComments] = useState<ReportComment[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<CommentKind>('comment')
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const kinds = allowedCommentKinds({ role: viewerRole, status, isReporter, isOnTask })
  const activeKind = kinds.includes(kind) ? kind : kinds[0]

  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error: loadError } = await supabase.from('report_comments').select(COMMENT_FIELDS).eq('report_id', reportId).order('created_at', { ascending: true })
    if (loadError) {
      setError('Updates could not be loaded.')
      setLoading(false)
      return
    }
    const rows = (data ?? []) as ReportComment[]
    setComments(rows)
    setLoading(false)
    const paths = [...new Set(rows.flatMap((row) => row.photo_paths ?? []))]
    if (!paths.length) return
    const { data: signed } = await supabase.storage.from('report-photos').createSignedUrls(paths, 300)
    setPhotoUrls(Object.fromEntries((signed ?? []).flatMap((entry) => entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : [])))
  }, [reportId])

  useEffect(() => {
    setLoading(true)
    setComments([])
    setPhotoUrls({})
    setError('')
    setMessage('')
    void load()
  }, [load])

  async function post() {
    if (!supabase || !activeKind) return
    const files = Array.from(fileInput.current?.files ?? [])
    if (files.length > MAX_REPLY_PHOTOS) return setError(`You can attach up to ${MAX_REPLY_PHOTOS} photos.`)
    if (files.some((file) => !EXTENSIONS[file.type] || file.size > 5 * 1024 * 1024)) return setError('Photos must be JPEG, PNG, or WebP images of 5 MB or less.')
    const check = buildCommentInsert({ reportId, kind: activeKind, message })
    if (check.error !== undefined) return setError(check.error)
    setBusy(true)
    setError('')
    const uploaded: string[] = []
    for (const [index, file] of files.entries()) {
      const path = `${userId}/reply-${reportId}-${Date.now()}-${index}.${EXTENSIONS[file.type]}`
      const { error: uploadError } = await supabase.storage.from('report-photos').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        if (uploaded.length) await supabase.storage.from('report-photos').remove(uploaded)
        setBusy(false)
        return setError(uploadError.message)
      }
      uploaded.push(path)
    }
    const { error: insertError } = await supabase.from('report_comments').insert({ ...check.payload, photo_paths: uploaded })
    if (insertError) {
      if (uploaded.length) await supabase.storage.from('report-photos').remove(uploaded)
      setBusy(false)
      return setError(insertError.message)
    }
    setMessage('')
    if (fileInput.current) fileInput.current.value = ''
    await load()
    setBusy(false)
    onPosted?.()
  }

  const placeholder = activeKind === 'reply' ? 'Reply to the response team, for example with the extra details they asked for.' : activeKind === 'info_request' ? 'Describe what the reporter should provide, such as a clearer photo of the drainage outlet.' : 'Add a comment about this report.'

  return <section className="conversation" aria-label="Report updates">
    <h4><MessageSquare size={14} /> Updates and replies</h4>
    <p className="workflow-hint">Everyone involved with this report, including the reporter, can read these messages.</p>
    {loading ? <p className="workflow-hint">Loading updates…</p> : comments.length === 0 ? <p className="workflow-hint">No messages yet.</p> : <ul className="conversation-list">
      {comments.map((comment) => <li key={comment.id} className={`conversation-item conversation-${comment.kind}`}>
        <div className="conversation-head"><strong>{comment.author_name}</strong><span className="conversation-tag">{commentLabel(comment)}</span><small>{formatTimelineStamp(comment.created_at)}</small></div>
        <p>{comment.message}</p>
        {comment.photo_paths?.length > 0 && <div className="photo-strip">{comment.photo_paths.map((path) => photoUrls[path] ? <a key={path} href={photoUrls[path]} target="_blank" rel="noreferrer"><img src={photoUrls[path]} alt="Photo added to this report" /></a> : null)}</div>}
      </li>)}
    </ul>}
    {activeKind ? <form className="conversation-form" onSubmit={(event) => { event.preventDefault(); void post() }}>
      {kinds.length > 1 && <label className="field-label">Message type<select value={activeKind} onChange={(event) => setKind(event.target.value as CommentKind)}><option value="comment">Comment</option><option value="info_request">Request additional information</option></select></label>}
      <label className="field-label">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={MAX_COMMENT_LENGTH} placeholder={placeholder} /></label>
      {activeKind === 'reply' && <label className="upload-button"><Camera size={14} /> Add photos (up to {MAX_REPLY_PHOTOS})<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workflow-actions"><button className="primary-button" type="submit" disabled={busy}><Send size={14} /> {busy ? 'Sending…' : activeKind === 'reply' ? 'Send reply' : activeKind === 'info_request' ? 'Send request' : 'Post comment'}</button></div>
    </form> : <>{error && <p className="form-error" role="alert">{error}</p>}<p className="workflow-hint">{viewerRole === 'responder' ? 'Only the assigned responder or team can comment on this report.' : 'This report is no longer open for replies.'}</p></>}
  </section>
}

export function ResidentReportModal({ report, userId, onClose, onPosted }: { report: { id: string; title: string; status: string }; userId: string; onClose: () => void; onPosted: () => void }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', report.id).order('created_at', { ascending: true })
    setEvents((data ?? []) as TimelineEvent[])
  }, [report.id])
  useEffect(() => { void refresh() }, [refresh])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="report-modal report-updates-modal" role="dialog" aria-modal="true" aria-labelledby="updates-title">
      <div className="modal-header"><div><p className="eyebrow">YOUR REPORT</p><h2 id="updates-title">{report.title}</h2><p>Status: {report.status}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close report updates"><X size={19} /></button></div>
      <ReportConversation reportId={report.id} status={report.status} viewerRole="resident" userId={userId} isReporter isOnTask={false} onPosted={() => { void refresh(); onPosted() }} />
      <ReportTimeline events={events} />
    </section>
  </div>
}
