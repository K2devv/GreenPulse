import { describe, expect, it } from 'vitest'
import { canHandleEscalation, escalationReport, orderEscalations, type SlaEscalation } from './sla-escalations'

const report = (overrides: Partial<{ assigned_to: string | null; assigned_team_id: string | null }> = {}) => ({ title: 'Blocked drain', status: 'Verified', assigned_to: null, assigned_team_id: null, ...overrides })
const escalation = (overrides: Partial<SlaEscalation>): SlaEscalation => ({ report_id: 'r1', stage: 1, escalated_at: '2026-11-02T04:00:00Z', acknowledged_at: null, report: report(), ...overrides })
const teams = [{ id: 'team-a', memberIds: ['responder-2'] }]

describe('escalationReport', () => {
  it('reads the joined report as an object or a one-item array', () => {
    expect(escalationReport({ report: report() })?.title).toBe('Blocked drain')
    expect(escalationReport({ report: [report()] })?.title).toBe('Blocked drain')
    expect(escalationReport({ report: [] })).toBeUndefined()
    expect(escalationReport({ report: null })).toBeUndefined()
    expect(escalationReport({})).toBeUndefined()
  })
})

describe('canHandleEscalation', () => {
  it('lets admins handle every escalation', () => {
    expect(canHandleEscalation(escalation({ report: null }), { role: 'admin', teams: [] })).toBe(true)
  })

  it('lets a responder handle escalations assigned to them or their team only', () => {
    expect(canHandleEscalation(escalation({ report: report({ assigned_to: 'responder-1' }) }), { role: 'responder', userId: 'responder-1', teams })).toBe(true)
    expect(canHandleEscalation(escalation({ report: [report({ assigned_team_id: 'team-a' })] }), { role: 'responder', userId: 'responder-2', teams })).toBe(true)
    expect(canHandleEscalation(escalation({ report: report({ assigned_to: 'someone-else' }) }), { role: 'responder', userId: 'responder-1', teams })).toBe(false)
    expect(canHandleEscalation(escalation({ report: report({ assigned_team_id: 'team-b' }) }), { role: 'responder', userId: 'responder-2', teams })).toBe(false)
    expect(canHandleEscalation(escalation({ report: report({ assigned_to: 'responder-1' }) }), { role: 'responder', teams })).toBe(false)
    expect(canHandleEscalation(escalation({ report: null }), { role: 'responder', userId: 'responder-1', teams })).toBe(false)
  })
})

describe('orderEscalations', () => {
  it('puts open escalations first, then stage 2, then the newest', () => {
    const items = [
      escalation({ report_id: 'acknowledged', stage: 2, acknowledged_at: '2026-11-03T00:00:00Z', escalated_at: '2026-11-05T00:00:00Z' }),
      escalation({ report_id: 'old-stage-1', stage: 1, escalated_at: '2026-11-01T00:00:00Z' }),
      escalation({ report_id: 'new-stage-1', stage: 1, escalated_at: '2026-11-04T00:00:00Z' }),
      escalation({ report_id: 'stage-2', stage: 2, escalated_at: '2026-11-02T00:00:00Z' }),
    ]
    expect(orderEscalations(items).map((item) => item.report_id)).toEqual(['stage-2', 'new-stage-1', 'old-stage-1', 'acknowledged'])
  })

  it('does not change the input and copes with a bad date', () => {
    const items = [escalation({ report_id: 'a', escalated_at: 'not a date' }), escalation({ report_id: 'b' })]
    const ordered = orderEscalations(items)
    expect(ordered.map((item) => item.report_id)).toEqual(['b', 'a'])
    expect(items.map((item) => item.report_id)).toEqual(['a', 'b'])
  })
})
