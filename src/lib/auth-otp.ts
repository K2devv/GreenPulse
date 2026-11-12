/** Sign-in and sign-up code helpers: code normalization, resend cooldowns, and user-facing auth error messages. */

export type OtpChannel = 'sms' | 'email'
export type AuthStep = 'send' | 'verify' | 'resend' | 'password' | 'set-password'
export type AuthPurpose = 'sign-in' | 'sign-up'

export type AuthErrorContext = {
  channel?: OtpChannel
  step: AuthStep
  purpose?: AuthPurpose
}

export type AuthErrorDescription = {
  message: string
  retryAfterSeconds?: number
  suggestSignUp?: boolean
  suggestSignIn?: boolean
  codeExpired?: boolean
}

/** Supabase enforces roughly one code per minute per address or number. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60

/** Accepts a 6–10 digit code typed with optional spaces or dashes. */
export function normalizeOtpCode(input: string | null | undefined): string | undefined {
  if (typeof input !== 'string') return undefined
  const code = input.replace(/[\s-]/g, '')
  return /^\d{6,10}$/.test(code) ? code : undefined
}

/** Whole seconds left before another code may be requested; 0 when a resend is allowed. */
export function secondsUntilResend(lastSentAt: number, now: number, cooldownSeconds = OTP_RESEND_COOLDOWN_SECONDS): number {
  if (!Number.isFinite(lastSentAt) || !Number.isFinite(now)) return 0
  const remainingMs = lastSentAt + cooldownSeconds * 1000 - now
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
}

const EXISTING_ACCOUNT_MARGIN_MS = 2 * 60 * 1000

/**
 * True when the account was created more than two minutes before `now`, so a code
 * "sign-up" actually signed into an account that already existed. Pass the time the
 * first code was requested as `now`: the account row is created when the code is sent,
 * not when it is verified.
 */
export function isLikelyExistingAccount(user: { created_at?: string } | null | undefined, now: number): boolean {
  if (!user?.created_at) return false
  const createdAt = Date.parse(user.created_at)
  if (Number.isNaN(createdAt)) return false
  return now - createdAt > EXISTING_ACCOUNT_MARGIN_MS
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

const RATE_LIMIT_CODES = new Set(['over_sms_send_rate_limit', 'over_email_send_rate_limit', 'over_request_rate_limit'])
const ACCOUNT_EXISTS_CODES = new Set(['user_already_exists', 'email_exists', 'phone_exists'])

const FALLBACK_MESSAGE = 'Sign-in could not be completed. Please try again.'

/** Maps a Supabase Auth error to a message that is safe and useful to show residents. */
export function describeAuthError(error: unknown, context: AuthErrorContext): AuthErrorDescription {
  const { code, message, status } = readError(error)
  const { channel, step, purpose } = context
  const sms = channel === 'sms'
  const destination = sms ? 'mobile number' : 'email address'

  if (code === 'phone_provider_disabled' || /unsupported phone provider/i.test(message)) {
    return { message: "Phone sign-in isn't available yet. Use email instead, or try again later." }
  }
  if (code === 'email_provider_disabled' || /email logins are disabled/i.test(message)) {
    return { message: "Email sign-in isn't available yet. Use your mobile number instead, or try again later." }
  }

  const waitMatch = /after (\d+) seconds?/i.exec(message)
  if ((code && RATE_LIMIT_CODES.has(code)) || waitMatch || status === 429 || /rate limit/i.test(message)) {
    const retryAfterSeconds = waitMatch ? Math.max(1, Number(waitMatch[1])) : OTP_RESEND_COOLDOWN_SECONDS
    if (step === 'password' || step === 'set-password') {
      return { message: `Too many attempts. Wait ${retryAfterSeconds} seconds and try again.`, retryAfterSeconds }
    }
    return { message: `Too many codes were requested. You can ask for a new code in ${retryAfterSeconds} seconds.`, retryAfterSeconds }
  }

  if (code === 'otp_expired' || /token has expired or is invalid/i.test(message)) {
    return { message: 'The code is incorrect or has expired. Check it, or request a new code.', codeExpired: true }
  }

  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    if (purpose === 'sign-up') return { message: "New accounts can't be created right now. Please try again later." }
    return { message: `No account uses this ${destination}. Create an account instead.`, suggestSignUp: true }
  }

  if ((code && ACCOUNT_EXISTS_CODES.has(code)) || /already (been )?registered|already exists/i.test(message)) {
    return { message: `An account already uses this ${destination}. Sign in instead.`, suggestSignIn: true }
  }

  if (code === 'sms_send_failed' || /error sending .*(otp|sms)/i.test(message)) {
    return { message: "We couldn't send the text message. Check the number, or use email instead." }
  }
  if (code === 'email_address_not_authorized') {
    return { message: "We couldn't send a code to this email address yet. Try again later, or use your mobile number instead." }
  }
  if (/error sending .*email/i.test(message)) {
    return { message: "We couldn't send the email. Try again in a few minutes." }
  }

  if (code === 'email_address_invalid') return { message: 'Enter a valid email address.' }
  if (code === 'validation_failed' || /invalid (phone|format)|e\.164|unable to validate email/i.test(message)) {
    if (sms || /phone/i.test(message)) return { message: 'Enter a valid mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.' }
    if (channel === 'email' || /email/i.test(message)) return { message: 'Enter a valid email address.' }
    return { message: 'Check the details you entered and try again.' }
  }

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return { message: 'The email or password is incorrect. If you created your account with a code, sign in with an email code instead.' }
  }
  if (code === 'email_not_confirmed') {
    return { message: 'This email address is not confirmed yet. Sign in with an email code instead.' }
  }
  if (code === 'user_banned') return { message: 'This account is suspended. Contact the District 5 office for help.' }

  if (code === 'weak_password') return { message: message ? `Choose a stronger password. ${message}` : 'Choose a stronger password.' }
  if (code === 'same_password') return { message: 'Choose a password different from your current one.' }
  if (code === 'reauthentication_needed') return { message: 'For security, sign out and sign in again before changing your password.' }

  if (status === 0 || /failed to fetch|network ?error|load failed/i.test(message)) {
    return { message: 'Could not reach the sign-in service. Check your connection and try again.' }
  }

  return { message: message || FALLBACK_MESSAGE }
}
