import { useLayoutEffect, useRef, type RefObject } from 'react'
import { motionIsReduced } from './display-prefs'

const EASING = 'cubic-bezier(.2, .8, .2, 1)'

// Animates children marked with data-flip-id when their order changes or new ones are added.
export function useFlip(containerRef: RefObject<HTMLElement | null>, signature: string) {
  const positions = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const reduced = motionIsReduced()
    const hadItems = positions.current.size > 0
    const next = new Map<string, number>()
    container.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((element) => {
      const id = element.dataset.flipId as string
      const top = element.offsetTop
      next.set(id, top)
      if (reduced || typeof element.animate !== 'function') return
      const previous = positions.current.get(id)
      if (previous !== undefined && previous !== top) {
        element.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: EASING })
      } else if (previous === undefined && hadItems) {
        element.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASING })
      }
    })
    positions.current = next
  }, [containerRef, signature])
}
