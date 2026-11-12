import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, LogIn, MessageSquare, Send, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { buildTimeline, formatTimelineStamp, type TimelineEvent } from './lib/report-timeline'
import { MAX_COMMENT_LENGTH, MAX_REPLY_PHOTOS, allowedCommentKinds, buildCommentInsert, commentKindOptionLabel, commentLabel, commentPlaceholder, commentSubmitLabel, commentsLoadErrorMessage, isMissingTableError, type CommentKind, type ReportComment, type ViewerRole } from './lib/report-comments'

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
  /** Called when a message from someone else may have arrived (Realtime insert, focus, or visibility). */
  onActivity?: () => void
}

const COMMENT_FIELDS = 'id, author_name, author_role, kind, message, photo_paths, created_at'
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }
// Realtime reuses a channel whose name is already open, so every mount gets its own name.
let conversationChannelCount = 0

export function ReportConversation({ reportId, status, viewerRole, userId, isReporter, isOnTask, onPosted, onActivity }: ConversationProps) {
  const [comments, setComments] = useState<ReportComment[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [tableMissing, setTableMissing] = useState(false)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<CommentKind>()
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const loadSequence = useRef(0)
  const onActivityRef = useRef(onActivity)
  useEffect(() => { onActivityRef.current = onActivity })
  const kinds = allowedCommentKinds({ role: viewerRole, status, isReporter, isOnTask })
  const activeKind = kind && kinds.includes(kind) ? kind : kinds[0]

  const load = useCallback(async () => {
    if (!supabase) return
    // Realtime, focus and posting can all reload at once; only the newest answer is shown.
    const sequence = ++loadSequence.current
    const { data, error: queryError } = await supabase.from('report_comments').select(COMMENT_FIELDS).eq('report_id', reportId).order('created_at', { ascending: true })
    if (sequence !== loadSequence.current) return
    if (queryError) {
      setTableMissing(isMissingTableError(queryError))
      setLoadError(commentsLoadErrorMessage(queryError, viewerRole))
      setLoading(false)
      return
    }
    const rows = (data ?? []) as ReportComment[]
    setComments(rows)
    setTableMissing(false)
    setLoadError('')
    setLoading(false)
    const paths = [...new Set(rows.flatMap((row) => row.photo_paths ?? []))]
    if (!paths.length) return
    const { data: signed } = await supabase.storage.from('report-photos').createSignedUrls(paths, 300)
    if (sequence !== loadSequence.current) return
    setPhotoUrls(Object.fromEntries((signed ?? []).flatMap((entry) => entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : [])))
  }, [reportId, viewerRole])

  useEffect(() => {
    setLoading(true)
    setComments([])
    setPhotoUrls({})
    setLoadError('')
    setTableMissing(false)
    setError('')
    setMessage('')
    void load()
  }, [load])

  // Live delivery: reload on every new message for this report. Focus and visibility changes
  // reload too, in case the Realtime connection dropped while the tab was in the background.
  useEffect(() => {
    if (!supabase) return
    const refresh = () => {
      void load()
      onActivityRef.current?.()
    }
    conversationChannelCount += 1
    const channel = supabase.channel(`report-comments-${reportId}-${conversationChannelCount}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'report_comments', filter: `report_id=eq.${reportId}` }, refresh)
      .subscribe()
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase!.removeChannel(channel)
    }
  }, [reportId, load])

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
      return setError(isMissingTableError(insertError) ? commentsLoadErrorMessage(insertError, viewerRole) : insertError.message)
    }
    setMessage('')
    if (fileInput.current) fileInput.current.value = ''
    await load()
    setBusy(false)
    onPosted?.()
  }

  // Posting would only fail while the table is missing, so the form waits for the migration.
  const formKind = tableMissing ? undefined : activeKind

  return <section className="conversation" aria-label="Report updates">
    <h4><MessageSquare size={14} /> Updates and replies</h4>
    <p className="workflow-hint">Everyone involved with this report, including the reporter, can read these messages. New messages appear here as they are posted.</p>
    {loadError && <p className="form-error" role="alert">{loadError}</p>}
    {loading ? <p className="workflow-hint">Loading updates…</p> : comments.length === 0 ? (loadError ? null : <p className="workflow-hint">No messages yet.</p>) : <ul className="conversation-list" aria-live="polite">
      {comments.map((comment) => <li key={comment.id} className={`conversation-item conversation-${comment.kind}`}>
        <div className="conversation-head"><strong>{comment.author_name}</strong><span className="conversation-tag">{commentLabel(comment)}</span><small>{formatTimelineStamp(comment.created_at)}</small></div>
        <p>{comment.message}</p>
        {comment.photo_paths?.length > 0 && <div className="photo-strip">{comment.photo_paths.map((path) => photoUrls[path] ? <a key={path} href={photoUrls[path]} target="_blank" rel="noreferrer"><img src={photoUrls[path]} alt="Photo added to this report" /></a> : null)}</div>}
      </li>)}
    </ul>}
    {formKind ? <form className="conversation-form" onSubmit={(event) => { event.preventDefault(); void post() }}>
      {kinds.length > 1 && <label className="field-label">Message type<select value={formKind} onChange={(event) => setKind(event.target.value as CommentKind)}>{kinds.map((option) => <option key={option} value={option}>{commentKindOptionLabel(option, viewerRole)}</option>)}</select></label>}
      <label className="field-label">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={MAX_COMMENT_LENGTH} placeholder={commentPlaceholder(formKind, viewerRole)} /></label>
      {formKind === 'reply' && <label className="upload-button"><Camera size={14} /> Add photos (up to {MAX_REPLY_PHOTOS})<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workflow-actions"><button className="primary-button" type="submit" disabled={busy}><Send size={14} /> {busy ? 'Sending…' : commentSubmitLabel(formKind, viewerRole)}</button></div>
    </form> : tableMissing ? null : <>{error && <p className="form-error" role="alert">{error}</p>}<p className="workflow-hint">{viewerRole === 'responder' ? 'Only the assigned responder or team can comment on this report.' : 'This report is no longer open for replies.'}</p></>}
  </section>
}

export function ResidentReportModal({ report, userId, onClose, onPosted }: { report: { id: string; title: string; status: string }; userId: string; onClose: () => void; onPosted: () => void }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const refreshSequence = useRef(0)
  const refresh = useCallback(async () => {
    if (!supabase) return
    const sequence = ++refreshSequence.current
    const { data } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', report.id).order('created_at', { ascending: true })
    if (sequence === refreshSequence.current) setEvents((data ?? []) as TimelineEvent[])
  }, [report.id])
  useEffect(() => { void refresh() }, [refresh])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="report-modal report-updates-modal" role="dialog" aria-modal="true" aria-labelledby="updates-title">
      <div className="modal-header"><div><p className="eyebrow">YOUR REPORT</p><h2 id="updates-title">{report.title}</h2><p>Status: {report.status}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close report updates"><X size={19} /></button></div>
      {/* Every staff message also adds a timeline entry, so the timeline reloads when one arrives. */}
      <ReportConversation reportId={report.id} status={report.status} viewerRole="resident" userId={userId} isReporter isOnTask={false} onPosted={() => { void refresh(); onPosted() }} onActivity={() => void refresh()} />
      <ReportTimeline events={events} />
    </section>
  </div>
}

type CommunityReportComment = {
  id: number
  author_name: string
  message: string
  created_at: string
}

const COMMUNITY_COMMENT_FIELDS = 'id, author_name, message, created_at'
const CLOSED_FOR_COMMUNITY_COMMENTS = ['Closed', 'Rejected', 'Duplicate']

type CommunityCommentsProps = {
  report: { id: string; status: string }
  userId?: string
  canComment: boolean
  onSignIn: () => void
  /** Show only the newest comments, with a link to the full discussion. */
  latest?: number
  onShowAll?: () => void
  onPosted?: () => void
  compact?: boolean
}

/** Public comments for one report: the list, the comment form, and why posting is unavailable. */
export function CommunityComments({ report, userId, canComment, onSignIn, latest, onShowAll, onPosted, compact = false }: CommunityCommentsProps) {
  const [comments, setComments] = useState<CommunityReportComment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const canPost = Boolean(supabase && userId && canComment && !CLOSED_FOR_COMMUNITY_COMMENTS.includes(report.status))

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data, error: loadError } = await supabase
      .from('community_report_comments')
      .select(COMMUNITY_COMMENT_FIELDS)
      .eq('report_id', report.id)
      .order('created_at', { ascending: true })
    if (loadError) {
      setError('Community comments could not be loaded. Apply the community comments migration to enable this feature.')
      setLoading(false)
      return
    }
    setComments((data ?? []) as CommunityReportComment[])
    setLoading(false)
  }, [report.id])

  useEffect(() => {
    setComments([])
    setLoading(true)
    setError('')
    setMessage('')
    void load()
  }, [load])

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !canPost) return
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return setError('Write a comment first.')
    if (trimmedMessage.length > MAX_COMMENT_LENGTH) return setError(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`)
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('community_report_comments').insert({ report_id: report.id, message: trimmedMessage })
    if (insertError) {
      setBusy(false)
      return setError(insertError.message)
    }
    setMessage('')
    await load()
    setBusy(false)
    onPosted?.()
  }

  const shown = latest ? comments.slice(-latest) : comments
  const hiddenCount = comments.length - shown.length

  return <>
    {!supabase ? null : loading ? <p className="workflow-hint">Loading comments…</p> : comments.length === 0 ? <p className="workflow-hint">No comments yet. Start the conversation.</p> : <ul className="conversation-list">
      {shown.map((comment) => <li key={comment.id} className="conversation-item">
        <div className="conversation-head"><strong>{comment.author_name}</strong><small>{formatTimelineStamp(comment.created_at)}</small></div>
        <p>{comment.message}</p>
      </li>)}
    </ul>}
    {hiddenCount > 0 && onShowAll && <button className="text-button community-comments-more" type="button" onClick={onShowAll}>View all {comments.length} comments</button>}
    {canPost ? <form className="conversation-form" onSubmit={(event) => void post(event)}>
      <label className="field-label">Add a comment<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={compact ? 2 : 3} maxLength={MAX_COMMENT_LENGTH} placeholder="Share a helpful update about this report." /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workflow-actions"><button className="primary-button" type="submit" disabled={busy}><Send size={14} /> {busy ? 'Posting…' : 'Post comment'}</button></div>
    </form> : !supabase ? <p className="workflow-hint">Community comments are available when shared reports are configured.</p> : !userId ? <div className="community-comment-signin"><p className="workflow-hint">Sign in to add a comment.</p><button className="secondary-button" type="button" onClick={onSignIn}><LogIn size={14} /> Sign in</button></div> : !canComment ? <p className="workflow-hint">Public comments are for resident accounts. Staff can use the report conversation in the Staff desk.</p> : <p className="workflow-hint">This report is closed to new comments.</p>}
    {error && !canPost && <p className="form-error" role="alert">{error}</p>}
  </>
}

export function CommunityReportDiscussion({ report, userId, canComment, onSignIn, onClose }: {
  report: { id: string; title: string; status: string }
  userId?: string
  canComment: boolean
  onSignIn: () => void
  onClose: () => void
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="report-modal report-updates-modal community-discussion-modal" role="dialog" aria-modal="true" aria-labelledby="community-discussion-title">
      <div className="modal-header"><div><p className="eyebrow">COMMUNITY DISCUSSION</p><h2 id="community-discussion-title">{report.title}</h2><p>Status: {report.status}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close community discussion"><X size={19} /></button></div>
      <section className="conversation" aria-label="Community comments">
        <h4><MessageSquare size={14} /> Public comments</h4>
        <p className="workflow-hint">Comments here are visible to anyone viewing this report on the map. Your account name stays private.</p>
        <CommunityComments report={report} userId={userId} canComment={canComment} onSignIn={onSignIn} />
      </section>
    </section>
  </div>
}
