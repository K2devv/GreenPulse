import { describe, expect, it } from 'vitest'
import { buildTimeline, describeEvent } from './report-timeline'
import { allowedCommentKinds, buildCommentInsert } from './report-comments'

describe('timeline', () => {
  it('orders events chronologically and uses plain labels', () => {
    const timeline = buildTimeline([
      { id: 2, event_type: 'status_changed', message: 'Status changed from Submitted to Verified', created_at: '2026-10-01T10:30:00Z' },
      { id: 1, event_type: 'submitted', message: 'Report submitted', created_at: '2026-10-01T09:15:00Z' },
      { id: 3, event_type: 'status_changed', message: 'Status changed from Awaiting verification to Resolved', created_at: '2026-10-02T16:00:00Z' },
    ])
    expect(timeline.map((entry) => entry.label)).toEqual(['Report submitted', 'Report verified', 'Resolution verified'])
  })

  it('marks resolutions sent back', () => {
    expect(describeEvent({ event_type: 'status_changed', message: 'Status changed from Awaiting verification to In progress' })).toBe('Resolution sent back for more work')
    expect(describeEvent({ event_type: 'comment_added', message: 'Admin comment added' })).toBe('Admin comment added')
  })
})

describe('comments', () => {
  it('limits what each role can post', () => {
    expect(allowedCommentKinds({ role: 'resident', status: 'Additional information requested', isReporter: true, isOnTask: false })).toEqual(['reply'])
    expect(allowedCommentKinds({ role: 'resident', status: 'Closed', isReporter: true, isOnTask: false })).toEqual([])
    expect(allowedCommentKinds({ role: 'responder', status: 'In progress', isReporter: false, isOnTask: false })).toEqual([])
    expect(allowedCommentKinds({ role: 'responder', status: 'In progress', isReporter: false, isOnTask: true })).toEqual(['comment'])
    expect(allowedCommentKinds({ role: 'admin', status: 'Under review', isReporter: false, isOnTask: false })).toEqual(['comment', 'info_request'])
  })

  it('validates messages', () => {
    expect(buildCommentInsert({ reportId: 'r', kind: 'reply', message: '  ' })).toHaveProperty('error')
    expect(buildCommentInsert({ reportId: 'r', kind: 'info_request', message: 'short' })).toHaveProperty('error')
    expect(buildCommentInsert({ reportId: 'r', kind: 'reply', message: ' Done ', photoPaths: ['a'] }).payload).toEqual({ report_id: 'r', kind: 'reply', message: 'Done', photo_paths: ['a'] })
  })
})
