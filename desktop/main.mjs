import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'

const appUrl = process.env.GREENPULSE_DESKTOP_URL || 'https://greenpulse-district5.vercel.app'
const appOrigin = new URL(appUrl).origin

app.setName('GreenPulse')

function isWebUrl(value) {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function openOutsideApp(value) {
  if (isWebUrl(value)) void shell.openExternal(value)
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'GreenPulse',
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    icon: fileURLToPath(new URL('./icons/greenpulse.png', import.meta.url)),
    backgroundColor: '#f5f7f2',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return requestingOrigin === appOrigin && permission === 'geolocation'
  })
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback) => {
    let requestingOrigin = ''
    try {
      requestingOrigin = new URL(contents.getURL()).origin
    } catch {
      // Deny permission requests without a valid web origin.
    }
    callback(requestingOrigin === appOrigin && permission === 'geolocation')
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutsideApp(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, target) => {
    try {
      if (new URL(target).origin === appOrigin) return
    } catch {
      // Non-web protocols are opened externally only when explicitly allowed.
    }
    event.preventDefault()
    openOutsideApp(target)
  })

  void window.loadURL(appUrl)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
