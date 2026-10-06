import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  ClipboardCheck,
  Crosshair,
  Droplets,
  Filter,
  Leaf,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Trees,
  Upload,
  UserRound,
  Waves,
  X,
} from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon, type LatLngExpression } from 'leaflet'
import type { Session } from '@supabase/supabase-js'
import { getAuthRedirectUrl, isSupabaseConfigured, supabase, toReport, type NotificationRow, type Profile, type ReportEvent, type ReportRow } from './lib/supabase'
import { buildReportAnalytics, type ChartDatum } from './lib/report-analytics'

type Category = 'Waste' | 'Pollution' | 'Flooding' | 'Drainage' | 'Water pollution' | 'Air pollution'
type Status = 'Submitted' | 'Under review' | 'Additional information requested' | 'Verified' | 'In progress' | 'Awaiting verification' | 'Resolved' | 'Rejected' | 'Closed'
type Urgency = 'Low' | 'Medium' | 'High'
type Theme = 'light' | 'dark'

type LocationSuggestion = {
  label: string
  coordinates: [number, number]
}

type Report = {
  id: string
  title: string
  category: Category
  issueType?: string
  observedAt?: string
  additionalInfo?: string
  photoPaths?: string[]
  status: Status
  urgency: Urgency
  description: string
  location: string
  coordinates: [number, number]
  createdAt: string
  image?: string
  photoPath?: string
  assignedTo?: string
  resolutionNote?: string
  resolvedAt?: string
  reporterId?: string
  reporterName?: string
}

type InboxNotification = {
  id: number | string
  report_id: string
  event_type: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

const initialReports: Report[] = [
  {
    id: 'DEMO-1048', title: 'Demo: Overflowing bins', category: 'Waste', status: 'Verified', urgency: 'High',
    description: 'Sample data only. Replace with a real community report during the pilot.', location: 'Demo site, District 5',
    coordinates: [14.7241, 121.0552], createdAt: '12 min ago',
  },
  {
    id: 'DEMO-1047', title: 'Demo: Water pooling after rain', category: 'Flooding', status: 'In progress', urgency: 'High',
    description: 'Sample data only. Replace with a real community report during the pilot.', location: 'Demo site, District 5',
    coordinates: [14.7178, 121.0491], createdAt: '38 min ago',
  },
  {
    id: 'DEMO-1046', title: 'Demo: Unusual creek discharge', category: 'Pollution', issueType: 'Water pollution', status: 'Under review', urgency: 'Medium',
    description: 'Sample data only. Replace with a real community report during the pilot.', location: 'Demo site, District 5',
    coordinates: [14.7308, 121.0604], createdAt: '1 hr ago',
  },
  {
    id: 'DEMO-1045', title: 'Demo: Drain covered in debris', category: 'Drainage', status: 'Resolved', urgency: 'Low',
    description: 'Sample data only. Replace with a real community report during the pilot.', location: 'Demo site, District 5',
    coordinates: [14.7135, 121.058], createdAt: 'Yesterday',
  },
  {
    id: 'DEMO-1044', title: 'Demo: Smoke from waste burning', category: 'Pollution', issueType: 'Air pollution', status: 'Under review', urgency: 'Medium',
    description: 'Sample data only. Replace with a real community report during the pilot.', location: 'Demo site, District 5',
    coordinates: [14.728, 121.0455], createdAt: 'Yesterday',
  },
]

const categoryColors: Record<Category, string> = {
  Waste: '#d77a37',
  Pollution: '#527ba4',
  Flooding: '#3986a2',
  'Water pollution': '#527ba4',
  'Air pollution': '#8d775b',
  Drainage: '#7f8c42',
}

const districtCenter: [number, number] = [14.7222, 121.0545]
const categoryOptions: Category[] = ['Waste', 'Pollution', 'Flooding', 'Drainage', 'Water pollution', 'Air pollution']
const intakeCategories: Category[] = ['Waste', 'Pollution', 'Flooding', 'Drainage']
const statusOptions: Status[] = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed']
function createReportMarker(report: Report, selected: boolean) {
  const categoryClass = report.category.toLowerCase().replace(/[^a-z]/g, '-')
  const Icon = categoryIcon(report.category)
  const iconMarkup = renderToStaticMarkup(<Icon size={18} strokeWidth={2.2} aria-hidden="true" />)
  return divIcon({
    className: 'incident-marker-shell',
    html: `<span class="incident-marker incident-marker-${categoryClass}${report.urgency === 'High' ? ' incident-marker-urgent' : ''}${selected ? ' incident-marker-selected' : ''}"><span class="incident-marker-icon">${iconMarkup}</span>${report.urgency === 'High' ? '<i></i>' : ''}</span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 42],
    popupAnchor: [0, -39],
  })
}

function formatCreatedAt(value: string) {
  const created = new Date(value)
  if (Number.isNaN(created.getTime())) return value
  const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`
  return created.toLocaleDateString()
}

async function deliverNotificationEmails(reportId: string, accessToken: string) {
  try {
    await fetch('/api/send-notification-emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    })
  } catch {
    return
  }
}

const categoryIcon = (category: Category) => {
  if (category === 'Flooding') return Waves
  if (category === 'Pollution' || category === 'Water pollution') return Droplets
  if (category === 'Air pollution') return Trees
  if (category === 'Drainage') return Filter
  return Leaf
}

function MapFocus({ report, center }: { report: Report | undefined; center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(report?.coordinates ?? center, report ? 16 : map.getZoom(), { duration: 0.65 })
  }, [center, map, report])
  return null
}

function AdminBarChart({ title, description, data }: { title: string; description: string; data: ChartDatum[] }) {
  const maximum = Math.max(1, ...data.map((item) => item.value))
  return <article className="analytics-chart">
    <div className="analytics-chart-heading"><div><strong>{title}</strong><span>{description}</span></div><span className="analytics-total"><b>{data.reduce((sum, item) => sum + item.value, 0)}</b> reports</span></div>
    {data.length ? <div className="category-bars" role="list" aria-label={title}>
      {data.map((item) => <div className="category-row" role="listitem" key={item.label} aria-label={`${item.label}: ${item.value} reports`}>
        <span title={item.label}>{item.label}</span>
        <i><b style={{ width: `${(item.value / maximum) * 100}%` }} /></i>
        <strong>{item.value}</strong>
      </div>)}
    </div> : <p className="admin-chart-empty">No report data yet.</p>}
  </article>
}

function readSavedReports(): Report[] {
  try {
    const saved = localStorage.getItem('greenpulse-reports')
    return saved ? [...JSON.parse(saved) as Report[], ...initialReports] : initialReports
  } catch {
    return initialReports
  }
}

function App() {
  const [reports, setReports] = useState<Report[]>(isSupabaseConfigured ? [] : readSavedReports)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [loadingReports, setLoadingReports] = useState(isSupabaseConfigured)
  const [backendError, setBackendError] = useState('')
  const [authModal, setAuthModal] = useState<'sign-in' | 'sign-up' | null>(null)
  const [profileModal, setProfileModal] = useState(false)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('')
  const [profileAvatarFile, setProfileAvatarFile] = useState<File>()
  const [profileSaving, setProfileSaving] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageSuccess, setAuthMessageSuccess] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [staffMode, setStaffMode] = useState(false)
  const [staffDashboardOpen, setStaffDashboardOpen] = useState(true)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffStatusFilter, setStaffStatusFilter] = useState('Open reports')
  const [staffUsers, setStaffUsers] = useState<Profile[]>([])
  const [staffReportId, setStaffReportId] = useState<string>()
  const [reportEvents, setReportEvents] = useState<ReportEvent[]>([])
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [readOverdueIds, setReadOverdueIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('greenpulse-read-overdue') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [staffPhotoUrl, setStaffPhotoUrl] = useState('')
  const [workflowError, setWorkflowError] = useState('')
  const [savingWorkflow, setSavingWorkflow] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [newestFirst, setNewestFirst] = useState(true)
  const [reporting, setReporting] = useState(false)
  const [photo, setPhoto] = useState<string>()
  const [formError, setFormError] = useState('')
  const [photoFile, setPhotoFile] = useState<File>()
  const [location, setLocation] = useState<[number, number]>(districtCenter)
  const [mapCenter, setMapCenter] = useState<[number, number]>(districtCenter)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([])
  const [locationSearchBusy, setLocationSearchBusy] = useState(false)
  const [locationSearchMessage, setLocationSearchMessage] = useState('')
  const [locationConfirmed, setLocationConfirmed] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('greenpulse-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    }).catch(() => {
      setBackendError('Could not connect to Supabase authentication.')
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
      if (!nextSession) {
        setProfile(null)
        setStaffMode(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('greenpulse-theme', theme)
    } catch {
      return
    }
  }, [theme])

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141a16' : '#f5f7f2')
  }, [theme])

  useEffect(() => {
    const query = locationQuery.trim()
    if (!reporting || locationConfirmed || query.length < 3) {
      setLocationSuggestions([])
      setLocationSearchBusy(false)
      return
    }
    const controller = new AbortController()
    setLocationSearchBusy(true)
    const timer = window.setTimeout(async () => {
      try {
        const parameters = new URLSearchParams({
          q: query,
          lat: String(districtCenter[0]),
          lon: String(districtCenter[1]),
          limit: '6',
          lang: 'en',
        })
        const response = await fetch(`https://photon.komoot.io/api/?${parameters}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Place search is temporarily unavailable.')
        const result = await response.json() as {
          features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string | undefined> }>
        }
        const suggestions = (result.features ?? []).flatMap((feature) => {
          const coordinates = feature.geometry?.coordinates
          const properties = feature.properties
          if (!coordinates || !properties || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return []
          const parts = [properties.name, properties.street, properties.district, properties.city, properties.state, properties.country]
            .filter((part): part is string => Boolean(part))
            .filter((part, index, parts) => parts.indexOf(part) === index)
          if (parts.length === 0) return []
          return [{ label: parts.join(', '), coordinates: [coordinates[1], coordinates[0]] as [number, number] }]
        })
        setLocationSuggestions(suggestions)
      } catch (error) {
        if (!controller.signal.aborted) {
          setLocationSuggestions([])
          setLocationSearchMessage(error instanceof Error ? error.message : 'Place search is temporarily unavailable.')
        }
      } finally {
        if (!controller.signal.aborted) setLocationSearchBusy(false)
      }
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [locationConfirmed, locationQuery, reporting])

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null)
      return
    }
    let active = true
    supabase.from('profiles').select('id, display_name, avatar_path, email_notifications, role').eq('id', session.user.id).single().then(async ({ data, error }) => {
      if (!active) return
      if (error) setBackendError(`Could not load your account profile: ${error.message}`)
      else {
        const nextProfile = data as Profile
        setProfile(nextProfile)
        if (nextProfile.avatar_path) {
          const { data: avatarData } = await supabase!.storage.from('profile-avatars').createSignedUrl(nextProfile.avatar_path, 3600)
          if (active) setProfileAvatarUrl(avatarData?.signedUrl ?? '')
        } else setProfileAvatarUrl('')
      }
    })
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!supabase) return
    let active = true
    setLoadingReports(true)
    async function loadReports() {
      const { data: communityRows, error: communityError } = await supabase!.from('community_reports').select('*').order('created_at', { ascending: false })
      if (communityError) {
        if (active) setBackendError(`Could not load community reports: ${communityError.message}`)
        if (active) setLoadingReports(false)
        return
      }
      let privateRows: ReportRow[] = []
      if (session?.user) {
        const query = profile?.role === 'responder' || profile?.role === 'admin'
          ? supabase!.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(display_name)').order('created_at', { ascending: false })
          : supabase!.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(display_name)').eq('reporter_id', session.user.id).order('created_at', { ascending: false })
        const { data, error } = await query
        if (error) {
          if (active) setBackendError(`Could not load your reports: ${error.message}`)
        } else privateRows = (data ?? []) as ReportRow[]
      }
      if (!active) return
      const combined = new Map<string, Report>()
      for (const row of (communityRows ?? []) as ReportRow[]) combined.set(row.id, toReport(row))
      for (const row of privateRows) combined.set(row.id, toReport(row))
      setReports([...combined.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setBackendError('')
      setLoadingReports(false)
    }
    void loadReports()
    return () => { active = false }
  }, [profile?.role, session])

  useEffect(() => {
    if (!supabase || (profile?.role !== 'responder' && profile?.role !== 'admin')) {
      setStaffUsers([])
      return
    }
    supabase.from('profiles').select('id, display_name, avatar_path, role').in('role', ['responder', 'admin']).then(({ data }) => {
      setStaffUsers((data ?? []) as Profile[])
    })
  }, [profile?.role])

  useEffect(() => {
    if (!supabase || !session) {
      setNotifications([])
      return
    }
    let active = true
    const refresh = async () => {
      const { data } = await supabase!.from('notifications').select('id, report_id, event_type, title, message, created_at, read_at').order('created_at', { ascending: false }).limit(50)
      if (active) setNotifications((data ?? []) as NotificationRow[])
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 60_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [session])

  useEffect(() => {
    if (!notificationPanelOpen || !supabase || !session) return
    supabase.from('notifications').select('id, report_id, event_type, title, message, created_at, read_at').order('created_at', { ascending: false }).limit(50).then(({ data }) => {
      setNotifications((data ?? []) as NotificationRow[])
    })
  }, [notificationPanelOpen, session])

  useEffect(() => {
    try {
      if (!isSupabaseConfigured) localStorage.setItem('greenpulse-reports', JSON.stringify(reports.filter((report) => report.id.startsWith('GP-NEW'))))
    } catch {
      setFormError('Your browser storage is full. The new report will remain available until you close this page.')
    }
  }, [reports])

  const visibleReports = useMemo(() => reports.filter((report) => {
    const matchesCategory = categoryFilter === 'All categories' || report.category === categoryFilter
    const matchesStatus = statusFilter === 'All statuses' || report.status === statusFilter
    const matchesSearch = `${report.title} ${report.location} ${report.id}`.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesStatus && matchesSearch
  }), [categoryFilter, reports, search, statusFilter])
  const orderedReports = newestFirst ? visibleReports : [...visibleReports].reverse()
  const staffQueue = useMemo(() => reports.filter((report) => {
    const matchesQuery = `${report.title} ${report.location} ${report.category}`.toLowerCase().includes(staffSearch.toLowerCase())
    const matchesStatus = staffStatusFilter === 'All reports'
      || (staffStatusFilter === 'Open reports' && report.status !== 'Resolved' && report.status !== 'Rejected' && report.status !== 'Closed')
      || report.status === staffStatusFilter
    return matchesQuery && matchesStatus
  }), [reports, staffSearch, staffStatusFilter])
  const adminAnalytics = useMemo(() => buildReportAnalytics(reports), [reports])

  const selectedReport = reports.find((report) => report.id === selectedId)
  const staffReport = reports.find((report) => report.id === staffReportId)
  const openReports = reports.filter((report) => report.status !== 'Resolved' && report.status !== 'Rejected' && report.status !== 'Closed').length
  const verifiedReports = reports.filter((report) => report.status === 'Verified' || report.status === 'In progress').length
  const overdueNotifications: InboxNotification[] = profile?.role === 'admin'
    ? reports.filter((report) => report.status !== 'Resolved' && report.status !== 'Rejected' && report.status !== 'Closed' && Date.now() - new Date(report.createdAt).getTime() >= 48 * 60 * 60 * 1000)
      .map((report) => ({ id: `overdue:${report.id}`, report_id: report.id, event_type: 'overdue_task', title: 'Overdue task', message: `Open report needs attention: ${report.title}.`, created_at: report.createdAt, read_at: readOverdueIds.includes(report.id) ? report.createdAt : null }))
    : []
  const inboxNotifications: InboxNotification[] = [...notifications, ...overdueNotifications]
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
  const unreadNotificationCount = inboxNotifications.filter((notification) => !notification.read_at).length

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    setAuthMessage('')
    setAuthMessageSuccess(false)
    setBackendError('')
    setAuthBusy(true)
    const result = authModal === 'sign-up'
      ? await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          data: { display_name: String(formData.get('display_name') ?? '').trim() },
        },
      })
      : await supabase.auth.signInWithPassword({ email, password })
    setAuthBusy(false)
    if (result.error) {
      const message = result.error.message
      setAuthMessage(/rate limit/i.test(message)
        ? 'Supabase has temporarily limited confirmation emails. Wait before retrying, or configure custom SMTP in Supabase Auth.'
        : message)
      return
    }
    if (authModal === 'sign-up' && !result.data.session) {
      setConfirmationEmail(email)
      setAuthMessage('Confirmation requested. Check your inbox and spam folder, then follow the link to return here.')
      setAuthMessageSuccess(true)
      return
    }
    setAuthModal(null)
    setAuthMessage('')
    setConfirmationEmail('')
  }

  async function resendConfirmation() {
    if (!supabase || !confirmationEmail) return
    setAuthBusy(true)
    setAuthMessage('')
    setAuthMessageSuccess(false)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: confirmationEmail,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    })
    setAuthBusy(false)
    setAuthMessage(error
      ? (/rate limit/i.test(error.message) ? 'The email limit is still active. Please wait before requesting another confirmation.' : error.message)
      : 'A new confirmation email has been requested.')
    setAuthMessageSuccess(!error)
  }

  function handleProfileAvatar(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBackendError('Choose a JPEG, PNG, or WebP profile image.')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setBackendError('Choose a profile image under 3 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setProfileAvatarPreview(String(reader.result))
    reader.readAsDataURL(file)
    setProfileAvatarFile(file)
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !profile) return
    const formData = new FormData(event.currentTarget)
    const displayName = String(formData.get('display_name') ?? '').trim()
    if (displayName.length < 2) {
      setBackendError('Add a display name with at least 2 characters.')
      return
    }
    setProfileSaving(true)
    setBackendError('')
    let avatarPath = profile.avatar_path ?? null
    if (profileAvatarFile) {
      const extension = profileAvatarFile.type === 'image/jpeg' ? 'jpg' : profileAvatarFile.type.split('/')[1]
      avatarPath = `${session.user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(avatarPath, profileAvatarFile, { contentType: profileAvatarFile.type, upsert: true })
      if (uploadError) {
        setProfileSaving(false)
        setBackendError(`Profile photo upload failed: ${uploadError.message}`)
        return
      }
    }
    const emailNotifications = formData.get('email_notifications') === 'on'
    const { data, error } = await supabase.from('profiles').update({ display_name: displayName, avatar_path: avatarPath, email_notifications: emailNotifications }).eq('id', session.user.id).select('id, display_name, avatar_path, email_notifications, role').single()
    setProfileSaving(false)
    if (error || !data) {
      setBackendError(error?.message ?? 'Your profile could not be updated.')
      return
    }
    const nextProfile = data as Profile
    setProfile(nextProfile)
    if (avatarPath) {
      const { data: avatarData } = await supabase.storage.from('profile-avatars').createSignedUrl(avatarPath, 3600)
      setProfileAvatarUrl(avatarData?.signedUrl ?? '')
    }
    setProfileAvatarFile(undefined)
    setProfileAvatarPreview('')
    setProfileModal(false)
  }

  function startReport() {
    setFormError('')
    if (isSupabaseConfigured && !session) {
      setAuthModal('sign-in')
      setAuthMessage('Sign in or create an account before submitting a report.')
      return
    }
    setLocationQuery('')
    setLocationSuggestions([])
    setLocationSearchMessage('')
    setLocationConfirmed(false)
    setLocation(districtCenter)
    setMapCenter(districtCenter)
    setReporting(true)
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setFormError('Location access is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const currentLocation: [number, number] = [coords.latitude, coords.longitude]
        setLocation(currentLocation)
        setMapCenter(currentLocation)
        setLocationQuery('Current location')
        setLocationConfirmed(true)
        setLocationSuggestions([])
        setLocationSearchMessage('')
        setSelectedId(undefined)
        setFormError('')
      },
      () => setFormError('Location was not shared. You can still submit the approximate map location.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function handlePhoto(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Choose a JPEG, PNG, or WebP image for the report photo.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Choose an image under 5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
    setPhotoFile(file)
    setFormError('')
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const category = String(formData.get('category')) as Category
    const issueType = String(formData.get('issue_type') ?? '').trim() || 'Other issue'
    const locationLabel = String(formData.get('location') ?? '').trim()
    if (!locationConfirmed || !locationLabel) {
      setFormError('Choose a suggested place or use your current location before submitting.')
      return
    }
    if (title.length < 3 || description.length < 8) {
      setFormError('Add a title of at least 3 characters and a description of at least 8 characters.')
      return
    }
    setFormError('')
    let report: Report
    if (supabase && session) {
      let photoPath: string | null = null
      if (photoFile) {
        const extension = photoFile.type === 'image/jpeg' ? 'jpg' : photoFile.type.split('/')[1]
        photoPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('report-photos').upload(photoPath, photoFile, { contentType: photoFile.type, upsert: false })
        if (uploadError) {
          setFormError(`Photo upload failed: ${uploadError.message}`)
          return
        }
      }
      const { data, error } = await supabase.from('reports').insert({
        reporter_id: session.user.id,
        title,
        category,
        issue_type: issueType,
        urgency: String(formData.get('urgency')),
        description,
        location_label: locationLabel,
        latitude: location[0],
        longitude: location[1],
        photo_path: photoPath,
        photo_paths: photoPath ? [photoPath] : [],
      }).select('*').single()
      if (error || !data) {
        if (photoPath) await supabase.storage.from('report-photos').remove([photoPath])
        setFormError(error?.message ?? 'The report could not be saved. Please try again.')
        return
      }
      report = toReport(data as ReportRow)
    } else {
      report = {
        id: `GP-NEW-${Date.now()}`,
        title,
        description,
        category,
        issueType,
        urgency: String(formData.get('urgency')) as Urgency,
        status: 'Submitted',
        location: locationLabel || 'Community location',
        coordinates: location,
        createdAt: new Date().toISOString(),
        image: photo,
      }
    }
    if (supabase && session) void deliverNotificationEmails(report.id, session.access_token)
    setReports((current) => [report, ...current])
    setSelectedId(report.id)
    setReporting(false)
    setPhoto(undefined)
    setPhotoFile(undefined)
    setFormError('')
    form.reset()
  }

  async function saveWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session || !staffReport) return
    const formData = new FormData(event.currentTarget)
    const nextStatus = String(formData.get('status')) as Status
    const resolutionNote = String(formData.get('resolution_note') ?? '').trim()
    if (['Additional information requested', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed'].includes(nextStatus) && resolutionNote.length < 8) {
      setWorkflowError('Add response details (at least 8 characters) before saving this status.')
      return
    }
    setSavingWorkflow(true)
    setWorkflowError('')
    const { data, error } = await supabase.from('reports').update({
      status: nextStatus,
      assigned_to: String(formData.get('assigned_to') ?? '') || null,
      verified_by: nextStatus === 'Verified' ? session.user.id : undefined,
      resolution_note: resolutionNote || null,
    }).eq('id', staffReport.id).select('*').single()
    setSavingWorkflow(false)
    if (error || !data) {
      setWorkflowError(error?.message ?? 'The update could not be saved.')
      return
    }
    const updatedReport = toReport(data as ReportRow)
    void deliverNotificationEmails(updatedReport.id, session.access_token)
    setReports((current) => current.map((report) => report.id === updatedReport.id ? updatedReport : report))
    setWorkflowError('Saved. The report timeline has been updated.')
  }

  useEffect(() => {
    if (!supabase || !staffMode || !staffReportId || (profile?.role !== 'responder' && profile?.role !== 'admin')) {
      setReportEvents([])
      setStaffPhotoUrl('')
      return
    }
    supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', staffReportId).order('created_at', { ascending: false }).then(({ data }) => {
      setReportEvents((data ?? []) as ReportEvent[])
    })
    const selected = reports.find((report) => report.id === staffReportId)

    if (selected?.photoPath) {
      supabase.storage.from('report-photos').createSignedUrl(selected.photoPath, 300).then(({ data }) => {
        setStaffPhotoUrl(data?.signedUrl ?? '')
      })
    } else setStaffPhotoUrl('')
  }, [profile?.role, staffMode, staffReportId, reports])

  function markNotificationRead(notification: InboxNotification) {
    const readAt = new Date().toISOString()
    if (typeof notification.id === 'string') {
      const nextIds = [...new Set([...readOverdueIds, notification.report_id])]
      setReadOverdueIds(nextIds)
      try {
        localStorage.setItem('greenpulse-read-overdue', JSON.stringify(nextIds))
      } catch {
        setBackendError('Overdue alert read state could not be saved in this browser.')
      }
    } else if (supabase) {
      void supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
    }
    if (profile?.role === 'admin' || profile?.role === 'responder') {
      setStaffMode(true)
      setStaffDashboardOpen(false)
      setStaffReportId(notification.report_id)
    } else setSelectedId(notification.report_id)
    setNotificationPanelOpen(false)
  }

  function markAllNotificationsRead() {
    const readAt = new Date().toISOString()
    if (supabase) void supabase.from('notifications').update({ read_at: readAt }).is('read_at', null)
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
    const nextIds = [...new Set([...readOverdueIds, ...overdueNotifications.map((item) => item.report_id)])]
    setReadOverdueIds(nextIds)
    try {
      localStorage.setItem('greenpulse-read-overdue', JSON.stringify(nextIds))
    } catch {
      setBackendError('Overdue alert read state could not be saved in this browser.')
    }
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="GreenPulse home">
          <span className="brand-mark"><Leaf size={19} strokeWidth={2.2} /></span>
          <span className="brand-name">green<span>pulse</span></span>
        </a>
        <div className="topbar-context"><span className="live-dot" /> Community watch <span className="context-divider">/</span> Environmental reports</div>
        <div className="topbar-actions">
          {!isSupabaseConfigured ? <span className="mode-badge">DEMO MODE</span> : null}
          <button className="icon-button theme-toggle" type="button" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
          {session && <button className={`icon-button notification-toggle ${notificationPanelOpen ? 'active' : ''}`} type="button" onClick={() => setNotificationPanelOpen((open) => !open)} aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`} aria-expanded={notificationPanelOpen} title="Notifications"><Bell size={16} />{unreadNotificationCount > 0 && <span className="notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}</button>}
          {session ? <>
            {(profile?.role === 'responder' || profile?.role === 'admin') && <button className={`text-button staff-toggle ${staffMode ? 'active' : ''}`} type="button" title={staffMode ? 'Return to community view' : 'Open staff desk'} aria-label={staffMode ? 'Return to community view' : 'Open staff desk'} onClick={() => { setStaffMode((current) => !current); setStaffDashboardOpen(true) }}><ClipboardCheck size={15} /><span>{staffMode ? 'Community view' : 'Staff desk'}</span></button>}
            <button className="profile-button" type="button" onClick={() => { setProfileAvatarPreview(profileAvatarUrl); setProfileModal(true) }} aria-label="Open profile settings"><span className="avatar">{profileAvatarUrl ? <img src={profileAvatarUrl} alt="" /> : (profile?.display_name || session.user.email || 'R').slice(0, 1).toUpperCase()}</span><span className="profile-label">{profile?.display_name || session.user.email}</span></button>
            <button className="icon-button" type="button" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </> : isSupabaseConfigured ? <button className="sign-in-button" type="button" onClick={() => { setAuthModal('sign-in'); setAuthMessage(''); setAuthMessageSuccess(false); setConfirmationEmail('') }} disabled={!authReady}><LogIn size={15} />Sign in</button> : <span className="profile-button"><span className="avatar">G</span><span className="profile-label">Guest</span></span>}
        </div>
      </header>

      {notificationPanelOpen && <section className="notification-panel" aria-label="Notifications">
        <div className="notification-panel-heading"><div><strong>Notifications</strong><span>{unreadNotificationCount ? `${unreadNotificationCount} unread` : 'All caught up'}</span></div><button className="icon-button" type="button" onClick={() => setNotificationPanelOpen(false)} aria-label="Close notifications"><X size={15} /></button></div>
        <div className="notification-list">
          {inboxNotifications.length === 0 ? <p className="notification-empty">No notifications yet.</p> : inboxNotifications.slice(0, 40).map((notification) => <button className="notification-item" type="button" key={notification.id} onClick={() => markNotificationRead(notification)}>
            <span className={`notification-marker ${notification.read_at ? '' : 'is-new'}`} />
            <span><strong>{notification.title}</strong><small>{notification.message} · {formatCreatedAt(notification.created_at)}</small></span>
            {!notification.read_at && <em>NEW</em>}
          </button>)}
        </div>
        <div className="notification-panel-footer"><span>In-app alerts · email updates in profile</span><button type="button" onClick={markAllNotificationsRead} disabled={unreadNotificationCount === 0}><CheckCheck size={13} />Mark all read</button></div>
      </section>}

      <main id="home" className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">COMMUNITY ENVIRONMENT DESK <span>•</span> DISTRICT 5, QUEZON CITY</p>
            <h1>{staffMode ? <>Coordinate the response. <em>Close the loop.</em></> : <>See it. Report it. <em>Restore it.</em></>}</h1>
            <p className="page-subtitle">{staffMode ? 'A focused queue for reviewing reports and coordinating community response.' : 'A shared view of local environmental concerns and response across District 5.'}</p>
          </div>
          <button className="primary-button" type="button" onClick={startReport}><Plus size={17} /> Report an issue</button>
        </section>

        {!isSupabaseConfigured && <div className="connection-banner demo-banner"><span className="mode-dot" /><span><strong>Demo data</strong> Reports stay in this browser. Add Supabase settings to enable shared reports and accounts.</span></div>}
        {backendError && <div className="connection-banner error-banner" role="alert"><AlertTriangle size={16} /><span>{backendError}</span><button type="button" onClick={() => setBackendError('')} aria-label="Dismiss message"><X size={14} /></button></div>}

        {staffMode ? <section className="stats-row staff-stats" aria-label="Staff response summary">
          <div className="stat-item"><span className="stat-icon stat-leaf"><ClipboardCheck size={17} /></span><span className="stat-copy"><strong>{openReports}</strong><span>Open queue</span></span></div>
          <div className="stat-item"><span className="stat-icon stat-clock"><AlertTriangle size={17} /></span><span className="stat-copy"><strong>{reports.filter((report) => report.urgency === 'High' && report.status !== 'Resolved' && report.status !== 'Rejected').length}</strong><span>Urgent</span></span></div>
          <div className="stat-item"><span className="stat-icon stat-verify"><Clock3 size={17} /></span><span className="stat-copy"><strong>{reports.filter((report) => report.status === 'In progress').length}</strong><span>In progress</span></span></div>
          <div className="stat-item"><span className="stat-icon stat-leaf"><Check size={17} /></span><span className="stat-copy"><strong>{reports.filter((report) => report.status === 'Resolved').length}</strong><span>Resolved</span></span></div>
        </section> : <section className="stats-row" aria-label="Community report summary">
          <div className="stat-item"><span className="stat-icon stat-leaf"><Leaf size={17} /></span><span className="stat-copy"><strong>{openReports}</strong><span>Open reports</span></span><span className="stat-note">needs attention</span></div>
          <div className="stat-item"><span className="stat-icon stat-verify"><ShieldCheck size={18} /></span><span className="stat-copy"><strong>{verifiedReports}</strong><span>Verified or assigned</span></span><span className="stat-note">being followed up</span></div>
          <div className="stat-item"><span className="stat-icon stat-clock"><Clock3 size={17} /></span><span className="stat-copy"><strong>{reports.length}</strong><span>Community reports</span></span><span className="stat-note">all time</span></div>
          <div className="stat-updated"><span className="live-dot" /> Updated just now</div>
        </section>}

        {staffMode && profile?.role === 'admin' && staffDashboardOpen && <section className="admin-overview" aria-label="Admin dashboard" aria-busy={loadingReports}>
          <div className="analytics-heading">
            <div><p className="eyebrow">ADMIN DASHBOARD</p><h2>Environmental report overview</h2></div>
            <div className="analytics-heading-actions"><span className="analytics-period">{loadingReports ? 'Loading reports…' : 'All reports'}<i />Current data</span><button className="secondary-button admin-dashboard-action" type="button" onClick={() => setStaffDashboardOpen(false)}><ClipboardCheck size={14} /> Response desk</button></div>
          </div>
          <div className="admin-metrics-grid">
            {[
              { label: 'Total reports', value: adminAnalytics.total, note: 'All recorded reports', icon: <Leaf size={15} /> },
              { label: 'Pending reports', value: adminAnalytics.pending, note: 'Awaiting review or follow-up', icon: <Clock3 size={15} /> },
              { label: 'Verified reports', value: adminAnalytics.verified, note: 'Verified by staff', icon: <ShieldCheck size={15} /> },
              { label: 'Assigned reports', value: adminAnalytics.assigned, note: 'With a responder assigned', icon: <UserRound size={15} /> },
              { label: 'In-progress reports', value: adminAnalytics.inProgress, note: 'Response underway', icon: <ArrowDownUp size={15} /> },
              { label: 'Resolved reports', value: adminAnalytics.resolved, note: 'Marked resolved', icon: <Check size={15} /> },
              { label: 'Closed reports', value: adminAnalytics.closed, note: 'Closed without resolution', icon: <X size={15} /> },
              { label: 'Rejected reports', value: adminAnalytics.rejected, note: 'Rejected by staff', icon: <AlertTriangle size={15} /> },
              { label: 'Critical reports', value: adminAnalytics.critical, note: 'High urgency', icon: <AlertTriangle size={15} /> },
              { label: 'Reports this week', value: adminAnalytics.thisWeek, note: 'Since Monday', icon: <CalendarDays size={15} /> },
              { label: 'Reports this month', value: adminAnalytics.thisMonth, note: 'Since the first of the month', icon: <CalendarDays size={15} /> },
            ].map((metric) => <article className="admin-metric" key={metric.label}>
              <span className="admin-metric-icon">{metric.icon}</span><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.note}</small>
            </article>)}
          </div>
          <div className="admin-chart-grid">
            <AdminBarChart title="Reports by category" description="Environmental concern type" data={adminAnalytics.byCategory} />
            <AdminBarChart title="Reports by status" description="Current response stage" data={adminAnalytics.byStatus} />
            <AdminBarChart title="Reports by urgency" description="Reported urgency level" data={adminAnalytics.byUrgency} />
            <AdminBarChart title="Reports by location" description="Most reported locations" data={adminAnalytics.byLocation} />
            <article className="analytics-chart admin-trend-chart">
              <div className="analytics-chart-heading"><div><strong>Reports over time</strong><span>Daily submissions over the last 14 days</span></div><span className="analytics-total"><b>{adminAnalytics.overTime.reduce((sum, day) => sum + day.value, 0)}</b> reports</span></div>
              <div className="admin-trend-bars" role="list" aria-label="Reports submitted per day over the last 14 days">
                {adminAnalytics.overTime.map((day) => <div className="admin-trend-day" role="listitem" key={day.date} aria-label={`${day.date}: ${day.value} reports`} title={`${day.date}: ${day.value} reports`}>
                  <small>{day.value || ''}</small><span className="admin-trend-track"><b style={{ height: `${Math.max(day.value ? 4 : 0, (day.value / Math.max(1, ...adminAnalytics.overTime.map((entry) => entry.value))) * 100)}%` }} /></span><small>{day.label}</small>
                </div>)}
              </div>
            </article>
            <article className="analytics-chart admin-outcome-chart">
              <div className="analytics-chart-heading"><div><strong>Resolution performance</strong><span>Resolved reports as a share of all reports</span></div><ShieldCheck size={17} /></div>
              <div className="resolution-content">
                <div className="resolution-ring" role="img" aria-label={`Resolution rate ${Math.round(adminAnalytics.resolutionRate)} percent`} style={{ background: `conic-gradient(#548a78 ${adminAnalytics.resolutionRate}%, #edf2eb 0)` }}><span>{Math.round(adminAnalytics.resolutionRate)}<small>%</small></span></div>
                <p><strong>{adminAnalytics.resolved} of {adminAnalytics.total}</strong><small>reports resolved</small></p>
              </div>
              <div className="average-resolution">
                <span>Average resolution time</span>
                <strong>{adminAnalytics.averageResolutionMs === undefined ? '—' : adminAnalytics.averageResolutionMs < 86_400_000
                  ? `${Math.max(1, Math.round(adminAnalytics.averageResolutionMs / 3_600_000))} hr`
                  : `${(adminAnalytics.averageResolutionMs / 86_400_000).toFixed(1)} days`}</strong>
                <small>Resolved reports with recorded resolution timestamps</small>
              </div>
            </article>
          </div>
        </section>}

        {staffMode && (profile?.role === 'responder' || profile?.role === 'admin') && (!staffDashboardOpen || profile.role !== 'admin') && <section className="staff-workbench" aria-label="Staff report management">
          <div className="staff-workbench-heading"><div><p className="eyebrow">RESPONSE MANAGEMENT</p><h2>Staff desk</h2><p>Review incoming reports, assign responders, and record outcomes.</p></div><div className="staff-workbench-actions">{profile.role === 'admin' && <button className="secondary-button" type="button" onClick={() => setStaffDashboardOpen(true)}><BarChart3 size={14} /> Dashboard</button>}<span className="role-chip"><ShieldCheck size={14} />{profile.role}</span></div></div>
          <div className="staff-workbench-grid">
            <div className="staff-queue"><div className="queue-heading"><div><h3>Response queue</h3><span>{staffQueue.length} shown · {openReports} open</span></div><div className="staff-queue-controls"><label className="search-box"><Search size={14} /><input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search queue" aria-label="Search staff queue" /></label><label className="select-wrap"><span className="sr-only">Filter staff queue by status</span><select value={staffStatusFilter} onChange={(event) => setStaffStatusFilter(event.target.value)}><option>Open reports</option><option>All reports</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label></div></div>
              {staffQueue.length === 0 ? <div className="staff-empty">No reports match this queue.</div> : staffQueue.map((report) => <button key={report.id} type="button" className={`queue-item ${staffReportId === report.id ? 'selected' : ''}`} onClick={() => { setStaffReportId(report.id); setWorkflowError('') }}><span className="queue-item-title">{report.title}</span><span className="queue-item-meta">{report.category} · {formatCreatedAt(report.createdAt)}</span><span className={`status-pill status-${report.status.toLowerCase().replace(/ /g, '-')}`}><i />{report.status}</span></button>)}
            </div>
            <div className="staff-detail">{staffReport ? <>
              <div className="staff-report-heading"><div><span className="report-id">{staffReport.id.slice(0, 8).toUpperCase()}</span><h3>{staffReport.title}</h3><span className="section-caption">{staffReport.category} · {staffReport.urgency} urgency · {formatCreatedAt(staffReport.createdAt)}</span><span className="reporter-line"><UserRound size={12} /> Reported by {staffReport.reporterName || 'Community resident'}</span></div><MapPin size={18} /></div>
              <p className="staff-description">{staffReport.description}</p>
              <p className="staff-location"><MapPin size={14} />{staffReport.location} <span>({staffReport.coordinates.map((coordinate) => coordinate.toFixed(5)).join(', ')})</span></p>
              {staffPhotoUrl && <a className="staff-photo-link" href={staffPhotoUrl} target="_blank" rel="noreferrer"><img src={staffPhotoUrl} alt="Attached report evidence" />View report photo</a>}
              <form className="workflow-form" onSubmit={saveWorkflow} key={`${staffReport.id}-${staffReport.status}-${staffReport.assignedTo ?? ''}-${staffReport.resolutionNote ?? ''}`}>
                <label className="field-label">Status<select name="status" defaultValue={staffReport.status}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label className="field-label">Assign responder<select name="assigned_to" defaultValue={staffReport.assignedTo ?? ''}><option value="">Unassigned</option>{staffUsers.map((user) => <option key={user.id} value={user.id}>{user.display_name || user.role}</option>)}</select></label>
                <label className="field-label">Response details<textarea name="resolution_note" rows={2} maxLength={1000} defaultValue={staffReport.resolutionNote ?? ''} placeholder="Required for information requests and outcomes" /></label>
                {workflowError && <p className={workflowError.startsWith('Saved') ? 'workflow-success' : 'form-error'} role="status">{workflowError}</p>}
                <button className="primary-button" type="submit" disabled={savingWorkflow}>{savingWorkflow ? 'Saving…' : 'Save response update'}</button>
              </form>
              <div className="event-history"><h4>Report history</h4>{reportEvents.length ? reportEvents.map((event) => <div className="event-item" key={event.id}><span className="event-mark" /><span><strong>{event.message}</strong><small>{formatCreatedAt(event.created_at)}</small></span></div>) : <p>No history entries yet.</p>}</div>
            </> : <div className="staff-detail-empty"><ClipboardCheck size={25} /><strong>Select a report</strong><span>Choose an open report to review and update its response.</span></div>}</div>
          </div>
        </section>}

        {!staffMode && <section className="monitoring-layout">
          <div className="map-column">
            <div className="section-toolbar">
              <div><h2>Incident map</h2><span className="section-caption">Verified community reports in District 5</span></div>
              <button className="map-location-button" type="button" onClick={requestLocation} title="Use my current location"><Crosshair size={15} /><span>My location</span></button>
            </div>
            <div className="map-frame">
              <MapContainer center={mapCenter as LatLngExpression} zoom={15} scrollWheelZoom className="leaflet-map">
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapFocus report={selectedReport} center={mapCenter} />
                {orderedReports.map((report) => (
                  <Marker
                    key={report.id}
                    position={report.coordinates}
                    icon={createReportMarker(report, selectedId === report.id)}
                    eventHandlers={{ click: () => setSelectedId(report.id) }}
                  >
                    <Popup className="report-map-popup"><div><span>{report.category} · {report.status}</span><strong>{report.title}</strong><small className="popup-reporter"><UserRound size={12} />Reported by {report.reporterName || 'Community resident'}</small><small><MapPin size={12} />{report.location}</small><p>{report.description}</p></div></Popup>
                  </Marker>
                ))}
              </MapContainer>
              <div className="map-label"><MapPin size={13} /> District 5, Quezon City</div>
              <div className="map-legend"><span className="legend-title">REPORT TYPE</span>{categoryOptions.map((category) => <span className="legend-item" key={category}><i style={{ backgroundColor: categoryColors[category] }} />{category}</span>)}</div>
            </div>
            <div className="map-footnote"><MapPin size={13} /> Pins show approximate report locations <span>·</span> Select a pin for details</div>
          </div>

          <aside className="reports-panel" aria-label="Recent environmental reports">
            <div className="reports-heading">
              <div><div className="reports-title-line"><h2>Recent reports</h2><span className="count-badge">{visibleReports.length}</span></div><span className="section-caption">Community-submitted concerns</span></div>
              <button className="icon-button sort-button" title={`Sort ${newestFirst ? 'oldest' : 'newest'} first`} aria-label={`Sort ${newestFirst ? 'oldest' : 'newest'} first`} onClick={() => setNewestFirst((current) => !current)} type="button"><ArrowDownUp size={16} /></button>
            </div>
            <div className="report-controls">
              <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports" aria-label="Search reports" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}</label>
              <div className="filter-row">
                <label className="select-wrap"><span className="sr-only">Filter by category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={13} /></label>
                <label className="select-wrap"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label>
              </div>
            </div>
            <div className="report-list">
              {loadingReports ? <div className="empty-state"><Clock3 size={20} /><strong>Loading reports</strong><span>Connecting to the community feed.</span></div> : orderedReports.length === 0 ? <div className="empty-state"><Search size={21} /><strong>No matching reports</strong><span>Try changing a filter or search term.</span></div> : orderedReports.map((report) => {
                const Icon = categoryIcon(report.category)
                return <button type="button" className={`report-item ${selectedId === report.id ? 'is-selected' : ''}`} key={report.id} onClick={() => setSelectedId(report.id)}>
                  <span className="report-category-icon" style={{ color: categoryColors[report.category], backgroundColor: `${categoryColors[report.category]}14` }}><Icon size={17} /></span>
                  <span className="report-main"><span className="report-title">{report.title}</span><span className="report-meta"><MapPin size={12} />{report.location}<span>·</span>{formatCreatedAt(report.createdAt)}</span><span className="report-tags"><span className={`status-pill status-${report.status.toLowerCase().replace(/ /g, '-')}`}><i />{report.status}</span>{report.urgency === 'High' && <span className="urgency-pill"><AlertTriangle size={11} />Urgent</span>}</span></span>
                  <span className="report-id">{report.id.replace('GP-', '#')}</span>
                </button>
              })}
            </div>
            <div className="panel-footer"><span><span className="live-dot" /> Live community feed</span><button type="button" onClick={() => { setCategoryFilter('All categories'); setStatusFilter('All statuses'); setSearch('') }}>Reset filters</button></div>
          </aside>
        </section>}

        <footer className="page-footer"><span>GREENPULSE <i>·</i> COMMUNITY ENVIRONMENT MONITORING · DISTRICT 5</span>{!staffMode && <button type="button" onClick={startReport}><Plus size={14} /> Add a report</button>}</footer>
      </main>

      {reporting && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReporting(false) }}>
        <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><div><p className="eyebrow">COMMUNITY REPORT</p><h2 id="modal-title">What did you notice?</h2><p>Help your community respond with a few details.</p></div><button className="icon-button" type="button" onClick={() => setReporting(false)} aria-label="Close report form"><X size={19} /></button></div>
          <form onSubmit={submitReport}>
            <label className="field-label">Report title<input name="title" maxLength={90} placeholder="e.g. Waste piling up beside the road" required /></label>
            <div className="form-grid"><label className="field-label">Category<select name="category" defaultValue="Waste">{intakeCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field-label">Specific issue<input name="issue_type" maxLength={80} placeholder="e.g. Clogged drainage" required /></label><label className="field-label">Urgency<select name="urgency" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></label></div>
            <label className="field-label">What is happening?<textarea name="description" rows={3} maxLength={500} placeholder="Describe what you observed and any immediate risks." required /></label>
            <div className="location-autocomplete-wrap">
              <label className="field-label" htmlFor="report-location">Location <span className="field-hint">Search a street, landmark, barangay, or facility</span></label>
              <div className={`location-autocomplete ${locationConfirmed ? 'location-confirmed' : ''}`}>
                <MapPin size={16} />
                <input id="report-location" name="location" value={locationQuery} onChange={(event) => { setLocationQuery(event.target.value); setLocationConfirmed(false); setLocationSearchMessage('') }} placeholder="e.g. Batasan Hills, Quezon City" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={locationSuggestions.length > 0} aria-controls="location-suggestions" />
                {locationSearchBusy && <span className="search-spinner" aria-label="Searching locations" />}
                {locationConfirmed && <Check size={16} className="location-check" />}
              </div>
              {locationSuggestions.length > 0 && <ul className="location-suggestions" id="location-suggestions" role="listbox" aria-label="Suggested places">{locationSuggestions.map((suggestion) => <li key={`${suggestion.label}-${suggestion.coordinates.join(',')}`}><button type="button" role="option" aria-selected="false" onClick={() => { setLocation(suggestion.coordinates); setMapCenter(suggestion.coordinates); setLocationQuery(suggestion.label); setLocationConfirmed(true); setLocationSuggestions([]); setLocationSearchMessage(''); setFormError('') }}><MapPin size={15} /><span>{suggestion.label}<small>{suggestion.coordinates[0].toFixed(5)}, {suggestion.coordinates[1].toFixed(5)}</small></span></button></li>)}</ul>}
              {locationSearchBusy && <p className="location-feedback" role="status">Searching nearby places…</p>}
              {!locationSearchBusy && locationSearchMessage && <p className="location-feedback location-search-error" role="status">{locationSearchMessage}</p>}
              {!locationSearchBusy && locationQuery.trim().length >= 3 && !locationConfirmed && !locationSearchMessage && locationSuggestions.length === 0 && <p className="location-feedback" role="status">No matches yet. Try another nearby name or use your current location.</p>}
              <p className="location-attribution">Place suggestions by Photon · OpenStreetMap contributors</p>
            </div>
              <div className="location-field"><div className="location-copy"><MapPin size={16} /><span><strong>{locationConfirmed ? 'Selected map location' : 'Choose a map location'}</strong><small>{locationConfirmed ? `${location[0].toFixed(5)}, ${location[1].toFixed(5)}` : 'Pick a search suggestion or use GPS'}</small></span></div><button className="text-button" type="button" onClick={requestLocation}><Crosshair size={14} /> Use my location</button></div>
            {isSupabaseConfigured && <p className="privacy-note">Your account identity stays private. Verified reports show their description and location on the community map.</p>}
            <div className="photo-row"><label className="upload-button"><Camera size={15} />{photo ? 'Photo attached' : 'Add a photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePhoto(event.target.files?.[0])} /></label>{photo && <button className="remove-photo" type="button" onClick={() => { setPhoto(undefined); setPhotoFile(undefined) }}><X size={13} /> Remove</button>}<span>Optional · JPEG, PNG, or WebP · max 5 MB</span></div>
            {photo && <img className="photo-preview" src={photo} alt="Selected report attachment preview" />}
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setReporting(false)}>Cancel</button><button className="primary-button" type="submit" disabled={loadingReports}>{loadingReports ? 'Connecting…' : <><Check size={16} /> Submit report</>}</button></div>
          </form>
        </section>
      </div>}

      {authModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthModal(null) }}>
        <section className="report-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="modal-header"><div><p className="eyebrow">DISTRICT 5 COMMUNITY ACCOUNT</p><h2 id="auth-title">{confirmationEmail && authModal === 'sign-up' ? 'Confirm your email' : authModal === 'sign-up' ? 'Create your account' : 'Welcome back'}</h2><p>{confirmationEmail && authModal === 'sign-up' ? `Follow the confirmation link sent to ${confirmationEmail}.` : 'Sign in to submit reports and follow their progress.'}</p></div><button className="icon-button" type="button" onClick={() => { setAuthModal(null); setConfirmationEmail('') }} aria-label="Close sign-in form"><X size={19} /></button></div>
          <form onSubmit={submitAuth}>
            {authModal === 'sign-up' && <label className="field-label">Name<input name="display_name" autoComplete="name" maxLength={80} required /></label>}
            <label className="field-label">Email<input name="email" type="email" autoComplete="email" defaultValue={confirmationEmail} required /></label>
            <label className="field-label">Password<input name="password" type="password" minLength={8} autoComplete={authModal === 'sign-up' ? 'new-password' : 'current-password'} required /></label>
            {authMessage && <p className={authMessageSuccess ? 'auth-success' : 'form-error'} role={authMessageSuccess ? 'status' : 'alert'}>{authMessage}</p>}
            {confirmationEmail && <button className="resend-confirmation" type="button" onClick={() => void resendConfirmation()} disabled={authBusy}>Resend confirmation email</button>}
            <div className="modal-actions"><button className="text-button" type="button" onClick={() => { setAuthModal(authModal === 'sign-up' ? 'sign-in' : 'sign-up'); setAuthMessage(''); setAuthMessageSuccess(false); setConfirmationEmail('') }}>{authModal === 'sign-up' ? 'Already have an account? Sign in' : 'Create an account'}</button><button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authModal === 'sign-up' ? 'Create account' : 'Sign in'}</button></div>
          </form>
        </section>
      </div>}

      {profileModal && profile && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileModal(false) }}>
        <section className="report-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
          <div className="modal-header"><div><p className="eyebrow">YOUR COMMUNITY ACCOUNT</p><h2 id="profile-title">Profile settings</h2><p>Keep your name and account image up to date.</p></div><button className="icon-button" type="button" onClick={() => setProfileModal(false)} aria-label="Close profile settings"><X size={19} /></button></div>
          <form onSubmit={saveProfile}>
            <div className="profile-editor"><div className="profile-avatar-large">{profileAvatarPreview || profileAvatarUrl ? <img src={profileAvatarPreview || profileAvatarUrl} alt="Profile preview" /> : <UserRound size={27} />}</div><label className="upload-button"><Upload size={15} /> Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleProfileAvatar(event.target.files?.[0])} /></label><span className="profile-upload-note">JPEG, PNG, or WebP · max 3 MB</span></div>
            <label className="field-label">Display name<input name="display_name" defaultValue={profile.display_name} maxLength={80} required /></label>
            <label className="field-label">Email<input value={session?.user.email ?? ''} readOnly /></label>
            <label className="notification-email-setting"><input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications !== false} /><span><strong>Email notifications</strong><small>Send report updates to this account's email address.</small></span></label>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setProfileModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={profileSaving}>{profileSaving ? 'Saving…' : <><Check size={16} /> Save profile</>}</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}

export default App