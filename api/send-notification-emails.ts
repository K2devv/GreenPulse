import { createClient } from '@supabase/supabase-js'

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

function jsonResponse(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.NOTIFICATION_FROM_EMAIL
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !resendApiKey || !senderEmail) {
    return jsonResponse({ error: 'Email notifications are not configured on the server.' }, 503)
  }

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return jsonResponse({ error: 'Sign in to deliver report notifications.' }, 401)

  let payload: { reportId?: unknown }
  try {
    payload = await request.json() as typeof payload
  } catch {
    return jsonResponse({ error: 'A report identifier is required.' }, 400)
  }
  const reportId = typeof payload.reportId === 'string' ? payload.reportId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return jsonResponse({ error: 'A valid report identifier is required.' }, 400)
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
    if (authError || !user) return jsonResponse({ error: 'Your session expired. Sign in again.' }, 401)

    const [{ data: report, error: reportError }, { data: profile, error: profileError }] = await Promise.all([
      adminClient.from('reports').select('id, reporter_id').eq('id', reportId).maybeSingle(),
      authClient.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    ])
    if (reportError || profileError) return jsonResponse({ error: 'Could not verify report access.' }, 500)
    if (!report) return jsonResponse({ error: 'Report not found.' }, 404)
    if (report.reporter_id !== user.id && profile?.role !== 'responder' && profile?.role !== 'admin') {
      return jsonResponse({ error: 'You are not authorized to deliver notifications for this report.' }, 403)
    }

    const { data: pending, error: pendingError } = await adminClient
      .from('notifications')
      .select('id, recipient_id, title, message')
      .eq('report_id', reportId)
      .is('email_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(50)
    if (pendingError) return jsonResponse({ error: 'Could not load pending email notifications.' }, 500)

    let sent = 0
    for (const notification of pending ?? []) {
      const { data: recipientProfile, error: recipientProfileError } = await adminClient
        .from('profiles')
        .select('email_notifications')
        .eq('id', notification.recipient_id)
        .maybeSingle()
      if (recipientProfileError) return jsonResponse({ error: 'Could not load notification preferences.' }, 500)

      if (recipientProfile?.email_notifications === false) {
        await adminClient.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', notification.id).is('email_sent_at', null)
        continue
      }

      const { data: recipient, error: recipientError } = await adminClient.auth.admin.getUserById(notification.recipient_id)
      if (recipientError) return jsonResponse({ error: 'Could not load a notification recipient.' }, 500)
      if (!recipient.user?.email) continue

      const delivery = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [recipient.user.email],
          subject: `GreenPulse: ${notification.title}`,
          text: `${notification.message}\n\nSign in to GreenPulse to view the report and its latest updates.`,
        }),
      })
      if (!delivery.ok) {
        console.error('Notification email delivery failed:', await delivery.text())
        return jsonResponse({ error: 'An email notification could not be delivered.' }, 502)
      }

      const { error: markError } = await adminClient
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', notification.id)
        .is('email_sent_at', null)
      if (markError) return jsonResponse({ error: 'Email was delivered but its delivery record could not be saved.' }, 500)
      sent += 1
    }

    return jsonResponse({ sent: String(sent) })
  } catch (error) {
    console.error('Notification email endpoint failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonResponse({ error: 'Email notifications are temporarily unavailable.' }, 500)
  }
}
