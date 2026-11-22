import { describe, expect, it } from 'vitest'
import { deliveryNeverAttempted, describeDeliveryError, groupDeliveryHistory, type DeliveryRecord } from './delivery-history'

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

// Resend's reply when the free test sender (onboarding@resend.dev) is asked to email someone else.
const testSenderError = JSON.stringify({
  message: 'You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.',
  name: 'validation_error',
  statusCode: 403,
})

describe('describeDeliveryError', () => {
  it('explains the test sender restriction in plain words, naming the address it can reach', () => {
    const text = describeDeliveryError(testSenderError)
    expect(text).toBe("Resend's free test sender only delivers to owner@example.com. To email everyone, verify a domain in Resend and set NOTIFICATION_FROM_EMAIL to an address on it. Retrying won't help until then.")
    expect(text).not.toContain('{')
  })

  it('still reads an error body that was cut off when stored', () => {
    expect(describeDeliveryError(testSenderError.slice(0, 120))).toBe("Resend's free test sender only delivers to owner@example.com. To email everyone, verify a domain in Resend and set NOTIFICATION_FROM_EMAIL to an address on it. Retrying won't help until then.")
    expect(describeDeliveryError('{"statusCode":422,"message":"The `to` field is invalid\\n","name":"valid')).toBe('The `to` field is invalid\n')
  })

  it('gives setup advice for common Resend errors', () => {
    expect(describeDeliveryError('{"statusCode":429,"message":"Too many requests","name":"rate_limit_exceeded"}')).toBe('Resend was sending too many emails at once. Retry in a minute.')
    expect(describeDeliveryError('{"statusCode":429,"message":"quota","name":"daily_quota_exceeded"}')).toBe("The Resend plan's daily email limit is used up. Retry tomorrow.")
    expect(describeDeliveryError('{"statusCode":403,"message":"API key is invalid","name":"invalid_api_Key"}')).toBe('Resend did not accept the API key. Check RESEND_API_KEY in Vercel.')
    expect(describeDeliveryError('{"statusCode":422,"message":"Invalid `from` field","name":"invalid_from_address"}')).toContain('NOTIFICATION_FROM_EMAIL')
  })

  it("shows any other Resend error's own message without the JSON around it", () => {
    expect(describeDeliveryError('{"statusCode":422,"message":"Missing `to` field.","name":"missing_required_field"}')).toBe('Missing `to` field.')
  })

  it('passes plain text through and drops empty errors', () => {
    expect(describeDeliveryError('Recipient has no email address.')).toBe('Recipient has no email address.')
    expect(describeDeliveryError('Email provider returned HTTP 500.')).toBe('Email provider returned HTTP 500.')
    expect(describeDeliveryError('{"unexpected":true}')).toBe('{"unexpected":true}')
    expect(describeDeliveryError('  ')).toBeNull()
    expect(describeDeliveryError(null)).toBeNull()
  })

  it('is applied to the grouped history rows', () => {
    const [group] = groupDeliveryHistory([record({ status: 'Failed', attempts: 1, last_error: testSenderError })])
    expect(group.lastError).toMatch(/^Resend's free test sender only delivers to owner@example\.com\./)
  })
})
