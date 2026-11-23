import { X } from 'lucide-react'
import type { FilterChip } from './lib/report-filters'
import { t } from './lib/i18n'

/**
 * A chip's label in the current language. The labels come from `describeActiveFilters` in English
 * ("Status: In progress", "From 2026-11-01"), which the server code shares, so they are translated here.
 */
function chipLabel(label: string) {
  const range = /^(From|To) (.+)$/.exec(label)
  if (range) return t(`${range[1]} {date}`, { date: range[2] })
  const pair = /^([^:]+): (.+)$/.exec(label)
  if (pair) return `${t(pair[1])}: ${t(pair[2])}`
  return t(label)
}

export function FilterChips({ chips, onRemove }: { chips: FilterChip[]; onRemove: (key: FilterChip['key']) => void }) {
  if (!chips.length) return null
  return <div className="filter-chips" role="group" aria-label={t('Active filters')}>
    {chips.map((chip) => <button className="filter-chip" type="button" key={chip.key} onClick={() => onRemove(chip.key)} aria-label={t('Remove filter: {filter}', { filter: chipLabel(chip.label) })}><span>{chipLabel(chip.label)}</span><X size={12} aria-hidden="true" /></button>)}
  </div>
}
