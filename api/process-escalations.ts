import { createClient } from '@supabase/supabase-js'

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
}

async function isValidCronToken(request: Request, expected: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const actualBytes = new TextEncoder().encode(token)
  const expectedBytes = new TextEncoder().encode(expected)
  if (actualBytes.length !== expectedBytes.length) return false
  let difference = 0
  for (let index = 0; index < actualBytes.length; index += 1) difference |= actualBytes[index] ^ expectedBytes[index]
  return difference === 0
}

export default async function handler(request: Request): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return jsonResponse({ error: 'Method not allowed.' }, 405)
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const cronSecret = process.env.CRON_SECRET
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Escalation processing is not configured.' }, 503)

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const cronAuthorized = Boolean(cronSecret && await isValidCronToken(request, cronSecret))
  if (!cronAuthorized) {
    if (!token || !supabaseAnonKey) return jsonResponse({ error: 'Unauthorized.' }, 401)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) return jsonResponse({ error: 'Sign in as an administrator to run this check.' }, 401)
    const { data: profile, error: profileError } = await authClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError || profile?.role !== 'admin') return jsonResponse({ error: 'Only administrators can run this check.' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const [{ data: settings, error: settingsError }, { data: reports, error: reportsError }] = await Promise.all([
    admin.from('response_settings').select('response_sla_hours, high_urgency_sla_hours, second_escalation_multiplier').eq('singleton', true).single(),
    admin.from('reports').select('id, title, status, urgency, created_at, started_at, assigned_to, assigned_team_id').not('status', 'in', '(Resolved,Rejected,Closed,Duplicate)'),
  ])
  if (settingsError || reportsError || !settings) return jsonResponse({ error: 'Escalation data could not be loaded.' }, 500)

  let stagesCreated = 0
  const reportsWithNewEscalations = new Set<string>()
  const now = Date.now()
  for (const report of reports ?? []) {
    const baseHours = report.urgency === 'High' ? settings.high_urgency_sla_hours : settings.response_sla_hours
    const ageHours = (now - new Date(report.created_at).getTime()) / 3_600_000
    const missedFirstResponse = !report.started_at && ageHours >= baseHours
    const missedSecondWindow = ageHours >= baseHours * settings.second_escalation_multiplier
    const maxStage = missedSecondWindow ? 2 : missedFirstResponse ? 1 : 0
    for (let stage = 1; stage <= maxStage; stage += 1) {
      const { data: created, error: escalationError } = await admin.rpc('raise_report_sla_escalation', {
        p_report_id: report.id,
        p_stage: stage,
      })
      if (escalationError) return jsonResponse({ error: `Could not record escalation for report ${report.id}.` }, 500)
      if (created) {
        stagesCreated += 1
        reportsWithNewEscalations.add(report.id)
      }
    }
  }
  let emailFailures = 0
  const deliveryToken = cronSecret || token
  for (const reportId of reportsWithNewEscalations) {
    try {
      const delivery = await fetch(new URL('/api/send-notification-emails', request.url), {
        method: 'POST',
        headers: { Authorization: `Bearer ${deliveryToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      })
      if (!delivery.ok) emailFailures += 1
    } catch {
      emailFailures += 1
    }
  }
  return jsonResponse({ processed: (reports ?? []).length, stagesCreated, emailFailures, checkedAt: new Date(now).toISOString() })
}
