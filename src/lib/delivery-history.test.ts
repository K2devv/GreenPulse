import { describe, expect, it } from 'vitest'
import { deliveryNeverAttempted, groupDeliveryHistory, type DeliveryRecord } from './delivery-history'

const record = (overrides: Partial<DeliveryRecord>): DeliveryRecord => ({
  id: 'notification:1',
  report_id: 'report-a',
  title: 'Waste by the creek',
  attempts: 0,
  last_error: null,
  channel: 'Resident/staff alert',
  status: 'Pending',
  attempted_at: '2026-11-17T02:00:00Z',
  ...overrides,
})

describe('groupDeliveryHistory', () => {
  it('merges deliveries for the same report, channel and status', () => {
    const groups = groupDeliveryHistory([
      record({ id: 'notification:1', attempted_at: '2026-11-17T02:00:00Z' }),
      record({ id: 'notification:2', attempted_at: '2026-11-17T03:00:00Z', attempts: 1 }),
      record({ id: 'notification:3', report_id: 'report-b', title: 'Flood on the corner' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ reportId: 'report-a', count: 2, attempts: 1, latestAt: '2026-11-17T03:00:00Z' })
    expect(groups[1]).toMatchObject({ reportId: 'report-b', count: 1 })
  })

  it('keeps different statuses and channels apart', () => {
    const groups = groupDeliveryHistory([
      record({ status: 'Failed', attempts: 3, last_error: 'Mailbox full' }),
      record({ status: 'Pending' }),
      record({ channel: 'Guest update' }),
    ])
    expect(groups).toHaveLength(3)
  })

  it('reports the newest error in a group', () => {
    const [group] = groupDeliveryHistory([
      record({ status: 'Failed', last_error: 'Old error', attempted_at: '2026-11-17T01:00:00Z' }),
      record({ status: 'Failed', last_error: 'New error', attempted_at: '2026-11-17T05:00:00Z' }),
      record({ status: 'Failed', last_error: null, attempted_at: '2026-11-17T06:00:00Z' }),
    ])
    expect(group.lastError).toBe('New error')
    expect(group.latestAt).toBe('2026-11-17T06:00:00Z')
  })

  it('orders groups newest first', () => {
    const groups = groupDeliveryHistory([
      record({ report_id: 'old', attempted_at: '2026-11-10T00:00:00Z' }),
      record({ report_id: 'new', attempted_at: '2026-11-18T00:00:00Z' }),
      record({ report_id: 'undated', attempted_at: null }),
    ])
    expect(groups.map((group) => group.reportId)).toEqual(['new', 'old', 'undated'])
  })
})

describe('deliveryNeverAttempted', () => {
  it('is true only when every delivery is pending with no attempts', () => {
    expect(deliveryNeverAttempted([record({}), record({ id: 'notification:2' })])).toBe(true)
    expect(deliveryNeverAttempted([record({}), record({ attempts: 1 })])).toBe(false)
    expect(deliveryNeverAttempted([record({ status: 'Sent', attempts: 1 })])).toBe(false)
    expect(deliveryNeverAttempted([])).toBe(false)
  })
})
