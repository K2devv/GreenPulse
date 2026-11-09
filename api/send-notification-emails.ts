import { createClient } from '@supabase/supabase-js'
import { withAppCors } from '../server/app-cors'

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

async function isValidCronToken(request: Request, expected: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const actualBytes = new TextEncoder().encode(token)
  const expectedBytes = new TextEncoder().encode(expected)
  if (actualBytes.length !== expectedBytes.length) return false
  let difference = 0
  for (let index = 0; index < actualBytes.length; index += 1) difference |= actualBytes[index] ^ expectedBytes[index]
  return difference === 0
}

function jsonResponse(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const cronSecret = process.env.CRON_SECRET
  const resendApiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.NOTIFICATION_FROM_EMAIL
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !resendApiKey || !senderEmail) {
    return jsonResponse({ error: 'Email notifications are not configured on the server.' }, 503)
  }

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const cronAuthorized = Boolean(cronSecret && await isValidCronToken(request, cronSecret))
  if (!accessToken && !cronAuthorized) return jsonResponse({ error: 'Sign in to deliver report notifications.' }, 401)

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

  const authClient = accessToken ? createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  }) : null
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: report, error: reportError } = await adminClient.from('reports').select('id, reporter_id, title, status').eq('id', reportId).maybeSingle()
    if (reportError) return jsonResponse({ error: 'Could not verify report access.' }, 500)
    if (!report) return jsonResponse({ error: 'Report not found.' }, 404)
    if (!cronAuthorized) {
      if (!authClient || !accessToken) return jsonResponse({ error: 'Sign in to deliver report notifications.' }, 401)
      const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
      if (authError || !user) return jsonResponse({ error: 'Your session expired. Sign in again.' }, 401)
      const { data: profile, error: profileError } = await authClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (profileError) return jsonResponse({ error: 'Could not verify report access.' }, 500)
      if (report.reporter_id !== user.id && profile?.role !== 'responder' && profile?.role !== 'admin') {
        return jsonResponse({ error: 'You are not authorized to deliver notifications for this report.' }, 403)
      }
    }

    const { data: pending, error: pendingError } = await adminClient
      .from('notifications')
      .select('id, recipient_id, title, message, email_attempt_count')
      .eq('report_id', reportId)
      .is('email_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(50)
    if (pendingError) return jsonResponse({ error: 'Could not load pending email notifications.' }, 500)

    let sent = 0
    let failed = 0
    for (const notification of pending ?? []) {
      const attemptAt = new Date().toISOString()
      const attemptCount = Number(notification.email_attempt_count ?? 0) + 1
      const { error: attemptError } = await adminClient.from('notifications').update({
        email_attempt_count: attemptCount,
        email_last_attempt_at: attemptAt,
        email_last_error: null,
        email_delivery_status: 'pending',
      }).eq('id', notification.id).is('email_sent_at', null)
      if (attemptError) return jsonResponse({ error: 'Could not record the email delivery attempt.' }, 500)

      const { data: recipientProfile, error: recipientProfileError } = await adminClient
        .from('profiles')
        .select('email_notifications')
        .eq('id', notification.recipient_id)
        .maybeSingle()
      if (recipientProfileError) return jsonResponse({ error: 'Could not load notification preferences.' }, 500)

      if (recipientProfile?.email_notifications === false) {
        await adminClient.from('notifications').update({ email_sent_at: new Date().toISOString(), email_delivery_status: 'suppressed' }).eq('id', notification.id).is('email_sent_at', null)
        continue
      }

      const { data: recipient, error: recipientError } = await adminClient.auth.admin.getUserById(notification.recipient_id)
      if (recipientError) return jsonResponse({ error: 'Could not load a notification recipient.' }, 500)
      if (!recipient.user?.email) {
        await adminClient.from('notifications').update({ email_last_error: 'Recipient has no email address.', email_delivery_status: 'failed' }).eq('id', notification.id).is('email_sent_at', null)
        failed += 1
        continue
      }

      const delivery = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `greenpulse-notification-${notification.id}`,
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [recipient.user.email],
          subject: `GreenPulse: ${notification.title}`,
          text: `${notification.message}\n\nSign in to GreenPulse to view the report and its latest updates.`,
        }),
      })
      if (!delivery.ok) {
        const errorDetail = (await delivery.text()).slice(0, 450) || `Email provider returned HTTP ${delivery.status}.`
        console.error('Notification email delivery failed:', errorDetail)
        await adminClient.from('notifications').update({ email_last_error: errorDetail, email_delivery_status: 'failed' }).eq('id', notification.id).is('email_sent_at', null)
        failed += 1
        continue
      }

      const { error: markError } = await adminClient
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString(), email_last_error: null, email_delivery_status: 'sent' })
        .eq('id', notification.id)
        .is('email_sent_at', null)
      if (markError) return jsonResponse({ error: 'Email was delivered but its delivery record could not be saved.' }, 500)
      sent += 1
    }

    const { data: guestAccess, error: guestAccessError } = await adminClient.from('guest_report_access')
      .select('contact_email, created_at, last_email_notification_at, last_email_notification_event_id, guest_email_attempt_count').eq('report_id', reportId).maybeSingle()
    if (guestAccessError) return jsonResponse({ error: 'Could not load guest notification preferences.' }, 500)
    if (guestAccess?.contact_email) {
      const since = guestAccess.last_email_notification_at ?? guestAccess.created_at
      let guestEventsQuery = adminClient.from('report_events')
        .select('id, message, created_at').eq('report_id', reportId).order('id', { ascending: true }).limit(20)
      guestEventsQuery = guestAccess.last_email_notification_event_id
        ? guestEventsQuery.gt('id', guestAccess.last_email_notification_event_id)
        : guestEventsQuery.gt('created_at', since)
      const { data: guestEvents, error: guestEventsError } = await guestEventsQuery
      if (guestEventsError) return jsonResponse({ error: 'Could not load guest report updates.' }, 500)
      if (guestEvents?.length) {
        const guestAttemptAt = new Date().toISOString()
        const guestAttemptCount = Number(guestAccess.guest_email_attempt_count ?? 0) + 1
        const { error: guestAttemptError } = await adminClient.from('guest_report_access').update({
          guest_email_attempt_count: guestAttemptCount,
          guest_email_last_attempt_at: guestAttemptAt,
          guest_email_last_error: null,
          guest_email_delivery_status: 'pending',
        }).eq('report_id', reportId)
        if (guestAttemptError) return jsonResponse({ error: 'Could not record the guest email delivery attempt.' }, 500)
        const delivery = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `greenpulse-guest-update-${reportId}-${guestEvents[guestEvents.length - 1].id}`,
          },
          body: JSON.stringify({
            from: senderEmail,
            to: [guestAccess.contact_email],
            subject: `GreenPulse report update: ${report.title}`,
            text: `Your report is now ${report.status}.\n\n${guestEvents.map((event) => `• ${event.message}`).join('\n')}\n\nOpen GreenPulse and choose Track report to view the full history or send follow-up feedback. Use the tracking code from your submission email or screen; keep it private.`,
          }),
        })
        if (!delivery.ok) {
          const errorDetail = (await delivery.text()).slice(0, 450) || `Email provider returned HTTP ${delivery.status}.`
          console.error('Guest report update email failed:', errorDetail)
          await adminClient.from('guest_report_access').update({ guest_email_last_error: errorDetail, guest_email_delivery_status: 'failed' }).eq('report_id', reportId)
          failed += 1
        } else {
          const { error: markGuestError } = await adminClient.from('guest_report_access')
            .update({
              last_email_notification_at: new Date().toISOString(),
              last_email_notification_event_id: guestEvents[guestEvents.length - 1].id,
              guest_email_last_error: null,
              guest_email_delivery_status: 'sent',
            }).eq('report_id', reportId)
          if (markGuestError) return jsonResponse({ error: 'Guest update email was delivered but its delivery record could not be saved.' }, 500)
          sent += 1
        }
      }
    }

    return failed
      ? jsonResponse({ error: `${failed} notification email${failed === 1 ? '' : 's'} failed.`, sent: String(sent), failed: String(failed) }, 502)
      : jsonResponse({ sent: String(sent), failed: '0' })
  } catch (error) {
    console.error('Notification email endpoint failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonResponse({ error: 'Email notifications are temporarily unavailable.' }, 500)
  }
}

export default withAppCors(handler)
