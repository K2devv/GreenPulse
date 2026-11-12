import { describe, expect, it } from 'vitest'
import { normalizePhoneNumber } from './phone-number'

describe('normalizePhoneNumber', () => {
  it('converts local Philippine mobile formats to E.164', () => {
    expect(normalizePhoneNumber('09171234567')).toBe('+639171234567')
    expect(normalizePhoneNumber('9171234567')).toBe('+639171234567')
    expect(normalizePhoneNumber('639171234567')).toBe('+639171234567')
  })

  it('accepts +63 and 0063 prefixes', () => {
    expect(normalizePhoneNumber('+63 917 123 4567')).toBe('+639171234567')
    expect(normalizePhoneNumber('+639171234567')).toBe('+639171234567')
    expect(normalizePhoneNumber('0063 917 123 4567')).toBe('+639171234567')
  })

  it('ignores spaces, dashes, dots, and parentheses', () => {
    expect(normalizePhoneNumber(' 0917-123-4567 ')).toBe('+639171234567')
    expect(normalizePhoneNumber('(0917) 123 4567')).toBe('+639171234567')
    expect(normalizePhoneNumber('+63 (917) 123-4567')).toBe('+639171234567')
    expect(normalizePhoneNumber('0917.123.4567')).toBe('+639171234567')
  })

  it('rejects landlines and short numbers without a country code', () => {
    expect(normalizePhoneNumber('02 8123 4567')).toBeUndefined()
    expect(normalizePhoneNumber('81234567')).toBeUndefined()
    expect(normalizePhoneNumber('0917123456')).toBeUndefined()
    expect(normalizePhoneNumber('091712345678')).toBeUndefined()
    expect(normalizePhoneNumber('12345')).toBeUndefined()
  })

  it('rejects empty and non-numeric input', () => {
    expect(normalizePhoneNumber('')).toBeUndefined()
    expect(normalizePhoneNumber('   ')).toBeUndefined()
    expect(normalizePhoneNumber('call me')).toBeUndefined()
    expect(normalizePhoneNumber('0917 123 4567 ext 2')).toBeUndefined()
  })

  it('accepts international numbers written with +', () => {
    expect(normalizePhoneNumber('+1 (415) 555-0123')).toBe('+14155550123')
    expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalizePhoneNumber('0044 20 7946 0958')).toBe('+442079460958')
  })

  it('rejects international numbers that are too short or too long', () => {
    expect(normalizePhoneNumber('+1234567')).toBeUndefined()
    expect(normalizePhoneNumber('+1234567890123456')).toBeUndefined()
    expect(normalizePhoneNumber('+0123456789')).toBeUndefined()
  })
})
