import { describe, expect, it } from 'vitest'
import { resolveSyncState } from './sync-status'

const base = { configured: true, online: true, syncing: false, queued: false, failed: false }

describe('resolveSyncState', () => {
  it('reports local mode without Supabase', () => {
    expect(resolveSyncState({ ...base, configured: false, online: false })).toBe('local')
  })

  it('prioritises offline, then queued, failed and syncing', () => {
    expect(resolveSyncState({ ...base, online: false, queued: true })).toBe('offline')
    expect(resolveSyncState({ ...base, queued: true, failed: true, syncing: true })).toBe('queued')
    expect(resolveSyncState({ ...base, failed: true, syncing: true })).toBe('failed')
    expect(resolveSyncState({ ...base, syncing: true })).toBe('syncing')
    expect(resolveSyncState(base)).toBe('synced')
  })
})
