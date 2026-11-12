import { describe, expect, it } from 'vitest'
import { formatExactCoordinates, openStreetMapUrl } from './ExactLocation'

describe('exact location helpers', () => {
  it('shows up to 6 decimals without trailing zeros', () => {
    expect(formatExactCoordinates([14.7222123456789, 121.05])).toBe('14.722212, 121.05')
  })

  it('links to OpenStreetMap centered on the point', () => {
    expect(openStreetMapUrl([14.722212, 121.05])).toBe('https://www.openstreetmap.org/?mlat=14.722212&mlon=121.05#map=18/14.722212/121.05')
  })
})
