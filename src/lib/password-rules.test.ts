import { describe, expect, it } from 'vitest'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, checkNewPassword } from './password-rules'

describe('checkNewPassword', () => {
  it('accepts a long-enough password typed the same twice', () => {
    expect(checkNewPassword('river-clean-42', 'river-clean-42')).toEqual({ longEnough: true, tooLong: false, matches: true, error: undefined })
  })

  it('asks for the minimum length first', () => {
    const check = checkNewPassword('short', 'other')
    expect(check).toMatchObject({ longEnough: false, matches: false })
    expect(check.error).toBe('Use at least 8 characters.')
    expect(checkNewPassword('a'.repeat(PASSWORD_MIN_LENGTH), '').longEnough).toBe(true)
    expect(checkNewPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1), '').longEnough).toBe(false)
  })

  it('refuses a password longer than bcrypt reads, counting bytes', () => {
    expect(checkNewPassword('a'.repeat(PASSWORD_MAX_BYTES), 'a'.repeat(PASSWORD_MAX_BYTES)).error).toBeUndefined()
    const long = 'a'.repeat(PASSWORD_MAX_BYTES + 1)
    expect(checkNewPassword(long, long)).toMatchObject({ tooLong: true, error: 'That password is too long. Use 72 characters or fewer.' })
    // "ñ" is two bytes in UTF-8, so 37 of them are 74 bytes.
    const accented = 'ñ'.repeat(37)
    expect(checkNewPassword(accented, accented).tooLong).toBe(true)
  })

  it('reports a confirmation that differs or is still empty', () => {
    expect(checkNewPassword('river-clean-42', 'river-clean-4')).toMatchObject({ matches: false, error: 'The passwords do not match.' })
    expect(checkNewPassword('river-clean-42', '').matches).toBe(false)
    expect(checkNewPassword('', '').matches).toBe(false)
  })
})
