import { describe, expect, it } from 'vitest'
import { LEGACY_THEME_KEY, THEME_CHOICE_KEY, oppositeTheme, readThemeChoice, resolveTheme } from './theme-preference'

const storageWith = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

describe('readThemeChoice', () => {
  it('returns the stored choice', () => {
    expect(readThemeChoice(storageWith({ [THEME_CHOICE_KEY]: 'light' }))).toBe('light')
    expect(readThemeChoice(storageWith({ [THEME_CHOICE_KEY]: 'dark' }))).toBe('dark')
  })

  it('returns null when nothing was chosen so the system setting applies', () => {
    expect(readThemeChoice(storageWith({}))).toBeNull()
    expect(readThemeChoice(undefined)).toBeNull()
  })

  it('keeps a dark theme saved by older builds but ignores their automatic light value', () => {
    expect(readThemeChoice(storageWith({ [LEGACY_THEME_KEY]: 'dark' }))).toBe('dark')
    expect(readThemeChoice(storageWith({ [LEGACY_THEME_KEY]: 'light' }))).toBeNull()
  })

  it('prefers the new key over the legacy one', () => {
    expect(readThemeChoice(storageWith({ [THEME_CHOICE_KEY]: 'light', [LEGACY_THEME_KEY]: 'dark' }))).toBe('light')
  })

  it('ignores unknown values and unavailable storage', () => {
    expect(readThemeChoice(storageWith({ [THEME_CHOICE_KEY]: 'sepia' }))).toBeNull()
    expect(readThemeChoice({ getItem: () => { throw new Error('blocked') } })).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('uses an explicit choice over the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system setting when there is no choice', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })
})

describe('oppositeTheme', () => {
  it('flips the theme', () => {
    expect(oppositeTheme('light')).toBe('dark')
    expect(oppositeTheme('dark')).toBe('light')
  })
})
