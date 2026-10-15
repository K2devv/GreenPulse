export type CommentKind = 'comment' | 'info_request' | 'reply'
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
const MIN_REQUEST_LENGTH = 8
const CLOSED_FOR_REPLIES = ['Closed', 'Rejected', 'Duplicate']

export function commentLabel(comment: Pick<ReportComment, 'author_role' | 'kind'>) {
  if (comment.kind === 'info_request') return 'Information request'
  if (comment.kind === 'reply') return 'Reporter reply'
  return comment.author_role === 'admin' ? 'Admin comment' : 'Responder comment'
}

export function allowedCommentKinds(input: { role: ViewerRole; status: string; isReporter: boolean; isOnTask: boolean }): CommentKind[] {
  if (input.role === 'resident') return input.isReporter && !CLOSED_FOR_REPLIES.includes(input.status) ? ['reply'] : []
  if (input.role === 'responder') return input.isOnTask ? ['comment'] : []
  return ['Resolved', ...CLOSED_FOR_REPLIES].includes(input.status) ? ['comment'] : ['comment', 'info_request']
}

export function buildCommentInsert(input: { reportId: string; kind: CommentKind; message: string; photoPaths?: string[] }):
  { payload: { report_id: string; kind: CommentKind; message: string; photo_paths: string[] }; error?: undefined } | { error: string; payload?: undefined } {
  const message = input.message.trim()
  if (!message) return { error: 'Write a message first.' }
  if (message.length > MAX_COMMENT_LENGTH) return { error: `Messages can be up to ${MAX_COMMENT_LENGTH} characters.` }
  if (input.kind === 'info_request' && message.length < MIN_REQUEST_LENGTH) return { error: `Describe what you need in at least ${MIN_REQUEST_LENGTH} characters.` }
  const photoPaths = input.photoPaths ?? []
  if (photoPaths.length > MAX_REPLY_PHOTOS) return { error: `You can attach up to ${MAX_REPLY_PHOTOS} photos.` }
  return { payload: { report_id: input.reportId, kind: input.kind, message, photo_paths: photoPaths } }
}
