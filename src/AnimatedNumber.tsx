import { useEffect, useRef, useState } from 'react'
import { motionIsReduced } from './display-prefs'

const prefersReducedMotion = motionIsReduced

export function AnimatedNumber({ value, duration = 600 }: { value: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(() => (prefersReducedMotion() ? value : 0))
  const displayedRef = useRef(displayed)

  useEffect(() => {
    if (prefersReducedMotion() || displayedRef.current === value) {
      displayedRef.current = value
      setDisplayed(value)
      return
    }
    const from = displayedRef.current
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = Math.round(from + (value - from) * eased)
      displayedRef.current = next
      setDisplayed(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className="animated-number" role="img" aria-label={String(value)}>{displayed}</span>
}

export function StatNumber({ value, loading = false }: { value: number; loading?: boolean }) {
  if (!loading) return <AnimatedNumber value={value} />
  return <><span className="skeleton skeleton-stat" aria-hidden="true" /><span className="sr-only">Loading</span></>
}
