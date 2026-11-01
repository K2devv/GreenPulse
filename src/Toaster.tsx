import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info'
export type ToastInput = { tone?: ToastTone; message: string; action?: { label: string; run: () => void } }
export type Toast = ToastInput & { id: number; tone: ToastTone }

const MAX_TOASTS = 4

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])
  const push = useCallback((toast: ToastInput) => {
    setToasts((current) => {
      if (current.some((entry) => entry.message === toast.message && !entry.action)) return current
      return [...current, { ...toast, tone: toast.tone ?? 'success', id: nextId.current++ }].slice(-MAX_TOASTS)
    })
  }, [])

  return { toasts, push, dismiss }
}

export function toneForMessage(message: string): ToastTone {
  return /could not|couldn't|failed|error|need attention|unable|not saved/i.test(message) ? 'error' : 'success'
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const Icon = toast.tone === 'error' ? CircleAlert : toast.tone === 'info' ? Info : CircleCheck
  const duration = toast.action ? 9000 : toast.tone === 'error' ? 8000 : 5000

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => onDismiss(toast.id), duration)
    return () => window.clearTimeout(timer)
  }, [duration, onDismiss, paused, toast.id])

  return <div className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} style={{ '--toast-duration': `${duration}ms` } as CSSProperties}>
    <Icon size={17} className="toast-icon" aria-hidden="true" />
    <span className="toast-message">{toast.message}</span>
    {toast.action && <button className="toast-action" type="button" onClick={() => { toast.action?.run(); onDismiss(toast.id) }}>{toast.action.label}</button>}
    <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}><X size={14} /></button>
    <i className={`toast-timer ${paused ? 'is-paused' : ''}`} aria-hidden="true" />
  </div>
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null
  return <div className="toast-viewport" aria-label="Notifications">{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}</div>
}
