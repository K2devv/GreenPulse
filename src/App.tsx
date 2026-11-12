import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileSearch,
  ClipboardCheck,
  Crosshair,
  LocateFixed,
  Droplets,
  Filter,
  Flame,
  Layers,
  Leaf,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Plus,
  SlidersHorizontal,
  Trash2,
  Users,
  Search,
  ShieldCheck,
  Sun,
  Trees,
  Upload,
  UserRound,
  Waves,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { Geolocation } from '@capacitor/geolocation'
import { topBackLayer, type BackLayer } from './lib/native-back'
import { attachReporterNames, getAuthRedirectUrl, isSupabaseConfigured, reporterIdsOf, supabase, toReport, type EnvironmentalFollowUp, type NotificationRow, type Profile, type ReportEvent, type ReportResolutionFeedback, type ReportRow, type Team } from './lib/supabase'
import { apiUrl } from './lib/api-url'
import { THEME_CHOICE_KEY, oppositeTheme, readThemeChoice, resolveTheme, type Theme } from './lib/theme-preference'
import { normalizePhoneNumber } from './lib/phone-number'
import { StaffWorkflowPanel } from './StaffWorkflowPanel'
import { AnimatedNumber } from './AnimatedNumber'
import { HeroPanel, type HeroStat } from './HeroPanel'
import { AdminBarChart, AdminTrendChart, ChartEmpty, ChartSkeleton } from './AdminCharts'
import { AdminSectionNav, adminTabId, type AdminSection } from './AdminSectionNav'
import { FilterChips } from './FilterChips'
import { ToastViewport, toneForMessage, useToasts } from './Toaster'
import { ViewLoader, useViewTransition } from './ViewLoader'
import { useDisplayPrefs } from './display-prefs'
import { DisplaySettings } from './DisplaySettings'
import { SyncStatus } from './SyncStatus'
import { resolveSyncState } from './lib/sync-status'
import { CommandPalette } from './CommandPalette'
import type { PaletteCommand } from './lib/command-palette'
import { SuccessBurst } from './SuccessBurst'
import { WelcomeTour } from './WelcomeTour'
import { EmptyIllustration } from './EmptyIllustration'
import { useFlip } from './useFlip'
import { useStatusChanges } from './useStatusChanges'
import { EnvironmentalReports } from './EnvironmentalReports'
import { CommunityReportDiscussion, ReportConversation, ReportTimeline, ResidentReportModal } from './ReportCommunication'
import { isViewerOnTask, mergeSavedReport, resolveStaffReport } from './lib/staff-report'
import { ReportFeedCard } from './ReportFeedCard'
import { ENGAGEMENT_BATCH_LIMIT, indexEngagement, type ReportEngagement } from './lib/report-engagement'
import { isOpenStatus } from './lib/report-workflow'
import { ExactLocation } from './ExactLocation'
import { formatPlaceLabel } from './lib/place-label'
import { DISTRICT_5_BARANGAYS, NO_BARANGAY, UNASSIGNED, clearFilter, countActiveFilters, defaultReportFilters, describeActiveFilters, detectBarangay, formatReportId, loadSavedFilters, saveFilters, type ReportFilters } from './lib/report-filters'
import { BOUNDARY_EDGE_TOLERANCE_METERS, findBarangayAt, loadBundledBarangayBoundaries, toBarangayBoundaries, type BarangayBoundary } from './lib/barangay-lookup'
import { buildDistrictOutline } from './lib/district-outline'
import { spreadCoincident } from './lib/map-clusters'
import type { HeatCell } from './lib/map-style'
import type { Bounds } from './lib/map-viewport'
import { MapSkeleton } from './MapParts'
import type { MapReport } from './ReportMap'
import { needsImmediateAttention } from './lib/report-escalation'
import { reportDeadline } from './lib/report-deadline'
import { formatDuration } from './lib/report-summary'
import { buildResponseTimeMetrics } from './lib/report-response-times'
import { buildReportAnalytics } from './lib/report-analytics'
import { findRecurringHotspots, type RecurringHotspot } from './lib/report-recurrence'
import { GuestReportTracking } from './GuestReportTracking'
import { MAX_REPORT_PHOTOS, prepareReportPhoto } from './lib/report-photos'
import { translate } from './lib/ui-copy'
import { deleteLocalReportDraft, getLocalReportDraft, saveLocalReportDraft, type LocalReportDraft } from './lib/report-drafts'

// The map library is large, so both maps load after the rest of the app.
const ReportMap = lazy(() => import('./ReportMap'))
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))

type Category = 'Waste' | 'Pollution' | 'Flooding' | 'Drainage' | 'Water pollution' | 'Air pollution'
type Status = 'Submitted' | 'Under review' | 'Additional information requested' | 'Verified' | 'In progress' | 'Awaiting verification' | 'Resolved' | 'Rejected' | 'Closed' | 'Duplicate'
type Urgency = 'Low' | 'Medium' | 'High'

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
  assignedTeamId?: string
  barangay?: string
  verifiedBy?: string
  verifiedAt?: string
  verificationNote?: string
  duplicateOf?: string
  assignedAt?: string
  dueDate?: string
  taskInstructions?: string
  taskPriority?: string
  resolutionPhotoPaths?: string[]
  resolutionDecision?: string
  resolutionReviewNote?: string
  resolutionReviewedBy?: string
  resolutionReviewedAt?: string
  resolutionNote?: string
  resolvedAt?: string
  startedAt?: string
  escalatedAt?: string
  reporterId?: string | null
  reporterName?: string
}

type ResidentFeedback = Pick<ReportResolutionFeedback, 'report_id' | 'feedback' | 'message' | 'updated_at'>

type InboxNotification = {
  id: number | string
  report_id: string
  event_type: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

type ResponseSettings = { response_sla_hours: number; high_urgency_sla_hours: number; second_escalation_multiplier: number }
type SlaEscalation = { report_id: string; stage: number; escalated_at: string; acknowledged_at: string | null; report?: { title: string; status: string; assigned_to: string | null; assigned_team_id: string | null } }
type DeliveryFailure = { id: string; report_id: string; title: string; attempts: number; last_error: string | null; channel: string; status: 'Sent' | 'Failed' | 'Suppressed' | 'Pending'; attempted_at: string | null }
type PilotOutcomes = { totalReports: number; reopenedReports: number; byBarangay: Array<{ label: string; reports: number; resolved: number; reopened: number; averageFirstResponseMs: number | null; averageResolutionMs: number | null }> }

function getRoleLabel(role: Profile['role']) {
  return role === 'resident' ? 'User' : role === 'responder' ? 'Responder' : 'Admin'
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
// Padded bounding box around Quezon City District 5 (south-west, north-east).
const districtBounds: [[number, number], [number, number]] = [[14.675, 121.005], [14.775, 121.105]]
// The same box as [west, south, east, north]: what the maps show if no barangay outlines can be loaded.
const districtBoundsBox: Bounds = [districtBounds[0][1], districtBounds[0][0], districtBounds[1][1], districtBounds[1][0]]
// How long the maps wait for outlines imported into the database before using the bundled ones.
const BOUNDARY_QUERY_TIMEOUT_MS = 2500
const NO_HEAT_CELLS: HeatCell[] = []
const isInsideDistrict = ([latitude, longitude]: [number, number]) =>
  latitude >= districtBounds[0][0] && latitude <= districtBounds[1][0] && longitude >= districtBounds[0][1] && longitude <= districtBounds[1][1]
const outsideDistrictMessage = 'That location is outside District 5, Quezon City.'
const outsideDistrictSubmitMessage = 'This report cannot be submitted because its location is outside District 5, Quezon City. Move the pin inside the district.'
const categoryOptions: Category[] = ['Waste', 'Pollution', 'Flooding', 'Drainage', 'Water pollution', 'Air pollution']
const intakeCategories: Category[] = ['Waste', 'Pollution', 'Flooding', 'Drainage']
const STAFF_PAGE_SIZE = 50
const statusOptions: Status[] = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed', 'Duplicate']
function placeLabel(report: Pick<Report, 'barangay' | 'location'>) {
  return report.barangay ? `Barangay ${report.barangay}` : report.location || 'District 5, Quezon City'
}

function approximateCoordinates([latitude, longitude]: [number, number]): [number, number] {
  return [Number(latitude.toFixed(3)), Number(longitude.toFixed(3))]
}

function distanceInMeters(first: [number, number], second: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(second[0] - first[0])
  const longitudeDelta = radians(second[1] - first[1])
  const latitudeOne = radians(first[0])
  const latitudeTwo = radians(second[0])
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

async function searchPlaces(query: string, center: [number, number], signal: AbortSignal): Promise<LocationSuggestion[]> {
  const parameters = new URLSearchParams({
    q: query,
    lat: String(center[0]),
    lon: String(center[1]),
    limit: '6',
    lang: 'en',
    bbox: `${districtBounds[0][1]},${districtBounds[0][0]},${districtBounds[1][1]},${districtBounds[1][0]}`,
  })
  const response = await fetch(`https://photon.komoot.io/api/?${parameters}`, { signal })
  if (!response.ok) throw new Error('Place search is temporarily unavailable.')
  const result = await response.json() as {
    features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string | undefined> }>
  }
  return (result.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates
    const properties = feature.properties
    if (!coordinates || !properties || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return []
    const label = formatPlaceLabel(properties)
    const point: [number, number] = [coordinates[1], coordinates[0]]
    return label && isInsideDistrict(point) ? [{ label, coordinates: point }] : []
  })
}

async function reverseGeocode(coordinates: [number, number], signal?: AbortSignal): Promise<string> {
  const parameters = new URLSearchParams({ lat: String(coordinates[0]), lon: String(coordinates[1]), lang: 'en' })
  const response = await fetch(`https://photon.komoot.io/reverse?${parameters}`, { signal })
  if (!response.ok) throw new Error('Address lookup is temporarily unavailable.')
  const result = await response.json() as {
    features?: Array<{ properties?: Record<string, string | undefined> }>
  }
  const properties = result.features?.[0]?.properties
  const label = formatPlaceLabel(properties)
  if (!label) throw new Error('No nearby address could be found.')
  return label
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

function toLocalDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

async function deliverNotificationEmails(reportId: string, accessToken: string) {
  try {
    await fetch(apiUrl('/api/send-notification-emails'), {
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

function ReportListSkeleton({ rows = 4, variant = 'report' }: { rows?: number; variant?: 'report' | 'queue' }) {
  return <div className={`skeleton-list skeleton-${variant}`} role="status" aria-busy="true"><span className="sr-only">Loading reports…</span>
    {Array.from({ length: rows }, (_, index) => <div className="skeleton-item" aria-hidden="true" key={index}>
      {variant === 'report' && <span className="skeleton skeleton-icon" />}
      <div className="skeleton-lines"><span className="skeleton skeleton-line skeleton-title" /><span className="skeleton skeleton-line skeleton-meta" /><span className="skeleton-tags"><span className="skeleton skeleton-pill" /><span className="skeleton skeleton-pill skeleton-pill-short" /></span></div>
    </div>)}
  </div>
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="filter-field"><span>{label}</span><span className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select><ChevronDown size={13} /></span></label>
}

const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'admin-overview-metrics', label: 'Overview' },
  { id: 'admin-charts', label: 'Charts' },
  { id: 'admin-summary', label: 'Report summary' },
  { id: 'admin-pilot', label: 'Pilot outcomes' },
  { id: 'admin-operations', label: 'Operations' },
]

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
  const [reportsSyncing, setReportsSyncing] = useState(false)
  const [reportsFailed, setReportsFailed] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [reportRefreshToken, setReportRefreshToken] = useState(0)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
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
  const [signupVerificationMethod, setSignupVerificationMethod] = useState<'email' | 'phone'>('email')
  const [signInMethod, setSignInMethod] = useState<'password' | 'phone-otp'>('password')
  const [phoneOtpPending, setPhoneOtpPending] = useState(false)
  const [phoneOtpNumber, setPhoneOtpNumber] = useState('')
  const [phoneOtpPurpose, setPhoneOtpPurpose] = useState<'sign-in' | 'sign-up' | null>(null)
  const [staffMode, setStaffMode] = useState(false)
  const [staffDashboardOpen, setStaffDashboardOpen] = useState(true)
  const [adminSection, setAdminSection] = useState(ADMIN_SECTIONS[0].id)
  const [staffFilters, setStaffFilters] = useState<ReportFilters>(defaultReportFilters)
  const [staffFiltersOpen, setStaffFiltersOpen] = useState(false)
  const [staffQueue, setStaffQueue] = useState<Report[]>([])
  const [staffQueueCount, setStaffQueueCount] = useState(0)
  const [staffQueueLoading, setStaffQueueLoading] = useState(false)
  const [staffQueueOffset, setStaffQueueOffset] = useState(0)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [teamMessage, setTeamMessage] = useState('')
  const [teamBusy, setTeamBusy] = useState(false)
  const [responderModalOpen, setResponderModalOpen] = useState(false)
  const [responderBusy, setResponderBusy] = useState(false)
  const [responderMessage, setResponderMessage] = useState('')
  const [staffUsersRefreshToken, setStaffUsersRefreshToken] = useState(0)
  const [reportBarangay, setReportBarangay] = useState('')
  const [reportCategory, setReportCategory] = useState<Category>('Waste')
  const [staffUsers, setStaffUsers] = useState<Profile[]>([])
  const [staffReportId, setStaffReportId] = useState<string>()
  const [reportEvents, setReportEvents] = useState<ReportEvent[]>([])
  const [staffResolutionFeedback, setStaffResolutionFeedback] = useState<ResidentFeedback | null>(null)
  const [environmentalFollowups, setEnvironmentalFollowups] = useState<EnvironmentalFollowUp[]>([])
  const [responseSettings, setResponseSettings] = useState<ResponseSettings>({ response_sla_hours: 48, high_urgency_sla_hours: 12, second_escalation_multiplier: 2 })
  const [slaEscalations, setSlaEscalations] = useState<SlaEscalation[]>([])
  const [pilotOutcomes, setPilotOutcomes] = useState<PilotOutcomes | null>(null)
  const [pilotOutcomesMessage, setPilotOutcomesMessage] = useState('')
  const [slaEscalationMessage, setSlaEscalationMessage] = useState('')
  const [escalationRunBusy, setEscalationRunBusy] = useState(false)
  const [responseSettingsBusy, setResponseSettingsBusy] = useState(false)
  const [responseSettingsMessage, setResponseSettingsMessage] = useState('')
  const [followupMessage, setFollowupMessage] = useState('')
  const [followupBusy, setFollowupBusy] = useState(false)
  const [followUpId, setFollowUpId] = useState<string>()
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [failedEmailNotifications, setFailedEmailNotifications] = useState<DeliveryFailure[]>([])
  const [emailRetryBusy, setEmailRetryBusy] = useState(false)
  const [emailRetryMessage, setEmailRetryMessage] = useState('')
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [readOverdueIds, setReadOverdueIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('greenpulse-read-overdue') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [staffPhotoUrls, setStaffPhotoUrls] = useState<{ original: string[]; resolution: string[] }>({ original: [], resolution: [] })
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  // '' is every barangay. Each change also asks the map to fit that barangay (seq makes a repeat count).
  const [barangayFilter, setBarangayFilter] = useState('')
  const [mapBarangayFit, setMapBarangayFit] = useState<{ seq: number; barangay: string }>()
  const [reportBarangayFit, setReportBarangayFit] = useState<{ seq: number; barangay: string }>()
  function chooseBarangayFilter(barangay: string) {
    setBarangayFilter(barangay)
    setMapBarangayFit((current) => ({ seq: (current?.seq ?? 0) + 1, barangay }))
  }
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [communityDiscussionId, setCommunityDiscussionId] = useState<string>()
  const [newestFirst, setNewestFirst] = useState(true)
  const [reportEngagement, setReportEngagement] = useState<ReadonlyMap<string, ReportEngagement>>(() => new Map())
  const [confirmedReportIds, setConfirmedReportIds] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmingReportId, setConfirmingReportId] = useState<string>()
  const [mapSearchQuery, setMapSearchQuery] = useState('')
  const [mapSearchSuggestions, setMapSearchSuggestions] = useState<LocationSuggestion[]>([])
  const [mapSearchBusy, setMapSearchBusy] = useState(false)
  const [mapSearchMessage, setMapSearchMessage] = useState('')
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [gpsLocation, setGpsLocation] = useState<[number, number]>()
  // Barangay outlines. They cut both maps down to District 5 and fill in a report's barangay
  // from its pin. Polygons imported into the database win, because the database trigger assigns
  // the barangay from those; otherwise the bundled OpenStreetMap outlines are used.
  const [importedBarangayBoundaries, setImportedBarangayBoundaries] = useState<BarangayBoundary[] | null>(null)
  const [bundledBarangayBoundaries, setBundledBarangayBoundaries] = useState<BarangayBoundary[] | null>(null)
  // The maps wait until both sources have answered (or given up), so the outline is drawn once and does not jump.
  const [importedBoundariesSettled, setImportedBoundariesSettled] = useState(!supabase)
  const [bundledBoundariesSettled, setBundledBoundariesSettled] = useState(false)
  const barangayBoundaries = importedBarangayBoundaries ?? bundledBarangayBoundaries
  // Polygons imported into the database are enforced there exactly, so the form is just as
  // strict with them. The bundled outlines are simplified, so they get a few meters of slack.
  const boundaryTolerance = importedBarangayBoundaries ? 0 : BOUNDARY_EDGE_TOLERANCE_METERS
  const barangayBoundariesRef = useRef(barangayBoundaries)
  const boundaryToleranceRef = useRef(boundaryTolerance)
  useEffect(() => {
    barangayBoundariesRef.current = barangayBoundaries
    boundaryToleranceRef.current = boundaryTolerance
  }, [barangayBoundaries, boundaryTolerance])
  /**
   * Whether a report may be placed at a point: inside a District 5 barangay. Only the coarse
   * bounding box can be checked while no outlines are loaded (offline on a first visit).
   */
  function isReportableLocation(point: [number, number]) {
    if (!isInsideDistrict(point)) return false
    const boundaries = barangayBoundariesRef.current
    return !boundaries || Boolean(findBarangayAt(point, boundaries, boundaryToleranceRef.current))
  }
  useEffect(() => {
    let active = true
    void loadBundledBarangayBoundaries().then((boundaries) => { if (active) setBundledBarangayBoundaries(boundaries) }).catch(() => {
      // Offline before the outlines were ever cached: the maps show the district's bounding box
      // and the report form falls back to the place label.
    }).finally(() => { if (active) setBundledBoundariesSettled(true) })
    if (!supabase) return () => { active = false }
    const giveUp = window.setTimeout(() => setImportedBoundariesSettled(true), BOUNDARY_QUERY_TIMEOUT_MS)
    void supabase.from('district5_barangay_boundaries').select('barangay, geometry_geojson').then(({ data }) => {
      if (!active) return
      const boundaries = toBarangayBoundaries(data ?? [])
      if (boundaries.length) setImportedBarangayBoundaries(boundaries)
      setImportedBoundariesSettled(true)
    }, () => { if (active) setImportedBoundariesSettled(true) })
    return () => {
      active = false
      window.clearTimeout(giveUp)
    }
  }, [])
  // The district's outer edge, merged from the barangay outlines. An incomplete database import
  // is not used for it, because it would cut the map down to only the imported barangays.
  const districtOutline = useMemo(() => (importedBoundariesSettled && bundledBoundariesSettled
    ? buildDistrictOutline([importedBarangayBoundaries?.length === DISTRICT_5_BARANGAYS.length ? importedBarangayBoundaries : null, bundledBarangayBoundaries], districtBoundsBox)
    : null), [bundledBarangayBoundaries, bundledBoundariesSettled, importedBarangayBoundaries, importedBoundariesSettled])
  const [mapLocationError, setMapLocationError] = useState('')
  const [reporting, setReporting] = useState(false)
  const reportFormRef = useRef<HTMLFormElement>(null)
  const [reportSubmissionId, setReportSubmissionId] = useState<string>(() => crypto.randomUUID())
  const [savedDraftAvailable, setSavedDraftAvailable] = useState(false)
  const [queuedUploadId, setQueuedUploadId] = useState<string>()
  const [draftMessage, setDraftMessage] = useState('')
  const [pendingDraftRestore, setPendingDraftRestore] = useState<LocalReportDraft>()
  const autoSubmitAfterRestore = useRef(false)
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')
  const [formStartedAt, setFormStartedAt] = useState(0)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [observedAt, setObservedAt] = useState(() => toLocalDateTimeInput(new Date()))
  const [location, setLocation] = useState<[number, number]>(districtCenter)
  const [mapCenter, setMapCenter] = useState<[number, number]>(districtCenter)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([])
  const [locationSearchBusy, setLocationSearchBusy] = useState(false)
  const [locationSearchMessage, setLocationSearchMessage] = useState('')
  const [locationConfirmed, setLocationConfirmed] = useState(false)
  // 'matched': the barangay was filled in from the pin. 'outside': the pin is outside every District 5 barangay.
  const [barangayAutofill, setBarangayAutofill] = useState<'' | 'matched' | 'outside'>('')
  // The barangay follows the pin: a search pick, map click, drag, or GPS fix all re-derive it.
  useEffect(() => {
    if (!reporting || !locationConfirmed || !barangayBoundaries) return
    const match = findBarangayAt(location, barangayBoundaries, boundaryTolerance)
    setReportBarangay(match ?? '')
    setBarangayAutofill(match ? 'matched' : 'outside')
  }, [reporting, location, locationConfirmed, barangayBoundaries, boundaryTolerance])
  // Fallback while no outlines are loaded: use a barangay named in the place label, if any.
  function fillBarangayFromLabel(label: string) {
    if (barangayBoundariesRef.current) return
    const detected = detectBarangay(label)
    if (!detected) return
    setReportBarangay(detected)
    setBarangayAutofill('matched')
  }
  const [guestTrackingOpen, setGuestTrackingOpen] = useState(false)
  const [guestTrackingToken, setGuestTrackingToken] = useState<string>()
  const [guestTrackingEmailSent, setGuestTrackingEmailSent] = useState(false)
  const [guestSubmitting, setGuestSubmitting] = useState(false)
  const [residentFeedback, setResidentFeedback] = useState<Record<string, ResidentFeedback>>({})
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [followedReportIds, setFollowedReportIds] = useState<string[]>([])
  const geocodeRequest = useRef(0)
  const reportsLoaded = useRef(false)
  // The theme follows the system setting until the user picks one with the toggle.
  const [themeChoice, setThemeChoice] = useState<Theme | null>(() => {
    try {
      return readThemeChoice(window.localStorage)
    } catch {
      return null
    }
  })
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = resolveTheme(themeChoice, systemPrefersDark)
  const toggleTheme = () => setThemeChoice(oppositeTheme(theme))
  const t = (key: Parameters<typeof translate>[0]) => translate(key)
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts()
  const [clock, setClock] = useState(() => Date.now())
  const { prefs: displayPrefs, update: updateDisplayPrefs } = useDisplayPrefs()
  const [scrolledPastHeading, setScrolledPastHeading] = useState(false)
  const [scrolledPastHero, setScrolledPastHero] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setScrolledPastHeading(window.scrollY > 160)
      setScrolledPastHero(window.scrollY > 420)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const pendingFilters = useRef<ReportFilters | null>(null)
  const filtersUserId = useRef<string | undefined>(undefined)

  useEffect(() => { if (formNotice) pushToast({ message: formNotice, tone: toneForMessage(formNotice) }) }, [formNotice, pushToast])
  useEffect(() => { if (responseSettingsMessage) pushToast({ message: responseSettingsMessage, tone: toneForMessage(responseSettingsMessage) }) }, [responseSettingsMessage, pushToast])
  useEffect(() => { if (slaEscalationMessage && !slaEscalationMessage.endsWith('…')) pushToast({ message: slaEscalationMessage, tone: toneForMessage(slaEscalationMessage) }) }, [slaEscalationMessage, pushToast])
  useEffect(() => { if (emailRetryMessage && !emailRetryMessage.endsWith('…')) pushToast({ message: emailRetryMessage, tone: toneForMessage(emailRetryMessage) }) }, [emailRetryMessage, pushToast])
  useEffect(() => { if (followupMessage) pushToast({ message: followupMessage, tone: toneForMessage(followupMessage) }) }, [followupMessage, pushToast])

  const signedInUserId = session?.user.id
  useEffect(() => {
    if (!signedInUserId) {
      filtersUserId.current = undefined
      return
    }
    if (filtersUserId.current === signedInUserId) return
    filtersUserId.current = signedInUserId
    const restored = loadSavedFilters(signedInUserId)
    pendingFilters.current = restored
    setStaffFilters(restored)
    setStaffQueueOffset(0)
  }, [signedInUserId])
  useEffect(() => {
    if (!signedInUserId || filtersUserId.current !== signedInUserId) return
    if (pendingFilters.current) {
      if (pendingFilters.current !== staffFilters) return
      pendingFilters.current = null
    }
    saveFilters(signedInUserId, staffFilters)
  }, [signedInUserId, staffFilters])

  useEffect(() => {
    if (!staffMode) return
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [staffMode])

  const queueShortcutsActive = staffMode && (profile?.role === 'responder' || (profile?.role === 'admin' && !staffDashboardOpen)) && !teamModalOpen && !profileModal && !authModal && !reporting
  useEffect(() => {
    if (!queueShortcutsActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const key = event.key.toLowerCase()
      if (key === 'j' || key === 'k') {
        if (!staffQueue.length) return
        event.preventDefault()
        const index = staffQueue.findIndex((report) => report.id === staffReportId)
        const next = key === 'j' ? Math.min(staffQueue.length - 1, index + 1) : Math.max(0, index - 1)
        setStaffReportId(staffQueue[next].id)
        window.requestAnimationFrame(() => document.querySelector('.queue-item.selected')?.scrollIntoView({ block: 'nearest' }))
      } else if (key === 'a') {
        event.preventDefault()
        const select = document.querySelector<HTMLSelectElement>('.staff-detail select[name="assigned_to"]')
        if (select && !select.disabled) {
          select.scrollIntoView({ block: 'center' })
          select.focus()
        } else {
          pushToast({ tone: 'info', message: staffReportId ? 'Only admins can assign responders on this report.' : 'Select a report first to assign it.' })
        }
      } else if (key === '/') {
        const search = document.querySelector<HTMLInputElement>('.staff-search input')
        if (search) {
          event.preventDefault()
          search.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [queueShortcutsActive, staffQueue, staffReportId, pushToast])

  useEffect(() => {
    if (!staffReportId || !window.matchMedia('(max-width: 900px)').matches) return
    document.querySelector('.staff-detail')?.scrollIntoView({ block: 'start' })
  }, [staffReportId])

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
    if (!themeChoice) return
    try {
      localStorage.setItem(THEME_CHOICE_KEY, themeChoice)
    } catch {
      return
    }
  }, [themeChoice])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

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
        setLocationSuggestions(await searchPlaces(query, districtCenter, controller.signal))
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
    const query = mapSearchQuery.trim()
    if (query.length < 3) {
      setMapSearchSuggestions([])
      setMapSearchBusy(false)
      setMapSearchMessage('')
      return
    }
    const controller = new AbortController()
    setMapSearchBusy(true)
    setMapSearchMessage('')
    const timer = window.setTimeout(async () => {
      try {
        setMapSearchSuggestions(await searchPlaces(query, mapCenter, controller.signal))
      } catch (error) {
        if (!controller.signal.aborted) {
          setMapSearchSuggestions([])
          setMapSearchMessage(error instanceof Error ? error.message : 'Place search is temporarily unavailable.')
        }
      } finally {
        if (!controller.signal.aborted) setMapSearchBusy(false)
      }
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [mapCenter, mapSearchQuery])

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
    if (!reportsLoaded.current) setLoadingReports(true)
    setReportsSyncing(true)
    async function loadReports() {
      const { data: communityRows, error: communityError } = await supabase!.from('community_reports').select('*').order('created_at', { ascending: false })
      if (communityError) {
        if (active) setBackendError(`Could not load community reports: ${communityError.message}`)
        if (active) { setLoadingReports(false); setReportsSyncing(false); setReportsFailed(true) }
        return
      }
      let privateRows: ReportRow[] = []
      let privateError = ''
      if (session?.user) {
        const loadAllForAdminOverview = profile?.role === 'admin' && staffMode && staffDashboardOpen
        const query = loadAllForAdminOverview
          ? supabase!.from('reports').select('*').order('created_at', { ascending: false })
          : supabase!.from('reports').select('*').eq('reporter_id', session.user.id).order('created_at', { ascending: false })
        const { data, error } = await query
        if (error) privateError = `Could not load your reports: ${error.message}`
        else {
          privateRows = (data ?? []) as ReportRow[]
          // Reporter names come from profiles, which residents can read only for themselves and
          // staff for everyone. A failed lookup just leaves the names out.
          const reporterIds = reporterIdsOf(privateRows)
          for (let start = 0; start < reporterIds.length; start += 100) {
            const { data: profileRows } = await supabase!.from('profiles').select('id, display_name').in('id', reporterIds.slice(start, start + 100))
            if (profileRows) privateRows = attachReporterNames(privateRows, profileRows)
          }
        }
      }
      if (!active) return
      const combined = new Map<string, Report>()
      for (const row of (communityRows ?? []) as ReportRow[]) combined.set(row.id, toReport(row))
      for (const row of privateRows) combined.set(row.id, toReport(row))
      setReports([...combined.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      // Community reports still load when the private query fails, but the problem stays visible.
      setBackendError(privateError)
      reportsLoaded.current = true
      setLastSyncedAt(new Date())
      setLoadingReports(false)
      setReportsSyncing(false)
      setReportsFailed(false)
    }
    void loadReports()
    return () => { active = false }
  }, [profile?.role, session, staffMode, staffDashboardOpen, reportRefreshToken])

  useEffect(() => {
    if (!supabase) return
    const channel = supabase.channel('greenpulse-report-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        setReportRefreshToken((current) => current + 1)
      })
      .subscribe()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) setReportRefreshToken((current) => current + 1)
    }, 60_000)
    const onOnline = () => {
      setIsOnline(true)
      setReportRefreshToken((current) => current + 1)
    }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      void supabase!.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      setResidentFeedback({})
      return
    }
    let active = true
    const ownReportIds = reports.filter((report) => report.reporterId === session.user.id).map((report) => report.id)
    if (!ownReportIds.length) {
      setResidentFeedback({})
      return
    }
    supabase.from('report_resolution_feedback').select('report_id, feedback, message, updated_at').in('report_id', ownReportIds).then(({ data }) => {
      if (active) setResidentFeedback(Object.fromEntries((data ?? []).map((row) => [row.report_id, row as ResidentFeedback])))
    })
    return () => { active = false }
  }, [reports, session])

  useEffect(() => {
    if (!supabase || !session) {
      setFollowedReportIds([])
      return
    }
    let active = true
    supabase.from('report_followers').select('report_id').eq('profile_id', session.user.id).then(({ data }) => {
      if (active) setFollowedReportIds((data ?? []).map((row) => row.report_id as string))
    })
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!supabase || (profile?.role !== 'admin' && profile?.role !== 'responder')) {
      setEnvironmentalFollowups([])
      return
    }
    let active = true
    supabase.from('environmental_followups').select('*').order('due_date', { ascending: true }).then(({ data }) => {
      if (active) setEnvironmentalFollowups((data ?? []) as EnvironmentalFollowUp[])
    })
    return () => { active = false }
  }, [profile?.role])

  useEffect(() => {
    if (!supabase || !staffMode || !staffReportId || (profile?.role !== 'admin' && profile?.role !== 'responder')) {
      setStaffResolutionFeedback(null)
      return
    }
    let active = true
    supabase.from('report_resolution_feedback').select('report_id, feedback, message, updated_at').eq('report_id', staffReportId).maybeSingle().then(({ data }) => {
      if (active) setStaffResolutionFeedback(data as ResidentFeedback | null)
    })
    return () => { active = false }
  }, [profile?.role, staffMode, staffReportId])

  useEffect(() => {
    if (!supabase || (profile?.role !== 'responder' && profile?.role !== 'admin')) {
      setStaffUsers([])
      return
    }
    supabase.from('profiles').select('id, display_name, avatar_path, role').in('role', ['responder', 'admin']).then(({ data }) => {
      setStaffUsers((data ?? []) as Profile[])
    })
  }, [profile?.role, staffUsersRefreshToken])

  async function loadTeams() {
    if (!supabase) return
    const { data, error } = await supabase.from('teams').select('id, name, team_members(profile_id)').order('name')
    if (error) {
      setTeams([])
      return
    }
    setTeams((data ?? []).map((team) => ({ id: team.id as string, name: team.name as string, memberIds: ((team.team_members ?? []) as { profile_id: string }[]).map((member) => member.profile_id) })))
  }

  useEffect(() => {
    if (!supabase || (profile?.role !== 'responder' && profile?.role !== 'admin')) {
      setTeams([])
      return
    }
    void loadTeams()
  }, [profile?.role])

  useEffect(() => {
    if (!supabase || profile?.role !== 'admin') return
    let active = true
    supabase.from('response_settings').select('response_sla_hours, high_urgency_sla_hours, second_escalation_multiplier').eq('singleton', true).maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setResponseSettingsMessage('Apply the response-settings migration to manage deadlines here.')
        return
      }
      if (data) setResponseSettings(data as ResponseSettings)
    })
    return () => { active = false }
  }, [profile?.role])

  useEffect(() => {
    if (!supabase || (profile?.role !== 'admin' && profile?.role !== 'responder')) {
      setSlaEscalations([])
      return
    }
    let active = true
    supabase.from('report_sla_escalations')
      .select('report_id, stage, escalated_at, acknowledged_at, report:reports!inner(title, status, assigned_to, assigned_team_id)')
      .order('escalated_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setSlaEscalationMessage('Apply the escalation migration to enable shared escalation tracking.')
          return
        }
        setSlaEscalations((data ?? []) as unknown as SlaEscalation[])
        setSlaEscalationMessage('')
      })
    return () => { active = false }
  }, [profile?.role, reportRefreshToken])

  useEffect(() => {
    if (!supabase || profile?.role !== 'admin') {
      setFailedEmailNotifications([])
      return
    }
    let active = true
    supabase.rpc('admin_notification_delivery_history').then(({ data, error }) => {
        if (!active) return
        if (error) {
          setEmailRetryMessage('Apply the notification-delivery migration to view failed email attempts.')
          return
        }
        setFailedEmailNotifications((data ?? []) as DeliveryFailure[])
        setEmailRetryMessage('')
      })
    return () => { active = false }
  }, [profile?.role, reportRefreshToken])

  useEffect(() => {
    if (!supabase || profile?.role !== 'admin') {
      setPilotOutcomes(null)
      return
    }
    let active = true
    supabase.rpc('admin_pilot_outcomes').then(({ data, error }) => {
      if (!active) return
      if (error) {
        setPilotOutcomesMessage('Apply the pilot-outcomes migration to view reopened-report and barangay results.')
        return
      }
      setPilotOutcomes(data as PilotOutcomes)
      setPilotOutcomesMessage('')
    })
    return () => { active = false }
  }, [profile?.role, reportRefreshToken])

  useEffect(() => setStaffQueueOffset(0), [staffFilters, session, profile?.role, staffMode, staffDashboardOpen])

  // What the shown queue was loaded for, so a refresh of the same rows reloads them quietly.
  const staffQueueLoaded = useRef({ key: '', end: 0 })
  useEffect(() => {
    const isStaffUser = profile?.role === 'admin' || profile?.role === 'responder'
    const queueIsVisible = staffMode && isStaffUser && (profile?.role !== 'admin' || !staffDashboardOpen)
    if (!supabase || !session || !queueIsVisible) {
      setStaffQueue([])
      setStaffQueueCount(0)
      setStaffQueueLoading(false)
      staffQueueLoaded.current = { key: '', end: 0 }
      return
    }
    let active = true
    const key = JSON.stringify([session.user.id, profile?.role, staffFilters])
    // Every row paged in so far is reloaded, so a Realtime or periodic refresh updates later pages
    // too and rows that moved between pages are neither repeated nor lost.
    const end = staffQueueOffset + STAFF_PAGE_SIZE
    // staff_report_page caps p_page_size at 100.
    const fetchSize = 100
    const quiet = staffQueueLoaded.current.key === key && staffQueueLoaded.current.end >= end
    if (!quiet) setStaffQueueLoading(true)
    async function loadStaffQueue() {
      const items: Report[] = []
      const seen = new Set<string>()
      let totalCount = 0
      for (let offset = 0; offset < end; offset += fetchSize) {
        const size = Math.min(fetchSize, end - offset)
        const { data, error } = await supabase!.rpc('staff_report_page', {
          p_query: staffFilters.query,
          p_status: staffFilters.status,
          p_resolution: staffFilters.resolution,
          p_category: staffFilters.category,
          p_urgency: staffFilters.urgency,
          p_barangay: staffFilters.barangay,
          p_assignee: staffFilters.assignee,
          p_team: staffFilters.team,
          p_date_from: staffFilters.dateFrom || null,
          p_date_to: staffFilters.dateTo || null,
          p_page_size: size,
          p_page_offset: offset,
        })
        if (!active) return
        if (error) {
          setBackendError(`Could not load the staff queue: ${error.message}`)
          // A failed refresh keeps the rows on screen; rows for other filters would be wrong.
          if (staffQueueLoaded.current.key !== key) {
            setStaffQueue([])
            setStaffQueueCount(0)
            staffQueueLoaded.current = { key: '', end: 0 }
          }
          setStaffQueueLoading(false)
          return
        }
        const page = data as { totalCount?: number; items?: ReportRow[] } | null
        const pageItems = page?.items ?? []
        totalCount = Number(page?.totalCount ?? 0)
        for (const row of pageItems) {
          if (seen.has(row.id)) continue
          seen.add(row.id)
          items.push(toReport(row) as Report)
        }
        if (pageItems.length < size) break
      }
      // The list is replaced only once the new rows are in, so it never empties mid-refresh.
      setStaffQueue(items)
      setStaffQueueCount(totalCount)
      setStaffQueueLoading(false)
      staffQueueLoaded.current = { key, end }
    }
    void loadStaffQueue()
    return () => { active = false }
  }, [session, profile?.role, staffMode, staffDashboardOpen, staffFilters, staffQueueOffset, reportRefreshToken])

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

  useEffect(() => {
    let active = true
    void getLocalReportDraft().then((draft) => {
      if (!active || !draft) return
      setSavedDraftAvailable(true)
      if (draft.queued) setQueuedUploadId(draft.submissionId)
    }).catch(() => {
      if (active) setDraftMessage('This browser could not read the saved report draft.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isOnline || !queuedUploadId || reporting) return
    void restoreReportDraft(true)
  }, [isOnline, queuedUploadId, reporting])

  useEffect(() => {
    if (!reporting || !pendingDraftRestore || !reportFormRef.current) return
    const form = reportFormRef.current
    for (const [name, value] of Object.entries(pendingDraftRestore.formValues)) {
      const control = form.elements.namedItem(name)
      if (control instanceof RadioNodeList) {
        for (const item of Array.from(control)) if (item instanceof HTMLInputElement) item.checked = item.value === value
      } else if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = value === 'on'
      } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        if (name !== 'category' && name !== 'barangay' && name !== 'observed_at' && name !== 'location') control.value = value
      }
    }
    setPendingDraftRestore(undefined)
    if (autoSubmitAfterRestore.current) {
      autoSubmitAfterRestore.current = false
      setDraftMessage('Connection restored. Your queued report will be sent shortly.')
      window.setTimeout(() => {
        setFormStartedAt(Date.now() - 3_000)
        form.requestSubmit()
      }, 3_000)
    }
  }, [pendingDraftRestore, reporting])

  const visibleReports = useMemo(() => reports.filter((report) => {
    const matchesCategory = categoryFilter === 'All categories' || report.category === categoryFilter
    const matchesStatus = statusFilter === 'All statuses' || report.status === statusFilter
    // A report without a recorded barangay (the demo reports, for one) is placed by where its pin lies.
    const matchesBarangay = !barangayFilter || (report.barangay ?? (barangayBoundaries ? findBarangayAt(report.coordinates, barangayBoundaries, boundaryTolerance) : undefined)) === barangayFilter
    const matchesSearch = `${report.title} ${report.location} ${report.id}`.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesStatus && matchesBarangay && matchesSearch
  }), [barangayBoundaries, barangayFilter, boundaryTolerance, categoryFilter, reports, search, statusFilter])
  const nearbyCenter = gpsLocation ?? mapCenter
  const nearbyReports = useMemo(() => visibleReports.filter((report) => distanceInMeters(report.coordinates, nearbyCenter) <= 1000), [nearbyCenter, visibleReports])
  const mapReports = nearbyOnly ? nearbyReports : visibleReports
  const orderedReports = newestFirst ? mapReports : [...mapReports].reverse()
  const heatmapCells = useMemo(() => {
    const cells = new Map<string, HeatCell>()
    for (const report of mapReports) {
      const [latitude, longitude] = approximateCoordinates(report.coordinates)
      const key = `${latitude},${longitude}`
      const cell = cells.get(key)
      if (cell) cell.count += 1
      else cells.set(key, { latitude, longitude, count: 1 })
    }
    return [...cells.values()]
  }, [mapReports])
  // Public coordinates are rounded, so reports often share a point. Each gets its own spot
  // nearby, worked out over every loaded report so pins do not move when a filter changes.
  const pinPositions = useMemo(() => spreadCoincident(reports.map((report) => {
    const [latitude, longitude] = approximateCoordinates(report.coordinates)
    return { id: report.id, latitude, longitude }
  })), [reports])
  const mapPins = useMemo(() => mapReports.filter((report) => isInsideDistrict(report.coordinates)).map((report): MapReport => {
    const open = isOpenStatus(report.status)
    return {
      id: report.id,
      title: report.title,
      category: report.category,
      status: report.status,
      description: report.description,
      reporterName: report.reporterName,
      place: placeLabel(report),
      createdLabel: formatCreatedAt(report.createdAt),
      position: pinPositions.get(report.id) ?? approximateCoordinates(report.coordinates),
      urgent: report.urgency === 'High' && open,
      open,
      color: categoryColors[report.category],
      icon: categoryIcon(report.category),
    }
  }), [mapReports, pinPositions])
  const activeFilterCount = countActiveFilters(staffFilters)
  const staffFilterChips = describeActiveFilters(staffFilters, { people: new Map(staffUsers.map((user) => [user.id, user.display_name || 'Unnamed staff member'])), teams: new Map(teams.map((team) => [team.id, team.name])) })
  const adminAnalytics = useMemo(() => buildReportAnalytics(reports), [reports])
  const responseMetrics = useMemo(() => buildResponseTimeMetrics(reports), [reports])
  const escalatedOpen = useMemo(() => reports.filter(needsImmediateAttention).length, [reports])
  const reportListRef = useRef<HTMLDivElement>(null)
  const staffQueueRef = useRef<HTMLDivElement>(null)
  useFlip(reportListRef, orderedReports.map((report) => report.id).join('|'))

  // Public "still there" and comment counts for the report cards. Until the engagement
  // migration is applied the RPC fails, and the cards simply leave the counts out.
  const engagementReportIds = useMemo(() => reports.slice(0, ENGAGEMENT_BATCH_LIMIT).map((report) => report.id).join(','), [reports])
  useEffect(() => {
    if (!supabase || !engagementReportIds || communityDiscussionId) return
    let active = true
    void supabase.rpc('community_report_engagement', { report_ids: engagementReportIds.split(',') }).then(({ data, error }) => {
      if (active && !error) setReportEngagement(indexEngagement(data))
    })
    return () => { active = false }
  }, [engagementReportIds, reportRefreshToken, communityDiscussionId])
  useFlip(staffQueueRef, staffQueue.map((report) => report.id).join('|'))
  const allKnownReports = useMemo(() => [...reports, ...staffQueue], [reports, staffQueue])
  const changedStatuses = useStatusChanges(allKnownReports)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [tourOpen, setTourOpen] = useState(() => {
    try { return localStorage.getItem('greenpulse-tour-seen') !== '1' } catch { return false }
  })
  const [mobileMap, setMobileMap] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 760px)')
    const onChange = () => setMobileMap(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  // Bring the expanded card into view inside the list (for example after a map pin is chosen)
  // without scrolling the page. Phones show the map sheet instead, so they are left alone.
  useEffect(() => {
    const list = reportListRef.current
    if (!selectedId || !list || mobileMap) return
    const card = Array.from(list.children).find((element) => (element as HTMLElement).dataset.flipId === selectedId)
    if (!card) return
    const listBox = list.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    if (cardBox.top < listBox.top) list.scrollTop += cardBox.top - listBox.top - 8
    else if (cardBox.bottom > listBox.bottom) list.scrollTop += Math.min(cardBox.bottom - listBox.bottom + 8, cardBox.top - listBox.top - 8)
  }, [selectedId, mobileMap])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const markTourSeen = useCallback(() => {
    try { localStorage.setItem('greenpulse-tour-seen', '1') } catch { /* the tour simply shows again next visit */ }
  }, [])
  function dismissTour() {
    setTourOpen(false)
    markTourSeen()
  }
  const nearbySuggestions = useMemo(() => {
    if (!reporting || !locationConfirmed || !supabase) return []
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    return reports
      .filter((report) => report.category === reportCategory && isOpenStatus(report.status)
        && new Date(report.createdAt).getTime() >= cutoff
        && distanceInMeters(report.coordinates, location) <= 350)
      .sort((first, second) => distanceInMeters(first.coordinates, location) - distanceInMeters(second.coordinates, location))
      .slice(0, 3)
  }, [location, locationConfirmed, reportCategory, reports, reporting])
  const recurringHotspots = useMemo(() => findRecurringHotspots(reports), [reports])
  const unplannedHotspots = useMemo(() => recurringHotspots.filter((hotspot) => !environmentalFollowups.some((item) => item.status === 'Scheduled'
    && item.category === hotspot.category && (item.barangay ?? '') === (hotspot.barangay ?? '')
    && item.source_report_ids.filter((id) => hotspot.reportIds.includes(id)).length >= 2)), [environmentalFollowups, recurringHotspots])

  const selectedReport = mapReports.find((report) => report.id === selectedId)
  const communityDiscussionReport = mapReports.find((report) => report.id === communityDiscussionId)
  // The staff panel needs the full `reports` row. `reports` mostly holds redacted community_reports
  // copies (no assignment, rounded coordinates), so the selected report is fetched on its own and
  // refetched on every Realtime or periodic refresh.
  const [staffReportDetail, setStaffReportDetail] = useState<Report>()
  const [staffReportDetailFailedId, setStaffReportDetailFailedId] = useState<string>()
  // Counts saved updates per report, so a fetch that started before a save is dropped.
  const staffReportDetailSaves = useRef(new Map<string, number>())
  const staffDetailViewer = profile?.role === 'admin' || profile?.role === 'responder'
  useEffect(() => {
    if (!supabase || !session || !staffMode || !staffReportId || !staffDetailViewer) {
      setStaffReportDetail(undefined)
      setStaffReportDetailFailedId(undefined)
      return
    }
    let active = true
    const savesAtStart = staffReportDetailSaves.current.get(staffReportId) ?? 0
    // Keep the current copy while refreshing the same report, so the panel doesn't flicker.
    setStaffReportDetail((current) => current?.id === staffReportId ? current : undefined)
    async function loadStaffReportDetail(reportId: string) {
      const isCurrent = () => active && (staffReportDetailSaves.current.get(reportId) ?? 0) === savesAtStart
      const { data, error } = await supabase!.from('reports').select('*').eq('id', reportId).single()
      if (!isCurrent()) return
      if (error || !data) {
        setStaffReportDetailFailedId(reportId)
        return
      }
      let row = data as ReportRow
      if (row.reporter_id) {
        const { data: profileRows } = await supabase!.from('profiles').select('id, display_name').eq('id', row.reporter_id)
        if (profileRows) [row] = attachReporterNames([row], profileRows)
      }
      if (!isCurrent()) return
      setStaffReportDetail(toReport(row) as Report)
      setStaffReportDetailFailedId(undefined)
    }
    void loadStaffReportDetail(staffReportId)
    return () => { active = false }
  }, [session, staffMode, staffReportId, staffDetailViewer, reportRefreshToken])
  function setSavedStaffReportDetail(saved: Report) {
    staffReportDetailSaves.current.set(saved.id, (staffReportDetailSaves.current.get(saved.id) ?? 0) + 1)
    // Leave the detail alone if the viewer has already moved on to another report.
    setStaffReportDetail((current) => current && current.id !== saved.id ? current : mergeSavedReport(current, saved))
  }
  const staffReport = useMemo(() => resolveStaffReport({ id: staffReportId, detail: staffReportDetail, queue: staffQueue, reports }), [staffReportId, staffReportDetail, staffQueue, reports])
  const followUpReport = reports.find((report) => report.id === followUpId)

  // Android back button closes the topmost open layer, then minimizes the app.
  const nativeBackRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    const isAdmin = profile?.role === 'admin'
    const open: Record<BackLayer, boolean> = {
      palette: paletteOpen,
      auth: Boolean(authModal),
      profile: profileModal && Boolean(profile),
      responder: responderModalOpen && isAdmin,
      team: teamModalOpen && isAdmin,
      'guest-tracking': guestTrackingOpen,
      'community-discussion': Boolean(communityDiscussionReport),
      'follow-up': Boolean(followUpReport && session),
      'report-form': reporting,
      notifications: notificationPanelOpen,
      'staff-filters': staffMode && staffFiltersOpen,
      'staff-detail': staffMode && Boolean(staffReportId),
      'map-sheet': !staffMode && mobileMap && Boolean(selectedReport),
      'staff-mode': staffMode,
    }
    const close: Record<BackLayer, () => void> = {
      palette: () => setPaletteOpen(false),
      auth: closeAuthModal,
      profile: () => setProfileModal(false),
      responder: () => { if (!responderBusy) setResponderModalOpen(false) },
      team: () => setTeamModalOpen(false),
      'guest-tracking': () => { setGuestTrackingOpen(false); setGuestTrackingToken(undefined); setGuestTrackingEmailSent(false) },
      'community-discussion': () => setCommunityDiscussionId(undefined),
      'follow-up': () => setFollowUpId(undefined),
      'report-form': () => setReporting(false),
      notifications: () => setNotificationPanelOpen(false),
      'staff-filters': () => setStaffFiltersOpen(false),
      'staff-detail': () => setStaffReportId(undefined),
      'map-sheet': () => setSelectedId(undefined),
      'staff-mode': () => setStaffMode(false),
    }
    nativeBackRef.current = () => {
      const layer = topBackLayer(open)
      if (layer) close[layer]()
      else void NativeApp.minimizeApp()
    }
  })
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = NativeApp.addListener('backButton', () => nativeBackRef.current())
    return () => { void listener.then((handle) => handle.remove()) }
  }, [])

  const selectedOwnReport = selectedReport && session && selectedReport.reporterId === session.user.id ? selectedReport : undefined
  const selectedOwnFeedback = selectedOwnReport ? residentFeedback[selectedOwnReport.id] : undefined
  const staffOnTask = isViewerOnTask(staffReport, session?.user.id, teams)
  const openReports = reports.filter((report) => isOpenStatus(report.status)).length
  const verifiedReports = reports.filter((report) => report.status === 'Verified' || report.status === 'In progress').length
  const overdueNotifications: InboxNotification[] = profile?.role === 'admin'
    ? reports.filter((report) => isOpenStatus(report.status) && Date.now() - new Date(report.createdAt).getTime() >= (report.urgency === 'High' ? responseSettings.high_urgency_sla_hours : responseSettings.response_sla_hours) * 60 * 60 * 1000)
      .map((report) => ({ id: `overdue:${report.id}`, report_id: report.id, event_type: 'overdue_task', title: 'Overdue task', message: `Open report needs attention: ${report.title}.`, created_at: report.createdAt, read_at: readOverdueIds.includes(report.id) ? report.createdAt : null }))
    : []
  const inboxNotifications: InboxNotification[] = [...notifications, ...overdueNotifications]
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
  const unreadNotificationCount = inboxNotifications.filter((notification) => !notification.read_at).length

  function resetPhoneOtp() {
    setPhoneOtpPending(false)
    setPhoneOtpNumber('')
    setPhoneOtpPurpose(null)
  }

  function openAuthModal(mode: 'sign-in' | 'sign-up') {
    resetPhoneOtp()
    setSignupVerificationMethod('email')
    setSignInMethod('password')
    setAuthModal(mode)
    setAuthMessage('')
    setAuthMessageSuccess(false)
    setConfirmationEmail('')
  }

  function closeAuthModal() {
    setAuthModal(null)
    setConfirmationEmail('')
    resetPhoneOtp()
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !authModal) return
    const mode = authModal
    const formData = new FormData(event.currentTarget)
    setAuthMessage('')
    setAuthMessageSuccess(false)
    setBackendError('')
    setAuthBusy(true)
    try {
      if (phoneOtpPending) {
        const token = String(formData.get('phone_otp') ?? '').trim()
        if (!token) throw new Error('Enter the code sent to your phone.')
        const { error } = await supabase.auth.verifyOtp({ phone: phoneOtpNumber, token, type: 'sms' })
        if (error) throw error
        closeAuthModal()
        setAuthMessage('')
        return
      }

      if ((mode === 'sign-up' && signupVerificationMethod === 'phone') || (mode === 'sign-in' && signInMethod === 'phone-otp')) {
        const enteredPhone = String(formData.get('phone') ?? '').trim()
        const phone = normalizePhoneNumber(enteredPhone)
        if (!phone) throw new Error('Enter a valid mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.')
        const displayName = String(formData.get('display_name') ?? '').trim()
        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: {
            shouldCreateUser: mode === 'sign-up',
            ...(mode === 'sign-up' ? { data: { display_name: displayName } } : {}),
          },
        })
        if (error) throw error
        setPhoneOtpNumber(phone)
        setPhoneOtpPurpose(mode)
        setPhoneOtpPending(true)
        setAuthMessage(`A verification code was sent to ${phone}.`)
        setAuthMessageSuccess(true)
        return
      }

      const email = String(formData.get('email') ?? '').trim()
      const password = String(formData.get('password') ?? '')
      const result = mode === 'sign-up'
        ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: { display_name: String(formData.get('display_name') ?? '').trim() },
          },
        })
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (mode === 'sign-up' && !result.data.session) {
        setConfirmationEmail(email)
        setAuthMessage('Confirmation requested. Check your inbox and spam folder, then follow the link to return here.')
        setAuthMessageSuccess(true)
        return
      }
      closeAuthModal()
      setAuthMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication could not be completed. Please try again.'
      setAuthMessage(/rate limit/i.test(message)
        ? 'Supabase has temporarily limited verification messages. Wait before retrying, or check the email and SMS provider settings in Supabase Auth.'
        : message)
    } finally {
      setAuthBusy(false)
    }
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

  async function resendPhoneOtp() {
    if (!supabase || !phoneOtpNumber || !phoneOtpPurpose) return
    setAuthBusy(true)
    setAuthMessage('')
    setAuthMessageSuccess(false)
    try {
      if (phoneOtpPurpose === 'sign-up') {
        const { error } = await supabase.auth.resend({ type: 'sms', phone: phoneOtpNumber })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithOtp({ phone: phoneOtpNumber, options: { shouldCreateUser: false } })
        if (error) throw error
      }
      setAuthMessage(`A new code was sent to ${phoneOtpNumber}.`)
      setAuthMessageSuccess(true)
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'A new code could not be sent.')
    } finally {
      setAuthBusy(false)
    }
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

  async function toggleReportFollow(report: Report) {
    if (!supabase || !session) return
    setFormError('')
    setFormNotice('')
    if (followedReportIds.includes(report.id)) {
      setFollowedReportIds((current) => current.filter((id) => id !== report.id))
      const { error } = await supabase.from('report_followers').delete().eq('report_id', report.id).eq('profile_id', session.user.id)
      if (error) {
        setFollowedReportIds((current) => current.includes(report.id) ? current : [...current, report.id])
        return setFormError('Could not unfollow this report. Please try again.')
      }
      setFormNotice('You will no longer receive updates for that report.')
      return
    }
    setFollowedReportIds((current) => [...current, report.id])
    const { error } = await supabase.from('report_followers').insert({ report_id: report.id, profile_id: session.user.id })
    if (error) {
      if (error.code !== '23505') setFollowedReportIds((current) => current.filter((id) => id !== report.id))
      return setFormError(error.code === '23505' ? 'You are already following this report.' : 'Could not follow this report. Please try again.')
    }
    setFormNotice('You are following this report. Status and assignment changes will appear in your notifications.')
  }

  async function sendReportConfirmation(reportId: string) {
    const response = await fetch(apiUrl('/api/confirm-report'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ reportId }),
    })
    const result = await response.json().catch(() => ({})) as { error?: string }
    return { ok: response.ok, status: response.status, error: result.error }
  }

  async function confirmNearbyReport(report: Report) {
    setFormError('')
    setFormNotice('')
    try {
      const result = await sendReportConfirmation(report.id)
      if (!result.ok) throw new Error(result.error || 'Your confirmation could not be saved.')
      setFormNotice('Thanks. The response team has been told that this issue is still present.')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Your confirmation could not be saved.')
    }
  }

  async function confirmStillThere(report: Report) {
    setConfirmingReportId(report.id)
    try {
      const result = await sendReportConfirmation(report.id)
      const alreadyConfirmed = result.status === 409 && /already confirmed/i.test(result.error ?? '')
      if (!result.ok && !alreadyConfirmed) throw new Error(result.error || 'Your confirmation could not be saved.')
      setConfirmedReportIds((current) => new Set(current).add(report.id))
      if (alreadyConfirmed) {
        pushToast({ tone: 'info', message: 'You already confirmed this report.' })
        return
      }
      setReportEngagement((current) => {
        const counts = current.get(report.id)
        if (!counts) return current
        return new Map(current).set(report.id, { ...counts, stillThere: counts.stillThere + 1 })
      })
      pushToast({ message: 'Thanks. The response team now knows this issue is still there.' })
    } catch (error) {
      pushToast({ tone: 'error', message: error instanceof Error ? error.message : 'Your confirmation could not be saved.' })
    } finally {
      setConfirmingReportId(undefined)
    }
  }

  async function submitResidentFeedback(feedback: 'fixed' | 'still_there') {
    if (!supabase || !session || !selectedOwnReport) return
    setFeedbackBusy(true)
    const { error } = await supabase.from('report_resolution_feedback').upsert({
      report_id: selectedOwnReport.id,
      feedback,
      message: feedbackNote.trim() || null,
    }, { onConflict: 'report_id' })
    setFeedbackBusy(false)
    if (error) {
      setBackendError('Your resolution feedback could not be saved. Please try again.')
      return
    }
    const saved = { report_id: selectedOwnReport.id, feedback, message: feedbackNote.trim() || null, updated_at: new Date().toISOString() } as ResidentFeedback
    setResidentFeedback((current) => ({ ...current, [selectedOwnReport.id]: saved }))
    setFeedbackNote('')
    void deliverNotificationEmails(selectedOwnReport.id, session.access_token)
  }

  async function createEnvironmentalFollowup(hotspot: RecurringHotspot) {
    if (!supabase || !session || profile?.role !== 'admin') return
    setFollowupBusy(true)
    setFollowupMessage('')
    const area = hotspot.barangay ? `Barangay ${hotspot.barangay}` : 'District 5'
    const { data, error } = await supabase.from('environmental_followups').insert({
      title: `${hotspot.category} inspection · ${area}`,
      category: hotspot.category,
      barangay: hotspot.barangay ?? null,
      location_label: hotspot.location,
      latitude: hotspot.coordinates[0],
      longitude: hotspot.coordinates[1],
      source_report_ids: hotspot.reportIds,
      assigned_team_id: null,
      due_date: null,
      created_by: session.user.id,
    }).select('*').single()
    setFollowupBusy(false)
    if (error || !data) {
      setFollowupMessage('The inspection task could not be created. Please try again.')
      return
    }
    setEnvironmentalFollowups((current) => [...current, data as EnvironmentalFollowUp])
    setFollowupMessage('Inspection task created. Assign a team and due date below.')
  }

  async function updateEnvironmentalFollowup(id: string, changes: Partial<EnvironmentalFollowUp>) {
    if (!supabase) return
    setFollowupBusy(true)
    setFollowupMessage('')
    const { data, error } = await supabase.from('environmental_followups').update(changes).eq('id', id).select('*').single()
    setFollowupBusy(false)
    if (error || !data) {
      setFollowupMessage('The inspection task could not be updated. Please try again.')
      return
    }
    setEnvironmentalFollowups((current) => current.map((item) => item.id === id ? data as EnvironmentalFollowUp : item))
  }

  function startReport() {
    setFormError('')
    setFormNotice('')
    setFormStartedAt(Date.now())
    setReportSubmissionId(crypto.randomUUID())
    setReportCategory('Waste')
    setReportBarangay('')
    setBarangayAutofill('')
    setPhotoPreviews([])
    setPhotoFiles([])
    setObservedAt(toLocalDateTimeInput(new Date()))
    setLocationQuery('')
    setLocationSuggestions([])
    setLocationSearchMessage('')
    setLocationConfirmed(false)
    setLocation(districtCenter)
    setMapCenter(districtCenter)
    setReporting(true)
  }

  async function saveReportDraft(queued = false) {
    const form = reportFormRef.current
    if (!form) return
    if (queued && !form.reportValidity()) return
    if (queued && (!locationConfirmed || !String(new FormData(form).get('location') ?? '').trim())) {
      setFormError('Choose a map location before queueing this report for upload.')
      return
    }
    const data = new FormData(form)
    const formValues = Object.fromEntries([...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']))
    try {
      await saveLocalReportDraft({
        submissionId: reportSubmissionId,
        savedAt: new Date().toISOString(),
        queued,
        formValues,
        coordinates: location,
        locationConfirmed,
        photos: photoFiles,
      })
      setSavedDraftAvailable(true)
      setDraftMessage(queued
        ? 'Saved on this device. GreenPulse will submit it when the connection returns; keep this browser open.'
        : 'Draft saved on this device. You can resume or delete it from this browser.')
      if (queued) {
        setQueuedUploadId(reportSubmissionId)
        setReporting(false)
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The draft could not be saved in this browser.')
    }
  }

  async function restoreReportDraft(automatic = false) {
    try {
      const draft = await getLocalReportDraft()
      if (!draft) {
        setSavedDraftAvailable(false)
        setQueuedUploadId(undefined)
        setDraftMessage('No saved draft was found in this browser.')
        return
      }
      setFormError('')
      setFormNotice('')
      setDraftMessage('')
      setFormStartedAt(Date.now() - 3_000)
      setReportSubmissionId(draft.submissionId)
      setReportCategory((draft.formValues.category as Category) || 'Waste')
      setReportBarangay(draft.formValues.barangay || '')
      setBarangayAutofill('')
      setObservedAt(draft.formValues.observed_at || toLocalDateTimeInput(new Date()))
      setLocationQuery(draft.formValues.location || '')
      setLocation(draft.coordinates)
      setMapCenter(draft.coordinates)
      setLocationConfirmed(draft.locationConfirmed)
      const prepared = await Promise.all(draft.photos.map((photo) => prepareReportPhoto(photo, Boolean(isSupabaseConfigured && !session))))
      setPhotoFiles(prepared.map((photo) => photo.file))
      setPhotoPreviews(prepared.map((photo) => photo.preview))
      autoSubmitAfterRestore.current = automatic
      setPendingDraftRestore(draft)
      setReporting(true)
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : 'The saved draft could not be opened.')
    }
  }

  async function deleteSavedDraft() {
    try {
      await deleteLocalReportDraft()
      setSavedDraftAvailable(false)
      setQueuedUploadId(undefined)
      setDraftMessage('Saved report draft deleted from this browser.')
    } catch {
      setDraftMessage('The saved report draft could not be deleted.')
    }
  }

  function requestLocation(showNearby = false) {
    const handleLocationError = () => {
      const message = 'Location was not shared. You can still select a point on the map.'
      setMapLocationError(message)
      if (reporting) setFormError(message)
    }

    const handlePosition = (coords: { latitude: number; longitude: number }) => {
      const currentLocation: [number, number] = [coords.latitude, coords.longitude]
      if (!isReportableLocation(currentLocation)) {
        setMapLocationError(outsideDistrictMessage)
        if (reporting) setFormError(outsideDistrictMessage)
        return
      }
      setGpsLocation(currentLocation)
      setLocation(currentLocation)
      setMapCenter(currentLocation)
      setLocationQuery('Current location')
      setLocationConfirmed(true)
      setLocationSuggestions([])
      setLocationSearchMessage('')
      setMapLocationError('')
      if (showNearby) setNearbyOnly(true)
      setSelectedId(undefined)
      setFormError('')
      const request = ++geocodeRequest.current
      void reverseGeocode(currentLocation).then((label) => {
        if (request === geocodeRequest.current) {
          setLocationQuery(label)
          fillBarangayFromLabel(label)
        }
      }).catch((error: unknown) => {
        if (request === geocodeRequest.current) {
          const message = error instanceof Error ? error.message : 'Address lookup is temporarily unavailable.'
          setLocationSearchMessage(`${message} Coordinates are still selected.`)
        }
      })
    }

    if (Capacitor.isNativePlatform()) {
      void Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
        .then(({ coords }) => handlePosition(coords))
        .catch(handleLocationError)
      return
    }

    if (!navigator.geolocation) {
      const message = 'Location access is not available in this browser.'
      setMapLocationError(message)
      if (reporting) setFormError(message)
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => handlePosition(coords),
      handleLocationError,
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  /** A barangay picked by hand moves the form map to it, unless the pin already lies inside it. Autofill never calls this. */
  function changeReportBarangay(barangay: string) {
    setReportBarangay(barangay)
    setBarangayAutofill('')
    if (!barangay) return
    const pinnedIn = locationConfirmed && barangayBoundaries ? findBarangayAt(location, barangayBoundaries, boundaryTolerance) : undefined
    if (pinnedIn !== barangay) setReportBarangayFit((current) => ({ seq: (current?.seq ?? 0) + 1, barangay }))
  }

  /** Pins a spot chosen on the report-form map. Returns false when the spot is outside District 5. */
  function selectMapLocation(coordinates: [number, number]): boolean {
    const preciseCoordinates: [number, number] = [Number(coordinates[0].toFixed(6)), Number(coordinates[1].toFixed(6))]
    // The map is blank outside the district, so a click or drag there is refused.
    if (!isReportableLocation(preciseCoordinates)) {
      setFormError(outsideDistrictMessage)
      return false
    }
    setLocation(preciseCoordinates)
    setMapCenter(preciseCoordinates)
    setLocationConfirmed(true)
    setLocationSuggestions([])
    setFormError('')
    setLocationSearchMessage('Finding a nearby address…')
    const request = ++geocodeRequest.current
    void reverseGeocode(preciseCoordinates).then((label) => {
      if (request === geocodeRequest.current) {
        setLocationQuery(label)
        fillBarangayFromLabel(label)
        setLocationSearchMessage('')
      }
    }).catch((error: unknown) => {
      if (request === geocodeRequest.current) {
        setLocationQuery('Selected map location')
        setLocationSearchMessage(`${error instanceof Error ? error.message : 'Address lookup is temporarily unavailable.'} Coordinates are still selected.`)
      }
    })
    return true
  }

  async function handlePhotos(fileList: FileList | null) {
    const incoming = Array.from(fileList ?? [])
    if (!incoming.length) return
    const combined = [...photoFiles, ...incoming]
    if (combined.length > MAX_REPORT_PHOTOS) {
      setFormError(`Attach up to ${MAX_REPORT_PHOTOS} report photos.`)
      return
    }
    const guest = isSupabaseConfigured && !session
    const maxBytes = guest ? 2_500_000 : 5 * 1024 * 1024
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setFormError('Choose JPEG, PNG, or WebP images for the report photos.')
        return
      }
      if (file.size > maxBytes) {
        setFormError(guest ? 'Guest report photos must be 2.5 MB or smaller each.' : 'Each report photo must be 5 MB or smaller.')
        return
      }
    }
    try {
      const prepared = await Promise.all(incoming.map((file) => prepareReportPhoto(file, guest)))
      setPhotoFiles((current) => [...current, ...prepared.map((photo) => photo.file)])
      setPhotoPreviews((current) => [...current, ...prepared.map((photo) => photo.preview)])
      setFormError('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'A photo could not be prepared.')
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    if (isSupabaseConfigured && !isOnline) {
      setFormError('You are offline. Reconnect before submitting this report.')
      return
    }
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const category = String(formData.get('category')) as Category
    const issueType = String(formData.get('issue_type') ?? '').trim() || 'Other issue'
    const additionalInfo = String(formData.get('additional_info') ?? '').trim()
    const observedValue = String(formData.get('observed_at') ?? '')
    const observedDate = new Date(observedValue)
    const consentGiven = formData.get('public_display_consent') === 'on'
    const locationLabel = String(formData.get('location') ?? '').trim()
    const barangay = String(formData.get('barangay') ?? '').trim()
    if (!consentGiven) {
      setFormError('Please review and accept the report visibility notice before submitting.')
      return
    }
    if (!observedValue || Number.isNaN(observedDate.getTime()) || observedDate.getTime() > Date.now() + 5 * 60_000) {
      setFormError('Choose a valid observation date and time. It cannot be in the future.')
      return
    }
    if (additionalInfo.length > 2000) {
      setFormError('Additional information must be 2,000 characters or fewer.')
      return
    }
    if (!locationConfirmed || !locationLabel) {
      setFormError('Choose a suggested place or use your current location before submitting.')
      return
    }
    // Reports are accepted for District 5 only, however the location was chosen (search, GPS,
    // map, or a restored draft). The guest API and the database check this again.
    if (!isReportableLocation(location)) {
      setFormError(outsideDistrictSubmitMessage)
      return
    }
    if (title.length < 3 || description.length < 8) {
      setFormError('Add a title of at least 3 characters and a description of at least 8 characters.')
      return
    }
    const guestEmail = String(formData.get('contact_email') ?? '').trim()
    const guestPhone = String(formData.get('contact_phone') ?? '').trim()
    if (supabase && !session) {
      if (!guestEmail && !guestPhone) {
        setFormError('Enter an email address or phone number so staff can follow up.')
        return
      }
      if (guestPhone && !normalizePhoneNumber(guestPhone)) {
        setFormError('Enter a valid mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.')
        return
      }
    }
    setFormError('')
    setFormNotice('')
    let report: Report
    let guestTrackingCode: string | undefined
    let guestEmailSent = false
    if (supabase && session) {
      const photoPaths: string[] = []
      for (const photoFile of photoFiles) {
        const photoPath = `${session.user.id}/${crypto.randomUUID()}.jpg`
        const { error: uploadError } = await supabase.storage.from('report-photos').upload(photoPath, photoFile, { contentType: 'image/jpeg', upsert: false })
        if (uploadError) {
          if (photoPaths.length) await supabase.storage.from('report-photos').remove(photoPaths)
          setFormError(`Photo upload failed: ${uploadError.message}`)
          return
        }
        photoPaths.push(photoPath)
      }
      const newReport = {
        client_submission_id: reportSubmissionId,
        reporter_id: session.user.id,
        title,
        category,
        issue_type: issueType,
        observed_at: observedDate.toISOString(),
        additional_info: additionalInfo || null,
        urgency: String(formData.get('urgency')),
        description,
        location_label: locationLabel,
        latitude: location[0],
        longitude: location[1],
        photo_path: photoPaths[0] ?? null,
        photo_paths: photoPaths,
        consent_version: '2026-10-v2',
      }
      let { data, error } = await supabase.from('reports').insert({ ...newReport, barangay: barangay || null }).select('*').single()
      // Keep submissions working if the barangay migration has not been applied yet.
      if (error?.message.includes('barangay')) ({ data, error } = await supabase.from('reports').insert(newReport).select('*').single())
      if (error?.code === '23505') {
        const existing = await supabase.from('reports').select('*').eq('client_submission_id', reportSubmissionId).eq('reporter_id', session.user.id).maybeSingle()
        if (existing.data) {
          if (photoPaths.length) await supabase.storage.from('report-photos').remove(photoPaths)
          data = existing.data
          error = null
        }
      }
      if (error || !data) {
        if (photoPaths.length) await supabase.storage.from('report-photos').remove(photoPaths)
        setFormError(error?.code === '22023' ? outsideDistrictSubmitMessage : error?.message ?? 'The report could not be saved. Please try again.')
        return
      }
      report = toReport(data as ReportRow)
    } else if (supabase) {
      const email = guestEmail
      const phone = guestPhone
      const website = String(formData.get('website') ?? '')
      setGuestSubmitting(true)
      const response = await fetch(apiUrl('/api/guest-reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          submissionId: reportSubmissionId,
          title,
          category,
          issueType,
          observedAt: observedDate.toISOString(),
          additionalInfo,
          urgency: String(formData.get('urgency')),
          description,
          locationLabel,
          latitude: location[0],
          longitude: location[1],
          barangay,
          email,
          phone,
          photoDataUrls: photoPreviews,
          website,
          startedAt: formStartedAt,
          consentGiven,
        }),
      }).catch(() => undefined)
      setGuestSubmitting(false)
      if (!response) {
        setFormError('Guest reporting is temporarily unavailable. Please try again.')
        return
      }
      let result: { error?: string; reportId?: string; trackingCode?: string; emailSent?: boolean }
      try { result = await response.json() as typeof result } catch {
        setFormError('Guest reporting is temporarily unavailable. Please try again.')
        return
      }
      if (!response.ok || !result.reportId || !result.trackingCode) {
        setFormError(result.error ?? 'The report could not be submitted. Please try again.')
        return
      }
      guestTrackingCode = result.trackingCode
      guestEmailSent = Boolean(result.emailSent)
      report = {
        id: result.reportId,
        title,
        description,
        category,
        issueType,
        observedAt: observedDate.toISOString(),
        additionalInfo: additionalInfo || undefined,
        urgency: String(formData.get('urgency')) as Urgency,
        status: 'Submitted',
        location: locationLabel,
        coordinates: location,
        barangay: barangay || undefined,
        createdAt: new Date().toISOString(),
        reporterName: 'Guest reporter',
        image: photoPreviews[0],
        photoPaths: [],
      }
    } else {
      report = {
        id: `GP-NEW-${Date.now()}`,
        title,
        description,
        category,
        issueType,
        observedAt: observedDate.toISOString(),
        additionalInfo: additionalInfo || undefined,
        urgency: String(formData.get('urgency')) as Urgency,
        status: 'Submitted',
        location: locationLabel || 'Community location',
        coordinates: location,
        barangay: barangay || undefined,
        createdAt: new Date().toISOString(),
        image: photoPreviews[0],
      }
    }
    if (supabase && session) void deliverNotificationEmails(report.id, session.access_token)
    void getLocalReportDraft().then((savedDraft) => {
      if (savedDraft?.submissionId === reportSubmissionId) {
        return deleteLocalReportDraft().then(() => {
          setSavedDraftAvailable(false)
          setQueuedUploadId(undefined)
        })
      }
      if (savedDraft) setDraftMessage('A different saved draft is still available in this browser.')
    }).catch(() => undefined)
    setDraftMessage('')
    setReports((current) => [report, ...current])
    setSelectedId(report.id)
    setReporting(false)
    setCelebrating(true)
    setFormNotice('')
    setPhotoPreviews([])
    setPhotoFiles([])
    setFormError('')
    setReportBarangay('')
    setBarangayAutofill('')
    form.reset()
    if (guestTrackingCode) {
      setGuestTrackingToken(guestTrackingCode)
      setGuestTrackingEmailSent(guestEmailSent)
      setGuestTrackingOpen(true)
    }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const form = event.currentTarget
    const name = String(new FormData(form).get('team_name') ?? '').trim()
    if (name.length < 2) {
      setTeamMessage('Enter a team name of at least 2 characters.')
      return
    }
    setTeamBusy(true)
    const { error } = await supabase.from('teams').insert({ name })
    setTeamBusy(false)
    if (error) {
      setTeamMessage(error.code === '23505' ? 'A team with that name already exists.' : error.message)
      return
    }
    form.reset()
    setTeamMessage('')
    await loadTeams()
  }

  async function createResponder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || profile?.role !== 'admin') return
    const form = event.currentTarget
    const data = new FormData(form)
    const displayName = String(data.get('display_name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    setResponderBusy(true)
    setResponderMessage('')
    try {
      const response = await fetch(apiUrl('/api/admin-create-responder'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      })
      const result = await response.json() as { displayName?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'The responder invitation could not be sent.')
      form.reset()
      setResponderModalOpen(false)
      setStaffUsersRefreshToken((current) => current + 1)
      pushToast({ tone: 'success', message: `${result.displayName ?? displayName} was invited as a responder.` })
    } catch (error) {
      setResponderMessage(error instanceof Error ? error.message : 'The responder invitation could not be sent.')
    } finally {
      setResponderBusy(false)
    }
  }

  async function deleteTeam(team: Team) {
    if (!supabase || !window.confirm(`Delete "${team.name}"? Reports assigned to it will become unassigned.`)) return
    setTeamBusy(true)
    const { error } = await supabase.from('teams').delete().eq('id', team.id)
    setTeamBusy(false)
    setTeamMessage(error?.message ?? '')
    await loadTeams()
    if (!error) setReports((current) => current.map((report) => report.assignedTeamId === team.id ? { ...report, assignedTeamId: undefined } : report))
  }

  async function toggleTeamMember(team: Team, userId: string) {
    if (!supabase) return
    setTeamBusy(true)
    const { error } = team.memberIds.includes(userId)
      ? await supabase.from('team_members').delete().eq('team_id', team.id).eq('profile_id', userId)
      : await supabase.from('team_members').insert({ team_id: team.id, profile_id: userId })
    setTeamBusy(false)
    setTeamMessage(error?.message ?? '')
    await loadTeams()
  }

  async function saveResponseSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || profile?.role !== 'admin') return
    const data = new FormData(event.currentTarget)
    const next = {
      response_sla_hours: Number(data.get('response_sla_hours')),
      high_urgency_sla_hours: Number(data.get('high_urgency_sla_hours')),
      second_escalation_multiplier: Number(data.get('second_escalation_multiplier')),
    }
    if (![next.response_sla_hours, next.high_urgency_sla_hours].every((value) => Number.isInteger(value) && value >= 1 && value <= 720)
      || !Number.isInteger(next.second_escalation_multiplier) || next.second_escalation_multiplier < 2 || next.second_escalation_multiplier > 10) {
      setResponseSettingsMessage('Choose deadlines from 1 to 720 hours and a second-escalation multiplier from 2 to 10.')
      return
    }
    setResponseSettingsBusy(true)
    setResponseSettingsMessage('')
    const { error } = await supabase.from('response_settings').update(next).eq('singleton', true)
    setResponseSettingsBusy(false)
    if (error) {
      setResponseSettingsMessage(`Deadlines could not be saved: ${error.message}`)
      return
    }
    setResponseSettings(next)
    setResponseSettingsMessage('Response deadlines and escalation windows saved.')
  }

  async function acknowledgeSlaEscalation(item: SlaEscalation) {
    if (!supabase || !session) return
    const acknowledgedAt = new Date().toISOString()
    const { error } = await supabase.from('report_sla_escalations')
      .update({ acknowledged_at: acknowledgedAt, acknowledged_by: session.user.id })
      .eq('report_id', item.report_id).eq('stage', item.stage).is('acknowledged_at', null)
    if (error) {
      setSlaEscalationMessage(`The escalation could not be acknowledged: ${error.message}`)
      return
    }
    setSlaEscalations((current) => current.map((entry) => entry.report_id === item.report_id && entry.stage === item.stage
      ? { ...entry, acknowledged_at: acknowledgedAt }
      : entry))
    setSlaEscalationMessage('Escalation acknowledged. The acknowledgement is recorded in the staff database.')
  }

  async function runEscalationCheck() {
    if (!session || profile?.role !== 'admin') return
    setEscalationRunBusy(true)
    setSlaEscalationMessage('Checking open reports against configured deadlines…')
    try {
      const response = await fetch(apiUrl('/api/process-escalations'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json().catch(() => null) as { error?: string; stagesCreated?: number; emailFailures?: number } | null
      if (!result) throw new Error('The escalation service is unavailable. Restart the app server and try again.')
      if (!response.ok) throw new Error(result.error || 'Escalation check failed.')
      setSlaEscalationMessage(`Escalation check complete. ${result.stagesCreated ?? 0} new escalation${result.stagesCreated === 1 ? '' : 's'} recorded.${result.emailFailures ? ` ${result.emailFailures} email batch${result.emailFailures === 1 ? '' : 'es'} need attention.` : ''}`)
      setReportRefreshToken((current) => current + 1)
    } catch (error) {
      setSlaEscalationMessage(error instanceof Error ? error.message : 'Escalation check failed.')
    } finally {
      setEscalationRunBusy(false)
    }
  }

  async function retryFailedEmails() {
    const failedRows = failedEmailNotifications.filter((item) => item.status === 'Failed' || item.status === 'Pending')
    if (!supabase || !session || profile?.role !== 'admin' || !failedRows.length) return
    setEmailRetryBusy(true)
    setEmailRetryMessage('Retrying failed email deliveries…')
    const reportIds = [...new Set(failedRows.map((item) => item.report_id))]
    let failures = 0
    let firstError = ''
    for (const reportId of reportIds) {
      try {
        const response = await fetch(apiUrl('/api/send-notification-emails'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ reportId }),
        })
        if (!response.ok) {
          failures += 1
          firstError ||= (await response.json().catch(() => null) as { error?: string } | null)?.error ?? ''
        }
      } catch {
        failures += 1
      }
    }
    setEmailRetryBusy(false)
    setReportRefreshToken((current) => current + 1)
    setEmailRetryMessage(failures ? `${failures} report email batch${failures === 1 ? '' : 'es'} still need attention.${firstError ? ` ${firstError}` : ''}` : 'Pending and failed email deliveries were retried.')
  }

  function updateStaffFilters(changes: Partial<ReportFilters>) {
    setStaffFilters((current) => ({ ...current, ...changes }))
    setStaffQueueOffset(0)
  }

  async function refreshStaffEvents(reportId: string) {
    if (!supabase || !session) return
    const { data } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', reportId).order('created_at', { ascending: false })
    setReportEvents((data ?? []) as ReportEvent[])
    void deliverNotificationEmails(reportId, session.access_token)
  }

  // Reloads the timeline when a message arrives from someone else. No emails: the sender delivers them.
  async function reloadStaffEvents(reportId: string) {
    if (!supabase || !session) return
    const { data } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', reportId).order('created_at', { ascending: false })
    setReportEvents((data ?? []) as ReportEvent[])
  }

  async function applyReportUpdate(payload: Record<string, unknown>, options?: { resolutionFiles?: File[] }) {
    if (!supabase || !session || !staffReport) return 'You are not signed in.'
    const uploadedPaths: string[] = []
    const update = { ...payload }
    for (const [index, file] of (options?.resolutionFiles ?? []).entries()) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        if (uploadedPaths.length) await supabase.storage.from('report-photos').remove(uploadedPaths)
        return 'After-photos must be JPEG, PNG, or WebP images of 5 MB or less.'
      }
      const path = `${session.user.id}/resolution-${staffReport.id}-${Date.now()}-${index}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`
      const { error: uploadError } = await supabase.storage.from('report-photos').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from('report-photos').remove(uploadedPaths)
        return uploadError.message
      }
      uploadedPaths.push(path)
    }
    if (uploadedPaths.length) update.resolution_photo_paths = [...(staffReport.resolutionPhotoPaths ?? []), ...uploadedPaths]
    let previous: Record<string, unknown> | undefined
    if (!uploadedPaths.length) {
      const { data: before } = await supabase.from('reports').select(Object.keys(update).join(',')).eq('id', staffReport.id).single()
      previous = (before as unknown as Record<string, unknown> | null) ?? undefined
    }
    const { data, error } = await supabase.from('reports').update(update).eq('id', staffReport.id).select('*').single()
    if (error || !data) {
      if (uploadedPaths.length) await supabase.storage.from('report-photos').remove(uploadedPaths)
      return error?.message ?? 'The update could not be saved.'
    }
    const updatedReport = toReport(data as ReportRow) as Report
    void deliverNotificationEmails(updatedReport.id, session.access_token)
    setSavedStaffReportDetail(updatedReport)
    setReports((current) => current.map((report) => report.id === updatedReport.id ? { ...report, ...updatedReport } : report))
    setStaffQueue((current) => current.map((report) => report.id === updatedReport.id ? { ...report, ...updatedReport } : report))
    const { data: events } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', updatedReport.id).order('created_at', { ascending: false })
    setReportEvents((events ?? []) as ReportEvent[])
    const restore = previous
    pushToast({
      message: typeof update.status === 'string' ? `${formatReportId(updatedReport.id)} marked ${update.status}.` : 'assigned_to' in update || 'assigned_team_id' in update ? `Assignment updated for ${formatReportId(updatedReport.id)}.` : `${formatReportId(updatedReport.id)} updated.`,
      action: restore ? { label: 'Undo', run: () => void undoReportUpdate(updatedReport.id, restore) } : undefined,
    })
    return undefined
  }

  async function undoReportUpdate(reportId: string, previous: Record<string, unknown>) {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('reports').update(previous).eq('id', reportId).select('*').single()
    if (error || !data) {
      pushToast({ tone: 'error', message: `The change could not be undone${error ? `: ${error.message}` : '.'}` })
      return
    }
    const restored = toReport(data as ReportRow) as Report
    setSavedStaffReportDetail(restored)
    setReports((current) => current.map((report) => report.id === restored.id ? { ...report, ...restored } : report))
    setStaffQueue((current) => current.map((report) => report.id === restored.id ? { ...report, ...restored } : report))
    void refreshStaffEvents(restored.id)
    pushToast({ tone: 'info', message: `Change to ${formatReportId(restored.id)} undone.` })
  }

  const staffPhotoPathsKey = JSON.stringify({
    originalPaths: [...new Set([...(staffReport?.photoPaths ?? []), ...(staffReport?.photoPath ? [staffReport.photoPath] : [])])],
    resolutionPaths: staffReport?.resolutionPhotoPaths ?? [],
  })
  useEffect(() => {
    if (!supabase || !staffMode || !staffReportId || (profile?.role !== 'responder' && profile?.role !== 'admin')) {
      setReportEvents([])
      setStaffPhotoUrls({ original: [], resolution: [] })
      return
    }
    supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', staffReportId).order('created_at', { ascending: false }).then(({ data }) => {
      setReportEvents((data ?? []) as ReportEvent[])
    })
    // Photo paths come only from the full row; the community copy has none.
    const { originalPaths, resolutionPaths } = JSON.parse(staffPhotoPathsKey) as { originalPaths: string[]; resolutionPaths: string[] }
    let active = true
    const sign = async (paths: string[]) => {
      if (!paths.length) return []
      const { data } = await supabase!.storage.from('report-photos').createSignedUrls(paths, 300)
      return (data ?? []).flatMap((entry) => entry.signedUrl ? [entry.signedUrl] : [])
    }
    void Promise.all([sign(originalPaths), sign(resolutionPaths)]).then(([original, resolution]) => {
      if (active) setStaffPhotoUrls({ original, resolution })
    })
    return () => { active = false }
  }, [profile?.role, staffMode, staffReportId, staffPhotoPathsKey, reportRefreshToken])

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

  const activeViewKey = !staffMode ? 'community' : profile?.role === 'admin' && staffDashboardOpen ? 'dashboard' : 'desk'
  const activeViewLabel = activeViewKey === 'community' ? 'Opening community view…' : activeViewKey === 'dashboard' ? 'Opening admin dashboard…' : 'Opening staff desk…'
  const viewTransition = useViewTransition(activeViewKey, reportsSyncing || staffQueueLoading)
  const syncState = resolveSyncState({ configured: isSupabaseConfigured, online: isOnline, syncing: reportsSyncing || staffQueueLoading, queued: Boolean(queuedUploadId), failed: reportsFailed })
  const urgentOpenCount = reports.filter((report) => report.urgency === 'High' && isOpenStatus(report.status)).length
  const contextTitle = activeViewKey === 'community' ? 'Community map' : activeViewKey === 'dashboard' ? 'Admin dashboard' : 'Staff desk'
  // Phones only (see .report-fab): shown once the hero's button is out of view, and never over the form or the map's report sheet.
  const fabVisible = scrolledPastHero && !reporting && !(mobileMap && selectedId)
  const heroStats: HeroStat[] = staffMode ? [
    { icon: ClipboardCheck, tone: 'leaf', value: openReports, label: 'Open queue' },
    { icon: AlertTriangle, tone: 'coral', value: reports.filter((report) => report.urgency === 'High' && report.status !== 'Resolved' && report.status !== 'Rejected').length, label: 'Urgent' },
    { icon: Clock3, tone: 'sky', value: reports.filter((report) => report.status === 'In progress').length, label: 'In progress' },
    { icon: Check, tone: 'amber', value: reports.filter((report) => report.status === 'Resolved').length, label: 'Resolved' },
  ] : [
    { icon: Leaf, tone: 'leaf', value: openReports, label: 'Open reports', note: 'needs attention' },
    { icon: ShieldCheck, tone: 'sky', value: verifiedReports, label: 'Verified or assigned', note: 'being followed up' },
    { icon: Clock3, tone: 'amber', value: reports.length, label: 'Community reports', note: 'all time' },
  ]
  const isStaffRole = profile?.role === 'admin' || profile?.role === 'responder'
  const paletteCommands: PaletteCommand[] = [
    { id: 'go-community', group: 'Go to', label: 'Community map', keywords: 'home public view', run: () => { setStaffMode(false); setStaffDashboardOpen(true) } },
    ...(isStaffRole ? [{ id: 'go-desk', group: 'Go to', label: 'Staff desk', keywords: 'queue responder', run: () => { setStaffMode(true); setStaffDashboardOpen(false) } }] : []),
    ...(profile?.role === 'admin' ? [{ id: 'go-dashboard', group: 'Go to', label: 'Admin dashboard', keywords: 'analytics overview charts', run: () => { setStaffMode(true); setStaffDashboardOpen(true) } }] : []),
    { id: 'act-report', group: 'Actions', label: 'Report an issue', keywords: 'new submit add', run: startReport },
    { id: 'act-location', group: 'Actions', label: 'Use my location', keywords: 'gps nearby locate', run: () => { setStaffMode(false); requestLocation(false) } },
    ...(isSupabaseConfigured ? [{ id: 'act-refresh', group: 'Actions', label: 'Refresh reports', keywords: 'sync reload', run: () => setReportRefreshToken((current) => current + 1) }] : []),
    { id: 'act-tour', group: 'Actions', label: 'Show the introduction again', keywords: 'help how works tour', run: () => { setStaffMode(false); setTourOpen(true); window.scrollTo({ top: 0 }) } },
    { id: 'disp-theme', group: 'Display', label: `Turn dark mode ${theme === 'dark' ? 'off' : 'on'}`, keywords: 'theme light', run: () => toggleTheme() },
    { id: 'disp-motion', group: 'Display', label: `${displayPrefs.reduceMotion ? 'Allow' : 'Reduce'} motion`, keywords: 'animation', run: () => updateDisplayPrefs({ reduceMotion: !displayPrefs.reduceMotion }) },
    { id: 'disp-contrast', group: 'Display', label: `Turn high contrast ${displayPrefs.highContrast ? 'off' : 'on'}`, keywords: 'accessibility', run: () => updateDisplayPrefs({ highContrast: !displayPrefs.highContrast }) },
    { id: 'disp-compact', group: 'Display', label: `Use ${displayPrefs.compact ? 'comfortable' : 'compact'} lists`, keywords: 'density rows', run: () => updateDisplayPrefs({ compact: !displayPrefs.compact }) },
    ...allKnownReports.filter((report, index, list) => list.findIndex((other) => other.id === report.id) === index).slice(0, 40).map((report) => ({
      id: `report-${report.id}`,
      group: 'Reports',
      label: report.title,
      hint: `${formatReportId(report.id)} · ${report.status}`,
      keywords: `${report.category} ${report.location} ${report.barangay ?? ''} ${report.id}`,
      run: () => {
        if (isStaffRole && staffMode) { setStaffDashboardOpen(false); setStaffReportId(report.id) }
        else { setStaffMode(false); setSelectedId(report.id) }
      },
    })),
  ]

  return (
    <div className={`app-shell theme-${theme}`} lang="en">
      <a className="skip-link" href="#home">Skip to main content</a>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="GreenPulse home">
          <span className="brand-mark"><Leaf size={19} strokeWidth={2.2} /></span>
          <span className="brand-name">green<span>pulse</span></span>
        </a>
        <div className="topbar-context">{isSupabaseConfigured && <span className={`live-dot ${isOnline ? '' : 'is-offline'}`} />} Community watch <span className="context-divider">/</span> Environmental reports</div>
        <div className={`topbar-chip ${scrolledPastHeading ? 'is-visible' : ''}`} aria-hidden={!scrolledPastHeading}><strong>{contextTitle}</strong><span>{openReports} open</span>{urgentOpenCount > 0 && <span className="is-urgent">{urgentOpenCount} urgent</span>}</div>
        <div className="topbar-actions">
          <SyncStatus state={syncState} detail={!isSupabaseConfigured ? 'Reports stay in this browser. Add Supabase settings to enable shared reports and accounts.' : lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : undefined} onRetry={() => setReportRefreshToken((current) => current + 1)} />
          <DisplaySettings prefs={displayPrefs} onChange={updateDisplayPrefs} />
          {savedDraftAvailable && <button className="text-button resume-draft-button" type="button" onClick={() => void restoreReportDraft(false)}>Resume draft</button>}
          <button className="icon-button theme-toggle" type="button" role="switch" onClick={() => toggleTheme()} aria-label="Dark mode" aria-checked={theme === 'dark'} title={`Turn dark mode ${theme === 'dark' ? 'off' : 'on'}`}><span className="theme-toggle-thumb" aria-hidden="true">{theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}</span></button>
          {isSupabaseConfigured && <button className="secondary-button track-report-button" type="button" aria-label="Track a report" title="Track a report" onClick={() => { setGuestTrackingToken(undefined); setGuestTrackingEmailSent(false); setGuestTrackingOpen(true) }}><FileSearch size={15} /><span className="track-report-label">Track report</span></button>}
          {session && <button className={`icon-button notification-toggle ${notificationPanelOpen ? 'active' : ''}`} type="button" onClick={() => setNotificationPanelOpen((open) => !open)} aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`} aria-expanded={notificationPanelOpen} title="Notifications"><Bell size={16} />{unreadNotificationCount > 0 && <span className="notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}</button>}
          {session ? <>
            {(profile?.role === 'responder' || profile?.role === 'admin') && <button className={`text-button staff-toggle ${staffMode ? 'active' : ''}`} type="button" title={staffMode ? 'Return to community view' : 'Open staff desk'} aria-label={staffMode ? 'Return to community view' : 'Open staff desk'} onClick={() => { setStaffMode((current) => !current); setStaffDashboardOpen(true) }}><ClipboardCheck size={15} /><span>{staffMode ? 'Community view' : 'Staff desk'}</span></button>}
            <button className="profile-button" type="button" onClick={() => { setProfileAvatarPreview(profileAvatarUrl); setProfileModal(true) }} aria-label="Open profile settings"><span className="avatar">{profileAvatarUrl ? <img src={profileAvatarUrl} alt="" /> : (profile?.display_name || session.user.email || session.user.phone || 'R').slice(0, 1).toUpperCase()}</span><span className="profile-label">{profile?.display_name || session.user.email || session.user.phone}</span>{profile && <span className={`profile-role-badge role-${profile.role}`}>{getRoleLabel(profile.role)}</span>}</button>
            <button className="icon-button topbar-signout" type="button" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </> : isSupabaseConfigured ? <button className="sign-in-button" type="button" onClick={() => openAuthModal('sign-in')} disabled={!authReady}><LogIn size={15} />Sign in</button> : <span className="profile-button"><span className="avatar">G</span><span className="profile-label">Guest</span></span>}
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

      <main id="home" className={`workspace ${viewTransition.entering ? 'view-entering' : ''}`} tabIndex={-1}>
        <HeroPanel
          title={staffMode ? <>Coordinate the response. <em>Close the loop.</em></> : <>See it. Report it. <em>Restore it.</em></>}
          subtitle={staffMode ? 'A focused queue for reviewing reports and coordinating community response.' : t('communitySubtitle')}
          action={<button className="primary-button" type="button" onClick={startReport}><Plus size={17} /> {t('reportIssue')}</button>}
          hint={staffMode ? undefined : 'No account needed. Takes about a minute.'}
          stats={heroStats}
          statsLabel={staffMode ? 'Staff response summary' : 'Community report summary'}
          loading={loadingReports}
          footer={!staffMode && isSupabaseConfigured ? <div className="hero-sync" aria-live="polite"><span className={`live-dot ${isOnline ? '' : 'is-offline'}`} />{lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Syncing reports…'}<button className="text-button" type="button" disabled={!isOnline || loadingReports} onClick={() => setReportRefreshToken((current) => current + 1)}>Refresh</button></div> : undefined}
        />

        {isSupabaseConfigured && !isOnline && <div className="connection-banner error-banner" role="status"><span><strong>You’re offline.</strong> Showing the last synced reports; you can save a report on this device and queue it for upload when you reconnect.{lastSyncedAt ? ` Last synced ${lastSyncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''}</span></div>}
        {draftMessage && <div className="connection-banner" role="status"><span>{draftMessage}</span>{savedDraftAvailable && <button className="text-button" type="button" onClick={() => void deleteSavedDraft()}>Delete saved draft</button>}</div>}
        {backendError && <div className="connection-banner error-banner" role="alert"><AlertTriangle size={16} /><span>{backendError}</span><button type="button" onClick={() => setBackendError('')} aria-label="Dismiss message"><X size={14} /></button></div>}

        {!staffMode && tourOpen && <WelcomeTour onDismiss={dismissTour} onSeen={markTourSeen} />}

        {staffMode && profile?.role === 'admin' && staffDashboardOpen && <section className="admin-overview" aria-label="Admin dashboard" aria-busy={loadingReports}>
          <div className="analytics-heading">
            <div><p className="eyebrow">ADMIN DASHBOARD</p><h2>Environmental report overview</h2></div>
            <div className="analytics-heading-actions"><span className="analytics-period">{loadingReports ? 'Loading reports…' : 'All reports'}<i />Current data</span><button className="secondary-button add-responder-button" type="button" onClick={() => { setResponderMessage(''); setResponderModalOpen(true) }}><Plus size={14} /> Add responder</button><button className="secondary-button admin-dashboard-action" type="button" onClick={() => setStaffDashboardOpen(false)}><ClipboardCheck size={14} /> Response desk</button></div>
          </div>
          <AdminSectionNav sections={ADMIN_SECTIONS} active={adminSection} onChange={setAdminSection} />
          {adminSection === 'admin-overview-metrics' && <div className="admin-metrics-grid" id="admin-overview-metrics" role="tabpanel" aria-labelledby={adminTabId('admin-overview-metrics')}>
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
              { label: 'Escalated reports', value: escalatedOpen, note: 'Open critical flooding', icon: <AlertTriangle size={15} /> },
              { label: 'Avg. verification time', value: formatDuration(responseMetrics.averageVerificationMs), note: 'Submitted to verified', icon: <Check size={15} /> },
              { label: 'Avg. response time', value: formatDuration(responseMetrics.averageResponseMs), note: 'Submitted to response started', icon: <ArrowDownUp size={15} /> },
              { label: 'Avg. resolution time', value: formatDuration(responseMetrics.averageResolutionMs), note: 'Submitted to resolved', icon: <ShieldCheck size={15} /> },
              { label: 'Reports this week', value: adminAnalytics.thisWeek, note: 'Since Monday', icon: <CalendarDays size={15} /> },
              { label: 'Reports this month', value: adminAnalytics.thisMonth, note: 'Since the first of the month', icon: <CalendarDays size={15} /> },
            ].map((metric, index) => <article className="admin-metric" key={metric.label} style={{ '--i': index } as CSSProperties}>
              <span className="admin-metric-icon">{metric.icon}</span><strong>{loadingReports ? <><span className="skeleton skeleton-stat" aria-hidden="true" /><span className="sr-only">Loading</span></> : typeof metric.value === 'number' ? <AnimatedNumber value={metric.value} /> : metric.value}</strong><span>{metric.label}</span><small>{metric.note}</small>
            </article>)}
          </div>}
          {adminSection === 'admin-charts' && <div className="admin-chart-grid" id="admin-charts" role="tabpanel" aria-labelledby={adminTabId('admin-charts')}>
            <AdminBarChart title="Reports by category" description="Environmental concern type" data={adminAnalytics.byCategory} loading={loadingReports} />
            <AdminBarChart title="Reports by status" description="Current response stage" data={adminAnalytics.byStatus} loading={loadingReports} />
            <AdminBarChart title="Reports by urgency" description="Reported urgency level" data={adminAnalytics.byUrgency} loading={loadingReports} />
            <AdminBarChart title="Reports by location" description="Most reported locations" data={adminAnalytics.byLocation} loading={loadingReports} />
            <AdminTrendChart daily={adminAnalytics.daily} loading={loadingReports} />
            <article className="analytics-chart admin-outcome-chart">
              <div className="analytics-chart-heading"><div><strong>Resolution performance</strong><span>Resolved reports as a share of all reports</span></div><ShieldCheck size={17} /></div>
              <div className="resolution-content">
                <div className="resolution-ring" role="img" aria-label={`Resolution rate ${Math.round(adminAnalytics.resolutionRate)} percent`} style={{ '--ring': `${adminAnalytics.resolutionRate}%` } as CSSProperties}><span><AnimatedNumber value={Math.round(adminAnalytics.resolutionRate)} /><small>%</small></span></div>
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
          </div>}
          {adminSection === 'admin-summary' && <EnvironmentalReports reports={reports} />}
          {adminSection === 'admin-pilot' && <section className="pilot-outcomes analytics-chart" id="admin-pilot" role="tabpanel" aria-labelledby={adminTabId('admin-pilot')}>
            <div className="analytics-chart-heading"><div><strong>Pilot outcomes</strong><span>All-time response and recurrence measures for participating teams</span></div><BarChart3 size={17} /></div>
            {pilotOutcomesMessage && <p className="workflow-hint" role="status">{pilotOutcomesMessage}</p>}
            {!pilotOutcomes && !pilotOutcomesMessage && (loadingReports ? <ChartSkeleton rows={3} /> : <ChartEmpty title="No pilot outcomes yet" hint="Response and recurrence measures appear after reports have been handled." />)}
            {pilotOutcomes && <>
              <div className="pilot-outcome-metrics"><p><strong>{pilotOutcomes.totalReports}</strong><span>recorded reports</span></p><p><strong>{pilotOutcomes.reopenedReports}</strong><span>reopened reports</span></p></div>
              <div className="pilot-outcome-table-wrap"><table className="pilot-outcome-table"><caption className="sr-only">Report outcomes by barangay</caption><thead><tr><th scope="col">Barangay</th><th scope="col">Reports</th><th scope="col">Resolved or closed</th><th scope="col">Reopened</th><th scope="col">Avg. first response</th><th scope="col">Avg. resolution</th></tr></thead><tbody>{pilotOutcomes.byBarangay.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.reports}</td><td>{row.resolved}</td><td>{row.reopened}</td><td>{formatDuration(row.averageFirstResponseMs ?? undefined)}</td><td>{formatDuration(row.averageResolutionMs ?? undefined)}</td></tr>)}</tbody></table></div>
            </>}
          </section>}
          {adminSection === 'admin-operations' && <div className="admin-operations-grid" id="admin-operations" role="tabpanel" aria-labelledby={adminTabId('admin-operations')}>
            <form className="admin-operation-card" onSubmit={(event) => void saveResponseSettings(event)}>
              <div><p className="eyebrow">OPERATIONS</p><h3>Response deadlines</h3><p>These targets drive overdue alerts in the staff inbox.</p></div>
              <label className="field-label">Standard urgency deadline (hours)<input name="response_sla_hours" type="number" min={1} max={720} step={1} value={responseSettings.response_sla_hours} onChange={(event) => setResponseSettings((current) => ({ ...current, response_sla_hours: Number(event.target.value) }))} required /></label>
              <label className="field-label">High urgency deadline (hours)<input name="high_urgency_sla_hours" type="number" min={1} max={720} step={1} value={responseSettings.high_urgency_sla_hours} onChange={(event) => setResponseSettings((current) => ({ ...current, high_urgency_sla_hours: Number(event.target.value) }))} required /></label>
              <label className="field-label">Second escalation window (multiple of first deadline)<input name="second_escalation_multiplier" type="number" min={2} max={10} step={1} value={responseSettings.second_escalation_multiplier} onChange={(event) => setResponseSettings((current) => ({ ...current, second_escalation_multiplier: Number(event.target.value) }))} required /><small>At the first deadline, notify admins and the assigned responder. At this multiple, notify admins again for supervisor review.</small></label>
              {responseSettingsMessage && <p className="workflow-hint" role="status">{responseSettingsMessage}</p>}
              <button className="secondary-button" type="submit" disabled={responseSettingsBusy}>{responseSettingsBusy ? 'Saving…' : 'Save deadlines'}</button>
            </form>
            <section className="admin-operation-card" aria-label="Escalation queue">
              <div><p className="eyebrow">FOLLOW-UP CONTROL</p><h3>Escalations</h3><p>Stage 1 goes to admins and the assigned responder. Stage 2 asks admins to review the task plan. Staff can acknowledge the escalation.</p></div>
              <button className="secondary-button" type="button" onClick={() => void runEscalationCheck()} disabled={escalationRunBusy}>{escalationRunBusy ? 'Checking…' : 'Check deadlines now'}</button>
              {slaEscalationMessage && <p className="workflow-hint" role="status">{slaEscalationMessage}</p>}
              <div className="workload-list escalation-list">{slaEscalations.length ? slaEscalations.slice(0, 8).map((item) => {
                const report = Array.isArray(item.report) ? item.report[0] : item.report
                const canAcknowledge = profile.role === 'admin' || report?.assigned_to === session?.user.id
                  || Boolean(report?.assigned_team_id && teams.find((team) => team.id === report.assigned_team_id)?.memberIds.includes(session?.user.id ?? ''))
                return <div className="workload-row escalation-row" key={`${item.report_id}-${item.stage}`}><span><strong>Stage {item.stage}: {report?.title ?? 'Report'}</strong><small>{formatCreatedAt(item.escalated_at)} · {item.acknowledged_at ? 'Acknowledged' : 'Needs acknowledgement'}</small></span>{!item.acknowledged_at && canAcknowledge && <button className="text-button" type="button" onClick={() => void acknowledgeSlaEscalation(item)}>Acknowledge</button>}</div>
              }) : <span className="workflow-hint">No SLA escalations recorded.</span>}</div>
            </section>
            <section className="admin-operation-card" aria-label="Email notification delivery">
              <div><p className="eyebrow">NOTIFICATION DELIVERY</p><h3>Email delivery history</h3><p>Recent sent and failed deliveries are recorded. Retries use stable idempotency keys.</p></div>
              {emailRetryMessage && <p className="workflow-hint" role="status">{emailRetryMessage}</p>}
              <div className="workload-list">{failedEmailNotifications.length ? failedEmailNotifications.slice(0, 8).map((item) => <div className="workload-row" key={item.id}><span><strong>{item.title} · {item.channel} · {item.status}</strong><small>{item.attempts} attempt{item.attempts === 1 ? '' : 's'} · {item.last_error ?? (item.attempted_at ? formatCreatedAt(item.attempted_at) : 'No failure detail')}</small></span></div>) : <span className="workflow-hint">No email delivery attempts are recorded.</span>}</div>
              <button className="secondary-button" type="button" disabled={emailRetryBusy || !failedEmailNotifications.some((item) => item.status === 'Failed' || item.status === 'Pending')} onClick={() => void retryFailedEmails()}>{emailRetryBusy ? 'Retrying…' : 'Retry failed email alerts'}</button>
            </section>
            <section className="admin-operation-card" aria-label="Responder workload">
              <div><p className="eyebrow">TEAM CAPACITY</p><h3>Open task workload</h3><p>Counts include reports assigned directly or to a team.</p></div>
              <div className="workload-list"><strong>Responders</strong>{staffUsers.filter((user) => user.role === 'responder').map((user) => <div className="workload-row" key={user.id}><span>{user.display_name || 'Unnamed responder'}</span><b>{reports.filter((report) => report.assignedTo === user.id && isOpenStatus(report.status)).length}</b></div>)}{staffUsers.filter((user) => user.role === 'responder').length === 0 && <span className="workflow-hint">No responders are configured.</span>}</div>
              <div className="workload-list"><strong>Teams</strong>{teams.map((team) => <div className="workload-row" key={team.id}><span>{team.name}</span><b>{reports.filter((report) => report.assignedTeamId === team.id && isOpenStatus(report.status)).length}</b></div>)}{teams.length === 0 && <span className="workflow-hint">No teams are configured.</span>}</div>
            </section>
          </div>}
        </section>}

        {staffMode && (profile?.role === 'responder' || profile?.role === 'admin') && (!staffDashboardOpen || profile.role !== 'admin') && <section className="staff-workbench" aria-label="Staff report management">
          <div className="staff-workbench-heading"><div><p className="eyebrow">RESPONSE MANAGEMENT</p><h2>Staff desk</h2><p>Review incoming reports, assign responders, and record outcomes.</p></div><div className="staff-workbench-actions">{profile.role === 'admin' && <button className="secondary-button add-responder-button" type="button" onClick={() => { setResponderMessage(''); setResponderModalOpen(true) }}><Plus size={14} /> Add responder</button>}{profile.role === 'admin' && <button className="secondary-button" type="button" onClick={() => { setTeamMessage(''); setTeamModalOpen(true) }}><Users size={14} /> Manage teams</button>}{profile.role === 'admin' && <button className="secondary-button" type="button" onClick={() => setStaffDashboardOpen(true)}><BarChart3 size={14} /> Dashboard</button>}<span className="role-chip"><ShieldCheck size={14} />{profile.role}</span></div></div>
          <section className="admin-operation-card staff-escalation-panel" aria-label="My deadline escalations">
            <div><p className="eyebrow">FOLLOW-UP CONTROL</p><h3>Deadline escalations</h3><p>Review reports assigned to you or your team and acknowledge the follow-up.</p></div>
            <div className="workload-list escalation-list">{slaEscalations.filter((item) => {
              const report = Array.isArray(item.report) ? item.report[0] : item.report
              return profile.role === 'admin' || report?.assigned_to === session?.user.id
                || Boolean(report?.assigned_team_id && teams.find((team) => team.id === report.assigned_team_id)?.memberIds.includes(session?.user.id ?? ''))
            }).slice(0, 10).map((item) => {
              const report = Array.isArray(item.report) ? item.report[0] : item.report
              return <div className="workload-row escalation-row" key={`${item.report_id}-${item.stage}`}><span><strong>Stage {item.stage}: {report?.title ?? 'Report'}</strong><small>{formatCreatedAt(item.escalated_at)} · {item.acknowledged_at ? 'Acknowledged' : 'Needs acknowledgement'}</small></span>{!item.acknowledged_at && <button className="text-button" type="button" onClick={() => void acknowledgeSlaEscalation(item)}>Acknowledge</button>}</div>
            })}</div>
            {!slaEscalations.some((item) => {
              const report = Array.isArray(item.report) ? item.report[0] : item.report
              return profile.role === 'admin' || report?.assigned_to === session?.user.id
                || Boolean(report?.assigned_team_id && teams.find((team) => team.id === report.assigned_team_id)?.memberIds.includes(session?.user.id ?? ''))
            }) && <span className="workflow-hint">No escalations are assigned to you or your team.</span>}
            {slaEscalationMessage && <p className="workflow-hint" role="status">{slaEscalationMessage}</p>}
          </section>
          <section className="recurrence-panel" aria-label="Recurring issue inspections">
            <div className="recurrence-heading"><div><p className="eyebrow">RECURRING ISSUES</p><h3>Inspections and maintenance follow-ups</h3><p>Patterns are based on reports from the last 90 days within 350 metres.</p></div><span className="count-badge">{profile.role === 'admin' ? unplannedHotspots.length : environmentalFollowups.filter((item) => item.status === 'Scheduled' && item.assigned_team_id && teams.find((team) => team.id === item.assigned_team_id)?.memberIds.includes(session?.user.id ?? '')).length}</span></div>
            {profile.role === 'admin' && unplannedHotspots.length > 0 && <div className="recurrence-suggestions">{unplannedHotspots.map((hotspot) => <article className="recurrence-suggestion" key={hotspot.key}><div><strong>{hotspot.category} · {hotspot.barangay ? `Barangay ${hotspot.barangay}` : 'District 5'}</strong><span>{hotspot.count} reports near {hotspot.location}</span></div><button className="secondary-button" type="button" disabled={followupBusy} onClick={() => void createEnvironmentalFollowup(hotspot)}>Schedule inspection</button></article>)}</div>}
            {profile.role === 'admin' && unplannedHotspots.length === 0 && <p className="workflow-hint">No new hotspot has reached three reports in the same area during the last 90 days.</p>}
            {followupMessage && <p className="workflow-hint" role="status">{followupMessage}</p>}
            <div className="environmental-followup-list">{environmentalFollowups.filter((item) => profile.role === 'admin' || (item.status === 'Scheduled' && Boolean(item.assigned_team_id && teams.find((team) => team.id === item.assigned_team_id)?.memberIds.includes(session?.user.id ?? '')))).map((item) => {
              const isAssignedResponder = Boolean(item.status === 'Scheduled' && item.assigned_team_id && teams.find((team) => team.id === item.assigned_team_id)?.memberIds.includes(session?.user.id ?? ''))
              return <article className="environmental-followup-item" key={item.id}><div className="followup-item-title"><strong>{item.title}</strong><span>{item.source_report_ids.length} source reports · {item.location_label}{item.barangay ? ` · ${item.barangay}` : ''}</span></div><span className={`followup-status followup-${item.status.toLowerCase()}`}>{item.status}</span>{profile.role === 'admin' && <div className="followup-controls"><label className="filter-field"><span>Team</span><select value={item.assigned_team_id ?? ''} disabled={followupBusy} onChange={(event) => void updateEnvironmentalFollowup(item.id, { assigned_team_id: event.target.value || null })}><option value="">Unassigned</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="filter-field"><span>Due date</span><input type="date" value={item.due_date ?? ''} disabled={followupBusy} onChange={(event) => void updateEnvironmentalFollowup(item.id, { due_date: event.target.value || null })} /></label>{item.status === 'Scheduled' && <><button className="text-button" type="button" disabled={followupBusy} onClick={() => void updateEnvironmentalFollowup(item.id, { status: 'Completed' })}>Mark complete</button><button className="text-button" type="button" disabled={followupBusy} onClick={() => void updateEnvironmentalFollowup(item.id, { status: 'Dismissed' })}>Dismiss</button></>}</div>}{profile.role === 'responder' && isAssignedResponder && <button className="secondary-button" type="button" disabled={followupBusy} onClick={() => void updateEnvironmentalFollowup(item.id, { status: 'Completed' })}>Mark inspection complete</button>}</article>
            })}</div>
          </section>
          <div className="staff-filters">
            <div className="staff-filters-bar">
              <label className="search-box staff-search"><Search size={15} /><input value={staffFilters.query} onChange={(event) => updateStaffFilters({ query: event.target.value })} placeholder="Search by ID, title, description, reporter, location, category, or assignee" aria-label="Search reports" />{staffFilters.query && <button type="button" onClick={() => updateStaffFilters({ query: '' })} aria-label="Clear search"><X size={14} /></button>}</label>
              <button className={`secondary-button filter-toggle ${staffFiltersOpen ? 'active' : ''}`} type="button" aria-expanded={staffFiltersOpen} aria-controls="staff-filter-panel" onClick={() => setStaffFiltersOpen((open) => !open)}><SlidersHorizontal size={14} /> Filters{activeFilterCount > 0 && <span className="count-badge">{activeFilterCount}</span>}</button>
              {activeFilterCount > 0 && <button className="text-button" type="button" onClick={() => setStaffFilters(defaultReportFilters)}>Clear all</button>}
            </div>
            {staffFiltersOpen && <div className="staff-filter-panel" id="staff-filter-panel">
              <FilterSelect label="Status" value={staffFilters.status} onChange={(status) => updateStaffFilters({ status })}><option value="open">Open reports</option><option value="all">All reports</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</FilterSelect>
              <FilterSelect label="Resolution" value={staffFilters.resolution} onChange={(resolution) => updateStaffFilters({ resolution, ...(resolution && resolution !== 'unresolved' && staffFilters.status === 'open' ? { status: 'all' } : {}) })}><option value="">Any resolution</option><option value="unresolved">Unresolved</option><option value="awaiting">Awaiting verification</option><option value="resolved">Resolved</option><option value="closed">Closed</option></FilterSelect>
              <FilterSelect label="Category" value={staffFilters.category} onChange={(category) => updateStaffFilters({ category })}><option value="">All categories</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</FilterSelect>
              <FilterSelect label="Urgency" value={staffFilters.urgency} onChange={(urgency) => updateStaffFilters({ urgency })}><option value="">Any urgency</option><option>High</option><option>Medium</option><option>Low</option></FilterSelect>
              <FilterSelect label="Barangay" value={staffFilters.barangay} onChange={(barangay) => updateStaffFilters({ barangay })}><option value="">All barangays</option><option value={NO_BARANGAY}>No barangay recorded</option>{DISTRICT_5_BARANGAYS.map((barangay) => <option key={barangay}>{barangay}</option>)}</FilterSelect>
              <FilterSelect label="Assigned to" value={staffFilters.assignee} onChange={(assignee) => updateStaffFilters({ assignee })}><option value="">Anyone</option><option value={UNASSIGNED}>Unassigned</option>{staffUsers.map((user) => <option key={user.id} value={user.id}>{user.display_name || 'Unnamed staff member'}</option>)}</FilterSelect>
              <FilterSelect label="Assigned team" value={staffFilters.team} onChange={(team) => updateStaffFilters({ team })}><option value="">Any team</option><option value={UNASSIGNED}>No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</FilterSelect>
              <label className="filter-field"><span>Submitted from</span><input type="date" value={staffFilters.dateFrom} max={staffFilters.dateTo || undefined} onChange={(event) => updateStaffFilters({ dateFrom: event.target.value })} /></label>
              <label className="filter-field"><span>Submitted to</span><input type="date" value={staffFilters.dateTo} min={staffFilters.dateFrom || undefined} onChange={(event) => updateStaffFilters({ dateTo: event.target.value })} /></label>
            </div>}
            <FilterChips chips={staffFilterChips} onRemove={(key) => { setStaffFilters((current) => clearFilter(current, key)); setStaffQueueOffset(0) }} />
          </div>
          <div className={`staff-workbench-grid ${staffReportId ? 'has-selection' : ''}`}>
            <div className="staff-queue" ref={staffQueueRef}><div className="queue-heading"><div><h3>Response queue</h3><span aria-live="polite">{staffQueueCount} matching reports · sorted by escalation and newest</span></div><span className="queue-shortcuts" aria-label="Keyboard shortcuts"><kbd>J</kbd><kbd>K</kbd> move <kbd>A</kbd> assign <kbd>/</kbd> search</span></div>
              {loadingReports || (staffQueueLoading && staffQueue.length === 0) ? <ReportListSkeleton rows={5} variant="queue" /> : staffQueueCount === 0 ? <div className="staff-empty"><EmptyIllustration variant={activeFilterCount > 0 ? 'search' : 'queue'} /><span>No reports match {activeFilterCount > 0 ? 'these filters' : 'this queue'}.</span>{activeFilterCount > 0 && <button className="text-button" type="button" onClick={() => { setStaffFilters(defaultReportFilters); setStaffQueueOffset(0) }}>Clear all filters</button>}</div> : <>
                {staffQueue.map((report) => {
                  const deadline = reportDeadline(report, responseSettings, clock)
                  return <button key={report.id} data-flip-id={report.id} type="button" className={`queue-item queue-urgency-${report.urgency.toLowerCase()} ${staffReportId === report.id ? 'selected' : ''}`} onClick={() => setStaffReportId(report.id)}><span className="queue-item-title">{report.title}</span><span className="queue-item-meta">{formatReportId(report.id)} · {report.category}{report.barangay ? ` · ${report.barangay}` : ''} · {formatCreatedAt(report.createdAt)}</span><span className="queue-item-tags"><span key={report.status} className={`status-pill status-${report.status.toLowerCase().replace(/ /g, '-')} ${changedStatuses.has(report.id) ? 'pill-changed' : ''}`}><i />{report.status}</span>{needsImmediateAttention(report) && <span className="urgency-pill escalated-pill"><AlertTriangle size={11} />Escalated</span>}{report.urgency === 'High' && <span className="urgency-pill"><AlertTriangle size={11} />Urgent</span>}{deadline && <span className={`deadline-chip ${deadline.overdue ? 'is-overdue' : deadline.soon ? 'is-soon' : ''}`}><Clock3 size={11} />{deadline.label}</span>}</span></button>
                })}
                {staffQueueCount > staffQueue.length && <button className="show-more-button" type="button" disabled={staffQueueLoading} onClick={() => setStaffQueueOffset(staffQueue.length)}>{staffQueueLoading ? 'Loading more…' : `Show next ${Math.min(STAFF_PAGE_SIZE, staffQueueCount - staffQueue.length)} (${staffQueueCount - staffQueue.length} remaining)`}</button>}
              </>}
            </div>
            <div className="staff-detail" key={staffReport?.id ?? 'none'}>{staffReport ? <>
              <button className="staff-back-button" type="button" onClick={() => setStaffReportId(undefined)}><ArrowLeft size={14} /> Back to queue</button>
              <div className="staff-report-heading"><div><span className="report-id">{staffReport.id.slice(0, 8).toUpperCase()}</span><h3>{staffReport.title}</h3><span className="section-caption">{staffReport.category} · {staffReport.urgency} urgency · {formatCreatedAt(staffReport.createdAt)}</span><span className="reporter-line"><UserRound size={12} /> Reported by {staffReport.reporterName || 'Community resident'}</span></div><MapPin size={18} /></div>
              <p className="staff-description">{staffReport.description}</p>
              <p className="section-caption">Observed {staffReport.observedAt ? new Date(staffReport.observedAt).toLocaleString() : 'at submission'}</p>
              {staffReport.additionalInfo && <p className="workflow-note-text"><strong>Additional information</strong>{staffReport.additionalInfo}</p>}
              <div className="meta-chips"><span className="meta-chip"><MapPin size={12} />{staffReport.barangay ? `Barangay ${staffReport.barangay}` : 'No barangay recorded'}</span></div>
              <ExactLocation label={staffReport.location} coordinates={staffReport.coordinates} />
              {session && (profile?.role === 'admin' || profile?.role === 'responder') && <StaffWorkflowPanel report={staffReport} role={profile.role} userId={session.user.id} staffUsers={staffUsers} teams={teams} allReports={[...reports, ...staffQueue]} originalPhotoUrls={staffPhotoUrls.original} resolutionPhotoUrls={staffPhotoUrls.resolution} events={reportEvents} residentFeedback={staffResolutionFeedback} onSubmit={applyReportUpdate} />}
              {session && profile && (profile.role === 'admin' || profile.role === 'responder') && <ReportConversation key={staffReport.id} reportId={staffReport.id} status={staffReport.status} viewerRole={profile.role} userId={session.user.id} isReporter={false} isOnTask={staffOnTask} onPosted={() => void refreshStaffEvents(staffReport.id)} onActivity={() => void reloadStaffEvents(staffReport.id)} />}
              <ReportTimeline events={reportEvents} />
            </> : staffReportId ? <div className="staff-detail-empty" role="status"><button className="staff-back-button" type="button" onClick={() => setStaffReportId(undefined)}><ArrowLeft size={14} /> Back to queue</button><ClipboardCheck size={25} />{staffReportDetailFailedId === staffReportId ? <><strong>This report could not be loaded</strong><span>It may have been removed, or the connection dropped. Try again from the queue.</span></> : <><strong>Loading report…</strong><span>Getting the latest assignment and task details.</span></>}</div> : <div className="staff-detail-empty"><ClipboardCheck size={25} /><strong>Select a report</strong><span>Choose an open report to review and update its response.</span></div>}</div>
          </div>
        </section>}

        {!staffMode && <section className="monitoring-layout">
          <div className="map-column">
            <div className="section-toolbar">
              <div><h2>{t('incidentMap')}</h2><span className="section-caption">{nearbyOnly ? `${nearbyReports.length} reports within 1 km` : `${visibleReports.length} reports · filters apply to map markers`}</span></div>
              <button className={`map-location-button ${nearbyOnly ? 'active' : ''}`} type="button" onClick={() => nearbyOnly ? setNearbyOnly(false) : requestLocation(true)} title={nearbyOnly ? 'Show all filtered reports' : 'Show reports near my current location'}><Crosshair size={15} /><span>{nearbyOnly ? 'All reports' : 'Nearby'}</span></button>
            </div>
            <div className="map-frame">
              <Suspense fallback={<MapSkeleton />}>
                {districtOutline ? <ReportMap
                  theme={theme}
                  outline={districtOutline}
                  reports={mapPins}
                  categoryColors={categoryColors}
                  categoryOrder={categoryOptions}
                  selectedId={selectedId}
                  focus={mapCenter === districtCenter ? undefined : mapCenter}
                  fitBarangay={mapBarangayFit}
                  heatCells={heatmapEnabled ? heatmapCells : NO_HEAT_CELLS}
                  gpsLocation={gpsLocation}
                  compact={mobileMap}
                  onSelect={setSelectedId}
                  onDiscuss={setCommunityDiscussionId}
                /> : <MapSkeleton />}
              </Suspense>
              {mobileMap && selectedReport && <div className="map-sheet" role="dialog" aria-label="Selected report" key={selectedReport.id}>
                <button className="icon-button map-sheet-close" type="button" onClick={() => setSelectedId(undefined)} aria-label="Close report preview"><X size={15} /></button>
                <span className="map-sheet-meta">{selectedReport.category} · {selectedReport.status}</span>
                <strong>{selectedReport.title}</strong>
                <small><MapPin size={12} />{placeLabel(selectedReport)} · {formatCreatedAt(selectedReport.createdAt)}</small>
                <p>{selectedReport.description}</p>
                <button className="secondary-button map-sheet-discussion" type="button" onClick={() => setCommunityDiscussionId(selectedReport.id)}><MessageSquare size={14} /> Comments and discussion</button>
              </div>}
              <div className="map-search-wrap">
                <label className="map-search-box"><Search size={15} /><input value={mapSearchQuery} onChange={(event) => { setMapSearchQuery(event.target.value); setMapSearchMessage('') }} placeholder="Search a place or address" aria-label="Search the map by place or address" autoComplete="off" />{mapSearchBusy && <span className="search-spinner" aria-label="Searching places" />}{mapSearchQuery && <button type="button" onClick={() => { setMapSearchQuery(''); setMapSearchSuggestions([]); setMapSearchMessage('') }} aria-label="Clear map search"><X size={13} /></button>}</label>
                {mapSearchSuggestions.length > 0 && <ul className="map-search-suggestions" role="listbox" aria-label="Map place suggestions">{mapSearchSuggestions.map((suggestion) => <li key={`${suggestion.label}-${suggestion.coordinates.join(',')}`}><button type="button" role="option" onClick={() => { setMapCenter(suggestion.coordinates); setMapSearchQuery(''); setMapSearchSuggestions([]); setMapSearchMessage(''); setNearbyOnly(false); setSelectedId(undefined) }}><MapPin size={14} /><span>{suggestion.label}<small>{suggestion.coordinates[0].toFixed(5)}, {suggestion.coordinates[1].toFixed(5)}</small></span></button></li>)}</ul>}
                {!mapSearchBusy && mapSearchMessage && <p className="map-search-feedback map-search-error" role="status">{mapSearchMessage}</p>}
                {!mapSearchBusy && mapSearchQuery.trim().length >= 3 && !mapSearchMessage && mapSearchSuggestions.length === 0 && <p className="map-search-feedback" role="status">No matching places found.</p>}
              </div>
              <div className="map-actions">
                <button className={`map-action-button ${heatmapEnabled ? 'active' : ''}`} type="button" aria-pressed={heatmapEnabled} onClick={() => setHeatmapEnabled((enabled) => !enabled)}><Flame size={14} />{heatmapEnabled ? 'Hide density' : 'Heatmap'}</button>
                                <button className="map-action-button" type="button" onClick={() => requestLocation(false)} title="Center the map on my current location"><LocateFixed size={14} />My location</button>
                              </div>
              <div className="map-label"><MapPin size={13} /> District 5, Quezon City</div>
              <div className={`map-legend ${legendOpen ? 'is-open' : 'is-collapsed'}`}><button className="legend-toggle" type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen((open) => !open)}><Layers size={13} />Legend<ChevronDown size={12} className="legend-chevron" /></button>{legendOpen && <div className="legend-body"><span className="legend-title">CATEGORY</span>{categoryOptions.map((category) => <button type="button" className={`legend-item legend-filter ${categoryFilter === category ? 'is-active' : ''}`} key={category} aria-pressed={categoryFilter === category} title={categoryFilter === category ? 'Show all categories' : `Show only ${category}`} onClick={() => setCategoryFilter(categoryFilter === category ? 'All categories' : category)}><i style={{ backgroundColor: categoryColors[category] }} />{category}</button>)}<span className="legend-divider" /><span className="legend-title">STATUS DOT</span><span className="legend-item"><i className="status-dot" data-status="submitted" />Submitted</span><span className="legend-item"><i className="status-dot" data-status="under-review" />Under review</span><span className="legend-item"><i className="status-dot" data-status="in-progress" />In progress</span><span className="legend-item"><i className="status-dot" data-status="resolved" />Resolved</span><span className="legend-divider" /><span className="legend-title">PINS</span><span className="legend-item"><i className="legend-urgent-ring" />High urgency</span><span className="legend-item"><i className="legend-muted-pin" />Resolved, smaller</span><span className="legend-item" title="The ring shows the mix of categories in the group"><i className="legend-cluster-ring" />Grouped reports</span><span className="legend-divider" /><span className="legend-title">REPORT DENSITY</span><span className="legend-item"><i className="density-low" />Low · 1–2</span><span className="legend-item"><i className="density-moderate" />Moderate · 3–5</span><span className="legend-item"><i className="density-high" />High · 6+</span></div>}</div>
              {mapLocationError && <p className="map-search-feedback map-search-error map-location-error" role="status">{mapLocationError}</p>}
            </div>
            <div className="map-footnote"><MapPin size={13} /><p>Pins are approximate locations <i>·</i> Status dots match report progress <i>·</i> Select a pin for details <i>·</i> Boundaries are indicative</p></div>
          </div>

          <aside className="reports-panel" aria-label="Recent environmental reports">
            <div className="reports-heading">
              <div><div className="reports-title-line"><h2>{nearbyOnly ? t('nearbyReports') : t('recentReports')}</h2><span className="count-badge">{mapReports.length}</span></div><span className="section-caption">{[nearbyOnly ? 'Within 1 km' : null, categoryFilter, statusFilter, barangayFilter ? `Barangay ${barangayFilter}` : null].filter(Boolean).join(' · ')}</span></div>
              <label className="feed-sort"><span>Sort</span><span className="select-wrap"><select value={newestFirst ? 'newest' : 'oldest'} onChange={(event) => setNewestFirst(event.target.value === 'newest')} aria-label="Sort reports"><option value="newest">Newest</option><option value="oldest">Oldest</option></select><ChevronDown size={13} /></span></label>
            </div>
            <div className="report-controls">
              <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchReports')} aria-label={t('searchReports')} />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}</label>
              <div className="filter-row">
                <label className="select-wrap"><span className="sr-only">Filter by category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={13} /></label>
                <label className="select-wrap"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.filter((status) => status !== 'Duplicate').map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label>
              </div>
              <div className="filter-row" style={{ gridTemplateColumns: '1fr' }}>
                <label className="select-wrap"><span className="sr-only">Filter by barangay</span><select value={barangayFilter} onChange={(event) => chooseBarangayFilter(event.target.value)}><option value="">All barangays</option>{DISTRICT_5_BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}</select><ChevronDown size={13} /></label>
              </div>
            </div>
            {selectedOwnReport && <div className="own-report-card"><span><strong>{selectedOwnReport.title}</strong><small>Your report · {selectedOwnReport.status}</small></span><button className="secondary-button" type="button" onClick={() => setFollowUpId(selectedOwnReport.id)}><MessageSquare size={14} /> Updates and replies</button><ExactLocation label={selectedOwnReport.location} coordinates={selectedOwnReport.coordinates} /></div>}
            {selectedOwnReport && session && ['Resolved', 'Closed'].includes(selectedOwnReport.status) && <section className="own-report-feedback"><div><strong>Was this issue fixed?</strong><small>Let the response team know if it is still happening.</small></div>{selectedOwnFeedback && <p className="workflow-hint">Your last response: {selectedOwnFeedback.feedback === 'fixed' ? 'You confirmed it was fixed.' : 'You said it still needs attention.'}</p>}<label className="field-label">Optional note<textarea rows={2} maxLength={500} value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} placeholder="Add a short update for the response team" /></label><div className="workflow-actions"><button className="primary-button" type="button" disabled={feedbackBusy} onClick={() => void submitResidentFeedback('fixed')}>{feedbackBusy ? 'Saving…' : 'It was fixed'}</button><button className="secondary-button" type="button" disabled={feedbackBusy} onClick={() => void submitResidentFeedback('still_there')}>Still needs attention</button></div></section>}
            <div className="report-list feed-card-list" ref={reportListRef}>
              {loadingReports ? <ReportListSkeleton /> : orderedReports.length === 0 ? <div className="empty-state"><EmptyIllustration variant={isSupabaseConfigured && !isOnline ? 'offline' : 'search'} /><strong>{isSupabaseConfigured && !isOnline ? 'You are offline' : 'No matching reports'}</strong><span>{isSupabaseConfigured && !isOnline ? 'Reconnect to load the latest reports.' : 'Try changing a filter or search term.'}</span></div> : orderedReports.map((report) => <ReportFeedCard
                key={report.id}
                report={report}
                icon={categoryIcon(report.category)}
                color={categoryColors[report.category]}
                place={placeLabel(report)}
                createdLabel={formatCreatedAt(report.createdAt)}
                selected={selectedId === report.id}
                statusChanged={changedStatuses.has(report.id)}
                engagement={reportEngagement.get(report.id)}
                canConfirm={isSupabaseConfigured && isOnline && isOpenStatus(report.status) && !(session && report.reporterId === session.user.id)}
                confirmState={confirmedReportIds.has(report.id) ? 'done' : confirmingReportId === report.id ? 'busy' : 'idle'}
                onToggle={() => setSelectedId((current) => current === report.id ? undefined : report.id)}
                onConfirm={() => void confirmStillThere(report)}
                userId={session?.user.id}
                canComment={profile?.role === 'resident'}
                onDiscuss={() => setCommunityDiscussionId(report.id)}
                onSignIn={() => openAuthModal('sign-in')}
                onCommentPosted={() => setReportEngagement((current) => {
                  const counts = current.get(report.id)
                  return counts ? new Map(current).set(report.id, { ...counts, comments: counts.comments + 1 }) : current
                })}
              />)}
            </div>
            <div className="panel-footer">{isSupabaseConfigured ? <span><span className={`live-dot ${isOnline ? '' : 'is-offline'}`} /> Live community feed</span> : <span>Sample reports on this device</span>}<button type="button" onClick={() => { setCategoryFilter('All categories'); setStatusFilter('All statuses'); setSearch(''); if (barangayFilter) chooseBarangayFilter('') }}>{t('resetFilters')}</button></div>
          </aside>
        </section>}

        <footer className="page-footer"><span className="footer-brand"><span className="brand-mark"><Leaf size={13} strokeWidth={2.2} /></span>GreenPulse</span><span>Community environment monitoring <i>·</i> District 5, Quezon City</span></footer>
      </main>

      {!staffMode && <button className={`report-fab ${fabVisible ? 'is-visible' : ''}`} type="button" onClick={startReport} aria-label="New report" aria-hidden={!fabVisible} tabIndex={fabVisible ? 0 : -1}><Plus size={19} />Report</button>}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      {celebrating && <SuccessBurst message="Report submitted. Thank you!" onDone={() => setCelebrating(false)} />}
      <ViewLoader visible={viewTransition.loaderVisible} label={activeViewLabel} dark={theme === 'dark'} />

      {followUpReport && session && <ResidentReportModal report={followUpReport} userId={session.user.id} onClose={() => setFollowUpId(undefined)} onPosted={() => void deliverNotificationEmails(followUpReport.id, session.access_token)} />}

      {reporting && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReporting(false) }}>
        <section className="report-modal report-form-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><div><p className="eyebrow">COMMUNITY REPORT</p><h2 id="modal-title">{t('reportFormTitle')}</h2><p>{isSupabaseConfigured && !session ? t('guestFormSubtitle') : t('reportFormSubtitle')}</p></div><button className="icon-button" type="button" onClick={() => setReporting(false)} aria-label="Close report form"><X size={19} /></button></div>
          <form className="report-form" ref={reportFormRef} onSubmit={submitReport}>
            <label className="honeypot-field" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <div className="report-form-grid">
              <div className="report-form-col">
                <section className="form-section">
                   <h3 className="form-section-title"><span>1</span>{t('whatHappened')}</h3>
                   <label className="field-label">{t('reportTitle')}<input name="title" maxLength={90} placeholder="e.g. Waste piling up beside the road" required /></label>
                   <fieldset className="choice-group"><legend>{t('category')}</legend><div className="choice-chips">{intakeCategories.map((category) => { const CategoryIcon = categoryIcon(category); return <label className="choice-chip" key={category}><input type="radio" name="category" value={category} checked={reportCategory === category} onChange={() => setReportCategory(category)} /><span><CategoryIcon size={15} />{category}</span></label> })}</div></fieldset>
                   <label className="field-label">{t('specificIssue')}<input name="issue_type" maxLength={80} placeholder="e.g. Clogged drainage" required /></label>
                   <fieldset className="choice-group"><legend>{t('urgency')}</legend><div className="segmented">{['Low', 'Medium', 'High'].map((urgency) => <label className={`segment segment-${urgency.toLowerCase()}`} key={urgency}><input type="radio" name="urgency" value={urgency} defaultChecked={urgency === 'Medium'} /><span>{urgency}</span></label>)}</div></fieldset>
                   <label className="field-label">{t('whenObserved')}<input name="observed_at" type="datetime-local" value={observedAt} max={toLocalDateTimeInput(new Date())} onChange={(event) => setObservedAt(event.target.value)} required /></label>
                   <label className="field-label">{t('whatHappening')}<textarea name="description" rows={4} maxLength={500} placeholder={t('descriptionHint')} required /></label>
                   <label className="field-label">{t('additionalInformation')} <span className="field-hint">{t('optionalContext')}</span><textarea name="additional_info" rows={3} maxLength={2000} placeholder="Add access details, recurring patterns, or other useful context." /></label>
                </section>
              </div>
              <div className="report-form-col">
                <section className="form-section">
                  <h3 className="form-section-title"><span>2</span>{t('where')}</h3>
            <div className="location-autocomplete-wrap">
              <label className="field-label" htmlFor="report-location">{t('location')} <span className="field-hint">Search a street, landmark, barangay, or facility</span></label>
              <div className={`location-autocomplete ${locationConfirmed ? 'location-confirmed' : ''}`}>
                <MapPin size={16} />
                <input id="report-location" name="location" value={locationQuery} onChange={(event) => { geocodeRequest.current += 1; setLocationQuery(event.target.value); setLocationConfirmed(false); setLocationSearchMessage('') }} placeholder="e.g. Batasan Hills, Quezon City" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={locationSuggestions.length > 0} aria-controls="location-suggestions" />
                {locationSearchBusy && <span className="search-spinner" aria-label="Searching locations" />}
                {locationConfirmed && <Check size={16} className="location-check" />}
              </div>
              {locationSuggestions.length > 0 && <ul className="location-suggestions" id="location-suggestions" role="listbox" aria-label="Suggested places">{locationSuggestions.map((suggestion) => {
                const suggestionBarangay = barangayBoundaries ? findBarangayAt(suggestion.coordinates, barangayBoundaries, boundaryTolerance) ?? null : undefined
                return <li key={`${suggestion.label}-${suggestion.coordinates.join(',')}`}><button type="button" role="option" aria-selected="false" disabled={suggestionBarangay === null} title={suggestionBarangay === null ? 'Outside District 5. Reports are accepted for District 5 only.' : undefined} onClick={() => { geocodeRequest.current += 1; setLocation(suggestion.coordinates); setMapCenter(suggestion.coordinates); setLocationQuery(suggestion.label); fillBarangayFromLabel(suggestion.label); setLocationConfirmed(true); setLocationSuggestions([]); setLocationSearchMessage(''); setFormError('') }}><MapPin size={15} /><span>{suggestion.label}<small>{suggestionBarangay ? <b className="suggestion-barangay">Brgy. {suggestionBarangay}</b> : suggestionBarangay === null ? <b className="suggestion-barangay is-outside">Outside District 5</b> : null}{suggestion.coordinates[0].toFixed(5)}, {suggestion.coordinates[1].toFixed(5)}</small></span></button></li>
              })}</ul>}
              {locationSearchBusy && <p className="location-feedback" role="status">Searching nearby places…</p>}
              {!locationSearchBusy && locationSearchMessage && <p className="location-feedback location-search-error" role="status">{locationSearchMessage}</p>}
              {!locationSearchBusy && locationQuery.trim().length >= 3 && !locationConfirmed && !locationSearchMessage && locationSuggestions.length === 0 && <p className="location-feedback" role="status">No matches yet. Try another nearby name or use your current location.</p>}
              <p className="location-attribution">Place suggestions by Photon · OpenStreetMap contributors</p>
            </div>
            <div className="barangay-field">
              <label className="field-label">{t('barangay')}<select name="barangay" className={barangayAutofill === 'matched' ? 'is-autofilled' : undefined} value={reportBarangay} onChange={(event) => { changeReportBarangay(event.target.value) }} aria-describedby={barangayAutofill ? 'barangay-autofill-note' : undefined} required><option value="">Select barangay</option>{DISTRICT_5_BARANGAYS.map((barangay) => <option key={barangay}>{barangay}</option>)}</select></label>
              {barangayAutofill === 'matched' && <p className="barangay-autofill-note" id="barangay-autofill-note" role="status" key={reportBarangay}><Check size={13} />Filled in from the pinned location. Change it if it looks wrong.</p>}
              {barangayAutofill === 'outside' && <p className="barangay-autofill-note is-outside" id="barangay-autofill-note" role="status"><AlertTriangle size={13} />This spot is outside District 5, so the report cannot be submitted. Move the pin inside the district.</p>}
            </div>
            <div className="location-picker-heading"><MapPin size={15} /><strong>{t('pinExactSpot')}</strong><span>{t('clickDragMap')}</span><button className="text-button" type="button" onClick={() => requestLocation()}><Crosshair size={14} /> {t('useMyLocation')}</button></div>
            <div className="report-location-map">
              <Suspense fallback={<MapSkeleton />}>
                {districtOutline ? <LocationPickerMap
                  theme={theme}
                  outline={districtOutline}
                  location={location}
                  color={categoryColors[reportCategory]}
                  icon={categoryIcon(reportCategory)}
                  fitBarangay={reportBarangayFit}
                  onSelect={selectMapLocation}
                /> : <MapSkeleton />}
              </Suspense>
            </div>
            <div className="location-field"><div className="location-copy"><MapPin size={16} /><span><strong>{locationConfirmed ? 'Selected location' : 'Choose a map location'}</strong><small>{locationConfirmed ? `${location[0].toFixed(5)}, ${location[1].toFixed(5)}` : 'Pick a search suggestion or use GPS'}</small></span></div></div>
            {isSupabaseConfigured && <p className="privacy-note">{session ? 'Your account identity stays private. The public map shows approximate report locations.' : 'Your email and phone number stay private. The public map shows approximate report locations.'}</p>}
            {nearbySuggestions.length > 0 && <section className="nearby-suggestions" aria-label="Similar open reports nearby"><div><strong>Similar open reports nearby</strong><p>If one is the same issue, follow it or confirm it is still present.</p></div>{nearbySuggestions.map((candidate) => <article className="nearby-suggestion" key={candidate.id}><span><strong>{candidate.title}</strong><small>{candidate.status} · {candidate.barangay ? `Barangay ${candidate.barangay} · ` : ''}{Math.round(distanceInMeters(candidate.coordinates, location))} m away</small></span><div className="nearby-suggestion-actions"><button className="text-button" type="button" onClick={() => { setReporting(false); setStaffMode(false); setSelectedId(candidate.id); setMapCenter(candidate.coordinates) }}>View</button>{session && <button className="text-button" type="button" onClick={() => void toggleReportFollow(candidate)}>{followedReportIds.includes(candidate.id) ? 'Unfollow' : 'Follow'}</button>}<button className="text-button" type="button" onClick={() => void confirmNearbyReport(candidate)}>Confirm still present</button></div></article>)}</section>}
                </section>
                <section className="form-section">
            <h3 className="form-section-title"><span>3</span>{t('photo')}</h3>
            <div className="photo-row"><label className="upload-button"><Camera size={15} />{photoFiles.length ? `${t('addPhotos')} (${photoFiles.length}/${MAX_REPORT_PHOTOS})` : t('addPhotos')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void handlePhotos(event.target.files); event.currentTarget.value = '' }} /></label><span>Optional · up to {MAX_REPORT_PHOTOS} JPEG, PNG, or WebP photos · max {isSupabaseConfigured && !session ? '2.5 MB each for guests' : '5 MB each'} · compressed before upload</span></div>
            {photoPreviews.length > 0 && <div className="report-photo-previews">{photoPreviews.map((preview, index) => <div className="report-photo-preview" key={`${index}-${preview.slice(-24)}`}><img className="photo-preview" src={preview} alt={`Selected report attachment ${index + 1}`} /><button className="remove-photo" type="button" aria-label={`Remove report photo ${index + 1}`} onClick={() => { setPhotoPreviews((current) => current.filter((_, photoIndex) => photoIndex !== index)); setPhotoFiles((current) => current.filter((_, photoIndex) => photoIndex !== index)) }}><X size={13} /> Remove</button></div>)}</div>}
                </section>
                {isSupabaseConfigured && !session && <section className="form-section guest-contact-section"><h3 className="form-section-title"><span>4</span>{t('followUp')}</h3><p className="workflow-hint">Provide at least one contact for security and follow-up. Your email and phone number stay private.</p><label className="field-label">Email address<input name="contact_email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" /></label><label className="field-label">Mobile number<input name="contact_phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={24} placeholder="09XXXXXXXXX or +639XXXXXXXXX" /></label><p className="workflow-hint">You can still track the report with the code shown after submission.</p></section>}
              </div>
            </div>
            <label className="privacy-consent"><input type="checkbox" name="public_display_consent" required /><span>{t('publicConsent')} <small>{t('retentionNotice')}</small></span></label>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            {formNotice && <p className="workflow-success" role="status">{formNotice}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => void saveReportDraft(false)}>Save draft</button>{isSupabaseConfigured && !isOnline && <button className="secondary-button" type="button" onClick={() => void saveReportDraft(true)}>Queue for upload</button>}<button className="secondary-button" type="button" onClick={() => setReporting(false)}>{t('cancel')}</button><button className="primary-button" type="submit" disabled={loadingReports || guestSubmitting || (isSupabaseConfigured && !isOnline)}>{guestSubmitting ? 'Submitting…' : loadingReports ? 'Connecting…' : <><Check size={16} /> {t('submitReport')}</>}</button></div>
          </form>
        </section>
      </div>}

      {guestTrackingOpen && <GuestReportTracking initialToken={guestTrackingToken} emailSent={guestTrackingEmailSent} onClose={() => { setGuestTrackingOpen(false); setGuestTrackingToken(undefined); setGuestTrackingEmailSent(false) }} />}

      {communityDiscussionReport && <CommunityReportDiscussion report={communityDiscussionReport} userId={session?.user.id} canComment={profile?.role === 'resident'} onSignIn={() => openAuthModal('sign-in')} onClose={() => setCommunityDiscussionId(undefined)} />}

      {responderModalOpen && profile?.role === 'admin' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !responderBusy) setResponderModalOpen(false) }}>
        <section className="report-modal responder-modal" role="dialog" aria-modal="true" aria-labelledby="responder-title">
          <div className="modal-header"><div><p className="eyebrow">STAFF DESK</p><h2 id="responder-title">Add a responder</h2><p>Send an invitation email so they can finish setting up their account.</p></div><button className="icon-button" type="button" onClick={() => setResponderModalOpen(false)} disabled={responderBusy} aria-label="Close add responder form"><X size={19} /></button></div>
          <form onSubmit={(event) => void createResponder(event)}>
            <label className="field-label">Responder name<input name="display_name" autoComplete="name" minLength={2} maxLength={80} required /></label>
            <label className="field-label">Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            {responderMessage && <p className="form-error" role="alert">{responderMessage}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setResponderModalOpen(false)} disabled={responderBusy}>Cancel</button><button className="primary-button" type="submit" disabled={responderBusy}>{responderBusy ? 'Sending invitation…' : <><Plus size={15} /> Invite responder</>}</button></div>
          </form>
        </section>
      </div>}

      {teamModalOpen && profile?.role === 'admin' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTeamModalOpen(false) }}>
        <section className="report-modal team-modal" role="dialog" aria-modal="true" aria-labelledby="team-title">
          <div className="modal-header"><div><p className="eyebrow">STAFF DESK</p><h2 id="team-title">Manage teams</h2><p>Group responders so reports can be assigned to a crew.</p></div><button className="icon-button" type="button" onClick={() => setTeamModalOpen(false)} aria-label="Close team manager"><X size={19} /></button></div>
          <form className="team-create" onSubmit={createTeam}><label className="field-label">New team name<input name="team_name" maxLength={60} placeholder="e.g. Drainage crew" required /></label><button className="primary-button" type="submit" disabled={teamBusy}><Plus size={15} /> Add team</button></form>
          {teamMessage && <p className="form-error" role="alert">{teamMessage}</p>}
          <div className="team-list">{teams.length === 0 ? <p className="staff-empty">No teams yet. Create one above.</p> : teams.map((team) => <div className="team-card" key={team.id}>
            <div className="team-card-heading"><strong><Users size={15} />{team.name}</strong><span>{team.memberIds.length} {team.memberIds.length === 1 ? 'member' : 'members'}</span><button className="icon-button" type="button" disabled={teamBusy} onClick={() => void deleteTeam(team)} aria-label={`Delete ${team.name}`}><Trash2 size={15} /></button></div>
            <div className="choice-chips">{staffUsers.map((user) => <label className="choice-chip" key={user.id}><input type="checkbox" checked={team.memberIds.includes(user.id)} disabled={teamBusy} onChange={() => void toggleTeamMember(team, user.id)} /><span>{user.display_name || 'Unnamed staff member'}</span></label>)}</div>
          </div>)}</div>
        </section>
      </div>}

      {authModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuthModal() }}>
        <section className="report-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="modal-header"><div><p className="eyebrow">DISTRICT 5 COMMUNITY ACCOUNT</p><h2 id="auth-title">{phoneOtpPending ? 'Verify your phone number' : confirmationEmail && authModal === 'sign-up' ? 'Confirm your email' : authModal === 'sign-up' ? 'Create your account' : 'Welcome back'}</h2><p>{phoneOtpPending ? `Enter the SMS code sent to ${phoneOtpNumber}.` : confirmationEmail && authModal === 'sign-up' ? `Follow the confirmation link sent to ${confirmationEmail}.` : authModal === 'sign-up' ? 'Choose email confirmation or verify by phone OTP.' : 'Sign in with your email and password or request a phone OTP. You can also submit a guest report with a tracking code.'}</p></div><button className="icon-button" type="button" onClick={closeAuthModal} aria-label="Close sign-in form"><X size={19} /></button></div>
          <form onSubmit={submitAuth}>
            {phoneOtpPending ? <>
              <label className="field-label">SMS verification code<input name="phone_otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus /></label>
              <button className="resend-confirmation" type="button" onClick={() => void resendPhoneOtp()} disabled={authBusy}>Resend phone code</button>
              <button className="resend-confirmation" type="button" onClick={() => { resetPhoneOtp(); setAuthMessage('') }} disabled={authBusy}>Use a different phone number</button>
            </> : confirmationEmail && authModal === 'sign-up' ? <p className="workflow-hint">Your account will be ready after you confirm the email link.</p> : authModal === 'sign-up' ? <>
              <label className="field-label">Verification method<select value={signupVerificationMethod} onChange={(event) => setSignupVerificationMethod(event.target.value as 'email' | 'phone')}><option value="email">Email confirmation</option><option value="phone">Phone OTP</option></select></label>
              <label className="field-label">Name<input name="display_name" autoComplete="name" maxLength={80} required /></label>
              {signupVerificationMethod === 'email' ? <>
                <label className="field-label">Email<input name="email" type="email" autoComplete="email" defaultValue={confirmationEmail} required /></label>
                <label className="field-label">Password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              </> : <label className="field-label">Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={24} placeholder="09XXXXXXXXX or +639XXXXXXXXX" required /></label>}
            </> : signInMethod === 'password' ? <>
              <label className="field-label">Sign-in method<select value={signInMethod} onChange={(event) => setSignInMethod(event.target.value as 'password' | 'phone-otp')}><option value="password">Email and password</option><option value="phone-otp">Phone OTP</option></select></label>
              <label className="field-label">Email<input name="email" type="email" autoComplete="email" required /></label>
              <label className="field-label">Password<input name="password" type="password" autoComplete="current-password" required /></label>
            </> : <>
              <label className="field-label">Sign-in method<select value={signInMethod} onChange={(event) => setSignInMethod(event.target.value as 'password' | 'phone-otp')}><option value="password">Email and password</option><option value="phone-otp">Phone OTP</option></select></label>
              <label className="field-label">Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={24} placeholder="09XXXXXXXXX or +639XXXXXXXXX" required /></label>
            </>}
            {authMessage && <p className={authMessageSuccess ? 'auth-success' : 'form-error'} role={authMessageSuccess ? 'status' : 'alert'}>{authMessage}</p>}
            {confirmationEmail && authModal === 'sign-up' && <button className="resend-confirmation" type="button" onClick={() => void resendConfirmation()} disabled={authBusy}>Resend confirmation email</button>}
            <div className="modal-actions"><button className="text-button" type="button" onClick={() => openAuthModal(authModal === 'sign-up' ? 'sign-in' : 'sign-up')} disabled={authBusy}>{authModal === 'sign-up' ? 'Already have an account? Sign in' : 'Create an account'}</button><button className="primary-button" type="submit" disabled={authBusy || Boolean(confirmationEmail)}>{authBusy ? 'Please wait…' : phoneOtpPending ? 'Verify code' : confirmationEmail ? 'Waiting for email confirmation' : authModal === 'sign-up' ? signupVerificationMethod === 'phone' ? 'Send phone OTP' : 'Create account' : signInMethod === 'phone-otp' ? 'Send phone OTP' : 'Sign in'}</button></div>
          </form>
        </section>
      </div>}

      {profileModal && profile && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileModal(false) }}>
        <section className="report-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
          <div className="modal-header"><div><p className="eyebrow">YOUR COMMUNITY ACCOUNT</p><h2 id="profile-title">Profile settings</h2><p>Keep your name and account image up to date.</p></div><button className="icon-button" type="button" onClick={() => setProfileModal(false)} aria-label="Close profile settings"><X size={19} /></button></div>
          <form onSubmit={saveProfile}>
            <div className="profile-editor"><div className="profile-avatar-large">{profileAvatarPreview || profileAvatarUrl ? <img src={profileAvatarPreview || profileAvatarUrl} alt="Profile preview" /> : <UserRound size={27} />}</div><label className="upload-button"><Upload size={15} /> Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleProfileAvatar(event.target.files?.[0])} /></label><span className="profile-upload-note">JPEG, PNG, or WebP · max 3 MB</span></div>
            <label className="field-label">Display name<input name="display_name" defaultValue={profile.display_name} maxLength={80} required /></label>
            <label className="field-label">{session?.user.email ? 'Email' : 'Phone number'}<input value={session?.user.email ?? session?.user.phone ?? ''} readOnly /></label>
            <div className="field-label">Role<span><span className={`profile-role-badge role-${profile.role}`}>{getRoleLabel(profile.role)}</span></span></div>
            {session?.user.email ? <label className="notification-email-setting"><input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications !== false} /><span><strong>Email notifications</strong><small>Send report updates to this account's email address.</small></span></label> : <p className="workflow-hint">Report updates will appear in the in-app inbox for this phone-based account.</p>}
            <div className="modal-actions"><button className="text-button profile-signout" type="button" onClick={() => { setProfileModal(false); void supabase?.auth.signOut() }}><LogOut size={14} /> Sign out</button><button className="secondary-button" type="button" onClick={() => setProfileModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={profileSaving}>{profileSaving ? 'Saving…' : <><Check size={16} /> Save profile</>}</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}

export default App
