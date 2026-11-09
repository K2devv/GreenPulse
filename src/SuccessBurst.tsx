import { useEffect, type CSSProperties } from 'react'
import { Check, Leaf } from 'lucide-react'
import { motionIsReduced } from './display-prefs'

// The full celebration plays for 2.2s. With motion reduced the card is static, so it only needs to stay long enough to read.
const CELEBRATION_MS = 2200
const STATIC_MS = 1400

const LEAVES = Array.from({ length: 12 }, (_, index) => ({ angle: index * 30 + (index % 2 ? 8 : -8), distance: 90 + (index % 3) * 28, delay: (index % 4) * 40 }))

export function SuccessBurst({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, motionIsReduced() ? STATIC_MS : CELEBRATION_MS)
    return () => window.clearTimeout(timer)
  }, [onDone])

  return <div className="success-burst" role="status" aria-live="polite" onClick={onDone}>
    <div className="success-burst-card">
      <span className="success-burst-check" aria-hidden="true">
        <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" /><path d="M15 27l8 8 15-17" /></svg>
        {LEAVES.map((leaf, index) => <i key={index} style={{ '--angle': `${leaf.angle}deg`, '--distance': `${leaf.distance}px`, '--delay': `${leaf.delay}ms` } as CSSProperties}><Leaf size={14} /></i>)}
      </span>
      <strong><Check size={14} aria-hidden="true" /> {message}</strong>
    </div>
  </div>
}
