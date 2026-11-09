const environment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}
const apiBaseUrl = environment.VITE_API_BASE_URL?.replace(/\/+$/, '') ?? ''

/** Keeps browser requests same-origin and routes native app requests to Vercel. */
export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalizedPath}`
}
