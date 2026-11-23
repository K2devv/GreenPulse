import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Ban,
  BarChart3,
  CalendarDays,
  Camera,
  Check,
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
  MapIcon,
  MapPin,
  MessageSquare,
  Moon,
  Plus,
  SlidersHorizontal,
  Trash2,
  Users,
  Search,
  ShieldCheck,
  Globe,
  Lock,
  Siren,
  Sparkles,
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
import { topBackLayer, topEscapeLayer, type BackLayer } from './lib/native-back'
import { attachReporterNames, getAuthRedirectUrl, isSupabaseConfigured, reporterIdsOf, sessionTokens, supabase, toReport, type EnvironmentalFollowUp, type Profile, type ReportEvent, type ReportResolutionFeedback, type ReportRow, type Team } from './lib/supabase'
import { apiUrl } from './lib/api-url'
import { fetchWithSession } from './lib/session-fetch'
import { THEME_CHOICE_KEY, oppositeTheme, readThemeChoice, resolveTheme, type Theme } from './lib/theme-preference'
import { normalizePhoneNumber } from './lib/phone-number'
import { CONFIRMATION_RESEND_COOLDOWN_SECONDS, describeAuthError, isExistingAccountSignUp, secondsUntilResend } from './lib/auth-errors'
import { StaffWorkflowPanel } from './StaffWorkflowPanel'
import { AnimatedNumber } from './AnimatedNumber'
import { HeroPanel, type HeroStat } from './HeroPanel'
import { ReportPhotoStrip } from './ReportPhotoStrip'
import { closePhotoViewer } from './PhotoViewer'
import { PhotoIssueSuggestion } from './PhotoIssueSuggestion'
import { usePhotoIssueSuggestion } from './usePhotoIssueSuggestion'
import { photoCheckerSupported, usePhotoChecker } from './usePhotoChecker'
import type { PhotoIssueGuess } from './lib/photo-issue-classifier'
import { isReportCategory, issueTypesByCategory } from './lib/report-categories'
import { SIGNED_PHOTO_RENEW_MS, SIGNED_PHOTO_SECONDS, canViewReportPhotos, knownPhotoPaths, photoPathList, photoSharing, toPhotoVisibility, type PhotoVisibility, type ReportPhotos } from './lib/report-photo-access'
import { StatReportsModal, type StatReportRow } from './StatReportsModal'
import { AdminBarChart, AdminTrendChart, ChartEmpty, ChartSkeleton } from './AdminCharts'
import { AdminSectionNav, adminTabId, type AdminSection } from './AdminSectionNav'
import { FilterChips } from './FilterChips'
import { ToastViewport, toneForMessage, useToasts } from './Toaster'
import { ViewLoader, useViewTransition } from './ViewLoader'
import { motionIsReduced, useDisplayPrefs } from './display-prefs'
import { deliveryNeverAttempted, groupDeliveryHistory, type DeliveryRecord } from './lib/delivery-history'
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
import { REPORT_LOAD_LIMIT, REPORT_PAGE_SIZE, applyRowChanges, loadInPages, mergeNewestPage } from './lib/report-paging'
import { ALL_STATUSES, STATUS_GROUP_FILTERS, communityStatusFilter, matchesHeroTile, matchesStatusFilter, staffQuickFilter, type HeroTile, type StaffQuickFilter } from './lib/report-quick-filters'
import { ExactLocation } from './ExactLocation'
import { formatPlaceLabel } from './lib/place-label'
import { DISTRICT_5_BARANGAYS, NO_BARANGAY, UNASSIGNED, clearFilter, countActiveFilters, defaultReportFilters, describeActiveFilters, detectBarangay, formatReportId, loadSavedFilters, saveFilters, type ReportFilters } from './lib/report-filters'
import { BOUNDARY_EDGE_TOLERANCE_METERS, findBarangayAt, loadBundledBarangayBoundaries, toBarangayBoundaries, type BarangayBoundary } from './lib/barangay-lookup'
import { barangayPinPoint } from './lib/barangay-center'
import { canHandleEscalation, type SlaEscalation } from './lib/sla-escalations'
import { EscalationList } from './EscalationList'
import { EmailCodeStep, type CodeStatus } from './EmailCodeStep'
import { NotificationBell, NotificationPanel } from './NotificationPanel'
import { LanguageToggle } from './LanguageToggle'
import { useDialogFocusTrap } from './useDialogFocusTrap'
import { useNotificationInbox } from './useNotificationInbox'
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
import { buildReportAnalytics, unrecordedBarangayLast } from './lib/report-analytics'
import { findRecurringHotspots, type RecurringHotspot } from './lib/report-recurrence'
import { guestSameAreaLimitMessage, reachedSameAreaLimit, sameAreaLimitMessage } from './lib/report-area-limit'
import { GuestReportTracking } from './GuestReportTracking'
import { MAX_REPORT_PHOTOS, prepareReportPhoto, reportPhotoProblem, type PreparedReportPhoto } from './lib/report-photos'
import { translate } from './lib/ui-copy'
import { deleteLocalReportDraft, getLocalReportDraft, saveLocalReportDraft, type LocalReportDraft } from './lib/report-drafts'
import { t, tn, dateLocale, useLanguage } from './lib/i18n'
import { translateServerText } from './lib/server-text'

// The map library is large, so both maps load after the rest of the app.
const ReportMap = lazy(() => import('./ReportMap'))
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))
const loadReportStart = () => import('./ReportStart')
const ReportStart = lazy(loadReportStart)

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
  /** Who can see the reporter's photos: only staff and the reporter, or everyone once verified. */
  photoVisibility?: PhotoVisibility
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
type DeliveryFailure = DeliveryRecord
type PilotOutcomes = { totalReports: number; reopenedReports: number; byBarangay: Array<{ label: string; reports: number; resolved: number; reopened: number; averageFirstResponseMs: number | null; averageResolutionMs: number | null }> }

function getRoleLabel(role: Profile['role']) {
  return role === 'resident' ? t('User') : role === 'responder' ? t('Responder') : t('Admin')
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
/** The sign-in dialog's screens. 'reset' asks for an email to send a reset code to; 'new-password' follows a verified reset. */
type AuthMode = 'sign-in' | 'sign-up' | 'reset' | 'new-password'
/** What an emailed 6-digit code confirms: a new account, or a password reset. */
type CodePurpose = 'signup' | 'recovery'
const STAFF_PAGE_SIZE = 50
/** Reports shown at a time in the phone report list. */
const FEED_PHONE_PAGE = 8
const statusOptions: Status[] = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed', 'Duplicate']
function placeLabel(report: Pick<Report, 'barangay' | 'location'>) {
  return report.barangay ? t('Barangay {barangay}', { barangay: report.barangay }) : report.location || 'District 5, Quezon City'
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
  if (!response.ok) throw new Error(t('Place search is temporarily unavailable.'))
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
  if (!response.ok) throw new Error(t('Address lookup is temporarily unavailable.'))
  const result = await response.json() as {
    features?: Array<{ properties?: Record<string, string | undefined> }>
  }
  const properties = result.features?.[0]?.properties
  const label = formatPlaceLabel(properties)
  if (!label) throw new Error(t('No nearby address could be found.'))
  return label
}

/** The delivery button names what it will do: send pending emails, retry failed ones, or both. */
function emailRetryLabel(items: readonly DeliveryRecord[]) {
  const failed = items.some((item) => item.status === 'Failed')
  const pending = items.some((item) => item.status === 'Pending')
  return failed && pending ? t('Retry failed and send pending emails') : pending ? t('Send pending emails') : t('Retry failed emails')
}

/** Date and time for the email delivery list, e.g. "Nov 17, 2:52 AM". */
function formatDeliveryTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(dateLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatCreatedAt(value: string) {
  const created = new Date(value)
  if (Number.isNaN(created.getTime())) return value
  const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60_000))
  if (minutes < 1) return t('Just now')
  if (minutes < 60) return t('{minutes} min ago', { minutes })
  if (minutes < 1440) return t('{hours} hr ago', { hours: Math.floor(minutes / 60) })
  return created.toLocaleDateString(dateLocale())
}

function toLocalDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Scrolls a section into view under the sticky top bar and rings it once, so the effect of a shortcut is easy to find. */
function revealSection(selector: string) {
  // Two frames: the section may only be mounted by the state change that came with the click.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(selector)
    if (!target) return
    const reduced = motionIsReduced()
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    if (!reduced && typeof target.animate === 'function') {
      target.animate([
        { outline: '2px solid rgba(79, 154, 104, .75)', outlineOffset: '0px' },
        { outline: '2px solid rgba(79, 154, 104, 0)', outlineOffset: '7px' },
      ], { duration: 1100, delay: 250, easing: 'ease-out' })
    }
  }))
}

/** Calls a GreenPulse API route with a current sign-in token (renewed first if it expired). */
function callApi(path: string, init: RequestInit) {
  return sessionTokens ? fetchWithSession(apiUrl(path), init, sessionTokens) : fetch(apiUrl(path), init)
}

async function deliverNotificationEmails(reportId: string) {
  try {
    await callApi('/api/send-notification-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  return <div className={`skeleton-list skeleton-${variant}`} role="status" aria-busy="true"><span className="sr-only">{t('Loading reports…')}</span>
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
  // Switching language re-renders the whole app; memoized text below lists it as a dependency.
  const language = useLanguage()
  const [reports, setReports] = useState<Report[]>(isSupabaseConfigured ? [] : readSavedReports)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [loadingReports, setLoadingReports] = useState(isSupabaseConfigured)
  const [reportsSyncing, setReportsSyncing] = useState(false)
  const [reportsFailed, setReportsFailed] = useState(false)
  // True when there are more reports than the app keeps loaded (REPORT_LOAD_LIMIT), so only the newest are shown.
  const [reportsTruncated, setReportsTruncated] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [reportRefreshToken, setReportRefreshToken] = useState(0)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [backendError, setBackendError] = useState('')
  const [authModal, setAuthModal] = useState<AuthMode | null>(null)
  const [profileModal, setProfileModal] = useState(false)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('')
  const [profileAvatarFile, setProfileAvatarFile] = useState<File>()
  const [profileSaving, setProfileSaving] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageSuccess, setAuthMessageSuccess] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  // A sign-up or password reset waiting for its emailed code. `sentAt` and `cooldownSeconds` drive the resend countdown.
  const [pendingConfirmation, setPendingConfirmation] = useState<{ email: string; sentAt: number; cooldownSeconds: number; purpose: CodePurpose } | null>(null)
  const [resendClock, setResendClock] = useState(() => Date.now())
  // The 6-digit code step: what the boxes show, the latest error, and a counter that clears and shakes them.
  const [codeStatus, setCodeStatus] = useState<CodeStatus>('waiting')
  const [codeError, setCodeError] = useState('')
  const [codeErrorNonce, setCodeErrorNonce] = useState(0)
  const [codeNotice, setCodeNotice] = useState('')
  const [codeResendBusy, setCodeResendBusy] = useState(false)
  const [authSuggestion, setAuthSuggestion] = useState<'sign-in' | 'sign-up' | null>(null)
  const [authPrefill, setAuthPrefill] = useState<{ email?: string; displayName?: string }>({})
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordMessageSuccess, setPasswordMessageSuccess] = useState(false)

  // Resend countdown: ticks once a second until the cooldown ends; cleared when the modal closes or on unmount.
  useEffect(() => {
    if (!pendingConfirmation) return
    const endsAt = pendingConfirmation.sentAt + pendingConfirmation.cooldownSeconds * 1000
    if (Date.now() >= endsAt) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      setResendClock(now)
      if (now >= endsAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [pendingConfirmation])

  // A sign-in from elsewhere (another tab, or a link in an older email) closes the modal. While a code is
  // being checked or celebrated, the code step closes the modal itself after its success animation.
  useEffect(() => {
    if (session && codeStatus !== 'verifying' && codeStatus !== 'success') closeAuthModal()
  }, [session])

  useEffect(() => {
    if (!profileModal) setPasswordMessage('')
  }, [profileModal])

  const [staffMode, setStaffMode] = useState(false)
  const [staffDashboardOpen, setStaffDashboardOpen] = useState(true)
  const [adminSection, setAdminSection] = useState(ADMIN_SECTIONS[0].id)
  // A new dashboard tab opens at its top. Without this, a tab picked while scrolled down the
  // previous one would start under the sticky tab bar, hiding its title and controls.
  useEffect(() => {
    const panel = document.getElementById(adminSection)
    const nav = document.querySelector<HTMLElement>('.admin-section-nav')
    if (!panel || !nav) return
    // Where the bar's bottom edge sits while it is stuck. The panel's position comes from the layout
    // (offsetTop), not getBoundingClientRect, because panels slide in with a transform; and the
    // target is in page coordinates, so it stays right when a shorter tab pulls the scroll back.
    const stuckBottom = (parseFloat(getComputedStyle(nav).top) || 0) + nav.getBoundingClientRect().height
    let pageTop = 0
    for (let element: HTMLElement | null = panel; element; element = element.offsetParent as HTMLElement | null) pageTop += element.offsetTop
    if (pageTop - window.scrollY < stuckBottom) window.scrollTo({ top: pageTop - stuckBottom - 12, behavior: motionIsReduced() ? 'instant' : 'smooth' })
  }, [adminSection])
  const [staffFilters, setStaffFilters] = useState<ReportFilters>(defaultReportFilters)
  const [staffFiltersOpen, setStaffFiltersOpen] = useState(false)
  const [staffQueue, setStaffQueue] = useState<Report[]>([])
  const [staffQueueCount, setStaffQueueCount] = useState(0)
  const [staffQueueLoading, setStaffQueueLoading] = useState(false)
  const [staffQueueOffset, setStaffQueueOffset] = useState(0)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  // The team whose card is asking "Delete this team?".
  const [teamDeleteId, setTeamDeleteId] = useState<string>()
  useEffect(() => { if (!teamModalOpen) setTeamDeleteId(undefined) }, [teamModalOpen])
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
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES)
  useDialogFocusTrap()
  // The report start screen is fetched once the page is idle, so it opens with its full animation
  // instead of a loading placeholder, without adding to the first load.
  useEffect(() => {
    const preload = () => { void loadReportStart().catch(() => undefined) }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preload, { timeout: 4000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(preload, 2000)
    return () => window.clearTimeout(timer)
  }, [])
  // The hero stat tile whose reports are open in a dialog.
  const [statTile, setStatTile] = useState<HeroTile>()
  // The community and staff views have different tiles, so a dialog does not outlive a switch between them.
  useEffect(() => setStatTile(undefined), [staffMode])
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
  // A new report starts on the photo-or-form screen; a restored draft opens the form directly.
  const [reportStep, setReportStep] = useState<'start' | 'form'>('form')
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
  const [photoVisibility, setPhotoVisibility] = useState<PhotoVisibility>('private')
  // Photo suggestions: set once the reporter picks a category themself, which a suggestion never overrides.
  const categoryChosen = useRef(false)
  // The text a photo suggestion last wrote into each field, so a later suggestion replaces only its own text.
  const photoAutofill = useRef<{ issueType?: string; title?: string }>({})
  const [photoFilled, setPhotoFilled] = useState<{ category: boolean; issueType: boolean; title: boolean }>({ category: false, issueType: false, title: false })
  const [photoGuessApplied, setPhotoGuessApplied] = useState(false)
  // A guess from the photo start screen, filled in once the form has opened.
  const pendingPhotoGuess = useRef<PhotoIssueGuess | undefined>(undefined)
  const reportTitleRef = useRef<HTMLInputElement>(null)
  const issueTypeRef = useRef<HTMLInputElement>(null)
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
  // Where the pin was placed when the reporter picked a barangay by hand; the note stays until the pin moves.
  const [barangayPin, setBarangayPin] = useState<{ barangay: string; point: [number, number] }>()
  const pinAtBarangayCenter = Boolean(barangayPin && barangayPin.point[0] === location[0] && barangayPin.point[1] === location[1])
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
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts()
  const reportInboxError = useCallback((message: string) => pushToast({ tone: 'error', message }), [pushToast])
  const inbox = useNotificationInbox({ userId: session?.user.id, refreshToken: reportRefreshToken, onError: reportInboxError })
  const refreshInbox = inbox.refresh
  // Opening the inbox re-reads it, so it is current even if a live update was missed.
  useEffect(() => { if (notificationPanelOpen) void refreshInbox() }, [notificationPanelOpen, refreshInbox])
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
          pushToast({ tone: 'info', message: staffReportId ? t('Only admins can assign responders on this report.') : t('Select a report first to assign it.') })
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
      setBackendError(t('Could not connect to Supabase authentication.'))
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
      // Opened from a password reset link (the default Supabase template): ask for the new password.
      if (event === 'PASSWORD_RECOVERY') {
        setPendingConfirmation(null)
        setAuthMessage('')
        setAuthSuggestion(null)
        setAuthModal('new-password')
      }
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
    // The browser draws a dropdown's open list from the page's root color scheme, not the dropdown's
    // own, so the root follows the app's theme too. Otherwise a dark-mode list opens light.
    document.documentElement.style.colorScheme = theme
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
          setLocationSearchMessage(error instanceof Error ? error.message : t('Place search is temporarily unavailable.'))
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
          setMapSearchMessage(error instanceof Error ? error.message : t('Place search is temporarily unavailable.'))
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
      if (error) setBackendError(t('Could not load your account profile: {message}', { message: error.message }))
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

  // Reports load a page at a time (see lib/report-paging). A full sync pages through everything up
  // to REPORT_LOAD_LIMIT; a light refresh re-reads only the newest page and the reports Realtime
  // said had changed, and lays them over the rows already held here.
  const reportSync = useRef({ context: '', fullDue: true, lastToken: -1, community: [] as ReportRow[], private: [] as ReportRow[] })
  const lightRefreshTokens = useRef(new Set<number>())
  const changedReportIds = useRef(new Set<string>())
  const requestLightRefresh = useCallback(() => setReportRefreshToken((current) => {
    lightRefreshTokens.current.add(current + 1)
    return current + 1
  }), [])
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true
    const sync = reportSync.current
    const userId = session?.user.id
    const loadAllForAdminOverview = profile?.role === 'admin' && staffMode && staffDashboardOpen
    // Any refresh request since the last run that was not a light one makes this a full sync.
    for (let token = sync.lastToken + 1; token <= reportRefreshToken; token += 1) {
      if (!lightRefreshTokens.current.has(token)) sync.fullDue = true
    }
    sync.lastToken = reportRefreshToken
    lightRefreshTokens.current.clear()
    const context = `${userId ?? ''}|${loadAllForAdminOverview}`
    if (sync.context !== context) {
      sync.context = context
      sync.private = []
      sync.fullDue = true
    }
    const full = sync.fullDue || !reportsLoaded.current
    if (!reportsLoaded.current) setLoadingReports(true)
    setReportsSyncing(true)

    const communityPage = (from: number, to: number) => client.from('community_reports').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    const privateRows = () => {
      const query = client.from('reports').select('*')
      return loadAllForAdminOverview ? query : query.eq('reporter_id', userId ?? '')
    }
    const privatePage = (from: number, to: number) => privateRows().order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    // Reporter names come from profiles, which residents can read only for themselves and staff
    // for everyone. A failed lookup just leaves the names out.
    const withReporterNames = async (rows: ReportRow[]) => {
      let named = rows
      const reporterIds = reporterIdsOf(rows)
      for (let start = 0; start < reporterIds.length; start += 100) {
        const { data: profileRows } = await client.from('profiles').select('id, display_name').in('id', reporterIds.slice(start, start + 100))
        if (profileRows) named = attachReporterNames(named, profileRows)
      }
      return named
    }
    const showHeldReports = () => {
      const combined = new Map<string, Report>()
      for (const row of sync.community) combined.set(row.id, toReport(row))
      for (const row of sync.private) combined.set(row.id, toReport(row))
      setReports([...combined.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    }
    const failCommunityLoad = (message: string) => {
      setBackendError(t('Could not load community reports: {message}', { message }))
      setLoadingReports(false)
      setReportsSyncing(false)
      setReportsFailed(true)
    }

    async function loadReports() {
      let privateError = ''
      if (full) {
        const community = await loadInPages<ReportRow>(communityPage, {
          isCancelled: () => !active,
          // On the very first load the newest page is shown as soon as it arrives.
          onPage: (rows) => {
            if (!active || reportsLoaded.current) return
            sync.community = rows
            showHeldReports()
            setLoadingReports(false)
          },
        })
        if (!active) return
        if (community.error) return failCommunityLoad(community.error)
        sync.community = community.rows
        let truncated = community.truncated
        if (userId) {
          const mine = await loadInPages<ReportRow>(privatePage, { isCancelled: () => !active })
          if (!active) return
          if (mine.error) privateError = t('Could not load your reports: {message}', { message: mine.error })
          else {
            const named = await withReporterNames(mine.rows)
            if (!active) return
            sync.private = named
            truncated = truncated || mine.truncated
          }
        } else sync.private = []
        // A failed private load is retried in full on the next refresh.
        sync.fullDue = Boolean(privateError)
        setReportsTruncated(truncated)
      } else {
        const ids = [...changedReportIds.current].slice(0, 100)
        const [page, changed] = await Promise.all([
          communityPage(0, REPORT_PAGE_SIZE - 1),
          ids.length ? client.from('community_reports').select('*').in('id', ids) : undefined,
        ])
        if (!active) return
        const communityError = page.error ?? changed?.error
        if (communityError) return failCommunityLoad(communityError.message)
        sync.community = applyRowChanges(mergeNewestPage(sync.community, (page.data ?? []) as ReportRow[]), ids, (changed?.data ?? []) as ReportRow[])
        if (userId) {
          const [minePage, mineChanged] = await Promise.all([
            privatePage(0, REPORT_PAGE_SIZE - 1),
            ids.length ? privateRows().in('id', ids) : undefined,
          ])
          if (!active) return
          const mineError = minePage.error ?? mineChanged?.error
          if (mineError) privateError = t('Could not load your reports: {message}', { message: mineError.message })
          else {
            const [namedPage, namedChanged] = await Promise.all([withReporterNames((minePage.data ?? []) as ReportRow[]), withReporterNames((mineChanged?.data ?? []) as ReportRow[])])
            if (!active) return
            sync.private = applyRowChanges(mergeNewestPage(sync.private, namedPage), ids, namedChanged)
          }
        } else sync.private = []
        ids.forEach((id) => changedReportIds.current.delete(id))
      }
      showHeldReports()
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (payload) => {
        // The changed report is re-read by id, so it stays current even when it is older than the newest page.
        const changedId = (payload.new as { id?: unknown }).id ?? (payload.old as { id?: unknown }).id
        if (typeof changedId === 'string') changedReportIds.current.add(changedId)
        if (changedReportIds.current.size > 100) {
          changedReportIds.current.clear()
          setReportRefreshToken((current) => current + 1)
        } else requestLightRefresh()
      })
      .subscribe()
    // The minute-by-minute fallback re-reads the newest page; every tenth one is a full sync.
    let ticks = 0
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      ticks += 1
      if (ticks % 10 === 0) setReportRefreshToken((current) => current + 1)
      else requestLightRefresh()
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
  }, [requestLightRefresh])

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
        setResponseSettingsMessage(t('Apply the response-settings migration to manage deadlines here.'))
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
          setSlaEscalationMessage(t('Apply the escalation migration to enable shared escalation tracking.'))
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
          setEmailRetryMessage(t('Apply the notification-delivery migration to view failed email attempts.'))
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
        setPilotOutcomesMessage(t('Apply the pilot-outcomes migration to view reopened-report and barangay results.'))
        return
      }
      const outcomes = data as PilotOutcomes
      setPilotOutcomes({ ...outcomes, byBarangay: unrecordedBarangayLast(outcomes.byBarangay ?? []) })
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
          setBackendError(t('Could not load the staff queue: {message}', { message: error.message }))
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
    try {
      if (!isSupabaseConfigured) localStorage.setItem('greenpulse-reports', JSON.stringify(reports.filter((report) => report.id.startsWith('GP-NEW'))))
    } catch {
      setFormError(t('Your browser storage is full. The new report will remain available until you close this page.'))
    }
  }, [reports])

  useEffect(() => {
    let active = true
    void getLocalReportDraft().then((draft) => {
      if (!active || !draft) return
      setSavedDraftAvailable(true)
      if (draft.queued) setQueuedUploadId(draft.submissionId)
    }).catch(() => {
      if (active) setDraftMessage(t('This browser could not read the saved report draft.'))
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
      setDraftMessage(t('Connection restored. Your queued report will be sent shortly.'))
      window.setTimeout(() => {
        setFormStartedAt(Date.now() - 3_000)
        form.requestSubmit()
      }, 3_000)
    }
  }, [pendingDraftRestore, reporting])

  const visibleReports = useMemo(() => reports.filter((report) => {
    const matchesCategory = categoryFilter === 'All categories' || report.category === categoryFilter
    const matchesStatus = matchesStatusFilter(report.status, statusFilter)
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
  }), [mapReports, pinPositions, language])
  const activeFilterCount = countActiveFilters(staffFilters)
  const staffFilterChips = describeActiveFilters(staffFilters, { people: new Map(staffUsers.map((user) => [user.id, user.display_name || t('Unnamed staff member')])), teams: new Map(teams.map((team) => [team.id, team.name])) })
  // `language` is listed because the analytics include translated weekday and fallback labels.
  const adminAnalytics = useMemo(() => buildReportAnalytics(reports), [reports, language])
  const responseMetrics = useMemo(() => buildResponseTimeMetrics(reports), [reports])
  const escalatedOpen = useMemo(() => reports.filter(needsImmediateAttention).length, [reports])
  const reportListRef = useRef<HTMLDivElement>(null)
  const staffQueueRef = useRef<HTMLDivElement>(null)
  const staffGridRef = useRef<HTMLDivElement>(null)
  // A report picked from outside the queue (an escalation, a notification, the command palette)
  // brings the queue and detail into view. On wide screens the detail pane is sticky, so a pick
  // made while scrolled down the queue already shows it; on one-column layouts the detail
  // replaces the queue in place, so the page scrolls back up to it.
  useEffect(() => {
    const grid = staffGridRef.current
    if (!staffReportId || !grid) return
    const top = grid.getBoundingClientRect().top
    const singleColumn = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches
    if (top > window.innerHeight * 0.6 || (singleColumn && top < 0)) grid.scrollIntoView({ block: 'start', behavior: motionIsReduced() ? 'instant' : 'smooth' })
  }, [staffReportId])
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
  // Every report the app has loaded, each once. A report in both lists keeps its staff queue row, which has more fields.
  const allKnownReports = useMemo(() => [...new Map([...reports, ...staffQueue].map((report) => [report.id, report])).values()], [reports, staffQueue])
  // The reporter's photos for a map preview, as short-lived signed links fetched when a preview opens.
  // Private photos go only to staff and the reporter; public ones to everyone once the report is
  // verified (see lib/report-photo-access).
  const photoContext = useRef({ reports: allKnownReports, userId: session?.user.id, role: profile?.role })
  photoContext.current = { reports: allKnownReports, userId: session?.user.id, role: profile?.role }
  // One request per report: a second caller (or React's development double effect) shares it, and
  // the signed links are reused until shortly before they expire. A failed request is not kept.
  const photoRequests = useRef(new Map<string, { photos: Promise<ReportPhotos>; renewAt: number; key: string }>())
  useEffect(() => { photoRequests.current.clear() }, [session?.user.id, profile?.role])
  const loadReportPhotos = useCallback((reportId: string): Promise<ReportPhotos> => {
    const { reports: known, userId, role } = photoContext.current
    const report = known.find((item) => item.id === reportId)
    const none: ReportPhotos = { urls: [], sharing: report ? photoSharing(report) : 'private' }
    // Demo mode keeps a report's first photo on this device.
    if (!supabase) return Promise.resolve(report?.image ? { urls: [report.image], sharing: photoSharing(report) } : none)
    if (!canViewReportPhotos({ userId, role }, report ?? {})) return Promise.resolve(none)
    // A change of status or visibility (a report verified, or its photos made private) fetches again.
    const key = report ? `${report.status}|${report.photoVisibility ?? ''}` : ''
    const cached = photoRequests.current.get(reportId)
    if (cached && cached.key === key && cached.renewAt > Date.now()) return cached.photos
    const client = supabase
    const requests = photoRequests.current
    const photos = (async (): Promise<ReportPhotos> => {
      let paths = report ? knownPhotoPaths(report) : undefined
      let sharing = none.sharing
      if (paths === undefined) {
        const { data, error } = await client.from('reports').select('photo_path, photo_paths, photo_visibility, status').eq('id', reportId).maybeSingle()
        if (error) throw error
        if (!data) return none
        paths = photoPathList(data.photo_paths as string[] | null, data.photo_path as string | null)
        sharing = photoSharing({ photoVisibility: toPhotoVisibility(data.photo_visibility), status: data.status as string })
      }
      if (!paths.length) return { urls: [], sharing }
      const { data: signed, error } = await client.storage.from('report-photos').createSignedUrls(paths, SIGNED_PHOTO_SECONDS)
      if (error) throw error
      return { urls: (signed ?? []).flatMap((entry) => entry.signedUrl ? [entry.signedUrl] : []), sharing }
    })().catch(() => {
      requests.delete(reportId)
      return none
    })
    requests.set(reportId, { photos, renewAt: Date.now() + SIGNED_PHOTO_SECONDS * 1000 - SIGNED_PHOTO_RENEW_MS, key })
    return photos
  }, [])
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
  // On phones the list is part of the page rather than a box that scrolls on its own, so it shows
  // a page of reports at a time.
  const [feedPhoneLimit, setFeedPhoneLimit] = useState(FEED_PHONE_PAGE)
  const feedReports = mobileMap ? orderedReports.slice(0, feedPhoneLimit) : orderedReports
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
  // Escape closes the topmost overlay on desktop (see topEscapeLayer); returns whether it closed one.
  const escapeRef = useRef<() => boolean>(() => false)
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
      'stat-reports': Boolean(statTile),
      'report-start': reporting && reportStep === 'start',
      'report-form': reporting && reportStep === 'form',
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
      'stat-reports': () => setStatTile(undefined),
      'report-start': () => setReporting(false),
      'report-form': () => setReporting(false),
      notifications: () => setNotificationPanelOpen(false),
      'staff-filters': () => setStaffFiltersOpen(false),
      'staff-detail': () => setStaffReportId(undefined),
      'map-sheet': () => setSelectedId(undefined),
      'staff-mode': () => setStaffMode(false),
    }
    nativeBackRef.current = () => {
      // A full-size photo sits above every layer, so back closes it first.
      if (closePhotoViewer()) return
      const layer = topBackLayer(open)
      if (layer) close[layer]()
      else void NativeApp.minimizeApp()
    }
    escapeRef.current = () => {
      const layer = topEscapeLayer(open)
      if (layer) close[layer]()
      return Boolean(layer)
    }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (escapeRef.current()) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = NativeApp.addListener('backButton', () => nativeBackRef.current())
    return () => { void listener.then((handle) => handle.remove()) }
  }, [])

  const selectedOwnReport = selectedReport && session && selectedReport.reporterId === session.user.id ? selectedReport : undefined
  const selectedOwnFeedback = selectedOwnReport ? residentFeedback[selectedOwnReport.id] : undefined
  const staffOnTask = isViewerOnTask(staffReport, session?.user.id, teams)
  const openReports = reports.filter((report) => isOpenStatus(report.status)).length
  const overdueNotifications: InboxNotification[] = profile?.role === 'admin'
    ? reports.filter((report) => isOpenStatus(report.status) && Date.now() - new Date(report.createdAt).getTime() >= (report.urgency === 'High' ? responseSettings.high_urgency_sla_hours : responseSettings.response_sla_hours) * 60 * 60 * 1000)
      .map((report) => ({ id: `overdue:${report.id}`, report_id: report.id, event_type: 'overdue_task', title: t('Overdue task'), message: t('Open report needs attention: {title}.', { title: report.title }), created_at: report.createdAt, read_at: readOverdueIds.includes(report.id) ? report.createdAt : null }))
    : []
  const inboxNotifications: InboxNotification[] = [...inbox.notifications, ...overdueNotifications]
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
  const unreadNotificationCount = inbox.unreadCount + overdueNotifications.filter((notification) => !notification.read_at).length

  function openAuthModal(mode: AuthMode, options: { prefill?: { email?: string; displayName?: string } } = {}) {
    setPendingConfirmation(null)
    setAuthPrefill(options.prefill ?? {})
    setAuthSuggestion(null)
    setAuthModal(mode)
    setAuthMessage('')
    setAuthMessageSuccess(false)
  }

  function closeAuthModal() {
    setAuthModal(null)
    setPendingConfirmation(null)
    setAuthSuggestion(null)
    setAuthMessage('')
    setAuthMessageSuccess(false)
  }

  function showAuthError(error: unknown, context: Parameters<typeof describeAuthError>[1]) {
    const described = describeAuthError(error, context)
    setAuthMessage(described.message)
    setAuthMessageSuccess(false)
    setAuthSuggestion(described.suggestSignUp ? 'sign-up' : described.suggestSignIn ? 'sign-in' : null)
    return described
  }

  function followAuthSuggestion() {
    if (!authModal || !authSuggestion) return
    openAuthModal(authSuggestion, { prefill: authPrefill })
  }

  /** Shows the 6-digit code step. `sentAt` 0 allows an immediate resend. */
  function awaitConfirmation(email: string, sentAt: number, purpose: CodePurpose = 'signup') {
    setResendClock(Date.now())
    setPendingConfirmation({ email, sentAt, cooldownSeconds: CONFIRMATION_RESEND_COOLDOWN_SECONDS, purpose })
    setCodeStatus('waiting')
    setCodeError('')
    setCodeNotice('')
    setAuthMessage('')
    setAuthSuggestion(null)
  }

  /** Emails a new sign-up or reset code and restarts the resend countdown. */
  async function sendConfirmationCode(email: string, purpose: CodePurpose = 'signup') {
    if (!supabase) return
    setCodeResendBusy(true)
    setCodeNotice('')
    try {
      const { error } = purpose === 'recovery'
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl() })
        : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: getAuthRedirectUrl() } })
      const now = Date.now()
      setResendClock(now)
      if (error) {
        const described = describeAuthError(error, { step: 'resend' })
        setCodeError(described.message)
        setCodeStatus('error')
        if (described.retryAfterSeconds) setPendingConfirmation((pending) => pending && { ...pending, sentAt: now, cooldownSeconds: described.retryAfterSeconds ?? CONFIRMATION_RESEND_COOLDOWN_SECONDS })
        return
      }
      setPendingConfirmation((pending) => pending && { ...pending, sentAt: now, cooldownSeconds: CONFIRMATION_RESEND_COOLDOWN_SECONDS })
      setCodeStatus('waiting')
      setCodeError('')
      setCodeNotice(t('A new code is on its way to {email}.', { email }))
    } catch (error) {
      setCodeError(describeAuthError(error, { step: 'resend' }).message)
      setCodeStatus('error')
    } finally {
      setCodeResendBusy(false)
    }
  }

  async function verifyEmailCode(code: string) {
    if (!supabase || !pendingConfirmation) return
    setCodeStatus('verifying')
    setCodeError('')
    setCodeNotice('')
    try {
      const recovery = pendingConfirmation.purpose === 'recovery'
      // A reset code signs the user in, after which they choose a new password.
      const { error } = await supabase.auth.verifyOtp({ email: pendingConfirmation.email, token: code, type: recovery ? 'recovery' : 'email' })
      if (error) {
        setCodeError(describeAuthError(error, { step: 'verify' }).message)
        setCodeStatus('error')
        setCodeErrorNonce((current) => current + 1)
        return
      }
      setCodeStatus('success')
      // Let the success animation play before moving on.
      window.setTimeout(() => {
        if (recovery) {
          setPendingConfirmation(null)
          setAuthMessage('')
          setAuthModal('new-password')
          return
        }
        closeAuthModal()
        pushToast({ message: t('Email confirmed. Welcome to GreenPulse.') })
      }, motionIsReduced() ? 0 : 1100)
    } catch (error) {
      setCodeError(describeAuthError(error, { step: 'verify' }).message)
      setCodeStatus('error')
      setCodeErrorNonce((current) => current + 1)
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !authModal || pendingConfirmation) return
    const mode = authModal
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const displayName = mode === 'sign-up' ? String(formData.get('display_name') ?? '').trim() : undefined
    setAuthPrefill({ email: email || authPrefill.email, displayName: displayName || authPrefill.displayName })
    setAuthMessage('')
    setAuthMessageSuccess(false)
    setAuthSuggestion(null)
    setBackendError('')
    setAuthBusy(true)
    try {
      if (mode === 'reset') {
        // Supabase answers the same whether or not an account uses this address, so the next
        // step never reveals which addresses are registered.
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl() })
        if (error) {
          showAuthError(error, { step: 'resend' })
          return
        }
        awaitConfirmation(email, Date.now(), 'recovery')
        return
      }

      if (mode === 'new-password') {
        const confirmation = String(formData.get('confirm_password') ?? '')
        if (password.length < 8) {
          setAuthMessage(t('Use at least 8 characters.'))
          return
        }
        if (password !== confirmation) {
          setAuthMessage(t('The passwords do not match.'))
          return
        }
        const { error } = await supabase.auth.updateUser({ password })
        if (error) {
          showAuthError(error, { step: 'set-password' })
          return
        }
        closeAuthModal()
        pushToast({ message: t('Password changed. You’re signed in.') })
        return
      }

      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          const described = showAuthError(error, { step: 'sign-in' })
          // An unconfirmed account gets a fresh code and goes straight to the code step.
          if (described.needsConfirmation) {
            awaitConfirmation(email, 0)
            void sendConfirmationCode(email)
          }
          return
        }
        closeAuthModal()
        return
      }

      // The role is never taken from metadata: the database trigger creates every new profile as a resident.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthRedirectUrl(), data: { display_name: displayName ?? '' } },
      })
      if (error) {
        showAuthError(error, { step: 'sign-up' })
        return
      }
      if (isExistingAccountSignUp(data.user)) {
        setAuthMessage(t('An account already uses this email address. Sign in instead.'))
        setAuthSuggestion('sign-in')
        return
      }
      if (data.session) {
        closeAuthModal()
        pushToast({ message: t('Your account is ready. Welcome to GreenPulse.') })
        return
      }
      awaitConfirmation(email, Date.now())
    } catch (error) {
      showAuthError(error, { step: mode === 'reset' ? 'resend' : mode === 'new-password' ? 'set-password' : mode })
    } finally {
      setAuthBusy(false)
    }
  }

  function resendConfirmation() {
    if (!pendingConfirmation || codeResendBusy) return
    if (secondsUntilResend(pendingConfirmation.sentAt, Date.now(), pendingConfirmation.cooldownSeconds) > 0) return
    void sendConfirmationCode(pendingConfirmation.email, pendingConfirmation.purpose)
  }

  const confirmationResendSeconds = pendingConfirmation ? secondsUntilResend(pendingConfirmation.sentAt, resendClock, pendingConfirmation.cooldownSeconds) : 0
  const authTitle = authModal === 'sign-up' ? t('Create your account')
    : authModal === 'reset' ? t('Reset your password')
      : authModal === 'new-password' ? t('Choose a new password')
        : t('Welcome back')
  const authSubtitle = authModal === 'sign-up' ? t('Create an account with your email address and a password.')
    : authModal === 'reset' ? t('Enter the email address you sign in with. We’ll send you a 6-digit code.')
      : authModal === 'new-password' ? t('You’re signed in. Set the password you’ll use next time.')
        : t('Sign in with your email and password. You can also submit a guest report with a tracking code.')

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session?.user.email) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const password = String(formData.get('new_password') ?? '')
    const confirmation = String(formData.get('confirm_password') ?? '')
    setPasswordMessageSuccess(false)
    if (password.length < 8) {
      setPasswordMessage(t('Use at least 8 characters.'))
      return
    }
    if (password !== confirmation) {
      setPasswordMessage(t('The passwords do not match.'))
      return
    }
    setPasswordSaving(true)
    setPasswordMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setPasswordMessage(describeAuthError(error, { step: 'set-password' }).message)
        return
      }
      form.reset()
      setPasswordMessage(t('Password changed. Use it the next time you sign in.'))
      setPasswordMessageSuccess(true)
    } catch (error) {
      setPasswordMessage(describeAuthError(error, { step: 'set-password' }).message)
    } finally {
      setPasswordSaving(false)
    }
  }

  function handleProfileAvatar(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBackendError(t('Choose a JPEG, PNG, or WebP profile image.'))
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setBackendError(t('Choose a profile image under 3 MB.'))
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
      setBackendError(t('Add a display name with at least 2 characters.'))
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
        setBackendError(t('Profile photo upload failed: {message}', { message: uploadError.message }))
        return
      }
    }
    const emailNotifications = formData.get('email_notifications') === 'on'
    const { data, error } = await supabase.from('profiles').update({ display_name: displayName, avatar_path: avatarPath, email_notifications: emailNotifications }).eq('id', session.user.id).select('id, display_name, avatar_path, email_notifications, role').single()
    setProfileSaving(false)
    if (error || !data) {
      setBackendError(error?.message ?? t('Your profile could not be updated.'))
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
        return setFormError(t('Could not unfollow this report. Please try again.'))
      }
      setFormNotice(t('You will no longer receive updates for that report.'))
      return
    }
    setFollowedReportIds((current) => [...current, report.id])
    const { error } = await supabase.from('report_followers').insert({ report_id: report.id, profile_id: session.user.id })
    if (error) {
      if (error.code !== '23505') setFollowedReportIds((current) => current.filter((id) => id !== report.id))
      return setFormError(error.code === '23505' ? t('You are already following this report.') : t('Could not follow this report. Please try again.'))
    }
    setFormNotice(t('You are following this report. Status and assignment changes will appear in your notifications.'))
  }

  async function sendReportConfirmation(reportId: string) {
    const response = await callApi('/api/confirm-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      if (!result.ok) throw new Error(result.error ? t(result.error) : t('Your confirmation could not be saved.'))
      setFormNotice(t('Thanks. The response team has been told that this issue is still present.'))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('Your confirmation could not be saved.'))
    }
  }

  async function confirmStillThere(report: Report) {
    setConfirmingReportId(report.id)
    try {
      const result = await sendReportConfirmation(report.id)
      const alreadyConfirmed = result.status === 409 && /already confirmed/i.test(result.error ?? '')
      if (!result.ok && !alreadyConfirmed) throw new Error(result.error ? t(result.error) : t('Your confirmation could not be saved.'))
      setConfirmedReportIds((current) => new Set(current).add(report.id))
      if (alreadyConfirmed) {
        pushToast({ tone: 'info', message: t('You already confirmed this report.') })
        return
      }
      setReportEngagement((current) => {
        const counts = current.get(report.id)
        if (!counts) return current
        return new Map(current).set(report.id, { ...counts, stillThere: counts.stillThere + 1 })
      })
      pushToast({ message: t('Thanks. The response team now knows this issue is still there.') })
    } catch (error) {
      pushToast({ tone: 'error', message: error instanceof Error ? error.message : t('Your confirmation could not be saved.') })
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
      setBackendError(t('Your resolution feedback could not be saved. Please try again.'))
      return
    }
    const saved = { report_id: selectedOwnReport.id, feedback, message: feedbackNote.trim() || null, updated_at: new Date().toISOString() } as ResidentFeedback
    setResidentFeedback((current) => ({ ...current, [selectedOwnReport.id]: saved }))
    setFeedbackNote('')
    void deliverNotificationEmails(selectedOwnReport.id)
  }

  async function createEnvironmentalFollowup(hotspot: RecurringHotspot) {
    if (!supabase || !session || profile?.role !== 'admin') return
    setFollowupBusy(true)
    setFollowupMessage('')
    const area = hotspot.barangay ? t('Barangay {barangay}', { barangay: hotspot.barangay }) : 'District 5'
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
      setFollowupMessage(t('The inspection task could not be created. Please try again.'))
      return
    }
    setEnvironmentalFollowups((current) => [...current, data as EnvironmentalFollowUp])
    setFollowupMessage(t('Inspection task created. Assign a team and due date below.'))
  }

  async function updateEnvironmentalFollowup(id: string, changes: Partial<EnvironmentalFollowUp>) {
    if (!supabase) return
    setFollowupBusy(true)
    setFollowupMessage('')
    const { data, error } = await supabase.from('environmental_followups').update(changes).eq('id', id).select('*').single()
    setFollowupBusy(false)
    if (error || !data) {
      setFollowupMessage(t('The inspection task could not be updated. Please try again.'))
      return
    }
    setEnvironmentalFollowups((current) => current.map((item) => item.id === id ? data as EnvironmentalFollowUp : item))
  }

  /**
   * Fills the form from a photo suggestion. A category the reporter picked is kept unless they
   * press "Use this instead" (`force`), and text they typed is never replaced.
   */
  function applyPhotoGuess(guess: PhotoIssueGuess, force = false) {
    const { category, issueType } = guess
    if (!category) return
    if (!force && categoryChosen.current && reportCategory !== category) {
      setPhotoGuessApplied(false)
      return
    }
    setReportCategory(category)
    const fill = (input: HTMLInputElement | null, field: 'issueType' | 'title', overwrite: boolean) => {
      if (!input || !issueType) return false
      const current = input.value.trim()
      if (current && current !== photoAutofill.current[field] && !overwrite) return false
      input.value = issueType
      photoAutofill.current[field] = issueType
      return true
    }
    const filledIssueType = fill(issueTypeRef.current, 'issueType', force)
    const filledTitle = fill(reportTitleRef.current, 'title', false)
    setPhotoFilled((current) => ({ category: true, issueType: filledIssueType || current.issueType, title: filledTitle || current.title }))
    setPhotoGuessApplied(true)
  }

  // One photo checker serves the start screen and the form, so the model is loaded only once.
  const photoChecker = usePhotoChecker()
  const photoSuggestion = usePhotoIssueSuggestion(photoChecker, (guess) => applyPhotoGuess(guess))
  const resetPhotoSuggestion = photoSuggestion.reset
  const presentPhotoGuess = photoSuggestion.present

  function clearPhotoAutofill() {
    categoryChosen.current = false
    photoAutofill.current = {}
    setPhotoFilled({ category: false, issueType: false, title: false })
    setPhotoGuessApplied(false)
    resetPhotoSuggestion()
  }

  // Closing the form stops any photo check and frees the model's memory.
  useEffect(() => {
    if (!reporting) resetPhotoSuggestion()
  }, [reporting, resetPhotoSuggestion])

  /** Checks and compresses photos picked on the start screen, like photos added to the form. */
  async function prepareStartPhotos(files: File[]): Promise<PreparedReportPhoto[]> {
    const guest = Boolean(isSupabaseConfigured && !session)
    const problem = reportPhotoProblem(files, 0, guest)
    if (problem) throw new Error(problem)
    return Promise.all(files.map((file) => prepareReportPhoto(file, guest)))
  }

  /** Leaves the start screen for the form, with the photos taken there and what they showed. */
  function continueToReportForm(photos: PreparedReportPhoto[], guess?: PhotoIssueGuess) {
    setPhotoFiles(photos.map((photo) => photo.file))
    setPhotoPreviews(photos.map((photo) => photo.preview))
    pendingPhotoGuess.current = guess
    setReportStep('form')
  }

  // The form's fields exist only once it has opened, so a guess from the start screen is filled in
  // then. It runs once per opening: the guess is cleared as soon as it is used.
  useEffect(() => {
    const guess = pendingPhotoGuess.current
    if (!reporting || reportStep !== 'form' || !guess) return
    pendingPhotoGuess.current = undefined
    applyPhotoGuess(guess, true)
    presentPhotoGuess(guess)
  }, [reporting, reportStep, presentPhotoGuess])

  function startReport() {
    setFormError('')
    setFormNotice('')
    clearPhotoAutofill()
    pendingPhotoGuess.current = undefined
    setReportStep(photoCheckerSupported ? 'start' : 'form')
    setFormStartedAt(Date.now())
    setReportSubmissionId(crypto.randomUUID())
    setReportCategory('Waste')
    setReportBarangay('')
    setBarangayAutofill('')
    setPhotoPreviews([])
    setPhotoFiles([])
    setPhotoVisibility('private')
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
      setFormError(t('Choose a map location before queueing this report for upload.'))
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
        ? t('Saved on this device. GreenPulse will submit it when the connection returns; keep this browser open.')
        : t('Draft saved on this device. You can resume or delete it from this browser.'))
      if (queued) {
        setQueuedUploadId(reportSubmissionId)
        setReporting(false)
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('The draft could not be saved in this browser.'))
    }
  }

  async function restoreReportDraft(automatic = false) {
    try {
      const draft = await getLocalReportDraft()
      if (!draft) {
        setSavedDraftAvailable(false)
        setQueuedUploadId(undefined)
        setDraftMessage(t('No saved draft was found in this browser.'))
        return
      }
      setFormError('')
      setFormNotice('')
      setDraftMessage('')
      setFormStartedAt(Date.now() - 3_000)
      setReportSubmissionId(draft.submissionId)
      clearPhotoAutofill()
      pendingPhotoGuess.current = undefined
      setReportStep('form')
      categoryChosen.current = true
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
      setPhotoVisibility(draft.formValues.photos_public === 'on' ? 'public' : 'private')
      autoSubmitAfterRestore.current = automatic
      setPendingDraftRestore(draft)
      setReporting(true)
    } catch (error) {
      setDraftMessage(error instanceof Error ? error.message : t('The saved draft could not be opened.'))
    }
  }

  async function deleteSavedDraft() {
    try {
      await deleteLocalReportDraft()
      setSavedDraftAvailable(false)
      setQueuedUploadId(undefined)
      setDraftMessage(t('Saved report draft deleted from this browser.'))
    } catch {
      setDraftMessage(t('The saved report draft could not be deleted.'))
    }
  }

  function requestLocation(showNearby = false) {
    const handleLocationError = () => {
      const message = t('Location was not shared. You can still select a point on the map.')
      setMapLocationError(message)
      if (reporting) setFormError(message)
    }

    const handlePosition = (coords: { latitude: number; longitude: number }) => {
      const currentLocation: [number, number] = [coords.latitude, coords.longitude]
      if (!isReportableLocation(currentLocation)) {
        setMapLocationError(t(outsideDistrictMessage))
        if (reporting) setFormError(t(outsideDistrictMessage))
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
          const message = error instanceof Error ? error.message : t('Address lookup is temporarily unavailable.')
          setLocationSearchMessage(t('{message} Coordinates are still selected.', { message }))
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
      const message = t('Location access is not available in this browser.')
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

  /**
   * A barangay picked by hand moves the pin to the middle of that barangay and fits the form map to it,
   * unless the pin already lies inside it. Autofill never calls this.
   */
  function changeReportBarangay(barangay: string) {
    setReportBarangay(barangay)
    setBarangayAutofill('')
    if (!barangay) return
    const pinnedIn = locationConfirmed && barangayBoundaries ? findBarangayAt(location, barangayBoundaries, boundaryTolerance) : undefined
    if (pinnedIn === barangay) return
    setReportBarangayFit((current) => ({ seq: (current?.seq ?? 0) + 1, barangay }))
    const point = barangayBoundaries ? barangayPinPoint(barangayBoundaries, barangay) : undefined
    if (point && selectMapLocation(point)) setBarangayPin({ barangay, point })
  }

  /** Pins a spot chosen on the report-form map. Returns false when the spot is outside District 5. */
  function selectMapLocation(coordinates: [number, number]): boolean {
    const preciseCoordinates: [number, number] = [Number(coordinates[0].toFixed(6)), Number(coordinates[1].toFixed(6))]
    // The map is blank outside the district, so a click or drag there is refused.
    if (!isReportableLocation(preciseCoordinates)) {
      setFormError(t(outsideDistrictMessage))
      return false
    }
    setLocation(preciseCoordinates)
    setMapCenter(preciseCoordinates)
    setLocationConfirmed(true)
    setLocationSuggestions([])
    setFormError('')
    setLocationSearchMessage(t('Finding a nearby address…'))
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
        setLocationSearchMessage(t('{message} Coordinates are still selected.', { message: error instanceof Error ? error.message : t('Address lookup is temporarily unavailable.') }))
      }
    })
    return true
  }

  async function handlePhotos(fileList: FileList | null) {
    const incoming = Array.from(fileList ?? [])
    if (!incoming.length) return
    const guest = Boolean(isSupabaseConfigured && !session)
    const problem = reportPhotoProblem(incoming, photoFiles.length, guest)
    if (problem) {
      setFormError(problem)
      return
    }
    try {
      const prepared = await Promise.all(incoming.map((file) => prepareReportPhoto(file, guest)))
      setPhotoFiles((current) => [...current, ...prepared.map((photo) => photo.file)])
      setPhotoPreviews((current) => [...current, ...prepared.map((photo) => photo.preview)])
      setFormError('')
      // Suggest the issue from the photos, newest first, unless a suggestion was already made.
      if (photoSuggestion.state.status !== 'suggested') void photoSuggestion.analyze([...prepared.map((photo) => photo.file), ...photoFiles])
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('A photo could not be prepared.'))
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    if (isSupabaseConfigured && !isOnline) {
      setFormError(t('You are offline. Reconnect before submitting this report.'))
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
      setFormError(t('Please review and accept the report visibility notice before submitting.'))
      return
    }
    if (!observedValue || Number.isNaN(observedDate.getTime()) || observedDate.getTime() > Date.now() + 5 * 60_000) {
      setFormError(t('Choose a valid observation date and time. It cannot be in the future.'))
      return
    }
    if (additionalInfo.length > 2000) {
      setFormError(t('Additional information must be 2,000 characters or fewer.'))
      return
    }
    if (!locationConfirmed || !locationLabel) {
      setFormError(t('Choose a suggested place or use your current location before submitting.'))
      return
    }
    // Reports are accepted for District 5 only, however the location was chosen (search, GPS,
    // map, or a restored draft). The guest API and the database check this again.
    if (!isReportableLocation(location)) {
      setFormError(t(outsideDistrictSubmitMessage))
      return
    }
    // A reporter may have only a few open reports at one spot (3 signed in, 2 as a guest). This
    // uses the reports already loaded; the database (signed in) and the guest endpoint enforce it
    // for every report. Demo mode has no accounts, so it follows the guest limit.
    const ownReports = session
      ? reports.filter((existing) => existing.reporterId === session.user.id)
      : supabase ? [] : reports.filter((existing) => existing.id.startsWith('GP-NEW-'))
    if (reachedSameAreaLimit(ownReports, location, { guest: !session })) {
      setFormError(t(session ? sameAreaLimitMessage : guestSameAreaLimitMessage))
      return
    }
    if (title.length < 3 || description.length < 8) {
      setFormError(t('Add a title of at least 3 characters and a description of at least 8 characters.'))
      return
    }
    const guestEmail = String(formData.get('contact_email') ?? '').trim()
    const guestPhone = String(formData.get('contact_phone') ?? '').trim()
    if (supabase && !session) {
      if (!guestEmail && !guestPhone) {
        setFormError(t('Enter an email address or phone number so staff can follow up.'))
        return
      }
      if (guestPhone && !normalizePhoneNumber(guestPhone)) {
        setFormError(t('Enter a valid mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.'))
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
          setFormError(t('Photo upload failed: {message}', { message: uploadError.message }))
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
        photo_visibility: photoPaths.length ? photoVisibility : 'private',
        consent_version: '2026-11-v3',
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
        setFormError(error?.code === '22023' ? t(outsideDistrictSubmitMessage) : error?.code === 'GP429' ? t(sameAreaLimitMessage) : error?.message ?? t('The report could not be saved. Please try again.'))
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
        setFormError(t('Guest reporting is temporarily unavailable. Please try again.'))
        return
      }
      let result: { error?: string; reportId?: string; trackingCode?: string; emailSent?: boolean }
      try { result = await response.json() as typeof result } catch {
        setFormError(t('Guest reporting is temporarily unavailable. Please try again.'))
        return
      }
      if (!response.ok || !result.reportId || !result.trackingCode) {
        setFormError(result.error ? t(result.error) : t('The report could not be submitted. Please try again.'))
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
        photoVisibility: 'private',
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
        photoVisibility: photoPreviews.length ? photoVisibility : 'private',
      }
    }
    if (supabase && session) void deliverNotificationEmails(report.id)
    void getLocalReportDraft().then((savedDraft) => {
      if (savedDraft?.submissionId === reportSubmissionId) {
        return deleteLocalReportDraft().then(() => {
          setSavedDraftAvailable(false)
          setQueuedUploadId(undefined)
        })
      }
      if (savedDraft) setDraftMessage(t('A different saved draft is still available in this browser.'))
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
      setTeamMessage(t('Enter a team name of at least 2 characters.'))
      return
    }
    setTeamBusy(true)
    const { error } = await supabase.from('teams').insert({ name })
    setTeamBusy(false)
    if (error) {
      setTeamMessage(error.code === '23505' ? t('A team with that name already exists.') : error.message)
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
      const response = await callApi('/api/admin-create-responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      })
      const result = await response.json() as { displayName?: string; error?: string }
      if (!response.ok) throw new Error(result.error ? t(result.error) : t('The responder invitation could not be sent.'))
      form.reset()
      setResponderModalOpen(false)
      setStaffUsersRefreshToken((current) => current + 1)
      pushToast({ tone: 'success', message: t('{name} was invited as a responder.', { name: result.displayName ?? displayName }) })
    } catch (error) {
      setResponderMessage(error instanceof Error ? error.message : t('The responder invitation could not be sent.'))
    } finally {
      setResponderBusy(false)
    }
  }

  // Asked inline in the team's card (see the team manager) rather than with the browser's confirm box.
  async function deleteTeam(team: Team) {
    if (!supabase) return
    setTeamBusy(true)
    const { error } = await supabase.from('teams').delete().eq('id', team.id)
    setTeamBusy(false)
    setTeamDeleteId(undefined)
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
      setResponseSettingsMessage(t('Choose deadlines from 1 to 720 hours and a second-escalation multiplier from 2 to 10.'))
      return
    }
    setResponseSettingsBusy(true)
    setResponseSettingsMessage('')
    const { error } = await supabase.from('response_settings').update(next).eq('singleton', true)
    setResponseSettingsBusy(false)
    if (error) {
      setResponseSettingsMessage(t('Deadlines could not be saved: {message}', { message: error.message }))
      return
    }
    setResponseSettings(next)
    setResponseSettingsMessage(t('Response deadlines and escalation windows saved.'))
  }

  async function acknowledgeSlaEscalation(item: SlaEscalation) {
    if (!supabase || !session) return
    const acknowledgedAt = new Date().toISOString()
    const { error } = await supabase.from('report_sla_escalations')
      .update({ acknowledged_at: acknowledgedAt, acknowledged_by: session.user.id })
      .eq('report_id', item.report_id).eq('stage', item.stage).is('acknowledged_at', null)
    if (error) {
      setSlaEscalationMessage(t('The escalation could not be acknowledged: {message}', { message: error.message }))
      return
    }
    setSlaEscalations((current) => current.map((entry) => entry.report_id === item.report_id && entry.stage === item.stage
      ? { ...entry, acknowledged_at: acknowledgedAt }
      : entry))
    setSlaEscalationMessage(t('Escalation acknowledged. The acknowledgement is recorded in the staff database.'))
  }

  async function runEscalationCheck() {
    if (!session || profile?.role !== 'admin') return
    setEscalationRunBusy(true)
    setSlaEscalationMessage(t('Checking open reports against configured deadlines…'))
    try {
      const response = await callApi('/api/process-escalations', { method: 'POST' })
      const result = await response.json().catch(() => null) as { error?: string; stagesCreated?: number; emailFailures?: number } | null
      if (!result) throw new Error(t('The escalation service is unavailable. Restart the app server and try again.'))
      if (!response.ok) throw new Error(result.error ? t(result.error) : t('Escalation check failed.'))
      setSlaEscalationMessage(`${tn('Escalation check complete. {count} new escalation recorded.', 'Escalation check complete. {count} new escalations recorded.', result.stagesCreated ?? 0)}${result.emailFailures ? ` ${tn('{count} email batch needs attention.', '{count} email batches need attention.', result.emailFailures)}` : ''}`)
      setReportRefreshToken((current) => current + 1)
    } catch (error) {
      setSlaEscalationMessage(error instanceof Error ? error.message : t('Escalation check failed.'))
    } finally {
      setEscalationRunBusy(false)
    }
  }

  async function retryFailedEmails() {
    const failedRows = failedEmailNotifications.filter((item) => item.status === 'Failed' || item.status === 'Pending')
    if (!supabase || !session || profile?.role !== 'admin' || !failedRows.length) return
    setEmailRetryBusy(true)
    setEmailRetryMessage(t('Sending the waiting email deliveries…'))
    const reportIds = [...new Set(failedRows.map((item) => item.report_id))]
    let failures = 0
    let firstError = ''
    for (const reportId of reportIds) {
      try {
        const response = await callApi('/api/send-notification-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    setEmailRetryMessage(failures ? `${tn('{count} report email batch still needs attention.', '{count} report email batches still need attention.', failures)}${firstError ? ` ${firstError}` : ''}` : t('Pending and failed email deliveries were retried.'))
  }

  function updateStaffFilters(changes: Partial<ReportFilters>) {
    setStaffFilters((current) => ({ ...current, ...changes }))
    setStaffQueueOffset(0)
  }

  async function refreshStaffEvents(reportId: string) {
    if (!supabase || !session) return
    const { data } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', reportId).order('created_at', { ascending: false })
    setReportEvents((data ?? []) as ReportEvent[])
    void deliverNotificationEmails(reportId)
  }

  // Reloads the timeline when a message arrives from someone else. No emails: the sender delivers them.
  async function reloadStaffEvents(reportId: string) {
    if (!supabase || !session) return
    const { data } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', reportId).order('created_at', { ascending: false })
    setReportEvents((data ?? []) as ReportEvent[])
  }

  async function applyReportUpdate(payload: Record<string, unknown>, options?: { resolutionFiles?: File[] }) {
    if (!supabase || !session || !staffReport) return t('You are not signed in.')
    const uploadedPaths: string[] = []
    const update = { ...payload }
    for (const [index, file] of (options?.resolutionFiles ?? []).entries()) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        if (uploadedPaths.length) await supabase.storage.from('report-photos').remove(uploadedPaths)
        return t('After-photos must be JPEG, PNG, or WebP images of 5 MB or less.')
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
      return error?.message ?? t('The update could not be saved.')
    }
    const updatedReport = toReport(data as ReportRow) as Report
    void deliverNotificationEmails(updatedReport.id)
    setSavedStaffReportDetail(updatedReport)
    setReports((current) => current.map((report) => report.id === updatedReport.id ? { ...report, ...updatedReport } : report))
    setStaffQueue((current) => current.map((report) => report.id === updatedReport.id ? { ...report, ...updatedReport } : report))
    const { data: events } = await supabase.from('report_events').select('id, event_type, message, created_at').eq('report_id', updatedReport.id).order('created_at', { ascending: false })
    setReportEvents((events ?? []) as ReportEvent[])
    const restore = previous
    pushToast({
      message: typeof update.status === 'string' ? t('{reportId} marked {status}.', { reportId: formatReportId(updatedReport.id), status: t(update.status) }) : 'assigned_to' in update || 'assigned_team_id' in update ? t('Assignment updated for {reportId}.', { reportId: formatReportId(updatedReport.id) }) : t('{reportId} updated.', { reportId: formatReportId(updatedReport.id) }),
      action: restore ? { label: t('Undo'), run: () => void undoReportUpdate(updatedReport.id, restore) } : undefined,
    })
    return undefined
  }

  async function undoReportUpdate(reportId: string, previous: Record<string, unknown>) {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('reports').update(previous).eq('id', reportId).select('*').single()
    if (error || !data) {
      pushToast({ tone: 'error', message: error ? t('The change could not be undone: {message}', { message: error.message }) : t('The change could not be undone.') })
      return
    }
    const restored = toReport(data as ReportRow) as Report
    setSavedStaffReportDetail(restored)
    setReports((current) => current.map((report) => report.id === restored.id ? { ...report, ...restored } : report))
    setStaffQueue((current) => current.map((report) => report.id === restored.id ? { ...report, ...restored } : report))
    void refreshStaffEvents(restored.id)
    pushToast({ tone: 'info', message: t('Change to {reportId} undone.', { reportId: formatReportId(restored.id) }) })
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

  function markOverdueRead(reportIds: string[]) {
    const nextIds = [...new Set([...readOverdueIds, ...reportIds])]
    setReadOverdueIds(nextIds)
    try {
      localStorage.setItem('greenpulse-read-overdue', JSON.stringify(nextIds))
    } catch {
      setBackendError(t('Overdue alert read state could not be saved in this browser.'))
    }
  }

  function markNotificationRead(notification: InboxNotification) {
    if (typeof notification.id === 'string') markOverdueRead([notification.report_id])
    else if (!notification.read_at) void inbox.markRead([notification.id])
    if (profile?.role === 'admin' || profile?.role === 'responder') {
      setStaffMode(true)
      setStaffDashboardOpen(false)
      setStaffReportId(notification.report_id)
    } else setSelectedId(notification.report_id)
    setNotificationPanelOpen(false)
  }

  function markAllNotificationsRead() {
    void inbox.markRead('all')
    markOverdueRead(overdueNotifications.map((item) => item.report_id))
  }

  const activeViewKey = !staffMode ? 'community' : profile?.role === 'admin' && staffDashboardOpen ? 'dashboard' : 'desk'
  const activeViewLabel = activeViewKey === 'community' ? t('Opening community view…') : activeViewKey === 'dashboard' ? t('Opening admin dashboard…') : t('Opening staff desk…')
  const viewTransition = useViewTransition(activeViewKey, reportsSyncing || staffQueueLoading)
  const syncState = resolveSyncState({ configured: isSupabaseConfigured, online: isOnline, syncing: reportsSyncing || staffQueueLoading, queued: Boolean(queuedUploadId), failed: reportsFailed })
  const urgentOpenCount = reports.filter((report) => report.urgency === 'High' && isOpenStatus(report.status)).length
  const contextTitle = activeViewKey === 'community' ? t('Community map') : activeViewKey === 'dashboard' ? t('Admin dashboard') : t('Staff desk')
  // Phones only (see .report-fab): shown once the hero's button is out of view, and never over the form or the map's report sheet.
  const fabVisible = scrolledPastHero && !reporting && !(mobileMap && selectedId)
  // The hero tiles open a dialog listing the reports they count. From there a report can be opened, or the
  // same set shown in the community list or the staff queue.
  function clearCommunityFilters() {
    setCategoryFilter('All categories')
    setSearch('')
    setNearbyOnly(false)
    if (barangayFilter) chooseBarangayFilter('')
  }
  function showTileReports(tile: HeroTile) {
    setStatTile(undefined)
    if (staffMode) {
      setStaffFilters(staffQuickFilter(tile as StaffQuickFilter))
      setStaffQueueOffset(0)
      setStaffDashboardOpen(false)
      revealSection('.staff-filters')
      return
    }
    setStatusFilter(communityStatusFilter(tile))
    clearCommunityFilters()
    revealSection('.reports-panel')
  }
  function openTileReport(id: string) {
    setStatTile(undefined)
    if (staffMode) {
      setStaffDashboardOpen(false)
      setStaffReportId(id)
      revealSection('.staff-workbench-grid')
      return
    }
    // The list's own filters could hide the report, so they are cleared before it is selected.
    setStatusFilter(ALL_STATUSES)
    clearCommunityFilters()
    setSelectedId(id)
    revealSection(mobileMap ? '.map-frame' : '.reports-panel')
  }
  type HeroTileInfo = Omit<HeroStat, 'value' | 'onSelect'> & { tile: HeroTile; description: string }
  const heroTiles: HeroTileInfo[] = staffMode ? [
    { tile: 'open', icon: ClipboardCheck, tone: 'leaf', label: t('Open queue'), hint: t('See the open queue'), description: t('Reports still waiting on review or a response.') },
    { tile: 'urgent', icon: AlertTriangle, tone: 'coral', label: t('Urgent'), hint: t('See open high-urgency reports'), description: t('Open reports marked high urgency.') },
    { tile: 'in-progress', icon: Clock3, tone: 'sky', label: t('In progress'), hint: t('See reports in progress'), description: t('Reports a responder is working on now.') },
    { tile: 'resolved', icon: Check, tone: 'amber', label: t('Resolved'), hint: t('See resolved reports'), description: t('Reports that have been marked resolved.') },
  ] : [
    { tile: 'open', icon: Leaf, tone: 'leaf', label: t('Open reports'), note: t('needs attention'), hint: t('See open reports'), description: t('Reports that have not been resolved or closed yet.') },
    { tile: 'followed-up', icon: ShieldCheck, tone: 'sky', label: t('Verified or assigned'), note: t('being followed up'), hint: t('See verified and in-progress reports'), description: t('Reports the District 5 desk has verified or is working on.') },
    { tile: 'all', icon: Clock3, tone: 'amber', label: t('Community reports'), note: t('all time'), hint: t('See every report'), description: t('Every report shared with the community so far.') },
  ]
  const heroStats: HeroStat[] = heroTiles.map(({ tile, description: _description, ...stat }) => ({ ...stat, value: reports.filter((report) => matchesHeroTile(report, tile)).length, onSelect: () => setStatTile(tile) }))
  const openTile = heroTiles.find((info) => info.tile === statTile)
  const statTileRows: StatReportRow[] = openTile ? reports.filter((report) => matchesHeroTile(report, openTile.tile)).map((report) => ({
    id: report.id,
    title: report.title,
    category: report.category,
    status: report.status,
    urgent: report.urgency === 'High',
    place: placeLabel(report),
    createdLabel: formatCreatedAt(report.createdAt),
    icon: categoryIcon(report.category),
    color: categoryColors[report.category],
  })) : []
  const isStaffRole = profile?.role === 'admin' || profile?.role === 'responder'
  const paletteCommands: PaletteCommand[] = [
    { id: 'go-community', group: t('Go to'), label: t('Community map'), keywords: 'home public view', run: () => { setStaffMode(false); setStaffDashboardOpen(true) } },
    ...(isStaffRole ? [{ id: 'go-desk', group: t('Go to'), label: t('Staff desk'), keywords: 'queue responder', run: () => { setStaffMode(true); setStaffDashboardOpen(false) } }] : []),
    ...(profile?.role === 'admin' ? [{ id: 'go-dashboard', group: t('Go to'), label: t('Admin dashboard'), keywords: 'analytics overview charts', run: () => { setStaffMode(true); setStaffDashboardOpen(true) } }] : []),
    { id: 'act-report', group: t('Actions'), label: t('Report an issue'), keywords: 'new submit add', run: startReport },
    { id: 'act-location', group: t('Actions'), label: t('Use my location'), keywords: 'gps nearby locate', run: () => { setStaffMode(false); requestLocation(false) } },
    ...(isSupabaseConfigured ? [{ id: 'act-refresh', group: t('Actions'), label: t('Refresh reports'), keywords: 'sync reload', run: () => setReportRefreshToken((current) => current + 1) }] : []),
    { id: 'act-tour', group: t('Actions'), label: t('Show the introduction again'), keywords: 'help how works tour', run: () => { setStaffMode(false); setTourOpen(true); window.scrollTo({ top: 0 }) } },
    { id: 'disp-theme', group: t('Display'), label: theme === 'dark' ? t('Turn dark mode off') : t('Turn dark mode on'), keywords: 'theme light', run: () => toggleTheme() },
    // Every display command reads "Turn … on/off", matching the switches in Display settings.
    { id: 'disp-motion', group: t('Display'), label: displayPrefs.reduceMotion ? t('Turn reduced motion off') : t('Turn reduced motion on'), keywords: 'reduce animation', run: () => updateDisplayPrefs({ reduceMotion: !displayPrefs.reduceMotion }) },
    { id: 'disp-contrast', group: t('Display'), label: displayPrefs.highContrast ? t('Turn high contrast off') : t('Turn high contrast on'), keywords: 'accessibility', run: () => updateDisplayPrefs({ highContrast: !displayPrefs.highContrast }) },
    ...(isStaffRole ? [{ id: 'disp-compact', group: t('Display'), label: displayPrefs.compact ? t('Turn compact lists off') : t('Turn compact lists on'), keywords: 'density rows comfortable staff queue', run: () => updateDisplayPrefs({ compact: !displayPrefs.compact }) }] : []),
    ...allKnownReports.slice(0, 40).map((report) => ({
      id: `report-${report.id}`,
      group: t('Reports'),
      label: report.title,
      hint: `${formatReportId(report.id)} · ${t(report.status)}`,
      keywords: `${report.category} ${t(report.category)} ${report.location} ${report.barangay ?? ''} ${report.id}`,
      run: () => {
        if (isStaffRole && staffMode) { setStaffDashboardOpen(false); setStaffReportId(report.id) }
        else { setStaffMode(false); setSelectedId(report.id) }
      },
    })),
  ]

  return (
    <div className={`app-shell theme-${theme}`} lang={language}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label={t('GreenPulse home')}>
          <span className="brand-mark"><Leaf size={19} strokeWidth={2.2} /></span>
          <span className="brand-name">green<span>pulse</span></span>
        </a>
        <div className="topbar-context">{isSupabaseConfigured && <span className={`live-dot ${isOnline ? '' : 'is-offline'}`} />} {t('Community watch')} <span className="context-divider">/</span> {t('Environmental reports')}</div>
        <div className={`topbar-chip ${scrolledPastHeading ? 'is-visible' : ''}`} aria-hidden={!scrolledPastHeading}><strong>{contextTitle}</strong><span>{t('{count} open', { count: openReports })}</span>{urgentOpenCount > 0 && <span className="is-urgent">{t('{count} urgent', { count: urgentOpenCount })}</span>}</div>
        <div className="topbar-actions">
          <SyncStatus state={syncState} detail={!isSupabaseConfigured ? t('Reports stay in this browser. Add Supabase settings to enable shared reports and accounts.') : lastSyncedAt ? t('Last synced {time}', { time: lastSyncedAt.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' }) }) : undefined} onRetry={() => setReportRefreshToken((current) => current + 1)} />
          <LanguageToggle onError={(message) => pushToast({ tone: 'error', message })} />
          <DisplaySettings prefs={displayPrefs} onChange={updateDisplayPrefs} showStaffOptions={isStaffRole} />
          {savedDraftAvailable && <button className="text-button resume-draft-button" type="button" onClick={() => void restoreReportDraft(false)}>{t('Resume draft')}</button>}
          <button className="icon-button theme-toggle" type="button" role="switch" onClick={() => toggleTheme()} aria-label={t('Dark mode')} aria-checked={theme === 'dark'} title={theme === 'dark' ? t('Turn dark mode off') : t('Turn dark mode on')}><span className="theme-toggle-thumb" aria-hidden="true">{theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}</span></button>
          {/* Tracking codes are for guest reporters; staff see every report already. */}
          {isSupabaseConfigured && !isStaffRole && <button className="secondary-button track-report-button" type="button" aria-label={t('Track a report')} title={t('Track a report')} onClick={() => { setGuestTrackingToken(undefined); setGuestTrackingEmailSent(false); setGuestTrackingOpen(true) }}><FileSearch size={15} /><span className="track-report-label">{t('Track report')}</span></button>}
          {session && <NotificationBell unread={unreadNotificationCount} open={notificationPanelOpen} onToggle={() => setNotificationPanelOpen((open) => !open)} />}
          {session ? <>
            {(profile?.role === 'responder' || profile?.role === 'admin') && <button className={`text-button staff-toggle ${staffMode ? 'active' : ''}`} type="button" title={staffMode ? t('Return to community view') : t('Open staff desk')} aria-label={staffMode ? t('Return to community view') : t('Open staff desk')} onClick={() => { setStaffMode((current) => !current); setStaffDashboardOpen(true) }}>{staffMode ? <MapIcon size={15} /> : <ClipboardCheck size={15} />}<span>{staffMode ? t('Community view') : t('Staff desk')}</span></button>}
            <button className="profile-button" type="button" onClick={() => { setProfileAvatarPreview(profileAvatarUrl); setProfileModal(true) }} aria-label={t('Open profile settings')}><span className="avatar">{profileAvatarUrl ? <img src={profileAvatarUrl} alt="" /> : (profile?.display_name || session.user.email || session.user.phone || 'R').slice(0, 1).toUpperCase()}</span><span className="profile-label">{profile?.display_name || session.user.email || session.user.phone}</span>{profile && <span className={`profile-role-badge role-${profile.role}`}>{getRoleLabel(profile.role)}</span>}</button>
            <button className="icon-button topbar-signout" type="button" onClick={() => void supabase?.auth.signOut()} aria-label={t('Sign out')} title={t('Sign out')}><LogOut size={16} /></button>
          </> : isSupabaseConfigured ? <button className="sign-in-button" type="button" onClick={() => openAuthModal('sign-in')} disabled={!authReady}><LogIn size={15} />{t('Sign in')}</button> : <span className="profile-button"><span className="avatar">G</span><span className="profile-label">{t('Guest')}</span></span>}
        </div>
      </header>

      <NotificationPanel
        open={notificationPanelOpen}
        notifications={inboxNotifications}
        unread={unreadNotificationCount}
        onSelect={markNotificationRead}
        onMarkAllRead={markAllNotificationsRead}
        onLoadOlder={inbox.hasOlder ? inbox.loadOlder : undefined}
        onClose={() => setNotificationPanelOpen(false)}
        onOpenSettings={profile ? () => { setNotificationPanelOpen(false); setProfileAvatarPreview(profileAvatarUrl); setProfileModal(true) } : undefined}
      />

      <main id="home" className={`workspace ${viewTransition.entering ? 'view-entering' : ''}`} tabIndex={-1}>
        <HeroPanel
          title={staffMode ? <>{t('Coordinate the response.')} <em>{t('Close the loop.')}</em></> : <>{t('See it.')} <span className="keep-together">{t('Report it.')}</span> <em className="keep-together">{t('Restore it.')}</em></>}
          subtitle={staffMode ? t('A focused queue for reviewing reports and coordinating community response.') : translate('communitySubtitle')}
          action={<button className="primary-button report-cta" type="button" onClick={startReport}><span className="report-cta-icon" aria-hidden="true"><Plus size={17} strokeWidth={2.6} /></span><span className="report-cta-label">{translate('reportIssue')}</span><span className="report-cta-arrow" aria-hidden="true"><ArrowRight size={15} strokeWidth={2.4} /></span></button>}
          hint={staffMode ? undefined : session ? t('Takes about a minute.') : t('No account needed. Takes about a minute.')}
          stats={heroStats}
          statsLabel={staffMode ? t('Staff response summary') : t('Community report summary')}
          loading={loadingReports}
          footer={!staffMode && isSupabaseConfigured ? <div className="hero-sync" aria-live="polite"><span className={`live-dot ${isOnline ? '' : 'is-offline'}`} />{lastSyncedAt ? t('Synced {time}', { time: lastSyncedAt.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' }) }) : t('Syncing reports…')}<button className="text-button" type="button" disabled={!isOnline || loadingReports} onClick={() => setReportRefreshToken((current) => current + 1)}>{t('Refresh')}</button></div> : undefined}
        />

        {isSupabaseConfigured && !isOnline && <div className="connection-banner error-banner" role="status"><span><strong>{t('You’re offline.')}</strong> {t('Showing the last synced reports; you can save a report on this device and queue it for upload when you reconnect.')}{lastSyncedAt ? ` ${t('Last synced {time}.', { time: lastSyncedAt.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' }) })}` : ''}</span></div>}
        {draftMessage && <div className="connection-banner" role="status"><span>{draftMessage}</span>{savedDraftAvailable && <button className="text-button" type="button" onClick={() => void deleteSavedDraft()}>{t('Delete saved draft')}</button>}</div>}
        {backendError && <div className="connection-banner error-banner" role="alert"><AlertTriangle size={16} /><span>{backendError}</span><button type="button" onClick={() => setBackendError('')} aria-label={t('Dismiss message')}><X size={14} /></button></div>}

        {!staffMode && tourOpen && <WelcomeTour onDismiss={dismissTour} onSeen={markTourSeen} />}

        {staffMode && profile?.role === 'admin' && staffDashboardOpen && <section className="admin-overview" aria-label={t('Admin dashboard')} aria-busy={loadingReports}>
          <div className="analytics-heading">
            <div><p className="eyebrow">{t('ADMIN DASHBOARD')}</p><h2>{t('Environmental report overview')}</h2></div>
            <div className="analytics-heading-actions"><span className="analytics-period" title={reportsTruncated ? t('There are more reports than the dashboard loads. These figures cover the newest {count}.', { count: REPORT_LOAD_LIMIT.toLocaleString(dateLocale()) }) : undefined}>{loadingReports ? t('Loading reports…') : reportsTruncated ? t('Newest {count} reports', { count: REPORT_LOAD_LIMIT.toLocaleString(dateLocale()) }) : t('All reports')}<i />{t('Current data')}</span><button className="secondary-button add-responder-button" type="button" onClick={() => { setResponderMessage(''); setResponderModalOpen(true) }}><Plus size={14} /> {t('Add responder')}</button><button className="secondary-button admin-dashboard-action" type="button" onClick={() => setStaffDashboardOpen(false)}><ClipboardCheck size={14} /> {t('Staff desk')}</button></div>
          </div>
          <AdminSectionNav sections={ADMIN_SECTIONS} active={adminSection} onChange={setAdminSection} />
          {adminSection === 'admin-overview-metrics' && <div className="admin-metrics-grid" id="admin-overview-metrics" role="tabpanel" aria-labelledby={adminTabId('admin-overview-metrics')}>
            {[
              { label: t('Total reports'), value: adminAnalytics.total, note: t('All recorded reports'), icon: <Leaf size={15} /> },
              { label: t('Pending reports'), value: adminAnalytics.pending, note: t('Awaiting review or follow-up'), icon: <Clock3 size={15} /> },
              { label: t('Verified reports'), value: adminAnalytics.verified, note: t('Verified by staff'), icon: <ShieldCheck size={15} /> },
              { label: t('Assigned reports'), value: adminAnalytics.assigned, note: t('With a responder assigned'), icon: <UserRound size={15} /> },
              { label: t('In-progress reports'), value: adminAnalytics.inProgress, note: t('Response underway'), icon: <ArrowDownUp size={15} /> },
              { label: t('Resolved reports'), value: adminAnalytics.resolved, note: t('Marked resolved'), icon: <Check size={15} /> },
              { label: t('Closed reports'), value: adminAnalytics.closed, note: t('Closed without resolution'), icon: <X size={15} /> },
              { label: t('Rejected reports'), value: adminAnalytics.rejected, note: t('Rejected by staff'), icon: <Ban size={15} /> },
              { label: t('Critical reports'), value: adminAnalytics.critical, note: t('High urgency'), icon: <AlertTriangle size={15} /> },
              { label: t('Escalated reports'), value: escalatedOpen, note: t('Open critical flooding'), icon: <Siren size={15} /> },
              { label: t('Avg. verification time'), value: formatDuration(responseMetrics.averageVerificationMs), note: t('Submitted to verified'), icon: <Check size={15} /> },
              { label: t('Avg. response time'), value: formatDuration(responseMetrics.averageResponseMs), note: t('Submitted to response started'), icon: <ArrowDownUp size={15} /> },
              { label: t('Avg. resolution time'), value: formatDuration(responseMetrics.averageResolutionMs), note: t('Submitted to resolved'), icon: <ShieldCheck size={15} /> },
              { label: t('Reports this week'), value: adminAnalytics.thisWeek, note: t('Since Monday'), icon: <CalendarDays size={15} /> },
              { label: t('Reports this month'), value: adminAnalytics.thisMonth, note: t('Since the first of the month'), icon: <CalendarDays size={15} /> },
            ].map((metric, index) => <article className="admin-metric" key={metric.label} style={{ '--i': index } as CSSProperties}>
              <span className="admin-metric-icon">{metric.icon}</span><strong>{loadingReports ? <><span className="skeleton skeleton-stat" aria-hidden="true" /><span className="sr-only">{t('Loading')}</span></> : typeof metric.value === 'number' ? <AnimatedNumber value={metric.value} /> : metric.value}</strong><span>{metric.label}</span><small>{metric.note}</small>
            </article>)}
          </div>}
          {adminSection === 'admin-charts' && <div className="admin-chart-grid" id="admin-charts" role="tabpanel" aria-labelledby={adminTabId('admin-charts')}>
            <AdminBarChart title={t('Reports by category')} description={t('Environmental concern type')} data={adminAnalytics.byCategory} loading={loadingReports} />
            <AdminBarChart title={t('Reports by status')} description={t('Current response stage')} data={adminAnalytics.byStatus} loading={loadingReports} />
            <AdminBarChart title={t('Reports by urgency')} description={t('Reported urgency level')} data={adminAnalytics.byUrgency} loading={loadingReports} />
            <AdminBarChart title={t('Reports by barangay')} description={t('Where reports were made')} data={adminAnalytics.byBarangay} loading={loadingReports} />
            <AdminTrendChart daily={adminAnalytics.daily} loading={loadingReports} />
            <article className="analytics-chart admin-outcome-chart">
              <div className="analytics-chart-heading"><div><strong>{t('Resolution performance')}</strong><span>{t('Resolved reports as a share of all reports')}</span></div><ShieldCheck size={17} /></div>
              <div className="resolution-content">
                <div className="resolution-ring" role="img" aria-label={t('Resolution rate {percent} percent', { percent: Math.round(adminAnalytics.resolutionRate) })} style={{ '--ring': `${adminAnalytics.resolutionRate}%` } as CSSProperties}><span><AnimatedNumber value={Math.round(adminAnalytics.resolutionRate)} /><small>%</small></span></div>
                <p><strong>{t('{count} of {total}', { count: adminAnalytics.resolved, total: adminAnalytics.total })}</strong><small>{t('reports resolved')}</small></p>
              </div>
              <div className="average-resolution">
                <span>{t('Average resolution time')}</span>
                <strong>{adminAnalytics.averageResolutionMs === undefined ? '—' : adminAnalytics.averageResolutionMs < 86_400_000
                  ? t('{count} hr', { count: Math.max(1, Math.round(adminAnalytics.averageResolutionMs / 3_600_000)) })
                  : t('{count} days', { count: (adminAnalytics.averageResolutionMs / 86_400_000).toFixed(1) })}</strong>
                <small>{t('Resolved reports with recorded resolution timestamps')}</small>
              </div>
            </article>
          </div>}
          {adminSection === 'admin-summary' && <EnvironmentalReports reports={reports} />}
          {adminSection === 'admin-pilot' && <section className="pilot-outcomes analytics-chart" id="admin-pilot" role="tabpanel" aria-labelledby={adminTabId('admin-pilot')}>
            <div className="analytics-chart-heading"><div><strong>{t('Pilot outcomes')}</strong><span>{t('All-time response and recurrence measures for participating teams')}</span></div><BarChart3 size={17} /></div>
            {pilotOutcomesMessage && <p className="workflow-hint" role="status">{pilotOutcomesMessage}</p>}
            {!pilotOutcomes && !pilotOutcomesMessage && (loadingReports ? <ChartSkeleton rows={3} /> : <ChartEmpty title={t('No pilot outcomes yet')} hint={t('Response and recurrence measures appear after reports have been handled.')} />)}
            {pilotOutcomes && <>
              <div className="pilot-outcome-metrics"><p><strong>{pilotOutcomes.totalReports}</strong><span>{t('recorded reports')}</span></p><p><strong>{pilotOutcomes.reopenedReports}</strong><span>{t('reopened reports')}</span></p></div>
              <div className="pilot-outcome-table-wrap"><table className="pilot-outcome-table"><caption className="sr-only">{t('Report outcomes by barangay')}</caption><thead><tr><th scope="col">{t('Barangay')}</th><th scope="col">{t('Reports')}</th><th scope="col">{t('Resolved or closed')}</th><th scope="col">{t('Reopened')}</th><th scope="col">{t('Avg. first response')}</th><th scope="col">{t('Avg. resolution')}</th></tr></thead><tbody>{pilotOutcomes.byBarangay.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.reports}</td><td>{row.resolved}</td><td>{row.reopened}</td><td>{formatDuration(row.averageFirstResponseMs ?? undefined)}</td><td>{formatDuration(row.averageResolutionMs ?? undefined)}</td></tr>)}</tbody></table></div>
            </>}
          </section>}
          {adminSection === 'admin-operations' && <div className="admin-operations-grid" id="admin-operations" role="tabpanel" aria-labelledby={adminTabId('admin-operations')}>
            <form className="admin-operation-card" onSubmit={(event) => void saveResponseSettings(event)}>
              <div><p className="eyebrow">{t('OPERATIONS')}</p><h3>{t('Response deadlines')}</h3><p>{t('These targets drive overdue alerts in the staff inbox.')}</p></div>
              <label className="field-label">{t('Standard urgency deadline (hours)')}<input name="response_sla_hours" type="number" min={1} max={720} step={1} value={responseSettings.response_sla_hours} onChange={(event) => setResponseSettings((current) => ({ ...current, response_sla_hours: Number(event.target.value) }))} required /></label>
              <label className="field-label">{t('High urgency deadline (hours)')}<input name="high_urgency_sla_hours" type="number" min={1} max={720} step={1} value={responseSettings.high_urgency_sla_hours} onChange={(event) => setResponseSettings((current) => ({ ...current, high_urgency_sla_hours: Number(event.target.value) }))} required /></label>
              <label className="field-label">{t('Second escalation window (multiple of first deadline)')}<input name="second_escalation_multiplier" type="number" min={2} max={10} step={1} value={responseSettings.second_escalation_multiplier} onChange={(event) => setResponseSettings((current) => ({ ...current, second_escalation_multiplier: Number(event.target.value) }))} required /><small>{t('At the first deadline, notify admins and the assigned responder. At this multiple, notify admins again for supervisor review.')}</small></label>
              {responseSettingsMessage && <p className="workflow-hint" role="status">{responseSettingsMessage}</p>}
              <button className="primary-button" type="submit" disabled={responseSettingsBusy}>{responseSettingsBusy ? t('Saving…') : t('Save deadlines')}</button>
            </form>
            <section className="admin-operation-card" aria-label={t('Escalation queue')}>
              <div><p className="eyebrow">{t('FOLLOW-UP CONTROL')}</p><h3>{t('Escalations')}</h3><p>{t('Stage 1 goes to admins and the assigned responder. Stage 2 asks admins to review the task plan. Staff can acknowledge the escalation.')}</p></div>
              <button className="secondary-button" type="button" onClick={() => void runEscalationCheck()} disabled={escalationRunBusy}>{escalationRunBusy ? t('Checking…') : t('Check deadlines now')}</button>
              {slaEscalationMessage && <p className="workflow-hint" role="status">{slaEscalationMessage}</p>}
              <EscalationList items={slaEscalations} limit={8} emptyText={t('No SLA escalations recorded.')} canAcknowledge={(item) => canHandleEscalation(item, { role: profile.role, userId: session?.user.id, teams })} onAcknowledge={(item) => void acknowledgeSlaEscalation(item)} />
            </section>
            <section className="admin-operation-card" aria-label={t('Email notification delivery')}>
              <div><p className="eyebrow">{t('NOTIFICATION DELIVERY')}</p><h3>{t('Email delivery history')}</h3><p>{t('Recent sent and failed deliveries are recorded. Retries use stable idempotency keys.')}</p></div>
              {emailRetryMessage && <p className="workflow-hint" role="status">{emailRetryMessage}</p>}
              {deliveryNeverAttempted(failedEmailNotifications) && <p className="workflow-hint delivery-setup-hint">{t('None of these emails has been tried yet. That usually means email sending is not set up on the server (RESEND_API_KEY and NOTIFICATION_FROM_EMAIL).')}</p>}
              <div className="workload-list">{failedEmailNotifications.length ? groupDeliveryHistory(failedEmailNotifications).slice(0, 8).map((group) => <div className="workload-row delivery-row" key={group.key}><span><strong>{group.title} <span className="delivery-report-id">{formatReportId(group.reportId)}</span></strong><small>{group.channel} · {group.count > 1 ? `${group.count} ${t(group.status).toLowerCase()}` : t(group.status)} · {tn('{count} attempt', '{count} attempts', group.attempts)}{group.latestAt ? ` · ${t('latest {time}', { time: formatDeliveryTime(group.latestAt) })}` : ''}</small>{group.lastError && <small className="delivery-error">{group.lastError}</small>}</span></div>) : <span className="workflow-hint">{t('No email delivery attempts are recorded.')}</span>}</div>
              <button className="secondary-button" type="button" disabled={emailRetryBusy || !failedEmailNotifications.some((item) => item.status === 'Failed' || item.status === 'Pending')} onClick={() => void retryFailedEmails()}>{emailRetryBusy ? t('Sending…') : emailRetryLabel(failedEmailNotifications)}</button>
            </section>
            <section className="admin-operation-card" aria-label={t('Responder workload')}>
              <div><p className="eyebrow">{t('TEAM CAPACITY')}</p><h3>{t('Open task workload')}</h3><p>{t('Counts include reports assigned directly or to a team.')}</p></div>
              <div className="workload-list"><strong>{t('Responders')}</strong>{staffUsers.filter((user) => user.role === 'responder').map((user) => <div className="workload-row" key={user.id}><span>{user.display_name || t('Unnamed responder')}</span><b>{reports.filter((report) => report.assignedTo === user.id && isOpenStatus(report.status)).length}</b></div>)}{staffUsers.filter((user) => user.role === 'responder').length === 0 && <span className="workflow-hint">{t('No responders are configured.')}</span>}</div>
              <div className="workload-list"><strong>{t('Teams')}</strong>{teams.map((team) => <div className="workload-row" key={team.id}><span>{team.name}</span><b>{reports.filter((report) => report.assignedTeamId === team.id && isOpenStatus(report.status)).length}</b></div>)}{teams.length === 0 && <span className="workflow-hint">{t('No teams are configured.')}</span>}</div>
            </section>
          </div>}
        </section>}

        {staffMode && (profile?.role === 'responder' || profile?.role === 'admin') && (!staffDashboardOpen || profile.role !== 'admin') && <section className="staff-workbench" aria-label={t('Staff report management')}>
          <div className="staff-workbench-heading"><div><p className="eyebrow">{t('RESPONSE MANAGEMENT')}</p><h2>{t('Staff desk')}</h2><p>{t('Review incoming reports, assign responders, and record outcomes.')}</p></div><div className="staff-workbench-actions">{profile.role === 'admin' && <button className="secondary-button" type="button" onClick={() => { setResponderMessage(''); setResponderModalOpen(true) }}><Plus size={14} /> {t('Add responder')}</button>}{profile.role === 'admin' && <button className="secondary-button" type="button" onClick={() => { setTeamMessage(''); setTeamModalOpen(true) }}><Users size={14} /> {t('Manage teams')}</button>}{profile.role === 'admin' && <button className="secondary-button" type="button" onClick={() => setStaffDashboardOpen(true)}><BarChart3 size={14} /> {t('Dashboard')}</button>}<span className="role-chip"><ShieldCheck size={14} />{profile.role}</span></div></div>
          <div className="staff-followups">
          <section className="admin-operation-card staff-escalation-panel" aria-label={t('My deadline escalations')}>
            <div><p className="eyebrow">{t('FOLLOW-UP CONTROL')}</p><h3>{t('Deadline escalations')}</h3><p>{profile.role === 'admin' ? t('Overdue reports across every team. Acknowledge one once someone is following up.') : t('Review reports assigned to you or your team and acknowledge the follow-up.')}</p></div>
            <EscalationList items={slaEscalations.filter((item) => canHandleEscalation(item, { role: profile.role, userId: session?.user.id, teams }))} limit={10} emptyText={profile.role === 'admin' ? t('No reports have passed their deadline.') : t('No escalations are assigned to you or your team.')} canAcknowledge={() => true} onAcknowledge={(item) => void acknowledgeSlaEscalation(item)} onOpen={(reportId) => setStaffReportId(reportId)} collapseAcknowledged />
            {slaEscalationMessage && <p className="workflow-hint" role="status">{slaEscalationMessage}</p>}
          </section>
          <section className="recurrence-panel" aria-label={t('Recurring issue inspections')}>
            <div className="recurrence-heading"><div><p className="eyebrow">{t('RECURRING ISSUES')}</p><h3>{t('Inspections and maintenance follow-ups')}</h3><p>{t('Patterns are based on reports from the last 90 days within 350 metres.')}</p></div><span className="count-badge">{profile.role === 'admin' ? unplannedHotspots.length : environmentalFollowups.filter((item) => item.status === 'Scheduled' && item.assigned_team_id && teams.find((team) => team.id === item.assigned_team_id)?.memberIds.includes(session?.user.id ?? '')).length}</span></div>
            {profile.role === 'admin' && unplannedHotspots.length > 0 && <div className="recurrence-suggestions">{unplannedHotspots.map((hotspot) => <article className="recurrence-suggestion" key={hotspot.key}><div><strong>{t(hotspot.category)} · {hotspot.barangay ? t('Barangay {barangay}', { barangay: hotspot.barangay }) : t('District 5')}</strong><span>{t('{count} reports near {location}', { count: hotspot.count, location: hotspot.location })}</span></div><button className="secondary-button" type="button" disabled={followupBusy} onClick={() => void createEnvironmentalFollowup(hotspot)}>{t('Schedule inspection')}</button></article>)}</div>}
            {profile.role === 'admin' && unplannedHotspots.length === 0 && <p className="workflow-hint">{t('No new hotspot has reached three reports in the same area during the last 90 days.')}</p>}
            {followupMessage && <p className="workflow-hint" role="status">{followupMessage}</p>}
            <div className="environmental-followup-list">{environmentalFollowups.filter((item) => profile.role === 'admin' || (item.status === 'Scheduled' && Boolean(item.assigned_team_id && teams.find((team) => team.id === item.assigned_team_id)?.memberIds.includes(session?.user.id ?? '')))).map((item) => {
              const isAssignedResponder = Boolean(item.status === 'Scheduled' && item.assigned_team_id && teams.find((team) => team.id === item.assigned_team_id)?.memberIds.includes(session?.user.id ?? ''))
              return <article className="environmental-followup-item" key={item.id}><div className="followup-item-title"><strong>{item.title}</strong><span>{t('{count} source reports', { count: item.source_report_ids.length })} · {item.location_label}{item.barangay ? ` · ${item.barangay}` : ''}</span></div><span className={`followup-status followup-${item.status.toLowerCase()}`}>{t(item.status)}</span>{profile.role === 'admin' && <div className="followup-controls"><label className="filter-field"><span>{t('Team')}</span><select value={item.assigned_team_id ?? ''} disabled={followupBusy} onChange={(event) => void updateEnvironmentalFollowup(item.id, { assigned_team_id: event.target.value || null })}><option value="">{t('Unassigned')}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="filter-field"><span>{t('Due date')}</span><input type="date" value={item.due_date ?? ''} disabled={followupBusy} onChange={(event) => void updateEnvironmentalFollowup(item.id, { due_date: event.target.value || null })} /></label>{item.status === 'Scheduled' && <><button className="text-button" type="button" disabled={followupBusy} onClick={() => void updateEnvironmentalFollowup(item.id, { status: 'Completed' })}>{t('Mark complete')}</button><button className="text-button" type="button" disabled={followupBusy} onClick={() => void updateEnvironmentalFollowup(item.id, { status: 'Dismissed' })}>{t('Dismiss')}</button></>}</div>}{profile.role === 'responder' && isAssignedResponder && <button className="secondary-button" type="button" disabled={followupBusy} onClick={() => void updateEnvironmentalFollowup(item.id, { status: 'Completed' })}>{t('Mark inspection complete')}</button>}</article>
            })}</div>
          </section>
          </div>
          <div className="staff-filters">
            <div className="staff-filters-bar">
              <label className="search-box staff-search"><Search size={15} /><input value={staffFilters.query} onChange={(event) => updateStaffFilters({ query: event.target.value })} placeholder={t('Search by ID, title, place or person')} title={t('Searches the report ID, title, description, reporter, location, category and assignee')} aria-label={t('Search reports')} />{staffFilters.query && <button type="button" onClick={() => updateStaffFilters({ query: '' })} aria-label={t('Clear search')}><X size={14} /></button>}</label>
              <button className={`secondary-button filter-toggle ${staffFiltersOpen ? 'active' : ''}`} type="button" aria-expanded={staffFiltersOpen} aria-controls="staff-filter-panel" onClick={() => setStaffFiltersOpen((open) => !open)}><SlidersHorizontal size={14} /> {t('Filters')}{activeFilterCount > 0 && <span className="count-badge">{activeFilterCount}</span>}</button>
              {activeFilterCount > 0 && <button className="text-button" type="button" onClick={() => setStaffFilters(defaultReportFilters)}>{t('Clear all')}</button>}
            </div>
            {staffFiltersOpen && <div className="staff-filter-panel" id="staff-filter-panel">
              <FilterSelect label={t('Status')} value={staffFilters.status} onChange={(status) => updateStaffFilters({ status })}><option value="open">{t('Open reports')}</option><option value="all">{t('All reports')}</option>{statusOptions.map((status) => <option key={status} value={status}>{t(status)}</option>)}</FilterSelect>
              <FilterSelect label={t('Resolution')} value={staffFilters.resolution} onChange={(resolution) => updateStaffFilters({ resolution, ...(resolution && resolution !== 'unresolved' && staffFilters.status === 'open' ? { status: 'all' } : {}) })}><option value="">{t('Any resolution')}</option><option value="unresolved">{t('Unresolved')}</option><option value="awaiting">{t('Awaiting verification')}</option><option value="resolved">{t('Resolved')}</option><option value="closed">{t('Closed')}</option></FilterSelect>
              <FilterSelect label={t('Category')} value={staffFilters.category} onChange={(category) => updateStaffFilters({ category })}><option value="">{t('All categories')}</option>{categoryOptions.map((category) => <option key={category} value={category}>{t(category)}</option>)}</FilterSelect>
              <FilterSelect label={t('Urgency')} value={staffFilters.urgency} onChange={(urgency) => updateStaffFilters({ urgency })}><option value="">{t('Any urgency')}</option><option value="High">{t('High')}</option><option value="Medium">{t('Medium')}</option><option value="Low">{t('Low')}</option></FilterSelect>
              <FilterSelect label={t('Barangay')} value={staffFilters.barangay} onChange={(barangay) => updateStaffFilters({ barangay })}><option value="">{t('All barangays')}</option><option value={NO_BARANGAY}>{t('No barangay recorded')}</option>{DISTRICT_5_BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}</FilterSelect>
              <FilterSelect label={t('Assigned to')} value={staffFilters.assignee} onChange={(assignee) => updateStaffFilters({ assignee })}><option value="">{t('Anyone')}</option><option value={UNASSIGNED}>{t('Unassigned')}</option>{staffUsers.map((user) => <option key={user.id} value={user.id}>{user.display_name || t('Unnamed staff member')}</option>)}</FilterSelect>
              <FilterSelect label={t('Assigned team')} value={staffFilters.team} onChange={(team) => updateStaffFilters({ team })}><option value="">{t('Any team')}</option><option value={UNASSIGNED}>{t('No team')}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</FilterSelect>
              <label className="filter-field"><span>{t('Submitted from')}</span><input type="date" value={staffFilters.dateFrom} max={staffFilters.dateTo || undefined} onChange={(event) => updateStaffFilters({ dateFrom: event.target.value })} /></label>
              <label className="filter-field"><span>{t('Submitted to')}</span><input type="date" value={staffFilters.dateTo} min={staffFilters.dateFrom || undefined} onChange={(event) => updateStaffFilters({ dateTo: event.target.value })} /></label>
            </div>}
            <FilterChips chips={staffFilterChips} onRemove={(key) => { setStaffFilters((current) => clearFilter(current, key)); setStaffQueueOffset(0) }} />
          </div>
          <div className={`staff-workbench-grid ${staffReportId ? 'has-selection' : ''}`} ref={staffGridRef}>
            <div className="staff-queue" ref={staffQueueRef}><div className="queue-heading"><div><h3>{t('Response queue')}</h3><span aria-live="polite">{t('{count} matching reports · sorted by escalation and newest', { count: staffQueueCount })}</span></div><span className="queue-shortcuts" aria-label={t('Keyboard shortcuts')}><kbd>J</kbd><kbd>K</kbd> {t('move')} <kbd>A</kbd> {t('assign')} <kbd>/</kbd> {t('search')}</span></div>
              {loadingReports || (staffQueueLoading && staffQueue.length === 0) ? <ReportListSkeleton rows={5} variant="queue" /> : staffQueueCount === 0 ? <div className="staff-empty"><EmptyIllustration variant={activeFilterCount > 0 ? 'search' : 'queue'} /><span>{activeFilterCount > 0 ? t('No reports match these filters.') : t('No reports match this queue.')}</span>{activeFilterCount > 0 && <button className="text-button" type="button" onClick={() => { setStaffFilters(defaultReportFilters); setStaffQueueOffset(0) }}>{t('Clear all filters')}</button>}</div> : <>
                {staffQueue.map((report) => {
                  const deadline = reportDeadline(report, responseSettings, clock)
                  return <button key={report.id} data-flip-id={report.id} type="button" className={`queue-item queue-urgency-${report.urgency.toLowerCase()} ${staffReportId === report.id ? 'selected' : ''}`} onClick={() => setStaffReportId(report.id)}><span className="queue-item-title">{report.title}</span><span className="queue-item-meta">{formatReportId(report.id)} · {t(report.category)}{report.barangay ? ` · ${report.barangay}` : ''} · {formatCreatedAt(report.createdAt)}</span><span className="queue-item-tags"><span key={report.status} className={`status-pill status-${report.status.toLowerCase().replace(/ /g, '-')} ${changedStatuses.has(report.id) ? 'pill-changed' : ''}`}><i />{t(report.status)}</span>{needsImmediateAttention(report) && <span className="urgency-pill escalated-pill"><AlertTriangle size={11} />{t('Escalated')}</span>}{report.urgency === 'High' && <span className="urgency-pill"><AlertTriangle size={11} />{t('Urgent')}</span>}{deadline && <span className={`deadline-chip ${deadline.overdue ? 'is-overdue' : deadline.soon ? 'is-soon' : ''}`}><Clock3 size={11} />{deadline.label}</span>}</span></button>
                })}
                {staffQueueCount > staffQueue.length && <button className="show-more-button" type="button" disabled={staffQueueLoading} onClick={() => setStaffQueueOffset(staffQueue.length)}>{staffQueueLoading ? t('Loading more…') : t('Show next {count} ({remaining} remaining)', { count: Math.min(STAFF_PAGE_SIZE, staffQueueCount - staffQueue.length), remaining: staffQueueCount - staffQueue.length })}</button>}
              </>}
            </div>
            <div className="staff-detail" key={staffReport?.id ?? 'none'}>{staffReport ? <>
              <button className="staff-back-button" type="button" onClick={() => setStaffReportId(undefined)}><ArrowLeft size={14} /> {t('Back to queue')}</button>
              <div className="staff-report-heading"><div><span className="report-id">{staffReport.id.slice(0, 8).toUpperCase()}</span><h3>{staffReport.title}</h3><span className="section-caption">{t(staffReport.category)} · {t('{urgency} urgency', { urgency: t(staffReport.urgency) })} · {formatCreatedAt(staffReport.createdAt)}</span><span className="reporter-line"><UserRound size={12} /> {t('Reported by {name}', { name: staffReport.reporterName ? translateServerText(staffReport.reporterName) : t('Community resident') })}</span></div><MapPin size={18} /></div>
              <p className="staff-description">{staffReport.description}</p>
              <p className="section-caption">{staffReport.observedAt ? t('Observed {time}', { time: new Date(staffReport.observedAt).toLocaleString(dateLocale()) }) : t('Observed at submission')}</p>
              {staffReport.additionalInfo && <p className="workflow-note-text"><strong>{t('Additional information')}</strong>{staffReport.additionalInfo}</p>}
              <div className="meta-chips"><span className="meta-chip"><MapPin size={12} />{staffReport.barangay ? t('Barangay {barangay}', { barangay: staffReport.barangay }) : t('No barangay recorded')}</span></div>
              <ExactLocation label={staffReport.location} coordinates={staffReport.coordinates} />
              {session && (profile?.role === 'admin' || profile?.role === 'responder') && <StaffWorkflowPanel report={staffReport} role={profile.role} userId={session.user.id} staffUsers={staffUsers} teams={teams} allReports={allKnownReports} originalPhotoUrls={staffPhotoUrls.original} resolutionPhotoUrls={staffPhotoUrls.resolution} events={reportEvents} residentFeedback={staffResolutionFeedback} onSubmit={applyReportUpdate} />}
              {session && profile && (profile.role === 'admin' || profile.role === 'responder') && <ReportConversation key={staffReport.id} reportId={staffReport.id} status={staffReport.status} viewerRole={profile.role} userId={session.user.id} isReporter={false} isOnTask={staffOnTask} onPosted={() => void refreshStaffEvents(staffReport.id)} onActivity={() => void reloadStaffEvents(staffReport.id)} />}
              <ReportTimeline events={reportEvents} />
            </> : staffReportId ? <div className="staff-detail-empty" role="status"><button className="staff-back-button" type="button" onClick={() => setStaffReportId(undefined)}><ArrowLeft size={14} /> {t('Back to queue')}</button><ClipboardCheck size={25} />{staffReportDetailFailedId === staffReportId ? <><strong>{t('This report could not be loaded')}</strong><span>{t('It may have been removed, or the connection dropped. Try again from the queue.')}</span></> : <><strong>{t('Loading report…')}</strong><span>{t('Getting the latest assignment and task details.')}</span></>}</div> : <div className="staff-detail-empty"><ClipboardCheck size={25} /><strong>{t('Select a report')}</strong><span>{t('Choose an open report to review and update its response.')}</span></div>}</div>
          </div>
        </section>}

        {!staffMode && <section className="monitoring-layout">
          <div className="map-column">
            <div className="section-toolbar">
              <div><h2>{translate('incidentMap')}</h2><span className="section-caption">{nearbyOnly ? t('{count} reports within 1 km', { count: nearbyReports.length }) : t('{count} reports · filters apply to map markers', { count: visibleReports.length })}</span></div>
              <button className={`map-location-button ${nearbyOnly ? 'active' : ''}`} type="button" onClick={() => nearbyOnly ? setNearbyOnly(false) : requestLocation(true)} title={nearbyOnly ? t('Show all filtered reports') : t('Show reports near my current location')}><Crosshair size={15} /><span>{nearbyOnly ? t('All reports') : t('Nearby')}</span></button>
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
                  loadPhotos={loadReportPhotos}
                /> : <MapSkeleton />}
              </Suspense>
              {mobileMap && selectedReport && <div className="map-sheet" role="dialog" aria-label={t('Selected report')} key={selectedReport.id}>
                <button className="icon-button map-sheet-close" type="button" onClick={() => setSelectedId(undefined)} aria-label={t('Close report preview')}><X size={15} /></button>
                <span className="map-sheet-meta">{t(selectedReport.category)} · {t(selectedReport.status)}</span>
                <strong>{selectedReport.title}</strong>
                <small><MapPin size={12} />{placeLabel(selectedReport)} · {formatCreatedAt(selectedReport.createdAt)}</small>
                <ReportPhotoStrip reportId={selectedReport.id} load={loadReportPhotos} variant="inline" caption={selectedReport.title} />
                <p>{selectedReport.description}</p>
                <button className="secondary-button map-sheet-discussion" type="button" onClick={() => setCommunityDiscussionId(selectedReport.id)}><MessageSquare size={14} /> {t('Comments and discussion')}</button>
              </div>}
              <div className="map-search-wrap">
                <label className="map-search-box"><Search size={15} /><input value={mapSearchQuery} onChange={(event) => { setMapSearchQuery(event.target.value); setMapSearchMessage('') }} placeholder={t('Search places')} aria-label={t('Search the map by place or address')} autoComplete="off" />{mapSearchBusy && <span className="search-spinner" aria-label={t('Searching places')} />}{mapSearchQuery && <button type="button" onClick={() => { setMapSearchQuery(''); setMapSearchSuggestions([]); setMapSearchMessage('') }} aria-label={t('Clear map search')}><X size={13} /></button>}</label>
                {mapSearchSuggestions.length > 0 && <ul className="map-search-suggestions" role="listbox" aria-label={t('Map place suggestions')}>{mapSearchSuggestions.map((suggestion) => <li key={`${suggestion.label}-${suggestion.coordinates.join(',')}`}><button type="button" role="option" onClick={() => { setMapCenter(suggestion.coordinates); setMapSearchQuery(''); setMapSearchSuggestions([]); setMapSearchMessage(''); setNearbyOnly(false); setSelectedId(undefined) }}><MapPin size={14} /><span>{suggestion.label}<small>{suggestion.coordinates[0].toFixed(5)}, {suggestion.coordinates[1].toFixed(5)}</small></span></button></li>)}</ul>}
                {!mapSearchBusy && mapSearchMessage && <p className="map-search-feedback map-search-error" role="status">{mapSearchMessage}</p>}
                {!mapSearchBusy && mapSearchQuery.trim().length >= 3 && !mapSearchMessage && mapSearchSuggestions.length === 0 && <p className="map-search-feedback" role="status">{t('No matching places found.')}</p>}
              </div>
              <div className="map-actions">
                <button className={`map-action-button ${heatmapEnabled ? 'active' : ''}`} type="button" aria-pressed={heatmapEnabled} onClick={() => setHeatmapEnabled((enabled) => !enabled)}><Flame size={14} />{heatmapEnabled ? t('Hide density') : t('Heatmap')}</button>
                                <button className="map-action-button" type="button" onClick={() => requestLocation(false)} title={t('Center the map on my current location')}><LocateFixed size={14} />{t('My location')}</button>
                              </div>
              <div className="map-label"><MapPin size={13} /> {t('District 5, Quezon City')}</div>
              <div className={`map-legend ${legendOpen ? 'is-open' : 'is-collapsed'}`}><button className="legend-toggle" type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen((open) => !open)}><Layers size={13} />{t('Legend')}<ChevronDown size={12} className="legend-chevron" /></button>{legendOpen && <div className="legend-body"><span className="legend-title">{t('CATEGORY')}</span>{categoryOptions.map((category) => <button type="button" className={`legend-item legend-filter ${categoryFilter === category ? 'is-active' : ''}`} key={category} aria-pressed={categoryFilter === category} title={categoryFilter === category ? t('Show all categories') : t('Show only {category}', { category: t(category) })} onClick={() => setCategoryFilter(categoryFilter === category ? 'All categories' : category)}><i style={{ backgroundColor: categoryColors[category] }} />{t(category)}</button>)}<span className="legend-divider" /><span className="legend-title">{t('STATUS DOT')}</span><span className="legend-item"><i className="status-dot" data-status="submitted" />{t('Submitted')}</span><span className="legend-item"><i className="status-dot" data-status="under-review" />{t('Under review')}</span><span className="legend-item"><i className="status-dot" data-status="in-progress" />{t('In progress')}</span><span className="legend-item"><i className="status-dot" data-status="resolved" />{t('Resolved')}</span><span className="legend-divider" /><span className="legend-title">{t('PINS')}</span><span className="legend-item"><i className="legend-urgent-ring" />{t('High urgency')}</span><span className="legend-item"><i className="legend-muted-pin" />{t('Resolved, smaller')}</span><span className="legend-item" title={t('The ring shows the mix of categories in the group')}><i className="legend-cluster-ring" />{t('Grouped reports')}</span><span className="legend-divider" /><span className="legend-title">{t('REPORT DENSITY')}</span><span className="legend-item"><i className="density-low" />{t('Low · 1–2')}</span><span className="legend-item"><i className="density-moderate" />{t('Moderate · 3–5')}</span><span className="legend-item"><i className="density-high" />{t('High · 6+')}</span></div>}</div>
              {mapLocationError && <p className="map-search-feedback map-search-error map-location-error" role="status">{mapLocationError}</p>}
            </div>
            <div className="map-footnote"><MapPin size={13} /><p>{t('Pins are approximate locations')} <i>·</i> {t('Status dots match report progress')} <i>·</i> {t('Select a pin for details')} <i>·</i> {t('Boundaries are indicative')}</p></div>
          </div>

          <aside className="reports-panel" aria-label={t('Recent environmental reports')}>
            <div className="reports-heading">
              <div><div className="reports-title-line"><h2>{nearbyOnly ? translate('nearbyReports') : translate('recentReports')}</h2><span className="count-badge">{mapReports.length}</span></div><span className="section-caption">{[nearbyOnly ? t('Within 1 km') : null, t(categoryFilter), t(statusFilter), barangayFilter ? t('Barangay {barangayFilter}', { barangayFilter }) : null, reportsTruncated ? t('Newest {count} only', { count: REPORT_LOAD_LIMIT.toLocaleString(dateLocale()) }) : null].filter(Boolean).join(' · ')}</span></div>
              <label className="feed-sort"><span>{t('Sort')}</span><span className="select-wrap"><select value={newestFirst ? 'newest' : 'oldest'} onChange={(event) => setNewestFirst(event.target.value === 'newest')} aria-label={t('Sort reports')}><option value="newest">{t('Newest')}</option><option value="oldest">{t('Oldest')}</option></select><ChevronDown size={13} /></span></label>
            </div>
            <div className="report-controls">
              <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translate('searchReports')} aria-label={translate('searchReports')} />{search && <button type="button" onClick={() => setSearch('')} aria-label={t('Clear search')}><X size={13} /></button>}</label>
              <div className="filter-row">
                <label className="select-wrap"><span className="sr-only">{t('Filter by category')}</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="All categories">{t('All categories')}</option>{categoryOptions.map((category) => <option key={category} value={category}>{t(category)}</option>)}</select><ChevronDown size={13} /></label>
                <label className="select-wrap"><span className="sr-only">{t('Filter by status')}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value={ALL_STATUSES}>{t(ALL_STATUSES)}</option>{STATUS_GROUP_FILTERS.map((group) => <option key={group} value={group}>{t(group)}</option>)}{statusOptions.filter((status) => status !== 'Duplicate').map((status) => <option key={status} value={status}>{t(status)}</option>)}</select><ChevronDown size={13} /></label>
              </div>
              <div className="filter-row filter-row-single">
                <label className="select-wrap"><span className="sr-only">{t('Filter by barangay')}</span><select value={barangayFilter} onChange={(event) => chooseBarangayFilter(event.target.value)}><option value="">{t('All barangays')}</option>{DISTRICT_5_BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}</select><ChevronDown size={13} /></label>
              </div>
            </div>
            {selectedOwnReport && <div className="own-report-card"><span><strong>{selectedOwnReport.title}</strong><small>{t('Your report')} · {t(selectedOwnReport.status)}</small></span><button className="secondary-button" type="button" onClick={() => setFollowUpId(selectedOwnReport.id)}><MessageSquare size={14} /> {t('Updates and replies')}</button><ExactLocation label={selectedOwnReport.location} coordinates={selectedOwnReport.coordinates} /></div>}
            {selectedOwnReport && session && ['Resolved', 'Closed'].includes(selectedOwnReport.status) && <section className="own-report-feedback"><div><strong>{t('Was this issue fixed?')}</strong><small>{t('Let the response team know if it is still happening.')}</small></div>{selectedOwnFeedback && <p className="workflow-hint">{t('Your last response:')} {selectedOwnFeedback.feedback === 'fixed' ? t('You confirmed it was fixed.') : t('You said it still needs attention.')}</p>}<label className="field-label">{t('Optional note')}<textarea rows={2} maxLength={500} value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} placeholder={t('Add a short update for the response team')} /></label><div className="workflow-actions"><button className="primary-button" type="button" disabled={feedbackBusy} onClick={() => void submitResidentFeedback('fixed')}>{feedbackBusy ? t('Saving…') : t('It was fixed')}</button><button className="secondary-button" type="button" disabled={feedbackBusy} onClick={() => void submitResidentFeedback('still_there')}>{t('Still needs attention')}</button></div></section>}
            <div className="report-list feed-card-list" ref={reportListRef}>
              {loadingReports ? <ReportListSkeleton /> : orderedReports.length === 0 ? <div className="empty-state"><EmptyIllustration variant={isSupabaseConfigured && !isOnline ? 'offline' : 'search'} /><strong>{isSupabaseConfigured && !isOnline ? t('You are offline') : t('No matching reports')}</strong><span>{isSupabaseConfigured && !isOnline ? t('Reconnect to load the latest reports.') : t('Try changing a filter or search term.')}</span></div> : feedReports.map((report) => <ReportFeedCard
                key={report.id}
                report={report}
                icon={categoryIcon(report.category)}
                color={categoryColors[report.category]}
                place={placeLabel(report)}
                createdLabel={formatCreatedAt(report.createdAt)}
                selected={selectedId === report.id}
                statusChanged={changedStatuses.has(report.id)}
                engagement={reportEngagement.get(report.id)}
                showStillThere={isStaffRole}
                canConfirm={isStaffRole && isSupabaseConfigured && isOnline && isOpenStatus(report.status) && report.reporterId !== session?.user.id}
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
            {!loadingReports && feedReports.length < orderedReports.length && <button className="show-more-button" type="button" onClick={() => setFeedPhoneLimit((current) => current + FEED_PHONE_PAGE)}>{orderedReports.length - feedReports.length <= FEED_PHONE_PAGE ? tn('Show {count} more report', 'Show {count} more reports', orderedReports.length - feedReports.length) : t('Show {count} more ({hidden} not shown)', { count: FEED_PHONE_PAGE, hidden: orderedReports.length - feedReports.length })}</button>}
            <div className="panel-footer">{isSupabaseConfigured ? <span><span className={`live-dot ${isOnline ? '' : 'is-offline'}`} /> {t('Live community feed')}</span> : <span>{t('Sample reports on this device')}</span>}{(categoryFilter !== 'All categories' || statusFilter !== ALL_STATUSES || search.trim() !== '' || barangayFilter !== '') && <button className="panel-footer-reset" type="button" onClick={() => { setCategoryFilter('All categories'); setStatusFilter(ALL_STATUSES); setSearch(''); if (barangayFilter) chooseBarangayFilter('') }}>{translate('resetFilters')}</button>}</div>
          </aside>
        </section>}

        <footer className="page-footer"><span className="footer-brand"><span className="brand-mark"><Leaf size={13} strokeWidth={2.2} /></span>GreenPulse</span><span>{t('Community environment monitoring')} <i>·</i> District 5, Quezon City</span></footer>
      </main>

      {!staffMode && <button className={`report-fab ${fabVisible ? 'is-visible' : ''}`} type="button" onClick={startReport} aria-label={t('New report')} aria-hidden={!fabVisible} tabIndex={fabVisible ? 0 : -1}><span className="report-fab-icon" aria-hidden="true"><Plus size={18} strokeWidth={2.6} /></span>{t('Report')}</button>}

      {openTile && <StatReportsModal
        icon={openTile.icon}
        tone={openTile.tone}
        eyebrow={staffMode ? t('STAFF DESK') : t('COMMUNITY REPORTS')}
        title={openTile.label}
        description={openTile.description}
        rows={statTileRows}
        loading={loadingReports}
        onSelect={openTileReport}
        onClose={() => setStatTile(undefined)}
        action={{ label: staffMode ? t('Open in staff queue') : t('Show on map and list'), run: () => showTileReports(openTile.tile) }}
      />}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      {celebrating && <SuccessBurst message={t('Report submitted. Thank you!')} onDone={() => setCelebrating(false)} />}
      <ViewLoader visible={viewTransition.loaderVisible} label={activeViewLabel} dark={theme === 'dark'} />

      {followUpReport && session && <ResidentReportModal report={followUpReport} userId={session.user.id} onClose={() => setFollowUpId(undefined)} onPosted={() => void deliverNotificationEmails(followUpReport.id)} />}

      {reporting && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReporting(false) }}>
        {reportStep === 'start' ? <Suspense fallback={<section className="report-modal report-start-modal is-loading" role="dialog" aria-modal="true" aria-label={t('Report an issue')}><span className="search-spinner" aria-label={t('Loading')} /></section>}>
          <ReportStart
            checker={photoChecker}
            guest={Boolean(isSupabaseConfigured && !session)}
            preparePhotos={prepareStartPhotos}
            onForm={(photos) => continueToReportForm(photos)}
            onFound={(guess, photos) => continueToReportForm(photos, guess)}
            onClose={() => setReporting(false)}
          />
        </Suspense> : <section className="report-modal report-form-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><div><p className="eyebrow">{t('COMMUNITY REPORT')}</p><h2 id="modal-title">{translate('reportFormTitle')}</h2><p>{isSupabaseConfigured && !session ? translate('guestFormSubtitle') : translate('reportFormSubtitle')}</p></div><button className="icon-button" type="button" onClick={() => setReporting(false)} aria-label={t('Close report form')}><X size={19} /></button></div>
          <form className="report-form" ref={reportFormRef} onSubmit={submitReport}>
            <label className="honeypot-field" aria-hidden="true">{t('Website')}<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <div className="report-form-grid">
              <div className="report-form-col">
                <section className="form-section">
                   <h3 className="form-section-title"><span>1</span>{translate('whatHappened')}</h3>
                   <label className="field-label">{translate('reportTitle')}<input ref={reportTitleRef} name="title" className={photoFilled.title ? 'is-autofilled' : undefined} onInput={() => setPhotoFilled((current) => ({ ...current, title: false }))} maxLength={90} placeholder={t('e.g. Waste piling up beside the road')} required /></label>
                   <fieldset className="choice-group"><legend>{translate('category')}</legend><div className="choice-chips">{intakeCategories.map((category) => { const CategoryIcon = categoryIcon(category); return <label className="choice-chip" key={category}><input type="radio" name="category" value={category} checked={reportCategory === category} onChange={() => { categoryChosen.current = true; setPhotoFilled((current) => ({ ...current, category: false })); setReportCategory(category) }} /><span><CategoryIcon size={15} />{t(category)}</span></label> })}</div></fieldset>
                   {photoFilled.category && <p className="barangay-autofill-note" role="status"><Sparkles size={13} />{t('Suggested from your photo. Change it if it looks wrong.')}</p>}
                   <label className="field-label">{translate('specificIssue')}<input ref={issueTypeRef} name="issue_type" list="issue-type-options" className={photoFilled.issueType ? 'is-autofilled' : undefined} onInput={() => setPhotoFilled((current) => ({ ...current, issueType: false }))} maxLength={80} placeholder={t('e.g. Clogged drainage')} required /></label>
                   <datalist id="issue-type-options">{(isReportCategory(reportCategory) ? issueTypesByCategory[reportCategory] : []).map((issueType) => <option key={issueType} value={issueType} />)}</datalist>
                   <fieldset className="choice-group"><legend>{translate('urgency')}</legend><div className="segmented">{['Low', 'Medium', 'High'].map((urgency) => <label className={`segment segment-${urgency.toLowerCase()}`} key={urgency}><input type="radio" name="urgency" value={urgency} defaultChecked={urgency === 'Medium'} /><span>{t(urgency)}</span></label>)}</div></fieldset>
                   <label className="field-label">{translate('whenObserved')}<input name="observed_at" type="datetime-local" value={observedAt} max={toLocalDateTimeInput(new Date())} onChange={(event) => setObservedAt(event.target.value)} required /></label>
                   <label className="field-label">{translate('whatHappening')}<textarea name="description" rows={4} maxLength={500} placeholder={translate('descriptionHint')} required /></label>
                   <label className="field-label">{translate('additionalInformation')} <span className="field-hint">{translate('optionalContext')}</span><textarea name="additional_info" rows={3} maxLength={2000} placeholder={t('Add access details, recurring patterns, or other useful context.')} /></label>
                </section>
              </div>
              <div className="report-form-col">
                <section className="form-section">
                  <h3 className="form-section-title"><span>2</span>{translate('where')}</h3>
            <div className="location-autocomplete-wrap">
              <label className="field-label" htmlFor="report-location">{translate('location')} <span className="field-hint">{t('Search a street, landmark, barangay, or facility')}</span></label>
              <div className={`location-autocomplete ${locationConfirmed ? 'location-confirmed' : ''}`}>
                <MapPin size={16} />
                <input id="report-location" name="location" value={locationQuery} onChange={(event) => { geocodeRequest.current += 1; setLocationQuery(event.target.value); setLocationConfirmed(false); setLocationSearchMessage('') }} placeholder={t('e.g. Batasan Hills, Quezon City')} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={locationSuggestions.length > 0} aria-controls="location-suggestions" />
                {locationSearchBusy && <span className="search-spinner" aria-label={t('Searching locations')} />}
                {locationConfirmed && <Check size={16} className="location-check" />}
              </div>
              {locationSuggestions.length > 0 && <ul className="location-suggestions" id="location-suggestions" role="listbox" aria-label={t('Suggested places')}>{locationSuggestions.map((suggestion) => {
                const suggestionBarangay = barangayBoundaries ? findBarangayAt(suggestion.coordinates, barangayBoundaries, boundaryTolerance) ?? null : undefined
                return <li key={`${suggestion.label}-${suggestion.coordinates.join(',')}`}><button type="button" role="option" aria-selected="false" disabled={suggestionBarangay === null} title={suggestionBarangay === null ? t('Outside District 5. Reports are accepted for District 5 only.') : undefined} onClick={() => { geocodeRequest.current += 1; setLocation(suggestion.coordinates); setMapCenter(suggestion.coordinates); setLocationQuery(suggestion.label); fillBarangayFromLabel(suggestion.label); setLocationConfirmed(true); setLocationSuggestions([]); setLocationSearchMessage(''); setFormError('') }}><MapPin size={15} /><span>{suggestion.label}<small>{suggestionBarangay ? <b className="suggestion-barangay">Brgy. {suggestionBarangay}</b> : suggestionBarangay === null ? <b className="suggestion-barangay is-outside">{t('Outside District 5')}</b> : null}{suggestion.coordinates[0].toFixed(5)}, {suggestion.coordinates[1].toFixed(5)}</small></span></button></li>
              })}</ul>}
              {locationSearchBusy && <p className="location-feedback" role="status">{t('Searching nearby places…')}</p>}
              {!locationSearchBusy && locationSearchMessage && <p className="location-feedback location-search-error" role="status">{locationSearchMessage}</p>}
              {!locationSearchBusy && locationQuery.trim().length >= 3 && !locationConfirmed && !locationSearchMessage && locationSuggestions.length === 0 && <p className="location-feedback" role="status">{t('No matches yet. Try another nearby name or use your current location.')}</p>}
              <p className="location-attribution">{t('Place suggestions by Photon · OpenStreetMap contributors')}</p>
            </div>
            <div className="barangay-field">
              <label className="field-label">{translate('barangay')}<select name="barangay" className={barangayAutofill === 'matched' ? 'is-autofilled' : undefined} value={reportBarangay} onChange={(event) => { changeReportBarangay(event.target.value) }} aria-describedby={barangayAutofill ? 'barangay-autofill-note' : undefined} required><option value="">{t('Select barangay')}</option>{DISTRICT_5_BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}</select></label>
              {pinAtBarangayCenter && barangayPin
                ? <p className="barangay-autofill-note" id="barangay-autofill-note" role="status" key={`pin-${reportBarangay}`}><MapPin size={13} />{t('Pin moved to the middle of Barangay {barangay}. Drag it or tap the map to mark the exact spot.', { barangay: barangayPin.barangay })}</p>
                : barangayAutofill === 'matched' && <p className="barangay-autofill-note" id="barangay-autofill-note" role="status" key={reportBarangay}><Check size={13} />{t('Filled in from the pinned location. Change it if it looks wrong.')}</p>}
              {barangayAutofill === 'outside' && <p className="barangay-autofill-note is-outside" id="barangay-autofill-note" role="status"><AlertTriangle size={13} />{t('This spot is outside District 5, so the report cannot be submitted. Move the pin inside the district.')}</p>}
            </div>
            <div className="location-picker-heading"><MapPin size={15} /><strong>{translate('pinExactSpot')}</strong><span>{translate('clickDragMap')}</span><button className="text-button" type="button" onClick={() => requestLocation()}><Crosshair size={14} /> {translate('useMyLocation')}</button></div>
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
                  placed={locationConfirmed}
                /> : <MapSkeleton />}
              </Suspense>
            </div>
            <div className="location-field"><div className="location-copy"><MapPin size={16} /><span><strong>{locationConfirmed ? t('Selected location') : t('Choose a map location')}</strong><small>{locationConfirmed ? `${location[0].toFixed(5)}, ${location[1].toFixed(5)}` : t('Pick a search suggestion or use GPS')}</small></span></div></div>
            {/* Guests read about their contact details in the follow-up step, next to those fields. */}
            {isSupabaseConfigured && <p className="privacy-note">{session ? t('Your account identity stays private. The public map shows approximate report locations.') : t('The public map shows approximate report locations.')}</p>}
            {nearbySuggestions.length > 0 && <section className="nearby-suggestions" aria-label={t('Similar open reports nearby')}><div><strong>{t('Similar open reports nearby')}</strong><p>{isStaffRole ? t('If one is the same issue, follow it or confirm it is still present.') : t('If one is the same issue, view or follow it instead of filing again.')}</p></div>{nearbySuggestions.map((candidate) => <article className="nearby-suggestion" key={candidate.id}><span><strong>{candidate.title}</strong><small>{t(candidate.status)} · {candidate.barangay ? `${t('Barangay {barangay}', { barangay: candidate.barangay })} · ` : ''}{t('{distance} m away', { distance: Math.round(distanceInMeters(candidate.coordinates, location)) })}</small></span><div className="nearby-suggestion-actions"><button className="text-button" type="button" onClick={() => { setReporting(false); setStaffMode(false); setSelectedId(candidate.id); setMapCenter(candidate.coordinates) }}>{t('View')}</button>{session && <button className="text-button" type="button" onClick={() => void toggleReportFollow(candidate)}>{followedReportIds.includes(candidate.id) ? t('Unfollow') : t('Follow')}</button>}{isStaffRole && <button className="text-button" type="button" onClick={() => void confirmNearbyReport(candidate)}>{t('Confirm still present')}</button>}</div></article>)}</section>}
                </section>
                <section className="form-section">
            <h3 className="form-section-title"><span>3</span>{translate('photo')}</h3>
            <div className="photo-row"><label className="upload-button"><Camera size={15} />{photoFiles.length ? `${translate('addPhotos')} (${photoFiles.length}/${MAX_REPORT_PHOTOS})` : translate('addPhotos')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void handlePhotos(event.target.files); event.currentTarget.value = '' }} /></label><span>{t('Optional · up to {count} JPEG, PNG, or WebP photos', { count: MAX_REPORT_PHOTOS })} · {t('max')} {isSupabaseConfigured && !session ? t('2.5 MB each for guests') : t('5 MB each')} · {t('compressed before upload')}</span></div>
            {photoPreviews.length > 0 && <div className="report-photo-previews">{photoPreviews.map((preview, index) => <div className="report-photo-preview" key={`${index}-${preview.slice(-24)}`}><img className="photo-preview" src={preview} alt={t('Selected report attachment {number}', { number: index + 1 })} /><button className="remove-photo" type="button" aria-label={t('Remove report photo {number}', { number: index + 1 })} onClick={() => { setPhotoPreviews((current) => current.filter((_, photoIndex) => photoIndex !== index)); setPhotoFiles((current) => current.filter((_, photoIndex) => photoIndex !== index)) }}><X size={13} /> {t('Remove')}</button></div>)}</div>}
            {/* Off keeps the photos private; on shares them publicly once the report is verified. */}
            {photoFiles.length > 0 && (session || !isSupabaseConfigured) && <div className="photo-visibility">
              <label className={`photo-visibility-toggle${photoVisibility === 'public' ? ' is-public' : ''}`}>
                <span className="photo-visibility-icon" aria-hidden="true">{photoVisibility === 'public' ? <Globe size={16} /> : <Lock size={16} />}</span>
                <span className="photo-visibility-copy"><b>{t('Make photos public')}</b><small id="photo-visibility-state">{photoVisibility === 'public' ? t('Public: anyone on the map, guests included, can see them once staff verify the report.') : t('Private: only you, responders and admins can see them.')}</small></span>
                <input type="checkbox" role="switch" name="photos_public" checked={photoVisibility === 'public'} onChange={(event) => setPhotoVisibility(event.target.checked ? 'public' : 'private')} aria-describedby="photo-visibility-state" />
                <i aria-hidden="true" />
              </label>
              {photoVisibility === 'public' && <p className="workflow-hint" role="status">{t('Make sure your photos don\'t show faces, plate numbers or anything else you don\'t want to share.')}</p>}
            </div>}
            {photoFiles.length > 0 && isSupabaseConfigured && !session && <p className="workflow-hint photo-visibility-note"><Lock size={13} aria-hidden="true" /> {t('Guest photos stay private: only responders and admins see them.')}</p>}
            <PhotoIssueSuggestion
              state={photoSuggestion.state}
              applied={photoGuessApplied}
              onAccept={photoSuggestion.accept}
              onDismiss={photoSuggestion.dismiss}
              onApply={() => { if (photoSuggestion.state.status === 'suggested') applyPhotoGuess(photoSuggestion.state.guess, true) }}
            />
                </section>
                {isSupabaseConfigured && !session && <section className="form-section guest-contact-section"><h3 className="form-section-title"><span>4</span>{translate('followUp')}</h3><p className="workflow-hint">{t('Provide at least one contact for security and follow-up. Your email and phone number stay private.')}</p><label className="field-label">{t('Email address')}<input name="contact_email" type="email" autoComplete="email" maxLength={254} placeholder={t('you@example.com')} /></label><label className="field-label">{t('Mobile number')}<input name="contact_phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={24} placeholder={t('09XXXXXXXXX or +639XXXXXXXXX')} /></label><p className="workflow-hint">{t('You can still track the report with the code shown after submission.')}</p></section>}
              </div>
            </div>
            <label className="privacy-consent"><input type="checkbox" name="public_display_consent" required /><span>{translate('publicConsent')} <small>{translate('retentionNotice')}</small></span></label>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            {formNotice && <p className="workflow-success" role="status">{formNotice}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => void saveReportDraft(false)}>{t('Save draft')}</button>{isSupabaseConfigured && !isOnline && <button className="secondary-button" type="button" onClick={() => void saveReportDraft(true)}>{t('Queue for upload')}</button>}<button className="secondary-button" type="button" onClick={() => setReporting(false)}>{translate('cancel')}</button><button className="primary-button" type="submit" disabled={loadingReports || guestSubmitting || (isSupabaseConfigured && !isOnline)}>{guestSubmitting ? t('Submitting…') : loadingReports ? t('Connecting…') : <><Check size={16} /> {translate('submitReport')}</>}</button></div>
          </form>
        </section>}
      </div>}

      {guestTrackingOpen && <GuestReportTracking initialToken={guestTrackingToken} emailSent={guestTrackingEmailSent} onClose={() => { setGuestTrackingOpen(false); setGuestTrackingToken(undefined); setGuestTrackingEmailSent(false) }} />}

      {communityDiscussionReport && <CommunityReportDiscussion report={communityDiscussionReport} userId={session?.user.id} canComment={profile?.role === 'resident'} onSignIn={() => openAuthModal('sign-in')} onClose={() => setCommunityDiscussionId(undefined)} />}

      {responderModalOpen && profile?.role === 'admin' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !responderBusy) setResponderModalOpen(false) }}>
        <section className="report-modal responder-modal" role="dialog" aria-modal="true" aria-labelledby="responder-title">
          <div className="modal-header"><div><p className="eyebrow">{t('STAFF DESK')}</p><h2 id="responder-title">{t('Add a responder')}</h2><p>{t('Send an invitation email so they can finish setting up their account.')}</p></div><button className="icon-button" type="button" onClick={() => setResponderModalOpen(false)} disabled={responderBusy} aria-label={t('Close add responder form')}><X size={19} /></button></div>
          <form onSubmit={(event) => void createResponder(event)}>
            <label className="field-label">{t('Responder name')}<input name="display_name" autoComplete="name" minLength={2} maxLength={80} required /></label>
            <label className="field-label">{t('Email address')}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            {responderMessage && <p className="form-error" role="alert">{responderMessage}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setResponderModalOpen(false)} disabled={responderBusy}>{t('Cancel')}</button><button className="primary-button" type="submit" disabled={responderBusy}>{responderBusy ? t('Sending invitation…') : <><Plus size={15} /> {t('Invite responder')}</>}</button></div>
          </form>
        </section>
      </div>}

      {teamModalOpen && profile?.role === 'admin' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTeamModalOpen(false) }}>
        <section className="report-modal team-modal" role="dialog" aria-modal="true" aria-labelledby="team-title">
          <div className="modal-header"><div><p className="eyebrow">{t('STAFF DESK')}</p><h2 id="team-title">{t('Manage teams')}</h2><p>{t('Group responders so reports can be assigned to a crew.')}</p></div><button className="icon-button" type="button" onClick={() => setTeamModalOpen(false)} aria-label={t('Close team manager')}><X size={19} /></button></div>
          <form className="team-create" onSubmit={createTeam}><label className="field-label">{t('New team name')}<input name="team_name" maxLength={60} placeholder={t('e.g. Drainage crew')} required /></label><button className="primary-button" type="submit" disabled={teamBusy}><Plus size={15} /> {t('Add team')}</button></form>
          {teamMessage && <p className="form-error" role="alert">{teamMessage}</p>}
          <div className="team-list">{teams.length === 0 ? <p className="staff-empty">{t('No teams yet. Create one above.')}</p> : teams.map((team) => <div className="team-card" key={team.id}>
            <div className="team-card-heading"><strong><Users size={15} />{team.name}</strong><span>{team.memberIds.length} {team.memberIds.length === 1 ? t('member') : t('members')}</span><button className="icon-button" type="button" disabled={teamBusy} onClick={() => setTeamDeleteId(team.id)} aria-label={t('Delete {name}', { name: team.name })} aria-expanded={teamDeleteId === team.id}><Trash2 size={15} /></button></div>
            {teamDeleteId === team.id && <div className="team-delete-confirm" role="group" aria-label={t('Confirm deleting {name}', { name: team.name })}><span>{t('Delete this team?')} <strong>{team.name}</strong> · {t('Reports assigned to this team become unassigned. This can’t be undone.')}</span><div><button className="secondary-button" type="button" disabled={teamBusy} onClick={() => setTeamDeleteId(undefined)}>{t('Keep team')}</button><button className="secondary-button button-danger" type="button" disabled={teamBusy} onClick={() => void deleteTeam(team)}><Trash2 size={14} /> {t('Delete team')}</button></div></div>}
            <div className="choice-chips">{staffUsers.map((user) => <label className="choice-chip" key={user.id}><input type="checkbox" checked={team.memberIds.includes(user.id)} disabled={teamBusy} onChange={() => void toggleTeamMember(team, user.id)} /><span>{user.display_name || t('Unnamed staff member')}</span></label>)}</div>
          </div>)}</div>
        </section>
      </div>}

      {authModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuthModal() }}>
        {pendingConfirmation ? <section className="report-modal auth-modal auth-code-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="icon-button auth-code-close" type="button" onClick={closeAuthModal} aria-label={t('Close sign-in form')}><X size={19} /></button>
          <EmailCodeStep
            key={pendingConfirmation.email}
            email={pendingConfirmation.email}
            status={codeStatus}
            errorMessage={codeError}
            errorNonce={codeErrorNonce}
            notice={codeNotice}
            resendSeconds={confirmationResendSeconds}
            cooldownSeconds={pendingConfirmation.cooldownSeconds}
            resendBusy={codeResendBusy}
            onComplete={(code) => void verifyEmailCode(code)}
            onResend={resendConfirmation}
            onChangeEmail={() => openAuthModal(pendingConfirmation.purpose === 'recovery' ? 'reset' : 'sign-up', { prefill: { ...authPrefill, email: pendingConfirmation.email } })}
            purpose={pendingConfirmation.purpose}
          />
        </section> : <section className="report-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="modal-header"><div><p className="eyebrow">{t('DISTRICT 5 COMMUNITY ACCOUNT')}</p><h2 id="auth-title">{authTitle}</h2><p>{authSubtitle}</p></div><button className="icon-button" type="button" onClick={closeAuthModal} aria-label={t('Close sign-in form')}><X size={19} /></button></div>
          <form onSubmit={submitAuth}>
            {authModal === 'sign-up' && <label className="field-label">{t('Name')}<input name="display_name" autoComplete="name" maxLength={80} defaultValue={authPrefill.displayName} required /></label>}
            {authModal !== 'new-password' && <label className="field-label">{t('Email')}<input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={authPrefill.email} required /></label>}
            {(authModal === 'sign-in' || authModal === 'sign-up') && <label className="field-label">{t('Password')}<input name="password" type="password" autoComplete={authModal === 'sign-up' ? 'new-password' : 'current-password'} minLength={authModal === 'sign-up' ? 8 : undefined} placeholder={authModal === 'sign-up' ? t('At least 8 characters') : undefined} required /></label>}
            {authModal === 'sign-in' && <button className="text-button auth-forgot" type="button" disabled={authBusy} onClick={(event) => {
              const typed = (event.currentTarget.form?.elements.namedItem('email') as HTMLInputElement | null)?.value.trim()
              openAuthModal('reset', { prefill: { ...authPrefill, email: typed || authPrefill.email } })
            }}>{t('Forgot password?')}</button>}
            {authModal === 'new-password' && <>
              {session?.user.email && <input type="email" name="username" autoComplete="username" value={session.user.email} readOnly hidden />}
              <label className="field-label">{t('New password')}<input name="password" type="password" autoComplete="new-password" minLength={8} placeholder={t('At least 8 characters')} required /></label>
              <label className="field-label">{t('Confirm new password')}<input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required /></label>
            </>}
            {authMessage && <p className={authMessageSuccess ? 'auth-success' : 'form-error'} role={authMessageSuccess ? 'status' : 'alert'}>{authMessage}</p>}
            {authSuggestion && <button className="text-button" type="button" onClick={followAuthSuggestion} disabled={authBusy}>{authSuggestion === 'sign-up' ? t('Create an account instead') : t('Sign in instead')}</button>}
            <div className="modal-actions">
              {authModal === 'new-password' ? <span /> : <button className="text-button" type="button" onClick={() => openAuthModal(authModal === 'sign-in' ? 'sign-up' : 'sign-in', { prefill: authPrefill })} disabled={authBusy}>{authModal === 'sign-up' ? t('Already have an account? Sign in') : authModal === 'reset' ? t('Back to sign in') : t('Create an account')}</button>}
              <button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? t('Please wait…') : authModal === 'sign-up' ? t('Create account') : authModal === 'reset' ? t('Send code') : authModal === 'new-password' ? t('Save password') : t('Sign in')}</button>
            </div>
          </form>
        </section>}
      </div>}

      {profileModal && profile && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileModal(false) }}>
        <section className="report-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
          <div className="modal-header"><div><p className="eyebrow">{t('YOUR COMMUNITY ACCOUNT')}</p><h2 id="profile-title">{t('Profile settings')}</h2><p>{t('Keep your name and account image up to date.')}</p></div><button className="icon-button" type="button" onClick={() => setProfileModal(false)} aria-label={t('Close profile settings')}><X size={19} /></button></div>
          <form id="profile-form" onSubmit={saveProfile}>
            <div className="profile-editor"><div className="profile-avatar-large">{profileAvatarPreview || profileAvatarUrl ? <img src={profileAvatarPreview || profileAvatarUrl} alt={t('Profile preview')} /> : <UserRound size={27} />}</div><label className="upload-button"><Upload size={15} /> {t('Change photo')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleProfileAvatar(event.target.files?.[0])} /></label><span className="profile-upload-note">{t('JPEG, PNG, or WebP · max 3 MB')}</span></div>
            <label className="field-label">{t('Display name')}<input name="display_name" defaultValue={profile.display_name} maxLength={80} required /></label>
            <label className="field-label">{session?.user.email ? t('Email') : t('Phone number')}<input value={session?.user.email ?? session?.user.phone ?? ''} readOnly /></label>
            <div className="field-label">{t('Role')}<span><span className={`profile-role-badge role-${profile.role}`}>{getRoleLabel(profile.role)}</span></span></div>
            {session?.user.email ? <label className="notification-email-setting"><input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications !== false} /><span><strong>{t('Email notifications')}</strong><small>{t('Send report updates to this account\'s email address.')}</small></span></label> : <p className="workflow-hint">{t('Report updates will appear in the in-app inbox for this phone-based account.')}</p>}
          </form>
          {session?.user.email && <form className="password-settings" onSubmit={savePassword}>
            <div><h3>{t('Sign-in password')}</h3><p>{t('Change the password you use to sign in. It is saved on its own, separately from your profile.')}</p></div>
            <label className="field-label">{t('New password')}<input name="new_password" type="password" minLength={8} autoComplete="new-password" required /></label>
            <label className="field-label">{t('Confirm new password')}<input name="confirm_password" type="password" minLength={8} autoComplete="new-password" required /></label>
            {passwordMessage && <p className={passwordMessageSuccess ? 'auth-success' : 'form-error'} role={passwordMessageSuccess ? 'status' : 'alert'}>{passwordMessage}</p>}
            <div className="modal-actions"><button className="secondary-button" type="submit" disabled={passwordSaving}>{passwordSaving ? t('Saving…') : t('Change password')}</button></div>
          </form>}
          {/* The profile's own actions close the sheet, so they sit at the very end, after the password section. */}
          <div className="modal-actions profile-actions"><button className="text-button profile-signout" type="button" onClick={() => { setProfileModal(false); void supabase?.auth.signOut() }}><LogOut size={14} /> {t('Sign out')}</button><button className="secondary-button" type="button" onClick={() => setProfileModal(false)}>{t('Cancel')}</button><button className="primary-button" type="submit" form="profile-form" disabled={profileSaving}>{profileSaving ? t('Saving…') : <><Check size={16} /> {t('Save profile')}</>}</button></div>
        </section>
      </div>}
    </div>
  )
}

export default App
