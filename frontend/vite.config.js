import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Large media the app works without; left to load on demand instead of
// being stored on every device at install.
const NOT_PRECACHED = /\.(mp4|webm|mov)$/i

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

// Writes the list of built files into dist/sw.js (see public/sw.js), so the
// service worker stores the whole app for offline use, and names the cache
// after a hash of their contents, so each deploy replaces the old copy.
function precacheManifest() {
  let outDir
  return {
    name: 'sariaya-precache-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir.startsWith('/') || /^[A-Za-z]:/.test(config.build.outDir)
        ? config.build.outDir
        : join(config.root, config.build.outDir)
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js')
      const files = listFiles(outDir)
        .filter((path) => path !== swPath && !NOT_PRECACHED.test(path))
        .sort()
      const hash = createHash('sha256')
      files.forEach((path) => hash.update(path).update(readFileSync(path)))
      const urls = files.map((path) => '/' + relative(outDir, path).split(sep).join('/'))
      const header = `self.__PRECACHE__ = ${JSON.stringify(urls)};\nself.__BUILD_ID__ = ${JSON.stringify(hash.digest('hex').slice(0, 12))};\n`
      writeFileSync(swPath, header + readFileSync(swPath, 'utf8'))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheManifest()],
})
