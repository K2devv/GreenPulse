import React from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/newsreader/latin-500-italic.css'
import './styles.css'
import './polish.css'
import './motion.css'
import './experience.css'
import App from './App'

const isProductionBuild = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD)

if (isProductionBuild && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch((error: unknown) => {
      console.warn('GreenPulse offline shell could not be registered.', error)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

const BOOT_SPLASH_MIN_MS = 800
const BOOT_SPLASH_MAX_MS = 6000
const splash = document.getElementById('boot-splash')

if (splash) {
  let dismissed = false
  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    splash.classList.add('is-hidden')
    window.setTimeout(() => splash.remove(), 500)
  }
  const whenReady = () => window.setTimeout(dismiss, Math.max(0, BOOT_SPLASH_MIN_MS - performance.now()))
  if (document.readyState === 'complete') whenReady()
  else window.addEventListener('load', whenReady, { once: true })
  window.setTimeout(dismiss, BOOT_SPLASH_MAX_MS)
}
