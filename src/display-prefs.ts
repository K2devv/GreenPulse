import { useCallback, useEffect, useState } from 'react'

export type DisplayPrefs = { reduceMotion: boolean; highContrast: boolean; compact: boolean }

export const DISPLAY_PREFS_KEY = 'greenpulse-display'
const defaults: DisplayPrefs = { reduceMotion: false, highContrast: false, compact: false }

export function readDisplayPrefs(): DisplayPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY) ?? '{}') as Partial<DisplayPrefs>
    return {
      reduceMotion: stored.reduceMotion === true,
      highContrast: stored.highContrast === true,
      compact: stored.compact === true,
    }
  } catch {
    return defaults
  }
}

export function applyDisplayPrefs(prefs: DisplayPrefs, root: HTMLElement = document.documentElement) {
  root.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full'
  root.dataset.contrast = prefs.highContrast ? 'high' : 'normal'
  root.dataset.density = prefs.compact ? 'compact' : 'comfortable'
}

export function useDisplayPrefs() {
  const [prefs, setPrefs] = useState<DisplayPrefs>(readDisplayPrefs)

  useEffect(() => {
    applyDisplayPrefs(prefs)
    try {
      localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // Preferences still apply for this session when storage is unavailable.
    }
  }, [prefs])

  const update = useCallback((patch: Partial<DisplayPrefs>) => setPrefs((current) => ({ ...current, ...patch })), [])
  return { prefs, update }
}

export function motionIsReduced() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced') return true
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
