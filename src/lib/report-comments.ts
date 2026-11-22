import { t } from './i18n'
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
  if (comment.kind === 'status_update') return t('Status update')
  if (comment.kind === 'info_request') return t('Information request')
  if (comment.kind === 'reply') return t('Reporter reply')
  return comment.author_role === 'admin' ? t('Admin reply') : t('Responder comment')
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
  if (kind === 'status_update') return t('Status update')
  if (kind === 'info_request') return t('Request additional information')
  if (kind === 'reply') return t('Reply')
  return role === 'admin' ? t('Reply to reporter') : t('Comment')
}

export function commentSubmitLabel(kind: CommentKind, role: ViewerRole) {
  if (kind === 'status_update') return t('Post status update')
  if (kind === 'info_request') return t('Send request')
  if (kind === 'reply') return t('Send reply')
  return role === 'admin' ? t('Send reply') : t('Post comment')
}

export function commentPlaceholder(kind: CommentKind, role: ViewerRole) {
  if (kind === 'status_update') return t('Tell the reporter what is happening, for example that a cleanup crew is scheduled for Friday morning.')
  if (kind === 'info_request') return t('Describe what the reporter should provide, such as a clearer photo of the drainage outlet.')
  if (kind === 'reply') return t('Reply to the response team, for example with the extra details they asked for.')
  return role === 'admin' ? t('Reply to the reporter about this report.') : t('Add a comment about this report.')
}

export function buildCommentInsert(input: { reportId: string; kind: CommentKind; message: string; photoPaths?: string[] }):
  { payload: { report_id: string; kind: CommentKind; message: string; photo_paths: string[] }; error?: undefined } | { error: string; payload?: undefined } {
  const message = input.message.trim()
  if (!message) return { error: t('Write a message first.') }
  if (message.length > MAX_COMMENT_LENGTH) return { error: t('Messages can be up to {count} characters.', { count: MAX_COMMENT_LENGTH }) }
  if (input.kind === 'info_request' && message.length < MIN_DETAILED_LENGTH) return { error: t('Describe what you need in at least {count} characters.', { count: MIN_DETAILED_LENGTH }) }
  if (input.kind === 'status_update' && message.length < MIN_DETAILED_LENGTH) return { error: t('Describe the update in at least {count} characters.', { count: MIN_DETAILED_LENGTH }) }
  const photoPaths = input.photoPaths ?? []
  if (photoPaths.length > MAX_REPLY_PHOTOS) return { error: t('You can attach up to {count} photos.', { count: MAX_REPLY_PHOTOS }) }
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
  if (isMissingTableError(error)) return t(role === 'resident' ? MISSING_COMMENTS_TABLE_RESIDENT_MESSAGE : MISSING_COMMENTS_TABLE_STAFF_MESSAGE)
  return t('Updates could not be loaded.')
}
