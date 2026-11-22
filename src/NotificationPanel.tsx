import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Bell, BellRing, CheckCheck, CheckCircle2, ChevronRight, Clock3, FileText, MessageSquare, RefreshCw, UserRound, X, XCircle } from 'lucide-react'
import { motionIsReduced } from './display-prefs'
import { badgeCount, filterNotifications, groupNotifications, notificationKind, notificationTime, type NotificationFilter, type NotificationIcon } from './lib/notification-inbox'
import { t, useLanguage } from './lib/i18n'
import { translateServerText } from './lib/server-text'

export type PanelNotification = {
  id: number | string
  report_id: string
  event_type: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

const ICONS: Record<NotificationIcon, ReactNode> = {
  alert: <AlertTriangle size={15} />,
  clock: <Clock3 size={15} />,
  check: <CheckCircle2 size={15} />,
  x: <XCircle size={15} />,
  user: <UserRound size={15} />,
  message: <MessageSquare size={15} />,
  file: <FileText size={15} />,
  refresh: <RefreshCw size={15} />,
  bell: <Bell size={15} />,
}

/** How long the inbox stays mounted to play its closing animation. Matches `panel-out` in styles.css. */
const PANEL_EXIT_MS = 170

/** The bell in the top bar. It rings and the badge pops when the unread count goes up. */
export function NotificationBell({ unread, open, onToggle }: { unread: number; open: boolean; onToggle: () => void }) {
  const previous = useRef(unread)
  const [ringKey, setRingKey] = useState(0)
  useEffect(() => {
    if (unread > previous.current) setRingKey((current) => current + 1)
    previous.current = unread
  }, [unread])
  return <button
    className={`icon-button notification-toggle${open ? ' active' : ''}${unread ? ' has-unread' : ''}`}
    type="button"
    onClick={onToggle}
    aria-label={unread ? t('Notifications, {count} unread', { count: unread }) : t('Notifications')}
    aria-expanded={open}
    aria-haspopup="dialog"
    title={t('Notifications')}
  >
    <span className="notification-bell" key={ringKey} data-ring={ringKey > 0 ? 'true' : undefined}><Bell size={16} /></span>
    {unread > 0 && <span className="notification-count" key={`count-${unread}`}>{badgeCount(unread)}</span>}
  </button>
}

type NotificationPanelProps = {
  /** The panel stays mounted briefly after this turns false, to animate out. */
  open: boolean
  notifications: readonly PanelNotification[]
  unread: number
  onSelect: (notification: PanelNotification) => void
  onMarkAllRead: () => void
  onClose: () => void
  /** Given when older notifications exist that are not loaded yet: loads the next batch. */
  onLoadOlder?: () => void
  /** Shown in the footer when given: opens profile settings, where email alerts are turned on or off. */
  onOpenSettings?: () => void
}

/** The notification inbox: All and Unread tabs, day groups, and a tone and icon per kind of alert. */
export function NotificationPanel({ open, ...props }: NotificationPanelProps) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (motionIsReduced()) {
      setMounted(false)
      return
    }
    const timer = window.setTimeout(() => setMounted(false), PANEL_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open])
  if (!open && !mounted) return null
  return <NotificationInbox {...props} closing={!open} />
}

function NotificationInbox({ notifications, unread, onSelect, onMarkAllRead, onClose, onLoadOlder, onOpenSettings, closing }: Omit<NotificationPanelProps, 'open'> & { closing: boolean }) {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  // The panel grows out of the bell, wherever the top bar has put it.
  const panelRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const panel = panelRef.current
    const bell = document.querySelector('.notification-toggle')?.getBoundingClientRect()
    if (panel && bell) panel.style.setProperty('--origin-x', `${Math.round(bell.left + bell.width / 2 - panel.offsetLeft)}px`)
  }, [])
  const language = useLanguage()
  const groups = useMemo(() => groupNotifications(filterNotifications(notifications, filter), now), [notifications, filter, now, language])
  let order = 0

  return <>
    <div className={`notification-scrim${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={onClose} />
    <section className={`notification-panel${closing ? ' is-closing' : ''}`} ref={panelRef} role="dialog" aria-label={t('Notifications')} inert={closing}>
      <header className="notification-panel-heading">
        <span className={`notification-panel-mark${unread ? ' has-unread' : ''}`} aria-hidden="true">{unread ? <BellRing size={17} /> : <Bell size={17} />}</span>
        <div className="notification-panel-title">
          <strong>{t('Notifications')}</strong>
          <span className={`notification-unread-pill${unread ? '' : ' is-zero'}`}>{unread ? t('{count} unread', { count: badgeCount(unread) }) : t('All caught up')}</span>
        </div>
        <div className="notification-panel-actions">
          <button className="notification-mark-all" type="button" onClick={onMarkAllRead} disabled={unread === 0} title={t('Mark all as read')}><CheckCheck size={14} /><span>{t('Mark all read')}</span></button>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t('Close notifications')}><X size={15} /></button>
        </div>
      </header>
      <div className="notification-tabs" role="tablist" aria-label={t('Show notifications')} data-active={filter}>
        <span className="notification-tab-indicator" aria-hidden="true" />
        <button role="tab" type="button" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>{t('All')}</button>
        <button role="tab" type="button" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')}>{t('Unread')}{unread ? <b key={unread}>{badgeCount(unread)}</b> : null}</button>
      </div>
      <div className="notification-list" key={filter}>
        {groups.length === 0 ? <div className="notification-empty">
          <span className="notification-empty-icon" aria-hidden="true"><CheckCheck size={22} /></span>
          <strong>{filter === 'unread' && notifications.length ? t('You\'re all caught up') : t('No notifications yet')}</strong>
          <span>{filter === 'unread' && notifications.length ? t('New alerts about your reports will appear here.') : t('Updates about reports you follow or handle will appear here.')}</span>
        </div> : groups.map((group) => <section className="notification-group" key={group.key} aria-label={group.label}>
          <h3><span>{group.label}</span><i aria-hidden="true" /><b>{group.items.length}</b></h3>
          <ul>
            {group.items.map((notification) => {
              const kind = notificationKind(notification.event_type)
              const isNew = !notification.read_at
              const index = order++
              return <li key={notification.id} style={{ ['--i' as string]: Math.min(index, 10) }}>
                <button className={`notification-item tone-${kind.tone}${isNew ? ' is-new' : ''}`} type="button" onClick={() => onSelect(notification)}>
                  <span className="notification-icon" aria-hidden="true">{ICONS[kind.icon]}</span>
                  <span className="notification-copy">
                    <strong>{translateServerText(notification.title)}</strong>
                    <span>{translateServerText(notification.message)}</span>
                  </span>
                  <span className="notification-meta">
                    <time dateTime={notification.created_at}>{notificationTime(notification.created_at, now)}</time>
                    <span className="notification-state">
                      <span className="notification-dot">{isNew && <span className="sr-only">{t('Unread')}</span>}</span>
                      <ChevronRight className="notification-go" size={15} aria-hidden="true" />
                    </span>
                  </span>
                </button>
              </li>
            })}
          </ul>
        </section>)}
        {onLoadOlder && groups.length > 0 && <button className="notification-older" type="button" onClick={onLoadOlder}>{t('Show older notifications')}</button>}
      </div>
      <footer className="notification-panel-footer">
        <span>{t('In-app alerts for your reports and tasks')}</span>
        {onOpenSettings && <button type="button" onClick={onOpenSettings}>{t('Email alerts')}</button>}
      </footer>
    </section>
  </>
}
