/** Screen geometry for map markers: cluster bubble sizes and keeping bubbles clear of the selected pin. */

/** On-screen diameter of a cluster bubble: larger groups get a larger bubble. */
export function clusterBubbleSize(count: number): number {
  return count < 10 ? 42 : count < 50 ? 48 : 56
}

/** A selected pin on screen, measured from its tip: 40 × 50 px drawn at 1.24× and lifted 3 px. */
export const SELECTED_PIN_BOX = { halfWidth: 25, height: 66 }
const CLEARANCE_GAP = 6

/**
 * The selected report is drawn on its own, so the reports around it can still form a bubble right
 * under its pin and hide the bubble's count. Given the bubble's centre relative to the pin's tip
 * in screen pixels (y grows downward), returns the [x, y] shift that moves an overlapping bubble
 * sideways, on the side it was already on, until it clears the pin; [0, 0] when it does not overlap.
 */
export function clusterClearance(dx: number, dy: number, bubbleSize: number, pin = SELECTED_PIN_BOX): [number, number] {
  const radius = bubbleSize / 2
  const overlapsX = Math.abs(dx) < pin.halfWidth + radius
  const overlapsY = dy > -pin.height - radius && dy < radius
  if (!overlapsX || !overlapsY) return [0, 0]
  const side = dx < 0 ? -1 : 1
  return [side * (pin.halfWidth + radius + CLEARANCE_GAP) - dx, 0]
}
