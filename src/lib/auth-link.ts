/**
 * Errors Supabase puts in the page address when an emailed link can't be used, such as a password
 * reset link that has expired or was already opened. supabase-js reads them but leaves them in the
 * address and shows nothing, so the app explains them and then removes them.
 */

export type AuthLinkError = { code: string; description: string }

const ERROR_KEYS = ['error', 'error_code', 'error_description']
/** Removed along with the error keys; Supabase adds `sb` to the redirects it builds. */
const REDIRECT_KEYS = [...ERROR_KEYS, 'sb']

// Links in the implicit flow (this app's) carry the result in the fragment; PKCE links use the query.
function fragmentParams(url: URL) {
  return new URLSearchParams(url.hash.replace(/^#/, ''))
}

function hasError(params: URLSearchParams) {
  return ERROR_KEYS.some((key) => params.has(key))
}

/** The link error in `href`, or null when the address has none (or isn't a valid URL). */
export function readAuthLinkError(href: string): AuthLinkError | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  for (const params of [fragmentParams(url), url.searchParams]) {
    if (!hasError(params)) continue
    return {
      code: params.get('error_code') || params.get('error') || 'unknown',
      description: params.get('error_description') ?? '',
    }
  }
  return null
}

/** True when `href` carries the session tokens of an emailed link of this `type` in the fragment. */
function isSignInLink(href: string, type: 'recovery' | 'invite') {
  try {
    const params = fragmentParams(new URL(href))
    return params.get('type') === type && params.has('access_token')
  } catch {
    return false
  }
}

/** True when `href` is where a password reset link lands: the session tokens in the fragment, marked `type=recovery`. */
export function isRecoveryLink(href: string): boolean {
  return isSignInLink(href, 'recovery')
}

/**
 * True when `href` is where an accepted invitation lands, marked `type=invite`. Invitations
 * (api/admin-create-responder.ts) come without a password, so the app asks for one next.
 */
export function isInviteLink(href: string): boolean {
  return isSignInLink(href, 'invite')
}

/** `href` without Supabase's link-error parameters; anything else in the address is kept. */
export function withoutAuthLinkError(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return href
  }
  const fragment = fragmentParams(url)
  if (hasError(fragment)) {
    REDIRECT_KEYS.forEach((key) => fragment.delete(key))
    const rest = fragment.toString()
    url.hash = rest ? `#${rest}` : ''
  }
  if (hasError(url.searchParams)) REDIRECT_KEYS.forEach((key) => url.searchParams.delete(key))
  return url.toString()
}
