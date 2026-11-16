/** Keeps keyboard focus inside the open dialog: the rule behind useDialogFocusTrap. */

/** What Tab can land on inside a dialog. */
export const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Where Tab should go inside a dialog with `count` focusable elements, when focus is on element
 * `current` (-1 when focus is outside the dialog). Returns the index to focus, or undefined to let
 * the browser move focus as usual.
 */
export function trappedFocusIndex(count: number, current: number, backwards: boolean): number | undefined {
  if (count === 0) return undefined
  // Focus is behind the dialog: bring it in at the end Tab was heading for.
  if (current < 0) return backwards ? count - 1 : 0
  if (backwards && current === 0) return count - 1
  if (!backwards && current === count - 1) return 0
  return undefined
}
