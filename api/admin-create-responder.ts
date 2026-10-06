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

function getInviteRedirectUrl(request: Request) {
  const requestOrigin = new URL(request.url).origin
  const configuredUrl = process.env.VITE_APP_URL
  if (!configuredUrl) return requestOrigin
  try {
    const target = new URL(configuredUrl)
    const targetHost = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const isLoopback = targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '::1'
    return isLoopback && target.origin !== requestOrigin ? requestOrigin : target.toString()
  } catch {
    return requestOrigin
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Responder invitations are not configured on the server.' }, 503)
  }

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return jsonResponse({ error: 'Sign in as an administrator to create responder accounts.' }, 401)

  let payload: { displayName?: unknown; email?: unknown }
  try {
    payload = await request.json() as typeof payload
  } catch {
    return jsonResponse({ error: 'Enter a valid name and email address.' }, 400)
  }

  const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (displayName.length < 2 || displayName.length > 80) {
    return jsonResponse({ error: 'The responder name must be between 2 and 80 characters.' }, 400)
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Enter a valid email address.' }, 400)
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

    const { data: profile, error: profileError } = await authClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) {
      console.error('Responder invite admin check failed:', profileError.message)
      return jsonResponse({ error: 'Could not verify administrator access.' }, 500)
    }
    if (profile?.role !== 'admin') return jsonResponse({ error: 'Only administrators can create responder accounts.' }, 403)

    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: getInviteRedirectUrl(request),
    })
    if (inviteError || !invitation.user) {
      return jsonResponse({ error: inviteError?.message ?? 'The invitation could not be created.' }, 400)
    }

    const { data: responderProfile, error: roleError } = await adminClient
      .from('profiles')
      .update({ display_name: displayName, role: 'responder' })
      .eq('id', invitation.user.id)
      .select('id')
      .maybeSingle()
    if (roleError || !responderProfile) {
      await adminClient.auth.admin.deleteUser(invitation.user.id)
      console.error('Responder profile provisioning failed:', roleError?.message ?? 'Profile trigger did not create a row.')
      return jsonResponse({ error: 'Could not finish creating the responder profile. The invitation was cancelled.' }, 500)
    }

    return jsonResponse({ email, displayName })
  } catch (error) {
    console.error('Responder invitation endpoint failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonResponse({ error: 'Responder invitations are temporarily unavailable.' }, 500)
  }
}