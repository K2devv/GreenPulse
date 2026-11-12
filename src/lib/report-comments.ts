export type CommentKind = 'status_update' | 'comment' | 'info_request' | 'reply'
export type CommentAuthorRole = 'resident' | 'responder' | 'admin'
export type ViewerRole = CommentAuthorRole

export type ReportComment = {
  id: number
  author_name: string
  author_role: CommentAuthorRole
  kind: CommentKind
  message: string
  photo_paths: string[]
  created_at: string
}

export const MAX_COMMENT_LENGTH = 1000
export const MAX_REPLY_PHOTOS = 3
const MIN_DETAILED_LENGTH = 8
// These lists mirror public.prepare_report_comment() (202611120002). Keep them in step.
const CLOSED_FOR_REPLIES = ['Closed', 'Rejected', 'Duplicate']
const FINISHED_FOR_INFO_REQUESTS = ['Resolved', ...CLOSED_FOR_REPLIES]
const CLOSED_FOR_STATUS_UPDATES = ['Rejected', 'Duplicate']

/** The tag shown on a posted message. */
export function commentLabel(comment: Pick<ReportComment, 'author_role' | 'kind'>) {
  if (comment.kind === 'status_update') return 'Status update'
  if (comment.kind === 'info_request') return 'Information request'
  if (comment.kind === 'reply') return 'Reporter reply'
  return comment.author_role === 'admin' ? 'Admin reply' : 'Responder comment'
}

/** The message types a viewer may post, in the order the form offers them. The first is the default. */
export function allowedCommentKinds(input: { role: ViewerRole; status: string; isReporter: boolean; isOnTask: boolean }): CommentKind[] {
  if (input.role === 'resident') return input.isReporter && !CLOSED_FOR_REPLIES.includes(input.status) ? ['reply'] : []
  if (input.role === 'responder') return input.isOnTask ? ['comment'] : []
  const kinds: CommentKind[] = []
  if (!CLOSED_FOR_STATUS_UPDATES.includes(input.status)) kinds.push('status_update')
  kinds.push('comment')
  if (!FINISHED_FOR_INFO_REQUESTS.includes(input.status)) kinds.push('info_request')
  return kinds
}

/** The option text in the message type select. */
export function commentKindOptionLabel(kind: CommentKind, role: ViewerRole) {
  if (kind === 'status_update') return 'Status update'
  if (kind === 'info_request') return 'Request additional information'
  if (kind === 'reply') return 'Reply'
  return role === 'admin' ? 'Reply to reporter' : 'Comment'
}

export function commentSubmitLabel(kind: CommentKind, role: ViewerRole) {
  if (kind === 'status_update') return 'Post status update'
  if (kind === 'info_request') return 'Send request'
  if (kind === 'reply') return 'Send reply'
  return role === 'admin' ? 'Send reply' : 'Post comment'
}

export function commentPlaceholder(kind: CommentKind, role: ViewerRole) {
  if (kind === 'status_update') return 'Tell the reporter what is happening, for example that a cleanup crew is scheduled for Friday morning.'
  if (kind === 'info_request') return 'Describe what the reporter should provide, such as a clearer photo of the drainage outlet.'
  if (kind === 'reply') return 'Reply to the response team, for example with the extra details they asked for.'
  return role === 'admin' ? 'Reply to the reporter about this report.' : 'Add a comment about this report.'
}

export function buildCommentInsert(input: { reportId: string; kind: CommentKind; message: string; photoPaths?: string[] }):
  { payload: { report_id: string; kind: CommentKind; message: string; photo_paths: string[] }; error?: undefined } | { error: string; payload?: undefined } {
  const message = input.message.trim()
  if (!message) return { error: 'Write a message first.' }
  if (message.length > MAX_COMMENT_LENGTH) return { error: `Messages can be up to ${MAX_COMMENT_LENGTH} characters.` }
  if (input.kind === 'info_request' && message.length < MIN_DETAILED_LENGTH) return { error: `Describe what you need in at least ${MIN_DETAILED_LENGTH} characters.` }
  if (input.kind === 'status_update' && message.length < MIN_DETAILED_LENGTH) return { error: `Describe the update in at least ${MIN_DETAILED_LENGTH} characters.` }
  const photoPaths = input.photoPaths ?? []
  if (photoPaths.length > MAX_REPLY_PHOTOS) return { error: `You can attach up to ${MAX_REPLY_PHOTOS} photos.` }
  return { payload: { report_id: input.reportId, kind: input.kind, message, photo_paths: photoPaths } }
}

/** PostgREST answers PGRST205 for a table missing from its schema cache; Postgres itself uses 42P01. */
export function isMissingTableError(error: { code?: string | null } | null | undefined) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

export const MISSING_COMMENTS_TABLE_STAFF_MESSAGE = "Report messages aren't set up yet. Apply migration 202610150001_report_communication.sql."
export const MISSING_COMMENTS_TABLE_RESIDENT_MESSAGE = "Report messages aren't available right now. Please check back later."

/** The message shown when the conversation cannot be loaded. */
export function commentsLoadErrorMessage(error: { code?: string | null }, role: ViewerRole) {
  if (isMissingTableError(error)) return role === 'resident' ? MISSING_COMMENTS_TABLE_RESIDENT_MESSAGE : MISSING_COMMENTS_TABLE_STAFF_MESSAGE
  return 'Updates could not be loaded.'
}
