// Generates PWA icons from the YBT logo. Run once (or whenever the logo changes):
//   node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = join(__dirname, '../public/YBT_Logo.gif')
const outDir = join(__dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/** Render the logo centered on a white square canvas.
 *  `scale` controls how much of the canvas the logo occupies —
 *  maskable icons need a ~80% safe zone so the OS mask never clips the art. */
async function makeIcon(size, scale, outFile) {
  const inner = Math.round(size * scale)
  const logo = await sharp(src, { animated: false })
    .resize(inner, inner, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(outDir, outFile))
  console.log(`[generate-icons] wrote icons/${outFile}`)
}

await makeIcon(192, 0.86, 'icon-192.png')
await makeIcon(512, 0.86, 'icon-512.png')
await makeIcon(512, 0.62, 'icon-maskable-512.png')
await makeIcon(180, 0.8, 'apple-touch-icon.png')
