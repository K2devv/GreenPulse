import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { DisplayPrefs } from './display-prefs'

const OPTIONS: { key: keyof DisplayPrefs; label: string; hint: string }[] = [
  { key: 'reduceMotion', label: 'Reduce motion', hint: 'Turns off animations and transitions.' },
  { key: 'highContrast', label: 'High contrast', hint: 'Stronger text and border colours.' },
  { key: 'compact', label: 'Compact lists', hint: 'Shows more rows in the staff queue.' },
]

export function DisplaySettings({ prefs, onChange }: { prefs: DisplayPrefs; onChange: (patch: Partial<DisplayPrefs>) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return <div className="display-settings" ref={wrapRef}>
    <button className="icon-button" type="button" aria-label="Display settings" aria-expanded={open} aria-haspopup="true" title="Display settings" onClick={() => setOpen((current) => !current)}><SlidersHorizontal size={16} /></button>
    {open && <div className="display-panel" role="group" aria-label="Display settings">
      <strong>Display</strong>
      {OPTIONS.map((option) => <label className="display-option" key={option.key}>
        <span><b>{option.label}</b><small>{option.hint}</small></span>
        <input type="checkbox" role="switch" checked={prefs[option.key]} onChange={(event) => onChange({ [option.key]: event.target.checked })} />
        <i aria-hidden="true" />
      </label>)}
    </div>}
  </div>
}
