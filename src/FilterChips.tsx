import { X } from 'lucide-react'
import type { FilterChip } from './lib/report-filters'

export function FilterChips({ chips, onRemove }: { chips: FilterChip[]; onRemove: (key: FilterChip['key']) => void }) {
  if (!chips.length) return null
  return <div className="filter-chips" role="group" aria-label="Active filters">
    {chips.map((chip) => <button className="filter-chip" type="button" key={chip.key} onClick={() => onRemove(chip.key)} aria-label={`Remove filter: ${chip.label}`}><span>{chip.label}</span><X size={12} aria-hidden="true" /></button>)}
  </div>
}
