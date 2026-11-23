import { CONFIRMATION_RESEND_COOLDOWN_SECONDS, secondsUntilResend } from './auth-errors'
/**
 * The "enter your 6-digit code" step of a sign-up or password reset, kept in sessionStorage so a
 * reload doesn't lose it. Phones often reload the tab while the reader switches to their email app
 * to find the code; without this they would have to start over and wait out the resend limit.
 */

/** What an emailed 6-digit code confirms: a new account, or a password reset. */
export type CodePurpose = 'signup' | 'recovery'

export type PendingCode = { email: string; sentAt: number; cooldownSeconds: number; purpose: CodePurpose }

export const PENDING_CODE_KEY = 'greenpulse-pending-code'
/** A saved step older than this isn't brought back: its code has most likely expired. */
export const PENDING_CODE_MAX_AGE_MS = 30 * 60 * 1000

/** The saved step in `raw`, or null when there is none, it is malformed, or it is too old. */
export function parsePendingCode(raw: string | null | undefined, now: number): PendingCode | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const { email, sentAt, cooldownSeconds, purpose } = value as Record<string, unknown>
  if (typeof email !== 'string' || !email.includes('@') || email.length > 254) return null
  if (purpose !== 'signup' && purpose !== 'recovery') return null
  if (typeof sentAt !== 'number' || !Number.isFinite(sentAt) || sentAt <= 0) return null
  // A time in the future means a changed clock; an old one means the code has likely expired.
  if (sentAt > now + 60_000 || now - sentAt > PENDING_CODE_MAX_AGE_MS) return null
  const cooldown = typeof cooldownSeconds === 'number' && Number.isFinite(cooldownSeconds) && cooldownSeconds >= 0 && cooldownSeconds <= 3600
    ? cooldownSeconds
    : CONFIRMATION_RESEND_COOLDOWN_SECONDS
  return { email, sentAt, cooldownSeconds: cooldown, purpose }
}

function sameEmail(first: string, second: string) {
  return first.trim().toLowerCase() === second.trim().toLowerCase()
}

/**
 * True when a code for this address and purpose went out so recently that another can't be sent
 * yet. The code already sent still works, so the app shows the code step again instead of asking
 * Supabase for a new email it would refuse.
 */
export function isCodeStillFresh(last: PendingCode | null | undefined, email: string, purpose: CodePurpose, now: number): last is PendingCode {
  if (!last || last.purpose !== purpose || !sameEmail(last.email, email)) return false
  return secondsUntilResend(last.sentAt, now, last.cooldownSeconds) > 0
}
