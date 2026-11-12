import { useCallback, useId, useState, type CSSProperties } from 'react'
import { MapPinOff, Maximize, Minus, Plus, type LucideIcon } from 'lucide-react'
import type { MapInstance } from '@vis.gl/react-maplibre'
import { motionIsReduced } from './display-prefs'
import { fitBoundsCamera, type Bounds, type FitCamera, type Padding } from './lib/map-viewport'

/** Closest zoom. The vector tiles stop at zoom 14 and are drawn larger beyond it. */
export const MAP_MAX_ZOOM = 18.5
/** Street-level zoom used when the map centers on a report, a search result, or a GPS fix. */
export const MAP_FOCUS_ZOOM = 15
/** Lines the pin's tip up with its coordinate: the tip sits 2.5 px above the bottom of the 40 x 50 pin box. */
export const PIN_OFFSET: [number, number] = [0, 2.5]

/** Animation length for a camera move, or 0 when motion is reduced in the app or the OS. */
export const cameraDuration = (milliseconds: number) => (motionIsReduced() ? 0 : milliseconds)

/**
 * Keeps a map inside the district. `lock` holds the camera that shows the whole district
 * with `padding` clear: its zoom is the map's minimum zoom and its view is the pan limit.
 * Call `measure` when the map loads and whenever it resizes.
 */
export function useDistrictLock(bounds: Bounds, padding: Padding) {
  const [lock, setLock] = useState<FitCamera | null>(null)
  const measure = useCallback((map: MapInstance) => {
    const { clientWidth, clientHeight } = map.getContainer()
    if (!clientWidth || !clientHeight) return null
    const next = fitBoundsCamera(bounds, clientWidth, clientHeight, padding, MAP_MAX_ZOOM)
    setLock((current) => (current && current.zoom === next.zoom && current.view.every((value, index) => value === next.view[index]) ? current : next))
    return next
  }, [bounds, padding])
  return { lock, measure }
}

/** Turns off rotating and tilting, which this flat, north-up map does not use. */
export function lockNorthUp(map: MapInstance) {
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
}

// A 40 x 50 balloon: round head centered at (20, 19) with radius 16, tapering to a tip at (20, 47.5).
const PIN_PATH = 'M10.15 31.61A16 16 0 1 1 29.85 31.61Q24.6 38.2 21.3 45.4Q20 47.9 18.7 45.4Q15.4 38.2 10.15 31.61Z'

export const statusSlug = (status: string) => status.toLowerCase().replace(/ /g, '-')

type MapPinProps = {
  color: string
  icon: LucideIcon
  /** Read by screen readers. */
  label: string
  /** Shown in a chip on hover or keyboard focus. */
  title?: string
  status?: string
  urgent?: boolean
  /** Resolved or closed: drawn smaller and faded so open issues lead. */
  muted?: boolean
  selected?: boolean
  /** 'location' is the draggable report-form pin; it is not a button. */
  variant?: 'report' | 'location'
  dragging?: boolean
  /** Entrance animation delay in milliseconds. */
  delay?: number
}

export function MapPin({ color, icon: Icon, label, title, status, urgent, muted, selected, variant = 'report', dragging, delay = 0 }: MapPinProps) {
  // Each pin carries its own gradient so two maps on the page never share an element id.
  const sheenId = `pin-sheen-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const classes = ['map-pin', variant === 'location' ? 'location-pin' : 'report-pin', urgent && 'is-urgent', muted && 'is-muted', selected && 'is-selected', dragging && 'is-dragging'].filter(Boolean).join(' ')
  const style = { '--pin-color': color, '--pin-delay': `${delay}ms` } as CSSProperties
  const body = <>
    <svg className="map-pin-shape" viewBox="0 0 40 50" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".46" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#000" stopOpacity=".2" />
        </linearGradient>
      </defs>
      <path className="map-pin-body" d={PIN_PATH} />
      <path className="map-pin-sheen" d={PIN_PATH} fill={`url(#${sheenId})`} />
    </svg>
    {urgent && <span className="map-pin-urgent" aria-hidden="true" />}
    <span className="map-pin-glyph"><Icon size={17} strokeWidth={2.3} aria-hidden="true" /></span>
    {status && <i className="report-pin-status" data-status={statusSlug(status)} />}
    {title && <span className="map-pin-chip" aria-hidden="true">{title}</span>}
  </>
  if (variant === 'location') return <span className={classes} style={style}>{body}<span className="sr-only">{label}</span></span>
  return <button type="button" className={classes} style={style} aria-label={label} aria-pressed={selected}>{body}</button>
}

/** A group of nearby reports: the ring shows the category mix, the badge counts open high-urgency reports. */
export function ClusterBubble({ count, urgent, ring }: { count: number; urgent: number; ring?: string }) {
  const size = count < 10 ? 42 : count < 50 ? 48 : 56
  const style = { '--cluster-ring': ring ?? 'var(--accent-line)', '--cluster-size': `${size}px` } as CSSProperties
  return <button type="button" className="report-cluster" style={style} aria-label={`${count} reports${urgent ? `, ${urgent} high urgency` : ''}. Zoom in.`}>
    <span className="report-cluster-count" aria-hidden="true">{count}</span>
    {urgent > 0 && <i className="report-cluster-urgent" aria-hidden="true">{urgent}</i>}
  </button>
}

export function UserDot() {
  return <span className="user-location-dot"><span className="sr-only">Your location</span></span>
}

type MapZoomControlsProps = {
  onZoomIn: () => void
  onZoomOut: () => void
  /** Adds a third button that returns to the whole district. */
  onFit?: () => void
  canZoomIn?: boolean
  canZoomOut?: boolean
}

export function MapZoomControls({ onZoomIn, onZoomOut, onFit, canZoomIn = true, canZoomOut = true }: MapZoomControlsProps) {
  return <div className="map-zoom" role="group" aria-label="Map zoom">
    <button type="button" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
    <button type="button" onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
    {onFit && <button type="button" onClick={onFit} aria-label="Show all of District 5" title="Show all of District 5"><Maximize size={15} /></button>}
  </div>
}

/** Placeholder shown while the map code and outlines load. */
export function MapSkeleton() {
  return <div className="map-skeleton skeleton" role="status" aria-busy="true"><span className="sr-only">Loading map…</span></div>
}

/** Shown when the map cannot start, for example on a device without WebGL2. */
export function MapUnavailable({ detail }: { detail: string }) {
  return <div className="map-unavailable" role="status">
    <MapPinOff size={22} aria-hidden="true" />
    <strong>The map could not be displayed</strong>
    <span>{detail}</span>
  </div>
}
