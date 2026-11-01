import { useEffect, useState } from 'react'

export type AdminSection = { id: string; label: string }

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function AdminSectionNav({ sections }: { sections: readonly AdminSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const targets = sections.flatMap((section) => document.getElementById(section.id) ?? [])
    if (!targets.length) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActiveId(visible[0].target.id)
    }, { rootMargin: '-130px 0px -55% 0px' })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [sections])

  return <nav className="admin-section-nav" aria-label="Dashboard sections">
    {sections.map((section) => <a key={section.id} href={`#${section.id}`} className={activeId === section.id ? 'is-active' : ''} aria-current={activeId === section.id ? 'location' : undefined} onClick={(event) => {
      event.preventDefault()
      setActiveId(section.id)
      document.getElementById(section.id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }}>{section.label}</a>)}
  </nav>
}
