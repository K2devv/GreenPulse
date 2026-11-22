import { describe, expect, it, vi } from 'vitest'
import { fetchWithSession, type SessionTokens } from './session-fetch'

function tokens(current: string | null, refreshed: string | null = null): SessionTokens & { refresh: ReturnType<typeof vi.fn> } {
  return { current: vi.fn(async () => current), refresh: vi.fn(async () => refreshed) }
}

function authorizationOf(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers).get('Authorization')
}

describe('fetchWithSession', () => {
  it('sends the current token and keeps the other headers and body', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const response = await fetchWithSession('/api/process-escalations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' }, tokens('fresh'), fetchImpl)
    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/process-escalations')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(authorizationOf(fetchImpl.mock.calls[0])).toBe('Bearer fresh')
  })

  it('refreshes the session once and retries when the server rejects the token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"Your session expired. Sign in again."}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"stagesCreated":2}', { status: 200 }))
    const source = tokens('expired', 'renewed')
    const response = await fetchWithSession('/api/process-escalations', { method: 'POST' }, source, fetchImpl)
    expect(response.status).toBe(200)
    expect(source.refresh).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(authorizationOf(fetchImpl.mock.calls[0])).toBe('Bearer expired')
    expect(authorizationOf(fetchImpl.mock.calls[1])).toBe('Bearer renewed')
  })

  it('returns the 401 when the session cannot be renewed', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }))
    const response = await fetchWithSession('/api/x', { method: 'POST' }, tokens('expired', null), fetchImpl)
    expect(response.status).toBe(401)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not retry with the same token', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }))
    await fetchWithSession('/api/x', { method: 'POST' }, tokens('same', 'same'), fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not retry other errors such as 403 or 503', async () => {
    for (const status of [403, 503]) {
      const fetchImpl = vi.fn(async () => new Response('{}', { status }))
      const source = tokens('fresh', 'renewed')
      const response = await fetchWithSession('/api/x', { method: 'POST' }, source, fetchImpl)
      expect(response.status).toBe(status)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(source.refresh).not.toHaveBeenCalled()
    }
  })

  it('sends no Authorization header for a guest', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }))
    const source = tokens(null, 'renewed')
    await fetchWithSession('/api/confirm-report', { method: 'POST', headers: { Authorization: 'Bearer stale' } }, source, fetchImpl)
    expect(authorizationOf(fetchImpl.mock.calls[0])).toBeNull()
    expect(source.refresh).not.toHaveBeenCalled()
  })

  it('treats a failing token lookup as signed out', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await fetchWithSession('/api/x', {}, { current: () => Promise.reject(new Error('offline')), refresh: async () => null }, fetchImpl)
    expect(authorizationOf(fetchImpl.mock.calls[0])).toBeNull()
  })
})
