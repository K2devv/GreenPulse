import { describe, expect, it } from 'vitest'
import {
  MAX_COMMENT_LENGTH,
  MAX_REPLY_PHOTOS,
  MISSING_COMMENTS_TABLE_RESIDENT_MESSAGE,
  MISSING_COMMENTS_TABLE_STAFF_MESSAGE,
  allowedCommentKinds,
  buildCommentInsert,
  commentKindOptionLabel,
  commentLabel,
  commentPlaceholder,
  commentSubmitLabel,
  commentsLoadErrorMessage,
  isMissingTableError,
  type CommentKind,
  type ViewerRole,
} from './report-comments'

const ALL_STATUSES = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Closed', 'Rejected', 'Duplicate']
const ALL_KINDS: CommentKind[] = ['status_update', 'comment', 'info_request', 'reply']
const ROLES: ViewerRole[] = ['resident', 'responder', 'admin']

// The expected kinds, written out as a table so a rule change shows up as a diff here.
function expectedKinds(role: ViewerRole, status: string, isReporter: boolean, isOnTask: boolean): CommentKind[] {
  if (role === 'resident') return isReporter && !['Closed', 'Rejected', 'Duplicate'].includes(status) ? ['reply'] : []
  if (role === 'responder') return isOnTask ? ['comment'] : []
  if (status === 'Rejected' || status === 'Duplicate') return ['comment']
  if (status === 'Resolved' || status === 'Closed') return ['status_update', 'comment']
  return ['status_update', 'comment', 'info_request']
}

describe('allowedCommentKinds', () => {
  for (const role of ROLES) {
    for (const status of ALL_STATUSES) {
      for (const isReporter of [false, true]) {
        for (const isOnTask of [false, true]) {
          it(`${role} on ${status}${isReporter ? ', reporter' : ''}${isOnTask ? ', on task' : ''}`, () => {
            expect(allowedCommentKinds({ role, status, isReporter, isOnTask })).toEqual(expectedKinds(role, status, isReporter, isOnTask))
          })
        }
      }
    }
  }

  it('gives admins status updates first, so they are the default', () => {
    expect(allowedCommentKinds({ role: 'admin', status: 'In progress', isReporter: false, isOnTask: false })[0]).toBe('status_update')
  })

  it('lets admins post a closing note on finished reports but not on rejected or duplicate ones', () => {
    expect(allowedCommentKinds({ role: 'admin', status: 'Closed', isReporter: false, isOnTask: false })).toContain('status_update')
    expect(allowedCommentKinds({ role: 'admin', status: 'Resolved', isReporter: false, isOnTask: false })).toContain('status_update')
    expect(allowedCommentKinds({ role: 'admin', status: 'Rejected', isReporter: false, isOnTask: false })).not.toContain('status_update')
    expect(allowedCommentKinds({ role: 'admin', status: 'Duplicate', isReporter: false, isOnTask: false })).not.toContain('status_update')
  })

  it('never offers status updates to residents or responders', () => {
    for (const role of ['resident', 'responder'] as const) {
      for (const status of ALL_STATUSES) {
        expect(allowedCommentKinds({ role, status, isReporter: true, isOnTask: true })).not.toContain('status_update')
      }
    }
  })
})

describe('buildCommentInsert', () => {
  it('trims the message and builds the payload', () => {
    expect(buildCommentInsert({ reportId: 'r1', kind: 'status_update', message: '  Crew scheduled for Friday  ' })).toEqual({
      payload: { report_id: 'r1', kind: 'status_update', message: 'Crew scheduled for Friday', photo_paths: [] },
    })
  })

  it('keeps reply photo paths', () => {
    expect(buildCommentInsert({ reportId: 'r1', kind: 'reply', message: 'Here it is', photoPaths: ['u/a.jpg'] }).payload?.photo_paths).toEqual(['u/a.jpg'])
  })

  it('rejects empty messages for every kind', () => {
    for (const kind of ALL_KINDS) expect(buildCommentInsert({ reportId: 'r1', kind, message: '   ' }).error).toBe('Write a message first.')
  })

  it('rejects messages over the length limit', () => {
    expect(buildCommentInsert({ reportId: 'r1', kind: 'comment', message: 'a'.repeat(MAX_COMMENT_LENGTH + 1) }).error).toMatch(/up to 1000/)
    expect(buildCommentInsert({ reportId: 'r1', kind: 'comment', message: 'a'.repeat(MAX_COMMENT_LENGTH) }).error).toBeUndefined()
  })

  it('requires detail for information requests and status updates only', () => {
    expect(buildCommentInsert({ reportId: 'r1', kind: 'info_request', message: 'photo' }).error).toMatch(/at least 8/)
    expect(buildCommentInsert({ reportId: 'r1', kind: 'status_update', message: 'soon' }).error).toMatch(/Describe the update/)
    expect(buildCommentInsert({ reportId: 'r1', kind: 'comment', message: 'ok' }).error).toBeUndefined()
    expect(buildCommentInsert({ reportId: 'r1', kind: 'reply', message: 'ok' }).error).toBeUndefined()
  })

  it('limits attached photos', () => {
    const photoPaths = Array.from({ length: MAX_REPLY_PHOTOS + 1 }, (_, index) => `u/${index}.jpg`)
    expect(buildCommentInsert({ reportId: 'r1', kind: 'reply', message: 'Photos', photoPaths }).error).toMatch(/up to 3 photos/)
  })
})

describe('labels', () => {
  it('tags posted messages by kind and author', () => {
    expect(commentLabel({ kind: 'status_update', author_role: 'admin' })).toBe('Status update')
    expect(commentLabel({ kind: 'info_request', author_role: 'admin' })).toBe('Information request')
    expect(commentLabel({ kind: 'reply', author_role: 'resident' })).toBe('Reporter reply')
    expect(commentLabel({ kind: 'comment', author_role: 'admin' })).toBe('Admin reply')
    expect(commentLabel({ kind: 'comment', author_role: 'responder' })).toBe('Responder comment')
  })

  it('labels every kind in the message type select', () => {
    expect(commentKindOptionLabel('status_update', 'admin')).toBe('Status update')
    expect(commentKindOptionLabel('comment', 'admin')).toBe('Reply to reporter')
    expect(commentKindOptionLabel('info_request', 'admin')).toBe('Request additional information')
    expect(commentKindOptionLabel('comment', 'responder')).toBe('Comment')
    expect(commentKindOptionLabel('reply', 'resident')).toBe('Reply')
  })

  it('gives every kind a submit label and a placeholder', () => {
    for (const role of ROLES) {
      for (const kind of ALL_KINDS) {
        expect(commentSubmitLabel(kind, role)).not.toBe('')
        expect(commentPlaceholder(kind, role)).not.toBe('')
      }
    }
    expect(commentSubmitLabel('status_update', 'admin')).toBe('Post status update')
    expect(commentSubmitLabel('comment', 'admin')).toBe('Send reply')
    expect(commentSubmitLabel('comment', 'responder')).toBe('Post comment')
  })
})

describe('missing table errors', () => {
  it('recognizes PostgREST and Postgres missing-table codes', () => {
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTableError({ code: '42501' })).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
  })

  it('tells staff which migration to apply and gives residents a generic message', () => {
    expect(commentsLoadErrorMessage({ code: 'PGRST205' }, 'admin')).toBe(MISSING_COMMENTS_TABLE_STAFF_MESSAGE)
    expect(commentsLoadErrorMessage({ code: '42P01' }, 'responder')).toBe(MISSING_COMMENTS_TABLE_STAFF_MESSAGE)
    expect(commentsLoadErrorMessage({ code: 'PGRST205' }, 'resident')).toBe(MISSING_COMMENTS_TABLE_RESIDENT_MESSAGE)
    expect(MISSING_COMMENTS_TABLE_RESIDENT_MESSAGE).not.toMatch(/migration/)
    expect(commentsLoadErrorMessage({ code: '500' }, 'admin')).toBe('Updates could not be loaded.')
  })
})
