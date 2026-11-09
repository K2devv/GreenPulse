import { describe, expect, it } from 'vitest'
import { BACK_LAYER_ORDER, topBackLayer } from './native-back'

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
