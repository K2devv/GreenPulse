import { AlertTriangle, Check, CloudOff, CloudUpload, HardDrive, RefreshCw } from 'lucide-react'
import { SYNC_LABELS, type SyncState } from './lib/sync-status'
import { t } from './lib/i18n'

const ICONS = { local: HardDrive, offline: CloudOff, queued: CloudUpload, syncing: RefreshCw, failed: AlertTriangle, synced: Check }

export function SyncStatus({ state, detail, onRetry }: { state: SyncState; detail?: string; onRetry?: () => void }) {
  const Icon = ICONS[state]
  const label = t(SYNC_LABELS[state])
  const content = <>
    <span className="sync-status-icon" aria-hidden="true"><Icon size={13} /></span>
    <span className="sync-status-label">{label}</span>
  </>
  const title = detail ? `${label} · ${detail}` : label
  if (state === 'failed' && onRetry) return <button className={`sync-status is-${state}`} type="button" onClick={onRetry} title={`${title} — ${t('click to retry')}`}>{content}<span className="sync-status-label">{t('Retry')}</span></button>
  return <span className={`sync-status is-${state}`} role="status" title={title}>{content}</span>
}
