import { useEffect } from 'react'
import { MapPin, PenLine, Radar, X } from 'lucide-react'
import type { CSSProperties } from 'react'

const STEPS = [
  { icon: MapPin, title: 'Spot it', text: 'See what neighbours already reported nearby.' },
  { icon: PenLine, title: 'Report it', text: 'Add a photo and a pin. No account needed.' },
  { icon: Radar, title: 'Track it', text: 'Follow progress and confirm the fix.' },
]

export function WelcomeTour({ onDismiss, onSeen }: { onDismiss: () => void; onSeen: () => void }) {
  // Showing the introduction once is enough: it will not reappear on the next visit.
  useEffect(() => { onSeen() }, [onSeen])
  return <section className="welcome-tour" aria-label="How GreenPulse works">
    <div className="welcome-tour-head">
      <h2>How GreenPulse works</h2>
      <span className="welcome-tip">Tip: press <kbd>Ctrl</kbd> <kbd>K</kbd> to search and jump anywhere.</span>
      <button className="icon-button" type="button" onClick={onDismiss} aria-label="Dismiss the introduction"><X size={15} /></button>
    </div>
    <ol className="welcome-steps">
      {STEPS.map((step, index) => <li key={step.title} style={{ '--i': index } as CSSProperties}>
        <span className="welcome-step-icon"><step.icon size={16} aria-hidden="true" /></span>
        <span><strong>{index + 1}. {step.title}</strong><small>{step.text}</small></span>
      </li>)}
    </ol>
  </section>
}
