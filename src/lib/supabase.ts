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

export type Team = {
  id: string
  name: string
  memberIds: string[]
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
  status: 'Submitted' | 'Under review' | 'Additional information requested' | 'Verified' | 'In progress' | 'Awaiting verification' | 'Resolved' | 'Rejected' | 'Closed' | 'Duplicate'
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
  assigned_team_id?: string | null
  barangay?: string | null
  verified_by?: string | null
  verified_at?: string | null
  verification_note?: string | null
  duplicate_of?: string | null
  assigned_at?: string | null
  due_date?: string | null
  task_instructions?: string | null
  task_priority?: 'Low' | 'Medium' | 'High' | null
  resolution_photo_paths?: string[] | null
  resolution_decision?: 'approved' | 'rejected' | 'action_requested' | null
  resolution_review_note?: string | null
  resolution_reviewed_by?: string | null
  resolution_reviewed_at?: string | null
  reporter_id?: string | null
  resolution_note?: string | null
  resolved_at?: string | null
  started_at?: string | null
  escalated_at?: string | null
  reporter_display_name?: string | null
  reporter?: { display_name?: string | null } | null
}

export type ReportResolutionFeedback = {
  report_id: string
  feedback: 'fixed' | 'still_there'
  message: string | null
  updated_at: string
}

export type EnvironmentalFollowUp = {
  id: string
  title: string
  category: 'Waste' | 'Pollution' | 'Flooding' | 'Drainage'
  barangay: string | null
  location_label: string
  latitude: number
  longitude: number
  source_report_ids: string[]
  status: 'Scheduled' | 'Completed' | 'Dismissed'
  assigned_team_id: string | null
  due_date: string | null
  completion_note: string | null
  created_by: string
  created_at: string
  completed_at: string | null
}

export type ReportEvent = {
  id: number
  event_type: string
  message: string
  created_at: string
}

/** Reporter ids to look up in `profiles`, without blanks or repeats. */
export function reporterIdsOf(rows: readonly Pick<ReportRow, 'reporter_id'>[]): string[] {
  return [...new Set(rows.map((row) => row.reporter_id).filter((id): id is string => Boolean(id)))]
}

/**
 * Adds each report's reporter name from `profiles` rows. Reports and profiles both reference
 * auth.users rather than each other, so the database cannot join them in one query.
 */
export function attachReporterNames(rows: readonly ReportRow[], profiles: ReadonlyArray<{ id: string; display_name?: string | null }>): ReportRow[] {
  const names = new Map(profiles.map((profile) => [profile.id, profile.display_name ?? null]))
  return rows.map((row) => (row.reporter_id && names.has(row.reporter_id) ? { ...row, reporter: { display_name: names.get(row.reporter_id) } } : row))
}

export function toReport(row: ReportRow) {
  const reporterName = row.reporter_display_name || row.reporter?.display_name || (row.reporter_id === null ? 'Guest reporter' : undefined)
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
    assignedTeamId: row.assigned_team_id ?? undefined,
    barangay: row.barangay ?? undefined,
    verifiedBy: row.verified_by ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    verificationNote: row.verification_note ?? undefined,
    duplicateOf: row.duplicate_of ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
    dueDate: row.due_date ?? undefined,
    taskInstructions: row.task_instructions ?? undefined,
    taskPriority: row.task_priority ?? undefined,
    resolutionPhotoPaths: row.resolution_photo_paths ?? [],
    resolutionDecision: row.resolution_decision ?? undefined,
    resolutionReviewNote: row.resolution_review_note ?? undefined,
    resolutionReviewedBy: row.resolution_reviewed_by ?? undefined,
    resolutionReviewedAt: row.resolution_reviewed_at ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    escalatedAt: row.escalated_at ?? undefined,
    reporterId: row.reporter_id,
    ...(reporterName ? { reporterName } : {}),
  }
}
