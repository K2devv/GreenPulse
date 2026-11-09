import type { KeyboardEvent } from 'react'

export type AdminSection = { id: string; label: string }

export const adminTabId = (id: string) => `${id}-tab`

export function AdminSectionNav({ sections, active, onChange }: { sections: readonly AdminSection[]; active: string; onChange: (id: string) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = sections.length - 1
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last : undefined
    if (next === undefined) return
    event.preventDefault()
    onChange(sections[next].id)
    document.getElementById(adminTabId(sections[next].id))?.focus()
  }

  return <div className="admin-section-nav" role="tablist" aria-label="Dashboard sections">
    {sections.map((section, index) => <button
      key={section.id}
      id={adminTabId(section.id)}
      type="button"
      role="tab"
      aria-selected={active === section.id}
      aria-controls={section.id}
      tabIndex={active === section.id ? 0 : -1}
      className={active === section.id ? 'is-active' : ''}
      onClick={() => onChange(section.id)}
      onKeyDown={(event) => onKeyDown(event, index)}
    >{section.label}</button>)}
  </div>
}
