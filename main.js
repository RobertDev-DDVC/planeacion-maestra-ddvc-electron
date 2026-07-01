const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')

const dev = process.env.NODE_ENV === 'development'
const PORT = 3000

// En producción usa renderer/ (bundle standalone de Next), en dev apunta al
// proyecto Next.js directamente (next dev lanzado por separado).
const nextDir = dev
  ? path.join(__dirname, '../pm-next')
  : path.join(__dirname, 'renderer')

// Directorio de datos de la app (config, logs, respaldos de excel).
const appDataDir = path.join(app.getPath('appData'), 'pm-ddvc')

/**
 * Espera hasta que el servidor HTTP responda en la URL dada.
 * Útil para no cargar la ventana antes de que el server de Next esté listo.
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

// Variables requeridas por el server de Next (espejo de pm-next/src/shared/lib/env.ts).
// Si falta alguna, el server de Next lanza y la ventana quedaría en blanco; por eso
// las validamos aquí antes de arrancar para mostrar un error claro.
const REQUIRED_CONFIG_KEYS = [
  'URL_AUTH_DATAVERSE', 'TENANT_ID_DATAVERSE', 'CLIENT_ID_DATAVERSE',
  'CLIENT_SECRET_DATAVERSE', 'RESOURCE_DATAVERSE', 'DATAVERSE_BASE_URL',
  'FABRIC_CLIENT_ID', 'FABRIC_CLIENT_SECRET', 'FABRIC_TENANT_ID',
  'FABRIC_SERVER', 'FABRIC_DATABASE',
  'ONEDRIVE_TENANT_ID', 'ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET',
  'ONEDRIVE_SHARING_URL', 'ONEDRIVE_EXCELES_URL',
  'CLIENT_ID_DYNAMICS', 'CLIENT_SECRET_DYNAMICS', 'RESOURCE_DYNAMICS', 'TOKEN_DYNAMICS',
  'SESSION_SECRET',
]

/**
 * Carga las credenciales desde %APPDATA%/pm-ddvc/config.json hacia process.env
 * antes de levantar el server de Next. Devuelve { ok } o { ok:false, message }.
 */
function loadConfigIntoEnv() {
  const configPath = path.join(appDataDir, 'config.json')
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      message:
        `No se encontró el archivo de configuración:\n${configPath}\n\n` +
        'Copia ahí "config.example.json" y completa las credenciales.',
    }
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch (e) {
    return { ok: false, message: `El archivo de configuración no es JSON válido:\n${configPath}\n\n${e.message}` }
  }
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) process.env[key] = String(value)
  }
  const missing = REQUIRED_CONFIG_KEYS.filter((k) => !process.env[k])
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Faltan variables en ${configPath}:\n\n${missing.map((k) => `  • ${k}`).join('\n')}`,
    }
  }
  return { ok: true }
}

async function createWindow() {
  const url = `http://localhost:${PORT}`

  if (dev) {
    // Dev: esperar a que next dev (lanzado externamente) esté listo
    console.log('Esperando al dev server de Next.js...')
    await waitForServer(url)
    console.log('Dev server listo.')
  } else {
    // Producción: inyectar credenciales y levantar el server standalone in-process
    const config = loadConfigIntoEnv()
    if (!config.ok) {
      dialog.showErrorBox('Configuración requerida', config.message)
      app.quit()
      return
    }
    process.env.NODE_ENV = 'production'
    process.env.PORT = String(PORT)
    process.env.HOSTNAME = '127.0.0.1'
    // El server standalone resuelve sus rutas vía __dirname, así que no depende
    // del cwd (verificado). No usamos process.chdir para evitar fallos de ruta.
    require(path.join(nextDir, 'server.js'))
    await waitForServer(url)
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadURL(url)
}

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('app:getAppDataPath', () => appDataDir)

/** Devuelve una ruta libre agregando " (n)" si el archivo ya existe. */
function uniquePath(p) {
  if (!fs.existsSync(p)) return p
  const dir = path.dirname(p)
  const ext = path.extname(p)
  const base = path.basename(p, ext)
  let i = 1
  let candidate
  do {
    candidate = path.join(dir, `${base} (${i})${ext}`)
    i++
  } while (fs.existsSync(candidate))
  return candidate
}

ipcMain.handle('dialog:saveExcel', async (_event, buffer, defaultName) => {
  // Guardar directo en la carpeta de Descargas (sin diálogo), sin sobrescribir.
  const downloadsDir = app.getPath('downloads')
  const filePath = uniquePath(path.join(downloadsDir, defaultName))
  fs.writeFileSync(filePath, Buffer.from(buffer))

  // Copia de respaldo en appdata/exports
  const exportsDir = path.join(appDataDir, 'exports')
  fs.mkdirSync(exportsDir, { recursive: true })
  fs.copyFileSync(filePath, path.join(exportsDir, path.basename(filePath)))

  return filePath
})

ipcMain.handle('log:write', async (_event, entry) => {
  const logsDir = path.join(appDataDir, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const fileName = `${today}.log`
  const logFile = path.join(logsDir, fileName)
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8')

  return {
    fileName,
    content: fs.readFileSync(logFile, 'utf-8')
  }
})

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
