import { t } from './i18n'
/**
 * Zoom and pan for the photo viewer. Points are in CSS pixels measured from the middle of the
 * stage; `x` and `y` move the middle of the photo, and `scale` is relative to the photo fitted
 * inside the stage (1 shows the whole photo).
 */

export type Size = { width: number; height: number }
export type Point = { x: number; y: number }
export type ZoomState = { scale: number; x: number; y: number }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
/** Where a click, double tap or the zoom-in button lands from the fitted view. */
export const TAP_ZOOM = 2.5
/** The zoom buttons and keys step through these. */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const
export const FITTED: ZoomState = { scale: 1, x: 0, y: 0 }

export const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))

/** The photo's size fitted inside the stage at its own aspect ratio, never past its natural size. */
export function fitSize(natural: Size, stage: Size): Size {
  if (natural.width <= 0 || natural.height <= 0 || stage.width <= 0 || stage.height <= 0) return { width: 0, height: 0 }
  const factor = Math.min(stage.width / natural.width, stage.height / natural.height, 1)
  return { width: natural.width * factor, height: natural.height * factor }
}

/** Keeps the zoomed photo covering the stage: no pan along a side where it fits, no gap past an edge. */
export function clampPan(state: ZoomState, photo: Size, stage: Size): ZoomState {
  const scale = clampZoom(state.scale)
  const limitX = Math.max(0, (photo.width * scale - stage.width) / 2)
  const limitY = Math.max(0, (photo.height * scale - stage.height) / 2)
  const clamp = (value: number, limit: number) => limit === 0 ? 0 : Math.min(limit, Math.max(-limit, value))
  return { scale, x: clamp(state.x, limitX), y: clamp(state.y, limitY) }
}

/** Zooms to `scale` while the part of the photo under `point` stays under it. */
export function zoomAt(state: ZoomState, scale: number, point: Point, photo: Size, stage: Size): ZoomState {
  const next = clampZoom(scale)
  if (next === MIN_ZOOM) return FITTED
  const ratio = next / state.scale
  return clampPan({ scale: next, x: point.x - (point.x - state.x) * ratio, y: point.y - (point.y - state.y) * ratio }, photo, stage)
}

/**
 * A pinch: the zoom when the two fingers came down (`start`, with their midpoint and spread),
 * followed to where the fingers are now, so the photo both scales and moves with them.
 */
export function pinchZoom(start: ZoomState, startMid: Point, startSpread: number, mid: Point, spread: number, photo: Size, stage: Size): ZoomState {
  if (startSpread <= 0) return start
  const scale = clampZoom(start.scale * spread / startSpread)
  // The photo point under the starting midpoint stays under the fingers' current midpoint.
  const ratio = scale / start.scale
  return clampPan({ scale, x: mid.x - (startMid.x - start.x) * ratio, y: mid.y - (startMid.y - start.y) * ratio }, photo, stage)
}

export function panBy(state: ZoomState, dx: number, dy: number, photo: Size, stage: Size): ZoomState {
  return clampPan({ scale: state.scale, x: state.x + dx, y: state.y + dy }, photo, stage)
}

/** A rotation in quarter turns, counted up without limit so it always animates forward, as 0 to 3. */
export const quarterTurns = (turns: number) => ((turns % 4) + 4) % 4

/** A size turned by `turns` quarter turns: width and height swap on every odd turn. */
export function rotatedSize(size: Size, turns: number): Size {
  return quarterTurns(turns) % 2 === 1 ? { width: size.height, height: size.width } : size
}

/**
 * The part of the photo the stage shows, as fractions of the photo (0 to 1 from its top left), for
 * the zoom navigator.
 */
export function visibleRegion(state: ZoomState, photo: Size, stage: Size): { left: number; top: number; width: number; height: number } {
  if (photo.width <= 0 || photo.height <= 0) return { left: 0, top: 0, width: 1, height: 1 }
  const span = (offset: number, view: number, length: number) => {
    // The stage spans -view/2 to view/2 around its middle; on the photo that is (p - offset) / scale.
    const start = Math.max(0, Math.min(1, (-view / 2 - offset) / state.scale / length + 0.5))
    const end = Math.max(0, Math.min(1, (view / 2 - offset) / state.scale / length + 0.5))
    return { start, size: end - start }
  }
  const x = span(state.x, stage.width, photo.width)
  const y = span(state.y, stage.height, photo.height)
  return { left: x.start, top: y.start, width: x.size, height: y.size }
}

/** Moves the zoomed photo so the point at `fraction` of it (0 to 1 from its top left) sits in the middle of the stage. */
export function centerOn(state: ZoomState, fraction: Point, photo: Size, stage: Size): ZoomState {
  const x = -(fraction.x - 0.5) * photo.width * state.scale
  const y = -(fraction.y - 0.5) * photo.height * state.scale
  return clampPan({ scale: state.scale, x, y }, photo, stage)
}

/** The next zoom step up (`direction` 1) or down (-1) from `scale`. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > scale + 0.01) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - 0.01) ?? MIN_ZOOM
}

/** The zoom readout: "Fit" for the whole photo, otherwise "1.5×", "2×". */
export function zoomLabel(scale: number): string {
  if (scale <= MIN_ZOOM + 0.01) return t('Fit')
  return `${Math.round(scale * 10) / 10}×`
}
