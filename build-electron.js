const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const pmNextDir = path.join(__dirname, '../pm-next')
const rendererDir = path.join(__dirname, 'renderer')

// 1. Build Next.js in pm-next
console.log('Building Next.js app in pm-next...')
execSync('pnpm run build', { cwd: pmNextDir, stdio: 'inherit' })

// 2. Copy .next output to renderer/
console.log('Copying .next build output to renderer/...')
const srcNext = path.join(pmNextDir, '.next')
const destNext = path.join(rendererDir, '.next')
if (fs.existsSync(destNext)) {
  fs.rmSync(destNext, { recursive: true })
}
fs.cpSync(srcNext, destNext, { recursive: true })

// 3. Copy public/ to renderer/
console.log('Copying public/ to renderer/...')
const srcPublic = path.join(pmNextDir, 'public')
const destPublic = path.join(rendererDir, 'public')
if (fs.existsSync(srcPublic)) {
  if (fs.existsSync(destPublic)) {
    fs.rmSync(destPublic, { recursive: true })
  }
  fs.cpSync(srcPublic, destPublic, { recursive: true })
}

// 4. Run electron-builder
console.log('Running electron-builder...')
execSync('npx electron-builder', { cwd: __dirname, stdio: 'inherit' })
