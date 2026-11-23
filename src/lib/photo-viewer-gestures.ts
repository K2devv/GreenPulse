/**
 * Gesture and slider rules for the photo viewer, kept apart from the component so they can be
 * tested: which way a drag is going, when a downward swipe closes the viewer, and where the
 * before-and-after slider's divider sits.
 */

/** A drag is locked to one direction once it has moved this far, in CSS pixels. */
export const AXIS_LOCK = 10
/** A downward swipe past this distance closes the viewer, in CSS pixels. */
export const DISMISS_DISTANCE = 120
/** A quick downward flick closes the viewer even when it is short, in CSS pixels per millisecond. */
export const DISMISS_SPEED = 0.6
/** How far the page shows through before a swipe down closes the viewer, in CSS pixels. */
const DISMISS_FADE = 320

/** The direction a drag is going once it has moved far enough to tell, or undefined while it is too short. */
export function dragAxis(dx: number, dy: number): 'x' | 'y' | undefined {
  if (Math.hypot(dx, dy) < AXIS_LOCK) return undefined
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
}

/** How far along a swipe down is, from 0 (not moved) to 1 (fully faded), for fading the viewer as it goes. */
export function dismissProgress(dy: number): number {
  return Math.max(0, Math.min(1, dy / DISMISS_FADE))
}

/** Whether a swipe down that ended `dy` pixels down at `speed` px/ms should close the viewer. */
export function shouldDismiss(dy: number, speed: number): boolean {
  return dy >= DISMISS_DISTANCE || (dy > AXIS_LOCK * 2 && speed >= DISMISS_SPEED)
}

/** The slider's divider stays a little in from each edge, so both photos always show a sliver. */
export const SPLIT_MIN = 2
export const SPLIT_MAX = 98

export const clampSplit = (value: number) => Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, value))

/** The divider position, in percent across the frame, for a pointer at `clientX`. */
export function splitAt(clientX: number, frame: { left: number; width: number }): number {
  if (frame.width <= 0) return 50
  return clampSplit(((clientX - frame.left) / frame.width) * 100)
}

/**
 * The divider after a key press on the slider: arrows move it 5% (25% with Shift), Home and End
 * go to the edges, and anything else returns undefined so the key is left alone.
 */
export function splitAfterKey(value: number, key: string, shift: boolean): number | undefined {
  const step = shift ? 25 : 5
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clampSplit(value - step)
  if (key === 'ArrowRight' || key === 'ArrowUp') return clampSplit(value + step)
  if (key === 'Home') return SPLIT_MIN
  if (key === 'End') return SPLIT_MAX
  return undefined
}
