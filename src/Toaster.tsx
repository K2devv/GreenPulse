import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { motionIsReduced } from './display-prefs'
import { t } from './lib/i18n'

export type ToastTone = 'success' | 'error' | 'info'
export type ToastInput = { tone?: ToastTone; message: string; action?: { label: string; run: () => void } }
/** `leaving` is set while a dismissed toast plays its exit animation. */
export type Toast = ToastInput & { id: number; tone: ToastTone; leaving?: boolean }

const MAX_TOASTS = 4
/** How long a dismissed toast stays mounted to animate out. Matches `toast-out` in styles.css. */
const TOAST_EXIT_MS = 260

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const exitTimers = useRef(new Set<number>())
  useEffect(() => {
    const timers = exitTimers.current
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const dismiss = useCallback((id: number) => {
    const remove = () => setToasts((current) => current.filter((toast) => toast.id !== id))
    if (motionIsReduced()) {
      remove()
      return
    }
    setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, leaving: true } : toast))
    const timer = window.setTimeout(() => {
      exitTimers.current.delete(timer)
      remove()
    }, TOAST_EXIT_MS)
    exitTimers.current.add(timer)
  }, [])
  const push = useCallback((toast: ToastInput) => {
    setToasts((current) => {
      if (current.some((entry) => entry.message === toast.message && !entry.action && !entry.leaving)) return current
      return [...current, { ...toast, tone: toast.tone ?? 'success', id: nextId.current++ }].slice(-MAX_TOASTS)
    })
  }, [])

  return { toasts, push, dismiss }
}

// The Filipino patterns match how i18n-fil.ts words failures: "Hindi ma-save…", "Hindi naipadala…",
// "Nabigo…", "…kailangang asikasuhin".
export function toneForMessage(message: string): ToastTone {
  return /could not|couldn't|failed|error|needs? attention|unable|not saved|\bhindi (ma|mai|nai|na-)|nabigo|kailangang asikasuhin/i.test(message) ? 'error' : 'success'
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const Icon = toast.tone === 'error' ? CircleAlert : toast.tone === 'info' ? Info : CircleCheck
  const duration = toast.action ? 9000 : toast.tone === 'error' ? 8000 : 5000
  const leaving = Boolean(toast.leaving)

  useEffect(() => {
    if (paused || leaving) return
    const timer = window.setTimeout(() => onDismiss(toast.id), duration)
    return () => window.clearTimeout(timer)
  }, [duration, leaving, onDismiss, paused, toast.id])

  // The slot animates the toast's height, so the stack closes up smoothly when one leaves. The clip
  // has no padding of its own, which is what lets the slot collapse all the way to nothing.
  return <div className={`toast-slot${leaving ? ' is-leaving' : ''}`}><div className="toast-clip">
    <div className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} style={{ '--toast-duration': `${duration}ms` } as CSSProperties}>
      <span className="toast-icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && <button className="toast-action" type="button" onClick={() => { toast.action?.run(); onDismiss(toast.id) }}>{toast.action.label}</button>}
      <button className="toast-close" type="button" aria-label={t('Dismiss notification')} onClick={() => onDismiss(toast.id)}><X size={14} /></button>
      <i className={`toast-timer ${paused ? 'is-paused' : ''}`} aria-hidden="true" />
    </div>
  </div></div>
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null
  return <div className="toast-viewport" aria-label={t('Notifications')}>{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}</div>
}
