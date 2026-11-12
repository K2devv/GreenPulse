import { describe, expect, it } from 'vitest'
import { CONFIRMATION_RESEND_COOLDOWN_SECONDS, describeAuthError, isExistingAccountSignUp, secondsUntilResend } from './auth-errors'

describe('secondsUntilResend', () => {
  it('counts down whole seconds from the last send', () => {
    expect(secondsUntilResend(0, 0)).toBe(CONFIRMATION_RESEND_COOLDOWN_SECONDS)
    expect(secondsUntilResend(0, 59_001)).toBe(1)
    expect(secondsUntilResend(0, 60_000)).toBe(0)
    expect(secondsUntilResend(1_000, 5_500, 15)).toBe(11)
  })

  it('allows a resend right away for bad input', () => {
    expect(secondsUntilResend(Number.NaN, 0)).toBe(0)
    expect(secondsUntilResend(0, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('isExistingAccountSignUp', () => {
  it('detects the empty identities list Supabase returns for a registered email', () => {
    expect(isExistingAccountSignUp({ identities: [] })).toBe(true)
  })

  it('treats a new user, or missing data, as a new sign-up', () => {
    expect(isExistingAccountSignUp({ identities: [{ provider: 'email' }] })).toBe(false)
    expect(isExistingAccountSignUp({ identities: null })).toBe(false)
    expect(isExistingAccountSignUp({})).toBe(false)
    expect(isExistingAccountSignUp(null)).toBe(false)
    expect(isExistingAccountSignUp(undefined)).toBe(false)
  })
})

describe('describeAuthError', () => {
  it('explains a disabled email provider without naming Supabase', () => {
    const result = describeAuthError({ code: 'email_provider_disabled', message: 'Email logins are disabled' }, { step: 'sign-in' })
    expect(result.message).toMatch(/isn't available/)
    expect(result.message).not.toMatch(/supabase/i)
  })

  it('reads the wait time from a rate limit and words it for the step', () => {
    const resend = describeAuthError({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429 }, { step: 'resend' })
    expect(resend).toMatchObject({ retryAfterSeconds: 42 })
    expect(resend.message).toMatch(/42 seconds/)
    expect(resend.message).toMatch(/emails/)

    const signIn = describeAuthError({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }, { step: 'sign-in' })
    expect(signIn).toMatchObject({ retryAfterSeconds: CONFIRMATION_RESEND_COOLDOWN_SECONDS })
    expect(signIn.message).toMatch(/Too many attempts/)

    expect(describeAuthError({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, { step: 'sign-up' }).retryAfterSeconds).toBe(CONFIRMATION_RESEND_COOLDOWN_SECONDS)
  })

  it('handles sign-ups that are turned off', () => {
    expect(describeAuthError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' }, { step: 'sign-up' }).message).toMatch(/can't be created/)
  })

  it('suggests signing in when the email is already registered', () => {
    expect(describeAuthError({ code: 'user_already_exists', message: 'User already registered' }, { step: 'sign-up' })).toMatchObject({ suggestSignIn: true })
    expect(describeAuthError({ message: 'A user with this email address has already been registered' }, { step: 'sign-up' })).toMatchObject({ suggestSignIn: true })
  })

  it('flags an unconfirmed email so the form can offer a new confirmation link', () => {
    expect(describeAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' }, { step: 'sign-in' })).toMatchObject({ needsConfirmation: true })
  })

  it('maps wrong credentials and bad email addresses', () => {
    expect(describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }, { step: 'sign-in' }).message).toBe('The email or password is incorrect.')
    expect(describeAuthError({ code: 'email_address_invalid', message: 'Email address "x" is invalid' }, { step: 'sign-up' }).message).toBe('Enter a valid email address.')
    expect(describeAuthError({ code: 'validation_failed', message: 'Unable to validate email address: invalid format' }, { step: 'sign-up' }).message).toBe('Enter a valid email address.')
  })

  it('explains email delivery failures', () => {
    expect(describeAuthError({ code: 'email_address_not_authorized', message: 'Email address not authorized' }, { step: 'sign-up' }).message).toMatch(/couldn't send/)
    expect(describeAuthError({ message: 'Error sending confirmation email' }, { step: 'resend' }).message).toMatch(/couldn't send/)
  })

  it('maps password change errors', () => {
    expect(describeAuthError({ code: 'weak_password', message: 'Password should be at least 8 characters.' }, { step: 'set-password' }).message).toBe('Choose a stronger password. Password should be at least 8 characters.')
    expect(describeAuthError({ code: 'weak_password' }, { step: 'set-password' }).message).toBe('Choose a stronger password.')
    expect(describeAuthError({ code: 'same_password', message: 'x' }, { step: 'set-password' }).message).toMatch(/different/)
    expect(describeAuthError({ code: 'reauthentication_needed', message: 'x' }, { step: 'set-password' }).message).toMatch(/sign out/)
  })

  it('maps suspended accounts and network failures', () => {
    expect(describeAuthError({ code: 'user_banned', message: 'User is banned' }, { step: 'sign-in' }).message).toMatch(/suspended/)
    expect(describeAuthError(new TypeError('Failed to fetch'), { step: 'sign-in' }).message).toMatch(/connection/)
    expect(describeAuthError({ status: 0, message: '' }, { step: 'sign-in' }).message).toMatch(/connection/)
  })

  it('keeps an unknown message, falls back when there is none, and reads error_code', () => {
    expect(describeAuthError({ message: 'Something unusual' }, { step: 'sign-in' }).message).toBe('Something unusual')
    expect(describeAuthError(undefined, { step: 'sign-in' }).message).toBe('Sign-in could not be completed. Please try again.')
    expect(describeAuthError('plain text failure', { step: 'sign-in' }).message).toBe('plain text failure')
    expect(describeAuthError({ error_code: 'invalid_credentials', message: '' }, { step: 'sign-in' }).message).toBe('The email or password is incorrect.')
  })
})
