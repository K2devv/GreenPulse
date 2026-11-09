import { createClient } from '@supabase/supabase-js'
import { DISTRICT_5_BARANGAYS } from '../src/lib/report-filters'
import { publicGuestEvents, publicGuestOutcome } from '../src/lib/guest-tracking'
import { claimRateLimit, hashRateLimitSubject, rateLimitAddress } from '../server/request-safety'
import { withAppCors } from '../server/app-cors'
import { normalizePhoneNumber } from '../src/lib/phone-number'

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

const categories = new Set(['Waste', 'Flooding', 'Pollution', 'Drainage'])
const urgencies = new Set(['Low', 'Medium', 'High'])
const allowedPhotoTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const maxPhotoBytes = 2_500_000
const maxGuestPhotoCount = 5
const maxEncodedPhotoChars = 650_000

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
  })
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function stableGuestCode(submissionId: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`greenpulse-guest-tracking:${submissionId}`))
  return Array.from(new Uint8Array(signature).slice(0, 24), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function cleanCode(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-f0-9]/g, '') : ''
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

async function sendConfirmationEmail(email: string, code: string, title: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.NOTIFICATION_FROM_EMAIL
  if (!apiKey || !from) return false
  const delivery = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'GreenPulse report tracking code',
      text: `Your report "${title}" was submitted. Keep this code to check updates or confirm whether the issue was fixed:\n\n${code}\n\nEnter this code on the GreenPulse site under Track a report. Keep it private; anyone with the code can view this report's status.`,
    }),
  })
  if (!delivery.ok) console.error('Guest report confirmation email failed:', delivery.status)
  return delivery.ok
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const trackingSecret = process.env.GUEST_TRACKING_SECRET
  if (!supabaseUrl || !serviceRoleKey || !trackingSecret || trackingSecret.length < 32) {
    return jsonResponse({ error: 'Guest reporting is not configured on the server.' }, 503)
  }
  const address = rateLimitAddress(request)
  if (!address) return jsonResponse({ error: 'Guest reporting is temporarily unavailable.' }, 503)

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 3_800_000) return jsonResponse({ error: 'The request is too large. Guest report photos must be 2.5 MB or smaller.' }, 413)

  let payload: Record<string, unknown>
  try {
    const body = await request.text()
    if (body.length > 3_800_000 || new TextEncoder().encode(body).byteLength > 3_800_000) return jsonResponse({ error: 'The request is too large. Guest report photos must be 2.5 MB or smaller.' }, 413)
    payload = JSON.parse(body) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'A valid request body is required.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const action = payload.action

  if (action === 'track' || action === 'feedback') {
    const code = cleanCode(payload.trackingCode)
    if (!/^[a-f0-9]{48}$/.test(code)) return jsonResponse({ error: 'Enter the 48-character tracking code from your submission.' }, 400)
    const tokenHash = await sha256(code)
    if (action === 'track') {
      const trackLimit = await claimRateLimit(admin, `ip:${address}`, trackingSecret, 'guest_tracking', 60, 3600)
      if (trackLimit.error) return jsonResponse({ error: 'Report tracking is temporarily unavailable.' }, 503)
      if (!trackLimit.allowed) return jsonResponse({ error: 'Too many tracking requests. Please try again later.' }, 429)
    } else {
      const [ipLimit, codeLimit] = await Promise.all([
        claimRateLimit(admin, `ip:${address}`, trackingSecret, 'guest_feedback_ip', 10, 3600),
        claimRateLimit(admin, `code:${tokenHash}`, trackingSecret, 'guest_feedback', 5, 3600),
      ])
      if (ipLimit.error || codeLimit.error) return jsonResponse({ error: 'Report tracking is temporarily unavailable.' }, 503)
      if (!ipLimit.allowed || !codeLimit.allowed) return jsonResponse({ error: 'Too many follow-up responses. Please try again later.' }, 429)
    }
    const { data: access, error: accessError } = await admin.from('guest_report_access').select('report_id').eq('access_token_hash', tokenHash).maybeSingle()
    if (accessError) return jsonResponse({ error: 'Report tracking is temporarily unavailable.' }, 500)
    if (!access) return jsonResponse({ error: 'No report was found for that code.' }, 404)

    if (action === 'feedback') {
      const feedback = payload.feedback
      const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 500) : ''
      if (feedback !== 'fixed' && feedback !== 'still_there') return jsonResponse({ error: 'Choose whether the issue was fixed or is still there.' }, 400)
      const { data: target, error: reportError } = await admin.from('reports').select('id, status').eq('id', access.report_id).maybeSingle()
      if (reportError) return jsonResponse({ error: 'Report tracking is temporarily unavailable.' }, 500)
      if (!target || !['Resolved', 'Closed'].includes(target.status)) return jsonResponse({ error: 'You can respond after the report is marked resolved.' }, 409)
      const { error } = await admin.from('report_resolution_feedback').upsert({ report_id: access.report_id, feedback, message: message || null }, { onConflict: 'report_id' })
      if (error) return jsonResponse({ error: 'Your follow-up could not be saved. Please try again.' }, 500)
    }

    const [{ data: report, error: reportError }, { data: events, error: eventsError }, { data: feedback, error: feedbackError }] = await Promise.all([
      admin.from('reports').select('id, title, status, resolved_at, updated_at').eq('id', access.report_id).maybeSingle(),
      admin.from('report_events').select('id, event_type, message, created_at').eq('report_id', access.report_id).order('created_at', { ascending: true }),
      admin.from('report_resolution_feedback').select('feedback, message, updated_at').eq('report_id', access.report_id).maybeSingle(),
    ])
    if (reportError || eventsError || feedbackError || !report) return jsonResponse({ error: 'Report tracking is temporarily unavailable.' }, 500)
    return jsonResponse({
      report: { ...report, outcome: publicGuestOutcome(report.status) },
      events: publicGuestEvents(events ?? []),
      feedback: feedback ?? null,
    })
  }

  if (action !== 'submit') return jsonResponse({ error: 'Unknown request.' }, 400)
  if (typeof payload.website === 'string' && payload.website.trim()) return jsonResponse({ error: 'The report could not be submitted.' }, 400)
  const startedAt = Number(payload.startedAt)
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2_500 || Date.now() - startedAt > 3_600_000) {
    return jsonResponse({ error: 'Please review the form and submit again.' }, 400)
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const issueType = typeof payload.issueType === 'string' ? payload.issueType.trim() : ''
  const description = typeof payload.description === 'string' ? payload.description.trim() : ''
  const additionalInfo = typeof payload.additionalInfo === 'string' ? payload.additionalInfo.trim() : ''
  const observedAt = typeof payload.observedAt === 'string' ? new Date(payload.observedAt) : new Date(Number.NaN)
  const locationLabel = typeof payload.locationLabel === 'string' ? payload.locationLabel.trim() : ''
  const category = typeof payload.category === 'string' ? payload.category : ''
  const urgency = typeof payload.urgency === 'string' ? payload.urgency : ''
  let barangay = typeof payload.barangay === 'string' ? payload.barangay.trim() : ''
  const latitude = Number(payload.latitude)
  const longitude = Number(payload.longitude)
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const phoneInput = typeof payload.phone === 'string' ? payload.phone.trim() : ''
  const phone = phoneInput ? normalizePhoneNumber(phoneInput) : undefined
  if (!email && !phoneInput) return jsonResponse({ error: 'Enter an email address or phone number so staff can follow up.' }, 400)
  if (payload.consentGiven !== true) return jsonResponse({ error: 'Review and accept the report visibility notice before submitting.' }, 400)
  if (title.length < 3 || title.length > 90 || issueType.length < 1 || issueType.length > 80 || description.length < 8 || description.length > 500 || additionalInfo.length > 2_000 || locationLabel.length < 1 || locationLabel.length > 200) {
    return jsonResponse({ error: 'Check the title, issue type, description, and location fields.' }, 400)
  }
  if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > Date.now() + 5 * 60_000) return jsonResponse({ error: 'Choose a valid observation date and time.' }, 400)
  if (!categories.has(category) || !urgencies.has(urgency)) return jsonResponse({ error: 'Choose a valid category and urgency.' }, 400)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 14.65 || latitude > 14.82 || longitude < 120.99 || longitude > 121.13) {
    return jsonResponse({ error: 'Choose a location within District 5, Quezon City.' }, 400)
  }
  const { data: boundaryBarangay, error: boundaryError } = await admin.rpc('district5_barangay_for_point', {
    p_latitude: latitude,
    p_longitude: longitude,
  })
  if (boundaryError?.code === '22023') return jsonResponse({ error: 'Choose a point inside a loaded District 5 barangay boundary.' }, 400)
  if (boundaryError) return jsonResponse({ error: 'District 5 boundary validation is unavailable. Contact the pilot administrator.' }, 503)
  if (typeof boundaryBarangay === 'string') barangay = boundaryBarangay
  if (barangay && !DISTRICT_5_BARANGAYS.includes(barangay as (typeof DISTRICT_5_BARANGAYS)[number])) return jsonResponse({ error: 'Choose a listed District 5 barangay.' }, 400)
  if (email && !validEmail(email)) return jsonResponse({ error: 'Enter a valid email address or leave it blank.' }, 400)
  if (phoneInput && !phone) return jsonResponse({ error: 'Enter a valid mobile number, such as 09XXXXXXXXX or +639XXXXXXXXX.' }, 400)

  const submissionId = typeof payload.submissionId === 'string' ? payload.submissionId.toLowerCase() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(submissionId)) return jsonResponse({ error: 'A valid submission identifier is required. Reopen the saved draft and try again.' }, 400)
  const code = await stableGuestCode(submissionId, trackingSecret)
  const tokenHash = await sha256(code)
  const { data: existingAccess, error: existingError } = await admin.from('guest_report_access')
    .select('report_id, access_token_hash').eq('client_submission_id', submissionId).maybeSingle()
  if (existingError) return jsonResponse({ error: 'Guest report idempotency is unavailable. Apply the submission-safety migration.' }, 503)
  if (existingAccess) {
    if (existingAccess.access_token_hash !== tokenHash) return jsonResponse({ error: 'The guest tracking secret changed; contact the pilot administrator before retrying.' }, 409)
    return jsonResponse({ reportId: existingAccess.report_id, trackingCode: code, emailSent: false, alreadySubmitted: true })
  }
  const { data: existingReport, error: existingReportError } = await admin.from('reports')
    .select('id').is('reporter_id', null).eq('client_submission_id', submissionId).maybeSingle()
  if (existingReportError) return jsonResponse({ error: 'Guest report idempotency is unavailable. Apply the submission-safety migration.' }, 503)
  if (existingReport) {
    const { error: repairError } = await admin.from('guest_report_access').insert({
      report_id: existingReport.id,
      client_submission_id: submissionId,
      access_token_hash: tokenHash,
      contact_email: email || null,
      contact_phone: phone ?? null,
    })
    if (repairError && repairError.code !== '23505') return jsonResponse({ error: 'The submitted report exists but its tracking access could not be restored. Retry shortly.' }, 503)
    return jsonResponse({ reportId: existingReport.id, trackingCode: code, emailSent: false, alreadySubmitted: true })
  }

  const reportId = crypto.randomUUID()
  const photoDataUrls = Array.isArray(payload.photoDataUrls) ? payload.photoDataUrls : []
  if (photoDataUrls.length > maxGuestPhotoCount) return jsonResponse({ error: `Attach up to ${maxGuestPhotoCount} photos.` }, 400)
  const photos: Array<{ path: string; bytes: Uint8Array; mime: string }> = []
  for (const photoDataUrl of photoDataUrls) {
    if (typeof photoDataUrl !== 'string') return jsonResponse({ error: 'An attached photo is invalid.' }, 400)
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(photoDataUrl)
    if (!match || match[2].length > maxEncodedPhotoChars) return jsonResponse({ error: 'Guest report photos must be JPEG, PNG, or WebP and 2.5 MB or smaller.' }, 400)
    const binary = atob(match[2])
    if (binary.length > maxPhotoBytes) return jsonResponse({ error: 'Guest report photos must be 2.5 MB or smaller.' }, 400)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const jpeg = match[1] === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const png = match[1] === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    const webp = match[1] === 'image/webp' && binary.slice(0, 4) === 'RIFF' && binary.slice(8, 12) === 'WEBP'
    if (!jpeg && !png && !webp) return jsonResponse({ error: 'The attached file does not match its image type.' }, 400)
    photos.push({ path: `guest/${reportId}/${crypto.randomUUID()}.${allowedPhotoTypes[match[1]]}`, bytes, mime: match[1] })
  }

  const ip = await hashRateLimitSubject(`ip:${address}`, trackingSecret)
  const { data: allowed, error: limitError } = await admin.rpc('claim_guest_report_slot', { p_ip_hash: ip })
  if (limitError) return jsonResponse({ error: 'Guest reporting is temporarily unavailable.' }, 500)
  if (!allowed) return jsonResponse({ error: 'Too many guest reports from this connection. Please try again later or sign in.' }, 429)

  const uploadedPhotoPaths: string[] = []
  for (const photo of photos) {
    const { error: uploadError } = await admin.storage.from('report-photos').upload(photo.path, photo.bytes, { contentType: photo.mime, upsert: false })
    if (uploadError) {
      if (uploadedPhotoPaths.length) await admin.storage.from('report-photos').remove(uploadedPhotoPaths)
      return jsonResponse({ error: 'The photo could not be saved. Please retry without it or use a smaller image.' }, 500)
    }
    uploadedPhotoPaths.push(photo.path)
  }
  const { error: reportError } = await admin.from('reports').insert({
    id: reportId,
    client_submission_id: submissionId,
    reporter_id: null,
    title,
    category,
    issue_type: issueType,
    observed_at: observedAt.toISOString(),
    additional_info: additionalInfo || null,
    urgency,
    description,
    location_label: locationLabel,
    latitude,
    longitude,
    barangay: barangay || null,
    photo_path: photos[0]?.path ?? null,
    photo_paths: photos.map((photo) => photo.path),
    consent_version: '2026-10-v2',
  })
  if (reportError) {
    if (uploadedPhotoPaths.length) await admin.storage.from('report-photos').remove(uploadedPhotoPaths)
    console.error('Guest report insert failed:', reportError.message)
    return jsonResponse({ error: 'The report could not be saved. Please try again.' }, 500)
  }

  const { error: accessError } = await admin.from('guest_report_access').insert({ report_id: reportId, client_submission_id: submissionId, access_token_hash: tokenHash, contact_email: email || null, contact_phone: phone ?? null })
  if (accessError) {
    await admin.from('reports').delete().eq('id', reportId)
    if (uploadedPhotoPaths.length) await admin.storage.from('report-photos').remove(uploadedPhotoPaths)
    console.error('Guest report access could not be created:', accessError.message)
    return jsonResponse({ error: 'The tracking code could not be created. Please try again.' }, 500)
  }

  const emailSent = email ? await sendConfirmationEmail(email, code, title).catch(() => false) : false
  if (emailSent) await admin.from('guest_report_access').update({ last_email_notification_at: new Date().toISOString() }).eq('report_id', reportId)
  return jsonResponse({ reportId, trackingCode: code, emailSent }, 201)
}

export default withAppCors(handler)
