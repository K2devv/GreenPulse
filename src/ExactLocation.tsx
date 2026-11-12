import { MapPin } from 'lucide-react'

/** Coordinates to at most 6 decimals (about 0.1 m), without trailing zeros. */
export function formatExactCoordinates([latitude, longitude]: [number, number]) {
  return `${Number(latitude.toFixed(6))}, ${Number(longitude.toFixed(6))}`
}

export function openStreetMapUrl([latitude, longitude]: [number, number]) {
  const lat = Number(latitude.toFixed(6))
  const lon = Number(longitude.toFixed(6))
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`
}

/**
 * The address and precise coordinates a reporter gave. Only the reporter and staff can read these
 * from the database; public views show the generalized barangay label instead, so this block must
 * only be given a report from the private `reports` table.
 */
export function ExactLocation({ label, coordinates }: { label: string; coordinates: [number, number] }) {
  return <section className="exact-location" aria-label="Exact location">
    <span className="field-label">Exact location</span>
    <p className="workflow-meta"><MapPin size={12} aria-hidden="true" />{label || 'No address recorded'}</p>
    <p className="section-caption">{formatExactCoordinates(coordinates)}</p>
    <a className="text-button" href={openStreetMapUrl(coordinates)} target="_blank" rel="noreferrer">Open in map</a>
    <p className="workflow-hint">Visible to staff and the reporter only</p>
  </section>
}
