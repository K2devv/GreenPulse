import { useEffect, useRef, useState } from 'react'
import { Leaf } from 'lucide-react'

const DECIDE_AFTER_MS = 250
const MIN_VISIBLE_MS = 450
const MAX_VISIBLE_MS = 4000
const ENTER_MS = 450

// A view switch always cross-fades; the loading screen only appears when data is still loading after DECIDE_AFTER_MS.
export function useViewTransition(viewKey: string, busy: boolean) {
  const [loaderVisible, setLoaderVisible] = useState(false)
  const [entering, setEntering] = useState(false)
  const previousKey = useRef(viewKey)
  const busyRef = useRef(busy)
  const shownAt = useRef(0)
  busyRef.current = busy

  useEffect(() => {
    if (previousKey.current === viewKey) return
    previousKey.current = viewKey
    setEntering(true)
    const enterTimer = window.setTimeout(() => setEntering(false), ENTER_MS)
    const decideTimer = window.setTimeout(() => {
      if (!busyRef.current) return
      shownAt.current = Date.now()
      setLoaderVisible(true)
    }, DECIDE_AFTER_MS)
    return () => { window.clearTimeout(enterTimer); window.clearTimeout(decideTimer) }
  }, [viewKey])

  useEffect(() => {
    if (!loaderVisible) return
    const elapsed = Date.now() - shownAt.current
    const delay = busy ? Math.max(0, MAX_VISIBLE_MS - elapsed) : Math.max(0, MIN_VISIBLE_MS - elapsed)
    const timer = window.setTimeout(() => setLoaderVisible(false), delay)
    return () => window.clearTimeout(timer)
  }, [busy, loaderVisible])

  return { loaderVisible, entering }
}

// Styles live in index.html (.gp-loader) so the boot splash and this overlay look identical.
export function ViewLoader({ visible, label, dark }: { visible: boolean; label: string; dark: boolean }) {
  return <div className={`gp-loader view-loader ${dark ? 'gp-dark' : ''} ${visible ? '' : 'is-hidden'}`} role="status" aria-live="polite" aria-hidden={!visible}>
    <div className="gp-loader-inner">
      <span className="gp-loader-mark" aria-hidden="true"><Leaf size={30} strokeWidth={2.2} /></span>
      <p className="gp-loader-name">green<span>pulse</span></p>
      <div className="gp-loader-bar" aria-hidden="true" />
      <p className="gp-loader-label">{label}</p>
    </div>
  </div>
}
