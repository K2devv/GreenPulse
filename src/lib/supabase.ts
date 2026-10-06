import { createClient } from '@supabase/supabase-js'

const environment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}
const supabaseUrl = environment.VITE_SUPABASE_URL
const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null

export function getAuthRedirectUrl() {
  return environment.VITE_APP_URL || window.location.origin
}

export type Profile = {
  id: string
  display_name: string
  avatar_path?: string | null
  email_notifications?: boolean
  role: 'resident' | 'responder' | 'admin'
}

export type NotificationRow = {
  id: number
  report_id: string
  event_type: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

export type ReportRow = {
  id: string
  title: string
  category: 'Waste' | 'Pollution' | 'Flooding' | 'Drainage' | 'Water pollution' | 'Air pollution'
  status: 'Submitted' | 'Under review' | 'Additional information requested' | 'Verified' | 'In progress' | 'Awaiting verification' | 'Resolved' | 'Rejected' | 'Closed'
  urgency: 'Low' | 'Medium' | 'High'
  description: string
  issue_type?: string
  observed_at?: string
  additional_info?: string | null
  location_label: string
  latitude: number
  longitude: number
  created_at: string
  updated_at?: string
  photo_path?: string | null
  photo_paths?: string[]
  assigned_to?: string | null
  reporter_id?: string
  resolution_note?: string | null
  resolved_at?: string | null
  reporter_display_name?: string | null
  reporter?: { display_name?: string | null } | null
}

export type ReportEvent = {
  id: number
  event_type: string
  message: string
  created_at: string
}

export function toReport(row: ReportRow) {
  const reporterName = row.reporter_display_name || row.reporter?.display_name || undefined
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    issueType: row.issue_type ?? row.category,
    status: row.status,
    urgency: row.urgency,
    description: row.description,
    location: row.location_label || 'Community location',
    coordinates: [row.latitude, row.longitude] as [number, number],
    createdAt: row.created_at,
    observedAt: row.observed_at ?? row.created_at,
    additionalInfo: row.additional_info ?? undefined,
    photoPath: row.photo_path ?? undefined,
    photoPaths: row.photo_paths ?? (row.photo_path ? [row.photo_path] : []),
    assignedTo: row.assigned_to ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    reporterId: row.reporter_id,
    ...(reporterName ? { reporterName } : {}),
  }
}