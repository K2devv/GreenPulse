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
  /** The newest error among them, if any, as a plain sentence (see `describeDeliveryError`). */
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
    .map(({ errorAt: _errorAt, ...group }) => ({ ...group, lastError: describeDeliveryError(group.lastError) }))
}

/** Pulls `name` and `message` out of a Resend error body, even one cut short when it was stored. */
function readProviderError(raw: string): { name: string; message: string } | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string') {
      const { name, message } = parsed as { name?: unknown; message: string }
      return { name: typeof name === 'string' ? name : '', message }
    }
    return null
  } catch {
    // The server keeps only the first 450 characters, which can cut the JSON off mid-way.
    const message = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw)?.[1]
    if (message === undefined) return null
    let text = message
    try {
      text = JSON.parse(`"${message}"`) as string
    } catch {
      // Keep the escaped text rather than lose the message.
    }
    return { name: /"name"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? '', message: text }
  }
}

/**
 * Turns a stored email delivery error into a plain sentence for admins. The server records the email
 * provider's raw reply (Resend answers with JSON); errors that are already plain text pass through.
 */
export function describeDeliveryError(raw: string | null): string | null {
  const text = raw?.trim()
  if (!text) return null
  const error = readProviderError(text)
  if (!error) return text
  const name = error.name.toLowerCase()
  if (/only send testing emails to your own email address/i.test(error.message)) {
    const ownAddress = /\(([^\s()]+@[^\s()]+)\)/.exec(error.message)?.[1]
    return `Resend's free test sender only delivers to ${ownAddress ?? 'the email address of the Resend account'}. To email everyone, verify a domain in Resend and set NOTIFICATION_FROM_EMAIL to an address on it. Retrying won't help until then.`
  }
  if (name === 'rate_limit_exceeded') return 'Resend was sending too many emails at once. Retry in a minute.'
  if (name === 'daily_quota_exceeded') return "The Resend plan's daily email limit is used up. Retry tomorrow."
  if (name === 'monthly_quota_exceeded') return "The Resend plan's monthly email limit is used up."
  if (['missing_api_key', 'invalid_api_key', 'restricted_api_key'].includes(name)) return 'Resend did not accept the API key. Check RESEND_API_KEY in Vercel.'
  if (name === 'invalid_from_address') return 'Resend did not accept the sender address. Set NOTIFICATION_FROM_EMAIL to onboarding@resend.dev or to an address on a verified domain.'
  return error.message
}

/** True when deliveries are queued but none has ever been tried, which points at server setup rather than at bad addresses. */
export function deliveryNeverAttempted(records: readonly DeliveryRecord[]): boolean {
  return records.length > 0 && records.every((record) => record.status === 'Pending' && record.attempts === 0)
}
