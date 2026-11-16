import { useEffect } from 'react'
import { FOCUSABLE_SELECTOR, trappedFocusIndex } from './lib/focus-trap'

/** The modal dialog nothing else is drawn over: the one whose own middle is not covered by another layer. */
function topModalDialog(): HTMLElement | undefined {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'))
  const uncovered = dialogs.filter((dialog) => {
    const box = dialog.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit !== null && dialog.contains(hit)
  })
  return uncovered[uncovered.length - 1] ?? dialogs[dialogs.length - 1]
}

/**
 * While a modal dialog (`aria-modal="true"`) is open, Tab and Shift+Tab stay inside it instead of
 * reaching the page behind. Installed once, so each dialog only has to mark itself as modal.
 */
export function useDialogFocusTrap() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      const dialog = topModalDialog()
      if (!dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((item) => item.getClientRects().length > 0)
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const active = document.activeElement
      const next = trappedFocusIndex(items.length, active instanceof HTMLElement ? items.indexOf(active) : -1, event.shiftKey)
      if (next === undefined) return
      event.preventDefault()
      items[next].focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
