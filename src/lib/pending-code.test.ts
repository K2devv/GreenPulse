import { describe, expect, it } from 'vitest'
import { CONFIRMATION_RESEND_COOLDOWN_SECONDS } from './auth-errors'
import { PENDING_CODE_MAX_AGE_MS, isCodeStillFresh, parsePendingCode, type PendingCode } from './pending-code'

const NOW = 1_800_000_000_000
const saved: PendingCode = { email: 'resident@example.com', sentAt: NOW - 20_000, cooldownSeconds: 60, purpose: 'recovery' }

describe('parsePendingCode', () => {
  it('brings back a recent code step', () => {
    expect(parsePendingCode(JSON.stringify(saved), NOW)).toEqual(saved)
    expect(parsePendingCode(JSON.stringify({ ...saved, purpose: 'signup' }), NOW)?.purpose).toBe('signup')
  })

  it('drops a step once its code has most likely expired', () => {
    expect(parsePendingCode(JSON.stringify({ ...saved, sentAt: NOW - PENDING_CODE_MAX_AGE_MS - 1 }), NOW)).toBeNull()
    expect(parsePendingCode(JSON.stringify({ ...saved, sentAt: NOW - PENDING_CODE_MAX_AGE_MS }), NOW)).not.toBeNull()
  })

  it('rejects malformed or unexpected values', () => {
    expect(parsePendingCode(null, NOW)).toBeNull()
    expect(parsePendingCode('', NOW)).toBeNull()
    expect(parsePendingCode('{not json', NOW)).toBeNull()
    expect(parsePendingCode('"text"', NOW)).toBeNull()
    expect(parsePendingCode(JSON.stringify({ ...saved, email: 'no-at-sign' }), NOW)).toBeNull()
    expect(parsePendingCode(JSON.stringify({ ...saved, purpose: 'magic-link' }), NOW)).toBeNull()
    expect(parsePendingCode(JSON.stringify({ ...saved, sentAt: 0 }), NOW)).toBeNull()
    expect(parsePendingCode(JSON.stringify({ ...saved, sentAt: NOW + 5 * 60_000 }), NOW)).toBeNull()
  })

  it('falls back to the usual cooldown when the saved one is unusable', () => {
    expect(parsePendingCode(JSON.stringify({ ...saved, cooldownSeconds: -1 }), NOW)?.cooldownSeconds).toBe(CONFIRMATION_RESEND_COOLDOWN_SECONDS)
    expect(parsePendingCode(JSON.stringify({ ...saved, cooldownSeconds: 'soon' }), NOW)?.cooldownSeconds).toBe(CONFIRMATION_RESEND_COOLDOWN_SECONDS)
  })
})

describe('isCodeStillFresh', () => {
  it('is true for the same address and purpose inside the resend wait', () => {
    expect(isCodeStillFresh(saved, 'resident@example.com', 'recovery', NOW)).toBe(true)
    expect(isCodeStillFresh(saved, '  Resident@Example.com ', 'recovery', NOW)).toBe(true)
  })

  it('is false once another code may be sent', () => {
    expect(isCodeStillFresh(saved, 'resident@example.com', 'recovery', saved.sentAt + 60_000)).toBe(false)
  })

  it('is false for another address, another purpose, or nothing sent', () => {
    expect(isCodeStillFresh(saved, 'other@example.com', 'recovery', NOW)).toBe(false)
    expect(isCodeStillFresh(saved, 'resident@example.com', 'signup', NOW)).toBe(false)
    expect(isCodeStillFresh(null, 'resident@example.com', 'recovery', NOW)).toBe(false)
  })
})
