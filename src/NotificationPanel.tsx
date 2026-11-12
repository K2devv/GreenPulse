import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Clock3, FileText, MessageSquare, RefreshCw, UserRound, X, XCircle } from 'lucide-react'
import { badgeCount, filterNotifications, groupNotifications, notificationKind, notificationTime, type NotificationFilter, type NotificationIcon } from './lib/notification-inbox'

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
    aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
    aria-expanded={open}
    aria-haspopup="dialog"
    title="Notifications"
  >
    <span className="notification-bell" key={ringKey} data-ring={ringKey > 0 ? 'true' : undefined}><Bell size={16} /></span>
    {unread > 0 && <span className="notification-count" key={`count-${unread}`}>{badgeCount(unread)}</span>}
  </button>
}

type NotificationPanelProps = {
  notifications: readonly PanelNotification[]
  unread: number
  onSelect: (notification: PanelNotification) => void
  onMarkAllRead: () => void
  onClose: () => void
  /** Shown in the footer when given: opens profile settings, where email alerts are turned on or off. */
  onOpenSettings?: () => void
}

/** The notification inbox: All and Unread tabs, day groups, and a tone and icon per kind of alert. */
export function NotificationPanel({ notifications, unread, onSelect, onMarkAllRead, onClose, onOpenSettings }: NotificationPanelProps) {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const groups = useMemo(() => groupNotifications(filterNotifications(notifications, filter).slice(0, 60), now), [notifications, filter, now])
  let order = 0

  return <>
    <div className="notification-scrim" role="presentation" onMouseDown={onClose} />
    <section className="notification-panel" role="dialog" aria-label="Notifications">
      <header className="notification-panel-heading">
        <div className="notification-panel-title">
          <strong>Notifications</strong>
          <span className={`notification-unread-pill${unread ? '' : ' is-zero'}`}>{unread ? `${badgeCount(unread)} unread` : 'All caught up'}</span>
        </div>
        <div className="notification-panel-actions">
          <button className="notification-mark-all" type="button" onClick={onMarkAllRead} disabled={unread === 0} title="Mark all as read"><CheckCheck size={14} /><span>Mark all read</span></button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close notifications"><X size={15} /></button>
        </div>
      </header>
      <div className="notification-tabs" role="tablist" aria-label="Show notifications" data-active={filter}>
        <span className="notification-tab-indicator" aria-hidden="true" />
        <button role="tab" type="button" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        <button role="tab" type="button" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')}>Unread{unread ? <b>{badgeCount(unread)}</b> : null}</button>
      </div>
      <div className="notification-list" key={filter}>
        {groups.length === 0 ? <div className="notification-empty">
          <span className="notification-empty-icon" aria-hidden="true"><CheckCheck size={22} /></span>
          <strong>{filter === 'unread' && notifications.length ? "You're all caught up" : 'No notifications yet'}</strong>
          <span>{filter === 'unread' && notifications.length ? 'New alerts about your reports will appear here.' : 'Updates about reports you follow or handle will appear here.'}</span>
        </div> : groups.map((group) => <section className="notification-group" key={group.key} aria-label={group.label}>
          <h3>{group.label}</h3>
          <ul>
            {group.items.map((notification) => {
              const kind = notificationKind(notification.event_type)
              const isNew = !notification.read_at
              const index = order++
              return <li key={notification.id} style={{ ['--i' as string]: Math.min(index, 10) }}>
                <button className={`notification-item tone-${kind.tone}${isNew ? ' is-new' : ''}`} type="button" onClick={() => onSelect(notification)}>
                  <span className="notification-icon" aria-hidden="true">{ICONS[kind.icon]}</span>
                  <span className="notification-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                  </span>
                  <span className="notification-meta">
                    <time dateTime={notification.created_at}>{notificationTime(notification.created_at, now)}</time>
                    {isNew && <span className="notification-dot"><span className="sr-only">Unread</span></span>}
                  </span>
                </button>
              </li>
            })}
          </ul>
        </section>)}
      </div>
      <footer className="notification-panel-footer">
        <span>In-app alerts for your reports and tasks</span>
        {onOpenSettings && <button type="button" onClick={onOpenSettings}>Email alerts</button>}
      </footer>
    </section>
  </>
}
