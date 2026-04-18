const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { createServer } = require('http')
const http = require('http')
const path = require('path')
const fs = require('fs')

const dev = process.env.NODE_ENV === 'development'
const PORT = 3000

// En producción usa renderer/, en dev apunta al proyecto Next.js directamente
const nextDir = dev 
  ? path.join(__dirname, '../pm-next')
  : path.join(__dirname, 'renderer')

/**
 * Espera hasta que el servidor HTTP responda en la URL dada.
 * Útil en dev para no cargar la ventana antes de que next dev esté listo.
 */
function waitForServer(url, { timeout = 30000, interval = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(`Server not ready at ${url} after ${timeout}ms`))
      }
      const req = http.get(url, (res) => {
        // Cualquier respuesta (incluso redirect) = server está vivo
        res.resume()
        resolve()
      })
      req.on('error', () => setTimeout(attempt, interval))
      req.setTimeout(1000, () => { req.destroy(); setTimeout(attempt, interval) })
    }
    attempt()
  })
}

async function createWindow() {
  let url = `http://localhost:${PORT}`

  if (dev) {
    // Dev: esperar a que next dev (lanzado externamente) esté listo
    console.log('Esperando al dev server de Next.js...')
    await waitForServer(url)
    console.log('Dev server listo.')
  } else {
    // Producción: levantar Next.js server internamente
    process.chdir(nextDir)
    const next = require('next')
    const nextApp = next({ dev: false, dir: nextDir })
    const handle = nextApp.getRequestHandler()
    await nextApp.prepare()

    const server = createServer((req, res) => handle(req, res))
    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  x.loadURL(url)
}x

// ── IPC Handlers ──────────────────────────────────────────────

const appDataDir = path.join(
  app.getPath('appData'), 'pm-ddvc'
)

ipcMain.handle('app:getAppDataPath', () => appDataDir)

ipcMain.handle('dialog:saveExcel', async (_event, buffer, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, Buffer.from(buffer))

  // Auto-save copy to appdata exports
  const exportsDir = path.join(appDataDir, 'exports')
  fs.mkdirSync(exportsDir, { recursive: true })
  fs.copyFileSync(filePath, path.join(exportsDir, path.basename(filePath)))

  return filePath
})

ipcMain.handle('log:write', async (_event, entry) => {
  const logsDir = path.join(appDataDir, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const logFile = path.join(logsDir, `${today}.log`)
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8')
})

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})