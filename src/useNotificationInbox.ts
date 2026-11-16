import { useCallback, useEffect, useRef, useState } from 'react'
import { withPendingReads } from './lib/notification-inbox'
import { supabase, type NotificationRow } from './lib/supabase'

/** Notifications loaded at first, and added by each "show older". */
const PAGE_SIZE = 50
const COLUMNS = 'id, report_id, event_type, title, message, created_at, read_at'

type InboxOptions = {
  /** The signed-in user, or undefined when signed out. The inbox is personal: only their rows are read. */
  userId: string | undefined
  /** Changes whenever reports were refreshed; most notifications come from a report changing. */
  refreshToken: number
  /** Called with a message when a read mark could not be saved. */
  onError: (message: string) => void
}

/**
 * The signed-in user's notifications, kept live.
 *
 * - A Realtime subscription reloads the inbox as soon as a notification is added or read elsewhere
 *   (once `notifications` is in the Realtime publication); `refreshToken` covers the rest.
 * - `unreadCount` is the true number of unread notifications, not just those in the loaded page.
 * - Marking as read shows at once and is then saved; a failed save is undone and reported.
 */
export function useNotificationInbox({ userId, refreshToken, onError }: InboxOptions) {
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [total, setTotal] = useState(0)
  // Unread notifications older than the loaded page: they count toward the badge but are not listed yet.
  const [olderUnread, setOlderUnread] = useState(0)
  // Notifications read in this session (id to read time). A list fetched before the read mark was
  // saved still says "unread", so these are laid over every fetch; see withPendingReads.
  const pendingReads = useRef(new Map<number | string, string>())
  const markingAll = useRef(false)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const loadSeq = useRef(0)
  // The latest values, for callbacks that run after an await.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const olderUnreadRef = useRef(olderUnread)
  olderUnreadRef.current = olderUnread

  const load = useCallback(async () => {
    if (!supabase || !userId) return
    const seq = ++loadSeq.current
    const [list, unread] = await Promise.all([
      supabase.from('notifications').select(COLUMNS, { count: 'exact' }).eq('recipient_id', userId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null),
    ])
    // A newer load has started, or the request failed: keep what is on screen.
    if (seq !== loadSeq.current || list.error) return
    const fetched = (list.data ?? []) as NotificationRow[]
    setRows(withPendingReads(fetched, pendingReads.current))
    setTotal(list.count ?? fetched.length)
    const loadedUnread = fetched.filter((row) => !row.read_at).length
    setOlderUnread(markingAll.current || unread.error ? 0 : Math.max(0, (unread.count ?? loadedUnread) - loadedUnread))
  }, [userId, limit])

  // Signing out, or switching account, empties the inbox.
  useEffect(() => {
    pendingReads.current.clear()
    setRows([])
    setTotal(0)
    setOlderUnread(0)
    setLimit(PAGE_SIZE)
  }, [userId])

  useEffect(() => { void load() }, [load, refreshToken])

  useEffect(() => {
    if (!supabase || !userId) return
    const client = supabase
    const channel = client.channel(`greenpulse-notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => void load())
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [userId, load])

  /** Marks notifications read on screen at once, then saves it. `ids` is a list, or 'all' for every unread one. */
  const markRead = useCallback(async (ids: number[] | 'all') => {
    if (!supabase || !userId) return
    const readAt = new Date().toISOString()
    const pending = pendingReads.current
    const affected = rowsRef.current.filter((item) => !item.read_at && (ids === 'all' || ids.includes(item.id))).map((item) => item.id)
    affected.forEach((id) => pending.set(id, readAt))
    setRows((current) => withPendingReads(current, pending))
    const previousOlderUnread = olderUnreadRef.current
    if (ids === 'all') {
      markingAll.current = true
      setOlderUnread(0)
    }
    // The query is only sent once it is awaited. It returns the rows it changed, because an update
    // that matches no row still reports success.
    const update = supabase.from('notifications').update({ read_at: readAt }).eq('recipient_id', userId)
    const { data, error } = await (ids === 'all' ? update.is('read_at', null) : update.in('id', ids)).select('id')
    if (ids === 'all') markingAll.current = false
    const saved = new Set((data ?? []).map((row) => row.id as number))
    const failed = error ? affected : affected.filter((id) => !saved.has(id))
    if (failed.length === 0) return
    failed.forEach((id) => pending.delete(id))
    setRows((current) => current.map((item) => failed.includes(item.id) && item.read_at === readAt ? { ...item, read_at: null } : item))
    if (ids === 'all') setOlderUnread(previousOlderUnread)
    onErrorRef.current(`${failed.length === 1 ? 'The notification' : 'Some notifications'} could not be marked as read. Check your connection and try again.`)
  }, [userId])

  return {
    notifications: rows,
    /** Every unread notification the user has, including ones older than the loaded page. */
    unreadCount: rows.filter((row) => !row.read_at).length + olderUnread,
    /** True when older notifications exist that are not loaded yet. */
    hasOlder: total > rows.length,
    loadOlder: useCallback(() => setLimit((current) => current + PAGE_SIZE), []),
    refresh: load,
    markRead,
  }
}
