import type { SupabaseClient } from '@supabase/supabase-js'

declare const process: { env: Record<string, string | undefined> }

export function rateLimitAddress(request: Request) {
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (vercelForwarded) return vercelForwarded
  if (request.headers.get('x-vercel-id')) {
    const realIp = request.headers.get('x-real-ip')?.trim()
    if (realIp) return realIp
  }
  if (process.env.VERCEL) return null
  return 'local-development'
}

export async function hashRateLimitSubject(subject: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(subject))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function claimRateLimit(
  admin: SupabaseClient,
  subject: string,
  secret: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
) {
  const subjectHash = await hashRateLimitSubject(subject, secret)
  const { data, error } = await admin.rpc('claim_api_rate_limit', {
    p_subject_hash: subjectHash,
    p_action: action,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  })
  return { allowed: data === true, error }
}
