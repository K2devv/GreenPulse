export type SyncState = 'local' | 'offline' | 'queued' | 'syncing' | 'failed' | 'synced'

export function resolveSyncState({ configured, online, syncing, queued, failed }: { configured: boolean; online: boolean; syncing: boolean; queued: boolean; failed: boolean }): SyncState {
  if (!configured) return 'local'
  if (!online) return 'offline'
  if (queued) return 'queued'
  if (failed) return 'failed'
  if (syncing) return 'syncing'
  return 'synced'
}

export const SYNC_LABELS: Record<SyncState, string> = {
  local: 'Demo data',
  offline: 'Offline',
  queued: 'Report queued',
  syncing: 'Syncing…',
  failed: 'Sync failed',
  synced: 'Synced',
}
