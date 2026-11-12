import { describe, expect, it } from 'vitest'
import { formatPlaceLabel, MAX_PLACE_LABEL_LENGTH } from './place-label'

describe('formatPlaceLabel', () => {
  it('builds a street-level label from a full Photon address', () => {
    expect(formatPlaceLabel({
      name: 'Jollibee', housenumber: '120', street: 'Quirino Highway', district: 'Gulod', locality: 'Novaliches',
      city: 'Quezon City', county: 'Fourth District', state: 'Metro Manila', country: 'Philippines', postcode: '1117',
    })).toBe('Jollibee, 120 Quirino Highway, Novaliches, Barangay Gulod, Quezon City')
  })

  it('uses a street alone and does not repeat it as the landmark', () => {
    expect(formatPlaceLabel({ name: 'Quirino Highway', street: 'Quirino Highway', city: 'Quezon City', state: 'Metro Manila' }))
      .toBe('Quirino Highway, Quezon City')
  })

  it('ignores a house number that has no street', () => {
    expect(formatPlaceLabel({ housenumber: '42', district: 'Fairview' })).toBe('Barangay Fairview, Quezon City')
  })

  it('recognizes a barangay given with a prefix and removes the duplicate locality', () => {
    expect(formatPlaceLabel({ street: 'Regalado Avenue', district: 'Brgy. North Fairview', locality: 'North Fairview' }))
      .toBe('Regalado Avenue, Barangay North Fairview, Quezon City')
    expect(formatPlaceLabel({ street: 'Regalado Avenue', district: 'Barangay Fairview' })).toBe('Regalado Avenue, Barangay Fairview, Quezon City')
  })

  it('keeps a locality that is not a barangay', () => {
    expect(formatPlaceLabel({ street: 'Susano Road', locality: 'Sitio Kalikasan', district: 'Santa Monica' }))
      .toBe('Susano Road, Sitio Kalikasan, Barangay Santa Monica, Quezon City')
  })

  it('does not treat a name that is the barangay itself as a landmark', () => {
    expect(formatPlaceLabel({ name: 'Gulod', type: 'district', district: 'Gulod', city: 'Quezon City' })).toBe('Barangay Gulod, Quezon City')
  })

  it('skips country and region noise', () => {
    expect(formatPlaceLabel({ name: 'Metro Manila', state: 'Metro Manila', country: 'Philippines', city: 'Quezon City' })).toBe('')
    expect(formatPlaceLabel({ name: 'Quezon City', city: 'Quezon City' })).toBe('')
  })

  it('returns nothing for empty input', () => {
    expect(formatPlaceLabel({})).toBe('')
    expect(formatPlaceLabel(null)).toBe('')
    expect(formatPlaceLabel(undefined)).toBe('')
  })

  it('handles numeric and padded values', () => {
    expect(formatPlaceLabel({ housenumber: 7, street: '  Tandang   Sora Avenue ' })).toBe('7 Tandang Sora Avenue, Quezon City')
  })

  it('stays within the length limit and keeps the city', () => {
    const label = formatPlaceLabel({ name: 'A'.repeat(90), street: 'B'.repeat(90), locality: 'C'.repeat(90), district: 'Gulod' })
    expect(label.length).toBeLessThanOrEqual(MAX_PLACE_LABEL_LENGTH)
    expect(label.endsWith('Quezon City')).toBe(true)
    expect(formatPlaceLabel({ name: 'X'.repeat(400) }).length).toBeLessThanOrEqual(MAX_PLACE_LABEL_LENGTH)
  })
})
