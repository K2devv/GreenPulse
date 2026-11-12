import { describe, expect, it } from 'vitest'
import { OTP_CODE_LENGTH, clearDigit, codeValue, emptyCode, fillDigits, formatCountdown, isCodeComplete } from './otp-code'

describe('emptyCode', () => {
  it('makes one empty box per digit', () => {
    expect(emptyCode()).toEqual(['', '', '', '', '', ''])
    expect(emptyCode(4)).toHaveLength(4)
    expect(OTP_CODE_LENGTH).toBe(6)
  })
})

describe('fillDigits', () => {
  it('writes a typed digit and moves to the next box', () => {
    expect(fillDigits(emptyCode(), 0, '4')).toEqual({ digits: ['4', '', '', '', '', ''], focusIndex: 1 })
    expect(fillDigits(['4', '', '', '', '', ''], 1, '2')).toEqual({ digits: ['4', '2', '', '', '', ''], focusIndex: 2 })
  })

  it('replaces a filled box and stays on the last box at the end', () => {
    expect(fillDigits(['1', '2', '3', '4', '5', '6'], 5, '9')).toEqual({ digits: ['1', '2', '3', '4', '5', '9'], focusIndex: 5 })
  })

  it('fills every box from a pasted code, ignoring spaces, dashes and words', () => {
    expect(fillDigits(emptyCode(), 3, 'Code: 123-456').digits).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(fillDigits(emptyCode(), 0, '123 456')).toEqual({ digits: ['1', '2', '3', '4', '5', '6'], focusIndex: 5 })
  })

  it('writes a short paste from the current box and drops extra digits past the end', () => {
    expect(fillDigits(emptyCode(), 2, '78')).toEqual({ digits: ['', '', '7', '8', '', ''], focusIndex: 4 })
    expect(fillDigits(emptyCode(), 4, '789')).toEqual({ digits: ['', '', '', '', '7', '8'], focusIndex: 5 })
  })

  it('ignores text without digits and clamps a bad index', () => {
    expect(fillDigits(['1', '', '', '', '', ''], 1, 'abc')).toEqual({ digits: ['1', '', '', '', '', ''], focusIndex: 1 })
    expect(fillDigits(emptyCode(), -3, '5').digits[0]).toBe('5')
    expect(fillDigits(emptyCode(), 99, '5').digits[5]).toBe('5')
  })

  it('does not change the input array', () => {
    const digits = emptyCode()
    fillDigits(digits, 0, '1')
    expect(digits).toEqual(emptyCode())
  })
})

describe('clearDigit', () => {
  it('clears the current box when it has a digit', () => {
    expect(clearDigit(['1', '2', '3', '', '', ''], 2)).toEqual({ digits: ['1', '2', '', '', '', ''], focusIndex: 2 })
  })

  it('clears the previous box and moves back when the current box is empty', () => {
    expect(clearDigit(['1', '2', '3', '', '', ''], 3)).toEqual({ digits: ['1', '2', '', '', '', ''], focusIndex: 2 })
  })

  it('stays on the first box', () => {
    expect(clearDigit(emptyCode(), 0)).toEqual({ digits: emptyCode(), focusIndex: 0 })
  })
})

describe('codeValue and isCodeComplete', () => {
  it('joins the digits and knows when every box is filled', () => {
    expect(codeValue(['1', '2', '3', '4', '5', '6'])).toBe('123456')
    expect(isCodeComplete(['1', '2', '3', '4', '5', '6'])).toBe(true)
    expect(isCodeComplete(['1', '2', '', '4', '5', '6'])).toBe(false)
    expect(isCodeComplete([])).toBe(false)
  })
})

describe('formatCountdown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCountdown(42)).toBe('0:42')
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(5.2)).toBe('0:06')
    expect(formatCountdown(-3)).toBe('0:00')
  })
})
