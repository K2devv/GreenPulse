export type EmptyVariant = 'search' | 'queue' | 'offline'

export function EmptyIllustration({ variant = 'search' }: { variant?: EmptyVariant }) {
  return <svg className={`empty-illustration is-${variant}`} viewBox="0 0 120 90" role="img" aria-hidden="true" focusable="false">
    <ellipse className="ei-shadow" cx="60" cy="80" rx="34" ry="5" />
    <path className="ei-hill" d="M8 76c14-20 30-26 44-18 10-14 28-16 60 18z" />
    {variant === 'search' && <g className="ei-float">
      <circle className="ei-lens" cx="56" cy="38" r="17" />
      <path className="ei-handle" d="M69 51l14 14" />
      <path className="ei-leaf" d="M49 42c0-9 6-15 15-15 0 9-6 15-15 15z" />
    </g>}
    {variant === 'queue' && <g className="ei-float">
      <rect className="ei-card" x="36" y="22" width="48" height="42" rx="7" />
      <path className="ei-check" d="M48 43l8 8 16-18" />
    </g>}
    {variant === 'offline' && <g className="ei-float">
      <path className="ei-cloud" d="M42 56a12 12 0 0 1 2-23 16 16 0 0 1 31 4 10 10 0 0 1-2 19z" />
      <path className="ei-slash" d="M44 24l34 38" />
    </g>}
  </svg>
}
