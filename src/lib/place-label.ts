import { DISTRICT_5_BARANGAYS } from './report-filters'

/** The address fields Photon (photon.komoot.io) returns for a place. All are optional. */
export type PhotonProperties = Partial<Record<
  'name' | 'housenumber' | 'street' | 'postcode' | 'locality' | 'district' | 'suburb' | 'neighbourhood' | 'city' | 'county' | 'state' | 'country' | 'countrycode' | 'type',
  string | number | undefined | null
>>

/** The longest label stored. The guest API and the form accept up to 200 characters. */
export const MAX_PLACE_LABEL_LENGTH = 180

const CITY = 'Quezon City'
const BARANGAY_PREFIX = /^(?:barangay|brgy\.?)\s+/i
const knownBarangays = new Map(DISTRICT_5_BARANGAYS.map((barangay) => [barangay.toLowerCase(), barangay]))

function text(value: string | number | undefined | null) {
  return value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim()
}

/** A lowercase key for comparing names: "Barangay Gulod", "Brgy. Gulod" and "gulod" are the same place. */
function nameKey(value: string) {
  return value.replace(BARANGAY_PREFIX, '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
}

/** The barangay a value names ("Barangay Gulod" or a bare District 5 barangay name), as "Barangay Gulod". */
function asBarangay(value: string) {
  if (!value) return undefined
  if (BARANGAY_PREFIX.test(value)) {
    const bare = value.replace(BARANGAY_PREFIX, '').trim()
    return bare ? `Barangay ${knownBarangays.get(bare.toLowerCase()) ?? bare}` : undefined
  }
  const known = knownBarangays.get(value.toLowerCase())
  return known ? `Barangay ${known}` : undefined
}

/**
 * Builds a street-level place label from Photon properties, most specific first:
 * landmark, house number and street, locality, barangay, then "Quezon City".
 * Country, region, province and postcode are left out, and repeated names are dropped.
 * Returns '' when Photon gave nothing more specific than the city, so callers can treat the
 * place as unknown instead of storing a label that names the whole city.
 */
export function formatPlaceLabel(properties: PhotonProperties | null | undefined, maxLength = MAX_PLACE_LABEL_LENGTH): string {
  if (!properties) return ''
  const name = text(properties.name)
  const street = text(properties.street)
  const houseNumber = text(properties.housenumber)
  const areas = [properties.locality, properties.suburb, properties.neighbourhood, properties.district].map(text).filter(Boolean)
  const regionNoise = new Set([properties.city, properties.county, properties.state, properties.country, CITY, 'Metro Manila', 'Philippines', 'National Capital Region', 'Manila'].map((value) => nameKey(text(value))).filter(Boolean))

  const barangay = [...areas, name].map(asBarangay).find(Boolean)
  const parts: string[] = []
  // A name that only repeats the street, the city or the region is not a landmark.
  if (name && !asBarangay(name) && nameKey(name) !== nameKey(street) && !regionNoise.has(nameKey(name))) parts.push(name)
  // A house number on its own says little, so it is only used together with a street.
  if (street) parts.push(houseNumber ? `${houseNumber} ${street}` : street)
  for (const area of areas) if (!asBarangay(area) && !regionNoise.has(nameKey(area))) parts.push(area)
  if (!parts.length && !barangay) return ''
  if (barangay) parts.push(barangay)

  const seen = new Set<string>()
  const unique = parts.filter((part) => {
    const key = nameKey(part)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  unique.push(CITY)

  // Over the limit: drop the least specific middle parts first, then cut as a last resort.
  while (unique.join(', ').length > maxLength && unique.length > 2) unique.splice(unique.length - 2, 1)
  const label = unique.join(', ')
  return label.length > maxLength ? `${label.slice(0, maxLength - 1).trimEnd()}…` : label
}
