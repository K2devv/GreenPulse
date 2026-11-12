import { describe, expect, it } from 'vitest'
import { describeAuthError, isLikelyExistingAccount, normalizeOtpCode, OTP_RESEND_COOLDOWN_SECONDS, secondsUntilResend } from './auth-otp'

describe('normalizeOtpCode', () => {
  it('accepts 6 to 10 digits', () => {
    expect(normalizeOtpCode('123456')).toBe('123456')
    expect(normalizeOtpCode('1234567890')).toBe('1234567890')
  })

  it('strips spaces and dashes', () => {
    expect(normalizeOtpCode(' 123 456 ')).toBe('123456')
    expect(normalizeOtpCode('123-456')).toBe('123456')
  })

  it('rejects short, long, non-numeric, and missing codes', () => {
    expect(normalizeOtpCode('12345')).toBeUndefined()
    expect(normalizeOtpCode('12345678901')).toBeUndefined()
    expect(normalizeOtpCode('12a456')).toBeUndefined()
    expect(normalizeOtpCode('')).toBeUndefined()
    expect(normalizeOtpCode(null)).toBeUndefined()
    expect(normalizeOtpCode(undefined)).toBeUndefined()
  })
})

describe('secondsUntilResend', () => {
  const sentAt = 1_000_000

  it('counts down whole seconds from the default cooldown', () => {
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60)
    expect(secondsUntilResend(sentAt, sentAt)).toBe(60)
    expect(secondsUntilResend(sentAt, sentAt + 18_000)).toBe(42)
    expect(secondsUntilResend(sentAt, sentAt + 59_001)).toBe(1)
  })

  it('returns 0 once the cooldown has passed', () => {
    expect(secondsUntilResend(sentAt, sentAt + 60_000)).toBe(0)
    expect(secondsUntilResend(sentAt, sentAt + 120_000)).toBe(0)
  })

  it('honours a custom cooldown and invalid input', () => {
    expect(secondsUntilResend(sentAt, sentAt + 1_000, 30)).toBe(29)
    expect(secondsUntilResend(Number.NaN, sentAt)).toBe(0)
  })
})

describe('isLikelyExistingAccount', () => {
  const now = Date.parse('2026-11-12T10:00:00Z')

  it('is true for accounts created more than two minutes earlier', () => {
    expect(isLikelyExistingAccount({ created_at: '2026-11-12T09:57:59Z' }, now)).toBe(true)
    expect(isLikelyExistingAccount({ created_at: '2025-01-01T00:00:00Z' }, now)).toBe(true)
  })

  it('is false for new accounts and missing or invalid data', () => {
    expect(isLikelyExistingAccount({ created_at: '2026-11-12T09:59:30Z' }, now)).toBe(false)
    expect(isLikelyExistingAccount({ created_at: '2026-11-12T09:58:00Z' }, now)).toBe(false)
    expect(isLikelyExistingAccount({ created_at: 'not a date' }, now)).toBe(false)
    expect(isLikelyExistingAccount({}, now)).toBe(false)
    expect(isLikelyExistingAccount(null, now)).toBe(false)
    expect(isLikelyExistingAccount(undefined, now)).toBe(false)
  })
})

describe('describeAuthError', () => {
  const smsSend = { channel: 'sms', step: 'send', purpose: 'sign-in' } as const
  const emailSend = { channel: 'email', step: 'send', purpose: 'sign-in' } as const

  it('hides disabled providers behind a friendly message', () => {
    const phone = describeAuthError({ code: 'phone_provider_disabled', message: 'Unsupported phone provider', status: 400 }, smsSend)
    expect(phone.message).toBe("Phone sign-in isn't available yet. Use email instead, or try again later.")
    expect(describeAuthError(new Error('Unsupported phone provider'), smsSend).message).toBe(phone.message)
    const email = describeAuthError({ code: 'email_provider_disabled', message: 'Email logins are disabled' }, emailSend)
    expect(email.message).toMatch(/^Email sign-in isn't available yet/)
    expect(describeAuthError({ message: 'Email logins are disabled' }, emailSend).message).toBe(email.message)
    expect(`${phone.message}${email.message}`).not.toMatch(/supabase/i)
  })

  it('parses the wait time from rate limits', () => {
    const result = describeAuthError({ code: 'over_sms_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.', status: 429 }, { channel: 'sms', step: 'resend' })
    expect(result.retryAfterSeconds).toBe(42)
    expect(result.message).toContain('42 seconds')
    expect(describeAuthError({ message: 'you can only request this after 1 second' }, emailSend).retryAfterSeconds).toBe(1)
  })

  it('defaults rate limits to the standard cooldown', () => {
    expect(describeAuthError({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, emailSend).retryAfterSeconds).toBe(60)
    expect(describeAuthError({ code: 'over_request_rate_limit' }, emailSend).retryAfterSeconds).toBe(60)
    expect(describeAuthError({ status: 429, message: '' }, emailSend).retryAfterSeconds).toBe(60)
    expect(describeAuthError(new Error('Email rate limit exceeded'), emailSend).retryAfterSeconds).toBe(60)
  })

  it('words rate limits on password steps as attempts, not codes', () => {
    const result = describeAuthError({ code: 'over_request_rate_limit', message: 'Request rate limit reached', status: 429 }, { step: 'password' })
    expect(result.message).toBe('Too many attempts. Wait 60 seconds and try again.')
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('treats expired and wrong codes the same way', () => {
    const verify = { channel: 'sms', step: 'verify', purpose: 'sign-up' } as const
    const byCode = describeAuthError({ code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 }, verify)
    expect(byCode).toEqual({ message: 'The code is incorrect or has expired. Check it, or request a new code.', codeExpired: true })
    expect(describeAuthError(new Error('Token has expired or is invalid'), verify)).toEqual(byCode)
  })

  it('suggests creating an account when code sign-in finds none', () => {
    const sms = describeAuthError({ code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 }, smsSend)
    expect(sms).toEqual({ message: 'No account uses this mobile number. Create an account instead.', suggestSignUp: true })
    const email = describeAuthError(new Error('Signups not allowed for otp'), emailSend)
    expect(email).toEqual({ message: 'No account uses this email address. Create an account instead.', suggestSignUp: true })
  })

  it('reports disabled signups during sign-up without a suggestion', () => {
    const result = describeAuthError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' }, { channel: 'email', step: 'send', purpose: 'sign-up' })
    expect(result.message).toBe("New accounts can't be created right now. Please try again later.")
    expect(result.suggestSignUp).toBeUndefined()
  })

  it('reports SMS and email delivery failures', () => {
    expect(describeAuthError({ code: 'sms_send_failed', message: 'Error sending confirmation OTP to provider: invalid number' }, smsSend).message).toBe("We couldn't send the text message. Check the number, or use email instead.")
    expect(describeAuthError({ message: 'Error sending sms OTP' }, smsSend).message).toMatch(/text message/)
    expect(describeAuthError({ code: 'unexpected_failure', message: 'Error sending magic link email', status: 500 }, emailSend).message).toBe("We couldn't send the email. Try again in a few minutes.")
    expect(describeAuthError({ code: 'email_address_not_authorized', message: 'Email address "a@b.c" cannot be used as it is not authorized' }, emailSend).message).toMatch(/^We couldn't send a code to this email address/)
  })

  it('reports invalid phone numbers and emails', () => {
    expect(describeAuthError({ code: 'validation_failed', message: 'Invalid phone number format (E.164 required)' }, smsSend).message).toMatch(/^Enter a valid mobile number/)
    expect(describeAuthError({ message: 'Invalid phone number format (E.164 required)' }, { step: 'send' }).message).toMatch(/^Enter a valid mobile number/)
    expect(describeAuthError({ code: 'validation_failed', message: 'Unable to validate email address: invalid format' }, emailSend).message).toBe('Enter a valid email address.')
    expect(describeAuthError({ code: 'validation_failed', message: 'Unable to validate email address: invalid format' }, { step: 'send' }).message).toBe('Enter a valid email address.')
    expect(describeAuthError({ code: 'email_address_invalid', message: 'Email address "x" is invalid' }, emailSend).message).toBe('Enter a valid email address.')
    expect(describeAuthError({ code: 'validation_failed', message: 'Bad input' }, { step: 'verify' }).message).toBe('Check the details you entered and try again.')
  })

  it('suggests signing in when the account already exists', () => {
    for (const code of ['user_already_exists', 'email_exists', 'phone_exists']) {
      expect(describeAuthError({ code, message: 'User already registered' }, { channel: 'email', step: 'send', purpose: 'sign-up' }).suggestSignIn).toBe(true)
    }
    expect(describeAuthError(new Error('User already registered'), { channel: 'sms', step: 'send', purpose: 'sign-up' })).toEqual({ message: 'An account already uses this mobile number. Sign in instead.', suggestSignIn: true })
  })

  it('explains wrong passwords and unconfirmed email', () => {
    expect(describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }, { step: 'password' }).message).toMatch(/^The email or password is incorrect\./)
    expect(describeAuthError(new Error('Invalid login credentials'), { step: 'password' }).message).toMatch(/email code/)
    expect(describeAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' }, { step: 'password' }).message).toMatch(/not confirmed yet/)
    expect(describeAuthError({ code: 'user_banned', message: 'User is banned' }, { step: 'password' }).message).toMatch(/suspended/)
  })

  it('explains password change errors', () => {
    const step = { step: 'set-password' } as const
    expect(describeAuthError({ code: 'weak_password', message: 'Password should be at least 8 characters.' }, step).message).toBe('Choose a stronger password. Password should be at least 8 characters.')
    expect(describeAuthError({ code: 'weak_password', message: '' }, step).message).toBe('Choose a stronger password.')
    expect(describeAuthError({ code: 'same_password', message: 'New password should be different from the old password.' }, step).message).toMatch(/different from your current one/)
    expect(describeAuthError({ code: 'reauthentication_needed', message: 'Password update requires reauthentication' }, step).message).toMatch(/sign in again/)
  })

  it('explains network failures', () => {
    expect(describeAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, emailSend).message).toMatch(/Could not reach the sign-in service/)
    expect(describeAuthError(new TypeError('Load failed'), emailSend).message).toMatch(/Could not reach/)
  })

  it('falls back to the original message, then to a generic one', () => {
    expect(describeAuthError(new Error('Something unusual happened'), emailSend).message).toBe('Something unusual happened')
    expect(describeAuthError({ error_code: 'mystery', message: 'Mystery failure' }, emailSend).message).toBe('Mystery failure')
    expect(describeAuthError('Plain string error', emailSend).message).toBe('Plain string error')
    expect(describeAuthError(undefined, emailSend).message).toBe('Sign-in could not be completed. Please try again.')
    expect(describeAuthError(42, emailSend).message).toBe('Sign-in could not be completed. Please try again.')
    expect(describeAuthError({ code: 7, message: 9 }, emailSend).message).toBe('Sign-in could not be completed. Please try again.')
  })
})
