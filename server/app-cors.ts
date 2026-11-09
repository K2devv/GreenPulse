declare const process: { env: Record<string, string | undefined> }

const builtInOrigins = new Set([
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:5173',
  'https://greenpulse-district5.vercel.app',
])

function allowedOrigins() {
  const origins = new Set(builtInOrigins)
  for (const value of [process.env.VITE_APP_URL, ...(process.env.CORS_ALLOWED_ORIGINS ?? '').split(',')]) {
    if (!value?.trim()) continue
    try {
      origins.add(new URL(value.trim()).origin)
    } catch {
      // Ignore malformed optional origins rather than widening access.
    }
  }
  return origins
}

function addVaryOrigin(headers: Headers) {
  const values = (headers.get('Vary') ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  if (!values.some((value) => value.toLowerCase() === 'origin')) values.push('Origin')
  headers.set('Vary', values.join(', '))
}

/** Adds the narrow cross-origin access required by bundled Capacitor apps. */
export function withAppCors(handler: (request: Request) => Promise<Response>) {
  return async function appCorsHandler(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = Boolean(origin && allowedOrigins().has(origin))

    if (request.method === 'OPTIONS') {
      const headers = new Headers()
      addVaryOrigin(headers)
      if (!allowed || !origin) return new Response(null, { status: 403, headers })
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Client-Info, Apikey')
      headers.set('Access-Control-Max-Age', '86400')
      return new Response(null, { status: 204, headers })
    }

    const response = await handler(request)
    if (!allowed || !origin) return response

    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Client-Info, Apikey')
    addVaryOrigin(headers)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}
