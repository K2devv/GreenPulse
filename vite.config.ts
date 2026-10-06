import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import createResponderHandler from './api/admin-create-responder'
import sendNotificationEmailsHandler from './api/send-notification-emails'

function responderApiPlugin(environment: Record<string, string | undefined>): Plugin {
  return {
    name: 'greenpulse-responder-api',
    configureServer(server) {
      const runtimeProcess = (globalThis as typeof globalThis & {
        process?: { env: Record<string, string | undefined> }
      }).process
      if (runtimeProcess) {
        for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_APP_URL', 'RESEND_API_KEY', 'NOTIFICATION_FROM_EMAIL']) {
          if (environment[key]) runtimeProcess.env[key] = environment[key]
        }
      }

      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost')
        if (requestUrl.pathname !== '/api/admin-create-responder' && requestUrl.pathname !== '/api/send-notification-emails') {
          next()
          return
        }

        try {
          const headers = new Headers()
          for (const [name, value] of Object.entries(request.headers)) {
            if (['connection', 'content-length', 'host', 'transfer-encoding'].includes(name)) continue
            if (typeof value === 'string') headers.set(name, value)
            else if (Array.isArray(value)) headers.set(name, value.join(', '))
          }

          const decoder = new TextDecoder()
          let body = ''
          for await (const chunk of request) {
            body += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
          }
          body += decoder.decode()

          const apiRequest = new Request(requestUrl, {
            method: request.method ?? 'GET',
            headers,
            body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
          })
          const apiHandler = requestUrl.pathname === '/api/send-notification-emails' ? sendNotificationEmailsHandler : createResponderHandler
          const apiResponse = await apiHandler(apiRequest)
          response.statusCode = apiResponse.status
          apiResponse.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(await apiResponse.text())
        } catch (error) {
          console.error('Local responder API failed:', error instanceof Error ? error.message : 'unknown error')
          response.statusCode = 500
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: 'Responder invitations are temporarily unavailable.' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), responderApiPlugin(loadEnv(mode, '.', ''))],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase/')) return 'supabase'
          if (id.includes('leaflet') || id.includes('react-leaflet')) return 'maps'
          if (id.includes('react-dom') || id.includes('/react/')) return 'react'
        },
      },
    },
  },
}))