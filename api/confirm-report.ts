import { createClient } from '@supabase/supabase-js'
import { claimRateLimit, hashRateLimitSubject, rateLimitAddress } from '../server/request-safety'
import { withAppCors } from '../server/app-cors'

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
  })
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'Report confirmations are not configured on the server.' }, 503)

  let payload: { reportId?: unknown }
  try { payload = await request.json() as typeof payload } catch { return jsonResponse({ error: 'A report identifier is required.' }, 400) }
  const reportId = typeof payload.reportId === 'string' ? payload.reportId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return jsonResponse({ error: 'A valid report identifier is required.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  let reporterId: string | null = null
  let guestIpHash: string | null = null
  if (accessToken) {
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { autoRefreshToken: false, persistSession: false } })
    const { data: { user }, error } = await authClient.auth.getUser(accessToken)
    if (error || !user) return jsonResponse({ error: 'Your session expired. Sign in again.' }, 401)
    reporterId = user.id
  } else {
    const address = rateLimitAddress(request)
    if (!address) return jsonResponse({ error: 'Report confirmation is temporarily unavailable.' }, 503)
    const [hourLimit, dayLimit] = await Promise.all([
      claimRateLimit(admin, `ip:${address}`, serviceRoleKey, 'guest_confirmation_hour', 10, 3600),
      claimRateLimit(admin, `ip:${address}`, serviceRoleKey, 'guest_confirmation_day', 20, 86400),
    ])
    if (hourLimit.error || dayLimit.error) return jsonResponse({ error: 'Report confirmation is temporarily unavailable.' }, 503)
    if (!hourLimit.allowed || !dayLimit.allowed) return jsonResponse({ error: 'Too many recent confirmations. Please try again later.' }, 429)
    guestIpHash = await hashRateLimitSubject(`ip:${address}:report:${reportId}`, serviceRoleKey)
  }

  const { data: report, error: reportError } = await admin.from('reports').select('id, status').eq('id', reportId).maybeSingle()
  if (reportError) return jsonResponse({ error: 'The report could not be checked.' }, 500)
  if (!report || ['Resolved', 'Closed', 'Rejected', 'Duplicate'].includes(report.status)) return jsonResponse({ error: 'This report is no longer open for confirmations.' }, 409)

  const { error: insertError } = await admin.from('report_confirmations').insert({ report_id: reportId, reporter_id: reporterId, guest_ip_hash: guestIpHash })
  if (insertError?.code === '23505') return jsonResponse({ error: 'You have already confirmed this report.' }, 409)
  if (insertError) return jsonResponse({ error: 'Your confirmation could not be saved.' }, 500)
  return jsonResponse({ confirmed: true })
}

export default withAppCors(handler)
