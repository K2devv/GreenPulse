import { MapPin, PenLine, Radar, X } from 'lucide-react'
import type { CSSProperties } from 'react'

const STEPS = [
  { icon: MapPin, title: 'Spot it', text: 'Browse the map to see what neighbours already reported nearby.' },
  { icon: PenLine, title: 'Report it', text: 'Add a photo and a pin. Guests can report without an account.' },
  { icon: Radar, title: 'Track it', text: 'Follow progress from review to resolution, and confirm the fix.' },
]

export function WelcomeTour({ onDismiss, onStart }: { onDismiss: () => void; onStart: () => void }) {
  return <section className="welcome-tour" aria-label="How GreenPulse works">
    <div className="welcome-tour-head">
      <div><p className="eyebrow">NEW HERE?</p><h2>How GreenPulse works</h2></div>
      <button className="icon-button" type="button" onClick={onDismiss} aria-label="Dismiss the introduction"><X size={15} /></button>
    </div>
    <ol className="welcome-steps">
      {STEPS.map((step, index) => <li key={step.title} style={{ '--i': index } as CSSProperties}>
        <span className="welcome-step-icon"><step.icon size={18} aria-hidden="true" /></span>
        <span><strong>{index + 1}. {step.title}</strong><small>{step.text}</small></span>
      </li>)}
    </ol>
    <div className="welcome-tour-actions">
      <button className="primary-button" type="button" onClick={onStart}>Start a report</button>
      <button className="text-button" type="button" onClick={onDismiss}>Got it</button>
      <span className="welcome-tip">Tip: press <kbd>Ctrl</kbd> <kbd>K</kbd> to search and jump anywhere.</span>
    </div>
  </section>
}
