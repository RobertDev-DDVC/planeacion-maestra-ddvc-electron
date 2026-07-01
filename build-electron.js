const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const pmNextDir = path.join(__dirname, '../pm-next')
const rendererDir = path.join(__dirname, 'renderer')

function copyDir(src, dest) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

// 1. Build Next.js en pm-next (genera .next/standalone gracias a output: 'standalone')
console.log('Building Next.js app in pm-next...')
execSync('pnpm run build', { cwd: pmNextDir, stdio: 'inherit' })

const standaloneDir = path.join(pmNextDir, '.next', 'standalone')
if (!fs.existsSync(standaloneDir)) {
  throw new Error(
    'No se encontró .next/standalone. Asegúrate de que pm-next/next.config.ts tenga output: "standalone".'
  )
}

// 2. Reiniciar renderer/ y copiar el bundle standalone (server.js + node_modules mínimo + .next/server)
console.log('Copying standalone build to renderer/...')
copyDir(standaloneDir, rendererDir)

// 3. standalone NO incluye .next/static — copiarlo aparte
console.log('Copying .next/static to renderer/.next/static...')
copyDir(path.join(pmNextDir, '.next', 'static'), path.join(rendererDir, '.next', 'static'))

// 4. standalone NO incluye public/ — copiarlo aparte (si existe)
const srcPublic = path.join(pmNextDir, 'public')
if (fs.existsSync(srcPublic)) {
  console.log('Copying public/ to renderer/public...')
  copyDir(srcPublic, path.join(rendererDir, 'public'))
}

// 5. Generar config.json desde pm-next/.env.local (se embebe vía extraResources)
console.log('Generando config.json desde pm-next/.env.local...')
const envLocalPath = path.join(pmNextDir, '.env.local')
if (!fs.existsSync(envLocalPath)) {
  throw new Error(`No se encontró ${envLocalPath}. Necesario para generar config.json.`)
}

function parseEnv(content) {
  const out = {}
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let value = t.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const envVars = parseEnv(fs.readFileSync(envLocalPath, 'utf-8'))
// config.example.json define el esquema de claves a embeber (evita filtrar vars sueltas).
const template = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf-8'))
const config = {}
const emptyKeys = []
for (const key of Object.keys(template)) {
  const value = envVars[key] ?? ''
  config[key] = value
  if (value === '') emptyKeys.push(key)
}
if (emptyKeys.length > 0) {
  console.warn(`Advertencia: claves vacías en config.json generado: ${emptyKeys.join(', ')}`)
}
fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2) + '\n')
console.log('config.json generado.')

// 6. Empaquetar con electron-builder
console.log('Running electron-builder...')
execSync('npx electron-builder', { cwd: __dirname, stdio: 'inherit' })
