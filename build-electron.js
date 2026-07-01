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

// 5. Empaquetar con electron-builder
console.log('Running electron-builder...')
execSync('npx electron-builder', { cwd: __dirname, stdio: 'inherit' })
