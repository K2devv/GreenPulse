/** Email and password sign-in helpers: confirmation resend cooldowns, repeat sign-ups, and user-facing auth error messages. */

export type AuthStep = 'sign-in' | 'sign-up' | 'resend' | 'set-password'

export type AuthErrorDescription = {
  message: string
  retryAfterSeconds?: number
  suggestSignUp?: boolean
  suggestSignIn?: boolean
  /** The account exists but its email address is not confirmed yet. */
  needsConfirmation?: boolean
}

/** Supabase sends at most about one confirmation email per address per minute. */
export const CONFIRMATION_RESEND_COOLDOWN_SECONDS = 60

/** Whole seconds left before another email may be requested; 0 when a resend is allowed. */
export function secondsUntilResend(lastSentAt: number, now: number, cooldownSeconds = CONFIRMATION_RESEND_COOLDOWN_SECONDS): number {
  if (!Number.isFinite(lastSentAt) || !Number.isFinite(now)) return 0
  const remainingMs = lastSentAt + cooldownSeconds * 1000 - now
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
}

/**
 * True when a sign-up was for an email address that already has an account. With email
 * confirmation on, Supabase does not return an error for that (it would reveal which addresses
 * are registered); it returns a user with an empty `identities` list and sends no email.
 */
export function isExistingAccountSignUp(user: { identities?: readonly unknown[] | null } | null | undefined): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0
}

function readError(error: unknown): { code?: string; message: string; status?: number } {
  if (typeof error === 'string') return { message: error }
  if (!error || typeof error !== 'object') return { message: '' }
  const record = error as { code?: unknown; message?: unknown; status?: unknown; error_code?: unknown }
  const code = typeof record.code === 'string' ? record.code : typeof record.error_code === 'string' ? record.error_code : undefined
  return {
    code,
    message: typeof record.message === 'string' ? record.message : '',
    status: typeof record.status === 'number' ? record.status : undefined,
  }
}

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])
const ACCOUNT_EXISTS_CODES = new Set(['user_already_exists', 'email_exists'])
const FALLBACK_MESSAGE = 'Sign-in could not be completed. Please try again.'

/** Maps a Supabase Auth error to a message that is safe and useful to show residents. */
export function describeAuthError(error: unknown, context: { step: AuthStep }): AuthErrorDescription {
  const { code, message, status } = readError(error)
  const { step } = context

  if (code === 'email_provider_disabled' || /email logins are disabled/i.test(message)) {
    return { message: "Email sign-in isn't available right now. Please try again later." }
  }

  const waitMatch = /after (\d+) seconds?/i.exec(message)
  if ((code && RATE_LIMIT_CODES.has(code)) || waitMatch || status === 429 || /rate limit/i.test(message)) {
    const retryAfterSeconds = waitMatch ? Math.max(1, Number(waitMatch[1])) : CONFIRMATION_RESEND_COOLDOWN_SECONDS
    if (step === 'sign-up' || step === 'resend') {
      return { message: `Too many emails were requested. You can ask for another one in ${retryAfterSeconds} seconds.`, retryAfterSeconds }
    }
    return { message: `Too many attempts. Wait ${retryAfterSeconds} seconds and try again.`, retryAfterSeconds }
  }

  if (code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return { message: "New accounts can't be created right now. Please try again later." }
  }
  if ((code && ACCOUNT_EXISTS_CODES.has(code)) || /already (been )?registered|already exists/i.test(message)) {
    return { message: 'An account already uses this email address. Sign in instead.', suggestSignIn: true }
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return { message: 'Confirm your email address first. Open the link we emailed you, or send a new one.', needsConfirmation: true }
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return { message: 'The email or password is incorrect.' }
  }

  if (code === 'email_address_not_authorized' || /error sending .*email/i.test(message)) {
    return { message: "We couldn't send the confirmation email. Try again in a few minutes." }
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || /unable to validate email|invalid email/i.test(message)) {
    return { message: 'Enter a valid email address.' }
  }

  if (code === 'weak_password') return { message: message ? `Choose a stronger password. ${message}` : 'Choose a stronger password.' }
  if (code === 'same_password') return { message: 'Choose a password different from your current one.' }
  if (code === 'reauthentication_needed') return { message: 'For security, sign out and sign in again before changing your password.' }
  if (code === 'user_banned') return { message: 'This account is suspended. Contact the District 5 office for help.' }

  if (status === 0 || /failed to fetch|network ?error|load failed/i.test(message)) {
    return { message: 'Could not reach the sign-in service. Check your connection and try again.' }
  }

  return { message: message || FALLBACK_MESSAGE }
}
