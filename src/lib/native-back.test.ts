import { describe, expect, it } from 'vitest'
import { BACK_LAYER_ORDER, topBackLayer, topEscapeLayer } from './native-back'

describe('topBackLayer', () => {
  it('returns undefined when nothing is open', () => {
    expect(topBackLayer({})).toBeUndefined()
    expect(topBackLayer({ auth: false, 'map-sheet': false })).toBeUndefined()
  })

  it('closes a dialog before the screen beneath it', () => {
    expect(topBackLayer({ 'report-form': true, auth: true })).toBe('auth')
    expect(topBackLayer({ 'staff-detail': true, 'staff-mode': true })).toBe('staff-detail')
    expect(topBackLayer({ 'map-sheet': true, notifications: true })).toBe('notifications')
  })

  it('treats the command palette as the topmost layer', () => {
    const everything = Object.fromEntries(BACK_LAYER_ORDER.map((layer) => [layer, true]))
    expect(topBackLayer(everything)).toBe('palette')
  })

  it('leaves the staff desk last', () => {
    expect(topBackLayer({ 'staff-mode': true })).toBe('staff-mode')
  })
})

describe('topEscapeLayer', () => {
  it('closes the topmost overlay', () => {
    expect(topEscapeLayer({ notifications: true })).toBe('notifications')
    expect(topEscapeLayer({ profile: true, notifications: true })).toBe('profile')
    expect(topEscapeLayer({ auth: true, 'guest-tracking': true })).toBe('auth')
  })

  it('never closes the report form, but closes an overlay opened above it', () => {
    expect(topEscapeLayer({ 'report-form': true })).toBeUndefined()
    expect(topEscapeLayer({ 'report-form': true, notifications: true })).toBeUndefined()
    expect(topEscapeLayer({ 'report-form': true, auth: true })).toBe('auth')
  })

  it('leaves the command palette to its own Escape handling', () => {
    expect(topEscapeLayer({ palette: true, profile: true })).toBeUndefined()
  })

  it('leaves pages such as the staff desk and the map sheet alone', () => {
    expect(topEscapeLayer({ 'staff-mode': true, 'staff-detail': true, 'map-sheet': true, 'staff-filters': true })).toBeUndefined()
    expect(topEscapeLayer({})).toBeUndefined()
  })
})
