/**
 * Export / import and shareable URL hashes.
 *
 * The URL codec compresses with CompressionStream('deflate-raw') where
 * available (all current browsers) and falls back to plain base64url. Payloads
 * are prefixed with a format byte so old links keep working.
 */

import { migrate } from './inventory.js'

const FORMAT_RAW = 'u'
const FORMAT_DEFLATE = 'z'

/* ------------------------------------------------------------- file I/O */

export function exportJSON(inventory) {
  return JSON.stringify(
    { app: 'temperlist', exportedAt: new Date().toISOString(), ...inventory },
    null,
    2,
  )
}

export function downloadJSON(inventory) {
  const blob = new Blob([exportJSON(inventory)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `temperlist-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function readJSONFile(file) {
  const text = await file.text()
  return migrate(JSON.parse(text))
}

/* --------------------------------------------------------- URL transport */

/**
 * Trim the inventory to just what a recipient needs. Dispositions are personal
 * working state and are dropped. A share link is "here's my collection", not
 * "here's my scratchpad".
 *
 * Links made by older builds carry two extra fields — a per-weapon moonsteel
 * flag and a `t` target list — that this build no longer models. `fromShare`
 * simply ignores them, so old links still open.
 */
function forShare(inventory) {
  return {
    v: 1,
    w: inventory.weapons.map((w) => [
      w.weaponId,
      w.craftwork,
      w.tempers.map((t) => (t.stacks > 1 ? [t.temperId, t.stacks] : t.temperId)),
    ]),
    s: inventory.shelf,
    c: [inventory.settings.recipeThreshold, inventory.settings.doubleStackCountsTwice ? 1 : 0],
  }
}

function fromShare(compact) {
  if (!compact || compact.v !== 1) throw new Error('Unrecognised share format.')
  return migrate({
    weapons: (compact.w ?? []).map(([weaponId, craftwork, tempers]) => ({
      weaponId,
      craftwork,
      tempers: (tempers ?? []).map((t) =>
        Array.isArray(t) ? { temperId: t[0], stacks: t[1] } : { temperId: t, stacks: 1 },
      ),
    })),
    shelf: compact.s ?? {},
    settings: {
      recipeThreshold: compact.c?.[0],
      doubleStackCountsTwice: compact.c?.[1] !== 0,
    },
  })
}

const hasCompression = typeof CompressionStream !== 'undefined'

export async function encodeShare(inventory) {
  const json = JSON.stringify(forShare(inventory))
  const bytes = new TextEncoder().encode(json)

  if (hasCompression) {
    const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw'))
    return FORMAT_DEFLATE + toBase64Url(deflated)
  }
  return FORMAT_RAW + toBase64Url(bytes)
}

export async function decodeShare(code) {
  if (!code) throw new Error('Empty share code.')
  const format = code[0]
  const body = fromBase64Url(code.slice(1))

  let bytes
  if (format === FORMAT_DEFLATE) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read compressed share links.')
    }
    bytes = await pipeThrough(body, new DecompressionStream('deflate-raw'))
  } else if (format === FORMAT_RAW) {
    bytes = body
  } else {
    throw new Error('Unrecognised share code.')
  }

  return fromShare(JSON.parse(new TextDecoder().decode(bytes)))
}

export async function shareUrl(inventory) {
  const code = await encodeShare(inventory)
  const base = `${location.origin}${location.pathname}`
  return `${base}#s=${code}`
}

/** Read (and clear) a share code from the current URL, if any. */
export function pendingShareCode() {
  const hash = location.hash.replace(/^#/, '')
  const match = /(?:^|&)s=([^&]+)/.exec(hash)
  return match ? decodeURIComponent(match[1]) : null
}

export function clearShareCode() {
  history.replaceState(null, '', location.pathname + location.search)
}

/* ------------------------------------------------------------- encoding */

async function pipeThrough(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function toBase64Url(bytes) {
  let bin = ''
  // Chunked to avoid blowing the argument limit on large inventories.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
