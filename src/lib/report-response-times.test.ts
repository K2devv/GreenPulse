import { describe, expect, it } from 'vitest'
import { buildResponseTimeMetrics, elapsedMs, responseStages } from './report-response-times'
import { isEscalated, prioritizeEscalated } from './report-escalation'

const H = 3_600_000
const at = (hours: number) => new Date(Date.UTC(2026, 9, 1, hours)).toISOString()

describe('response time metrics', () => {
  it('averages each stage using only reports that reached it', () => {
    const metrics = buildResponseTimeMetrics([
      { createdAt: at(0), verifiedAt: at(1), assignedAt: at(2), startedAt: at(3), resolvedAt: at(10), status: 'Resolved' },
      { createdAt: at(0), verifiedAt: at(3), status: 'Verified' },
    ])
    expect(metrics.averageVerificationMs).toBe(2 * H)
    expect(metrics.averageAssignmentMs).toBe(1 * H)
    expect(metrics.averageResponseMs).toBe(3 * H)
    expect(metrics.averageResolutionMs).toBe(10 * H)
  })

  it('ignores invalid or negative intervals', () => {
    expect(elapsedMs(at(5), at(1))).toBeUndefined()
    expect(elapsedMs('nope', at(1))).toBeUndefined()
    expect(buildResponseTimeMetrics([]).averageResolutionMs).toBeUndefined()
  })

  it('lists the five tracked stages', () => {
    expect(responseStages({ createdAt: at(0) }).map((stage) => stage.key)).toEqual(['submitted', 'verified', 'assigned', 'started', 'resolved'])
  })
})

describe('escalation', () => {
  it('flags critical flooding and lifts open ones first', () => {
    const base = { status: 'Submitted' }
    const list = [
      { id: 1, category: 'Waste', urgency: 'High', ...base },
      { id: 2, category: 'Flooding', urgency: 'High', ...base },
      { id: 3, category: 'Flooding', urgency: 'High', status: 'Resolved' },
    ]
    expect(isEscalated(list[1])).toBe(true)
    expect(isEscalated(list[0])).toBe(false)
    expect(prioritizeEscalated(list).map((report) => report.id)).toEqual([2, 1, 3])
  })
})
