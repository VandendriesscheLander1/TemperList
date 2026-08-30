/**
 * Icon pipeline: fetch the source art once, downscale to WebP, write to
 * public/icons/.
 *
 * The upstream art is 512×512 PNG at 68–250 KB apiece; ~100 of those is ~15 MB,
 * far too much for a grid view. At 96/160px WebP the whole set lands around
 * 0.5–1 MB, same-origin and service-worker cacheable.
 */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ICON_DIR = resolve(ROOT, 'public/icons')

const IMAGE_BASE = process.env.IMAGE_BASE || 'https://api.avakot.org/v1/I'
const WIKI_FILEPATH = 'https://wiki.avakot.org/Special:FilePath'
const UA = 'TemperList/0.1 (Soulframe temper tracker)'

/** Origin frames aren't in the API; they come from the wiki. */
export const ORIGIN_FRAMES = [
  'UniversalFrame.png',
  'CassidFrame.png',
  'DendritFrame.png',
  'FeykinFrame.png',
  'MendicantFrame.png',
  "Ode'nFrame.png",
]

const SIZES = { icon: 96, frame: 128 }
const CONCURRENCY = 6

function baseName(file) {
  return file.replace(/\.(png|jpe?g|webp|gif)$/i, '')
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Try the API image host first, then the wiki (which also hosts frames and
 * occasionally has art the API doesn't).
 */
async function fetchIcon(file) {
  const attempts = ORIGIN_FRAMES.includes(file)
    ? [`${WIKI_FILEPATH}/${encodeURIComponent(file)}`]
    : [`${IMAGE_BASE}/${encodeURIComponent(file)}`, `${WIKI_FILEPATH}/${encodeURIComponent(file)}`]

  let lastError
  for (const url of attempts) {
    try {
      return await fetchBuffer(url)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('no source')
}

/**
 * @param files   icon filenames from the catalogue (e.g. 'Avex.png')
 * @param frames  extra files to fetch at frame size
 * @param force   re-download even if the .webp already exists
 */
export async function downloadIcons(files, frames = ORIGIN_FRAMES, { force = false } = {}) {
  let sharp
  try {
    ;({ default: sharp } = await import('sharp'))
  } catch {
    console.warn(
      '\n  ! sharp is not installed, skipping icon download.\n' +
        '    Run `npm install` then re-run this script. The app will fall back to\n' +
        '    remote images from api.avakot.org in the meantime.',
    )
    return { written: 0, skipped: 0, failed: [] }
  }

  await mkdir(ICON_DIR, { recursive: true })

  const jobs = [
    ...new Set(files.filter(Boolean)),
  ].map((file) => ({ file, size: SIZES.icon }))
  for (const frame of frames) jobs.push({ file: frame, size: SIZES.frame })

  const unique = new Map(jobs.map((j) => [j.file, j]))
  const queue = [...unique.values()]
  const failed = []
  let written = 0
  let skipped = 0

  console.log(`\nIcons: ${queue.length} to process → public/icons/`)

  async function worker() {
    for (;;) {
      const job = queue.shift()
      if (!job) return

      const out = resolve(ICON_DIR, `${baseName(job.file)}.webp`)
      if (!force && existsSync(out)) {
        skipped++
        continue
      }

      try {
        const buf = await fetchIcon(job.file)
        const webp = await sharp(buf)
          .resize(job.size, job.size, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82, effort: 5 })
          .toBuffer()
        await writeFile(out, webp)
        written++
      } catch (err) {
        failed.push({ file: job.file, error: err.message })
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const total = await dirSize(ICON_DIR)
  console.log(
    `  ${written} written, ${skipped} already present, ${failed.length} failed. ` +
      `${(total / 1024).toFixed(0)} KB total`,
  )
  for (const f of failed.slice(0, 10)) console.warn(`  ! ${f.file}: ${f.error}`)
  if (failed.length > 10) console.warn(`  ! …and ${failed.length - 10} more`)

  return { written, skipped, failed }
}

async function dirSize(dir) {
  try {
    const entries = await readdir(dir)
    const sizes = await Promise.all(entries.map((e) => stat(resolve(dir, e)).then((s) => s.size)))
    return sizes.reduce((a, b) => a + b, 0)
  } catch {
    return 0
  }
}
