/** Where an API request gets the signed-in user's access token. */
export type SessionTokens = {
  /** The current token, renewed first when it has expired. Null when nobody is signed in. */
  current: () => Promise<string | null>
  /** Asks the auth server for a new token. Null when the session can't be renewed. */
  refresh: () => Promise<string | null>
}

/**
 * Calls a GreenPulse API route as the signed-in user.
 *
 * The token is read from the auth client when the request is made, not from React state, so a token
 * that expired while the laptop slept or the tab sat in the background is renewed before it is sent.
 * If the server still answers 401, the session is refreshed once and the request is sent again.
 * Without this, an admin who had been signed in for over an hour was told to sign in as an
 * administrator by "Check deadlines now", although they were one.
 */
export async function fetchWithSession(url: string, init: RequestInit, tokens: SessionTokens, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    else headers.delete('Authorization')
    return fetchImpl(url, { ...init, headers })
  }
  const token = await tokens.current().catch(() => null)
  const response = await send(token)
  if (response.status !== 401 || !token) return response
  const renewed = await tokens.refresh().catch(() => null)
  if (!renewed || renewed === token) return response
  return send(renewed)
}
