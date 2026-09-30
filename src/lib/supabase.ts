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
  role: 'resident' | 'responder' | 'admin'
}

export type ReportRow = {
  id: string
  title: string
  category: 'Waste' | 'Flooding' | 'Water pollution' | 'Air pollution' | 'Drainage'
  status: 'Submitted' | 'Under review' | 'Verified' | 'In progress' | 'Resolved' | 'Rejected'
  urgency: 'Low' | 'Medium' | 'High'
  description: string
  location_label: string
  latitude: number
  longitude: number
  created_at: string
  updated_at?: string
  photo_path?: string | null
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
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    urgency: row.urgency,
    description: row.description,
    location: row.location_label || 'Community location',
    coordinates: [row.latitude, row.longitude] as [number, number],
    createdAt: row.created_at,
    photoPath: row.photo_path ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
    reporterId: row.reporter_id,
    reporterName: row.reporter_display_name || row.reporter?.display_name || undefined,
  }
}