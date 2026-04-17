const { app, BrowserWindow } = require('electron')
const { createServer } = require('http')
const { parse } = require('url')
const path = require('path')

const dev = process.env.NODE_ENV === 'development'

// En producción usa renderer/, en dev apunta al proyecto Next.js directamente
const nextDir = dev 
  ? path.join(__dirname, '../pm-next')
  : path.join(__dirname, 'renderer')

// En dev, usar el next del proyecto autocobro para evitar conflictos de versión
const next = dev
  ? require(path.join(nextDir, 'node_modules', 'next'))
  : require('next')

const nextApp = next({ dev, dir: nextDir })
const handle = nextApp.getRequestHandler()

async function createWindow() {
  await nextApp.prepare()

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  server.listen(3000, '127.0.0.1', () => {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    })

    win.loadURL('http://127.0.0.1:3000')
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})