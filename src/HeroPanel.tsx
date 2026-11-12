import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { StatNumber } from './AnimatedNumber'

export type HeroStat = {
  icon: LucideIcon
  /** Picks the tile's accent color. */
  tone: 'leaf' | 'sky' | 'amber' | 'coral'
  value: number
  label: string
  /** Short qualifier under the label, hidden on small screens. */
  note?: string
}

type HeroPanelProps = {
  title: ReactNode
  subtitle: string
  /** The primary action, shown under the subtitle. */
  action: ReactNode
  /** A short line next to the action. */
  hint?: string
  stats: HeroStat[]
  statsLabel: string
  loading: boolean
  /** Optional line under the stats, such as when the data was last synced. */
  footer?: ReactNode
}

/** The page's opening panel: what the app is for, the main action, and the headline numbers. */
export function HeroPanel({ title, subtitle, action, hint, stats, statsLabel, loading, footer }: HeroPanelProps) {
  return <section className="hero">
    <div className="hero-backdrop" aria-hidden="true"><i /><i /><i /></div>
    <div className="hero-copy">
      <p className="hero-eyebrow"><span className="hero-eyebrow-dot" />Community environment desk <span>•</span> District 5, Quezon City</p>
      <h1>{title}</h1>
      <p className="hero-subtitle">{subtitle}</p>
      <div className="hero-actions">{action}{hint && <span className="hero-hint">{hint}</span>}</div>
    </div>
    <div className="hero-side">
      <div className="hero-stats" role="group" aria-label={statsLabel} data-count={stats.length}>
        {stats.map((stat) => <div className={`hero-stat tone-${stat.tone}`} key={stat.label}>
          <span className="hero-stat-icon"><stat.icon size={16} aria-hidden="true" /></span>
          <strong><StatNumber loading={loading} value={stat.value} /></strong>
          <span className="hero-stat-label">{stat.label}</span>
          {stat.note && <small>{stat.note}</small>}
        </div>)}
      </div>
      {footer}
    </div>
  </section>
}
