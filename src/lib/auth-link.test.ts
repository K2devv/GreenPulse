import { describe, expect, it } from 'vitest'
import { isRecoveryLink, readAuthLinkError, withoutAuthLinkError } from './auth-link'

describe('isRecoveryLink', () => {
  it('recognises where a password reset link lands', () => {
    expect(isRecoveryLink('https://greenpulse.example/#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')).toBe(true)
  })

  it('ignores other sign-ins, errors, and ordinary addresses', () => {
    expect(isRecoveryLink('https://greenpulse.example/#access_token=abc&type=signup')).toBe(false)
    expect(isRecoveryLink('https://greenpulse.example/#type=recovery')).toBe(false)
    expect(isRecoveryLink('https://greenpulse.example/?type=recovery&access_token=abc')).toBe(false)
    expect(isRecoveryLink('https://greenpulse.example/#error=access_denied&error_code=otp_expired')).toBe(false)
    expect(isRecoveryLink('https://greenpulse.example/')).toBe(false)
    expect(isRecoveryLink('not a url')).toBe(false)
  })
})

const EXPIRED = 'https://greenpulse.example/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

describe('readAuthLinkError', () => {
  it('reads the error Supabase puts in the fragment after an expired link', () => {
    expect(readAuthLinkError(EXPIRED)).toEqual({ code: 'otp_expired', description: 'Email link is invalid or has expired' })
  })

  it('reads an error in the query string, as PKCE redirects send it', () => {
    expect(readAuthLinkError('https://greenpulse.example/?error=server_error&error_description=Oops')).toEqual({ code: 'server_error', description: 'Oops' })
  })

  it('ignores ordinary addresses, successful sign-ins, and bad input', () => {
    expect(readAuthLinkError('https://greenpulse.example/')).toBeNull()
    expect(readAuthLinkError('https://greenpulse.example/?report=12#map')).toBeNull()
    expect(readAuthLinkError('https://greenpulse.example/#access_token=abc&type=recovery')).toBeNull()
    expect(readAuthLinkError('not a url')).toBeNull()
  })
})

describe('withoutAuthLinkError', () => {
  it('removes the error and Supabase marker but keeps the rest of the address', () => {
    expect(withoutAuthLinkError(EXPIRED)).toBe('https://greenpulse.example/')
    expect(withoutAuthLinkError(`${EXPIRED}&sb=`)).toBe('https://greenpulse.example/')
    expect(withoutAuthLinkError('https://greenpulse.example/?report=12&error=access_denied&error_code=otp_expired')).toBe('https://greenpulse.example/?report=12')
  })

  it('leaves addresses without an error alone', () => {
    expect(withoutAuthLinkError('https://greenpulse.example/?report=12#map')).toBe('https://greenpulse.example/?report=12#map')
    expect(withoutAuthLinkError('https://greenpulse.example/?sb=1')).toBe('https://greenpulse.example/?sb=1')
    expect(withoutAuthLinkError('not a url')).toBe('not a url')
  })
})
