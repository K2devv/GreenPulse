/** Email delivery history for the admin Operations tab: one row per report, channel and status. */

export type DeliveryStatus = 'Sent' | 'Failed' | 'Suppressed' | 'Pending'

export type DeliveryRecord = {
  id: string
  report_id: string
  title: string
  attempts: number
  last_error: string | null
  channel: string
  status: DeliveryStatus
  attempted_at: string | null
}

export type DeliveryGroup = {
  key: string
  reportId: string
  title: string
  channel: string
  status: DeliveryStatus
  /** How many deliveries share this report, channel and status. */
  count: number
  /** Attempts across all of them. */
  attempts: number
  /** The newest error message among them, if any. */
  lastError: string | null
  /** The newest attempt (or creation) time among them. */
  latestAt: string | null
}

const time = (value: string | null) => {
  const parsed = value ? new Date(value).getTime() : Number.NaN
  return Number.isNaN(parsed) ? -Infinity : parsed
}

/**
 * Merges deliveries that would otherwise show as identical rows (several alerts about the same
 * report, all still pending, for example). Groups are ordered newest first.
 */
export function groupDeliveryHistory(records: readonly DeliveryRecord[]): DeliveryGroup[] {
  const groups = new Map<string, DeliveryGroup & { errorAt: number }>()
  for (const record of records) {
    const key = `${record.report_id}|${record.channel}|${record.status}`
    const at = time(record.attempted_at)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, {
        key, reportId: record.report_id, title: record.title, channel: record.channel, status: record.status,
        count: 1, attempts: record.attempts, lastError: record.last_error, latestAt: record.attempted_at,
        errorAt: record.last_error ? at : -Infinity,
      })
      continue
    }
    group.count += 1
    group.attempts += record.attempts
    if (at > time(group.latestAt)) group.latestAt = record.attempted_at
    if (record.last_error && at >= group.errorAt) {
      group.lastError = record.last_error
      group.errorAt = at
    }
  }
  return [...groups.values()]
    .sort((first, second) => time(second.latestAt) - time(first.latestAt))
    .map(({ errorAt: _errorAt, ...group }) => group)
}

/** True when deliveries are queued but none has ever been tried, which points at server setup rather than at bad addresses. */
export function deliveryNeverAttempted(records: readonly DeliveryRecord[]): boolean {
  return records.length > 0 && records.every((record) => record.status === 'Pending' && record.attempts === 0)
}
