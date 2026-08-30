/**
 * Build the app's chrome icons (rail buttons, mark, targeting star) from the
 * source art in src/assets/ui/source/.
 *
 * Separate from icons.mjs, which fetches catalogue art into the gitignored
 * public/icons/. These are hand-placed, committed, and imported by ui-icons.js
 * so Vite fingerprints them.
 *
 *   node scripts/ui-icons.mjs
 */

import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src/assets/ui/source')
const OUT = join(ROOT, 'src/assets/ui')

/** [source file, output file, square size in px]. */
const ICONS = [
  ['AvakotContext.png', 'mark.webp', 128],
  ['Codex.png', 'overview.webp', 128],
  ['FireBuff.png', 'tempers.webp', 128],
  ['OffensiveNode.png', 'arsenal.webp', 128],
  ['Forge.png', 'planner.webp', 128],
  ['StarIcon2.png', 'star.webp', 64],
]

/** The mark doubles as the favicon; PNG because WebP favicons are patchy. */
const FAVICON = ['AvakotContext.png', 'favicon.png', 48]

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('! sharp is not installed. Run `npm install` first.')
  process.exit(1)
}

await mkdir(OUT, { recursive: true })

for (const [from, to, size] of ICONS) {
  const info = await sharp(join(SRC, from))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, effort: 6 })
    .toFile(join(OUT, to))
  console.log(`  ${to.padEnd(16)} ${size}px  ${(info.size / 1024).toFixed(1)} KB`)
}

const [favFrom, favTo, favSize] = FAVICON
const fav = await sharp(join(SRC, favFrom))
  .resize(favSize, favSize)
  .png({ compressionLevel: 9, palette: true })
  .toFile(join(OUT, favTo))
console.log(`  ${favTo.padEnd(16)} ${favSize}px  ${(fav.size / 1024).toFixed(1)} KB`)
