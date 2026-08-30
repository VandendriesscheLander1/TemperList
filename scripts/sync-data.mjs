/**
 * Snapshot the catalogue from the GraphQL API into src/data/, and download +
 * compress every icon into public/icons/.
 *
 * Requires AVAKOT_API_KEY in .env (see .env.example). The API's CORS allowlist
 * only admits https://avakot.market, so the browser can't call it directly,
 * hence a build-time snapshot.
 *
 *   npm run sync-data          # incremental (keeps existing icons)
 *   npm run sync-data:force    # re-download every icon
 *
 * Runs an introspection query first and reports any field that doesn't exist,
 * so a schema change surfaces as an error here rather than as empty columns
 * in the UI.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeTemper, normalizeWeapon, isPlaceholder } from '../src/lib/normalize.js'
import { downloadIcons, ORIGIN_FRAMES } from './icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(ROOT, 'src/data')

/* ------------------------------------------------------------------ env */

async function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) return
  const text = await readFile(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line)
    if (!m) continue
    const value = m[2].replace(/^["']|["']$/g, '')
    if (!(m[1] in process.env)) process.env[m[1]] = value
  }
}

/* ----------------------------------------------------------- graphql io */

let ENDPOINT
let API_KEY

async function gql(query, label) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'User-Agent': 'TemperList/0.1 sync-data',
    },
    body: JSON.stringify({ query }),
  })

  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      const j = JSON.parse(text)
      detail = j.message || j.error || detail
    } catch {}
    if (res.status === 401) {
      throw new Error(
        `${label}: 401 Unauthorized. Check AVAKOT_API_KEY in .env. Get a key at ${new URL('/apollo', ENDPOINT).href}`,
      )
    }
    throw new Error(`${label}: HTTP ${res.status}: ${detail}`)
  }

  const json = JSON.parse(text)
  if (json.errors?.length) throw new Error(`${label}: ${json.errors.map((e) => e.message).join('; ')}`)
  return json.data
}

/* --------------------------------------------------------- introspection */

const INTROSPECT = `
  query Introspect {
    __schema {
      queryType { name }
      types {
        name
        kind
        fields { name type { name kind ofType { name kind ofType { name kind } } } }
      }
    }
  }
`

/** The fields the app reads. Anything missing gets reported, not silently dropped. */
const EXPECTED = {
  Temper: ['ItemID', 'Icon', 'Description', 'Name', 'Stats', 'TemperType', 'subcategory', 'faction'],
  Weapon: ['ItemID', 'Description', 'Slot', 'Rarity', 'Art', 'Origin', 'ImgIcon', 'possibleTempers'],
}

function unwrap(type) {
  let t = type
  while (t && !t.name && t.ofType) t = t.ofType
  return t?.name ?? null
}

/**
 * Find the object type behind a root query field (e.g. `tempers` → `Temper`)
 * and report which of our expected fields it actually has.
 */
function analyze(schema, rootField, expected) {
  const queryTypeName = schema.queryType?.name ?? 'Query'
  const queryType = schema.types.find((t) => t.name === queryTypeName)
  const field = queryType?.fields?.find((f) => f.name === rootField)
  if (!field) return { ok: false, reason: `root field \`${rootField}\` not found` }

  const typeName = unwrap(field.type)
  const type = schema.types.find((t) => t.name === typeName)
  if (!type?.fields) return { ok: false, reason: `type \`${typeName}\` has no fields` }

  const available = new Set(type.fields.map((f) => f.name))
  const present = expected.filter((f) => available.has(f))
  const missing = expected.filter((f) => !available.has(f))
  const extra = type.fields.map((f) => f.name).filter((f) => !expected.includes(f))

  return { ok: true, typeName, present, missing, extra, available: [...available] }
}

/** Build a selection set from only the fields that actually exist. */
function selection(analysis, nested = {}) {
  return analysis.present
    .map((f) => (nested[f] ? `${f} { ${nested[f]} }` : f))
    .join(' ')
}

/* -------------------------------------------------------------- pipeline */

async function main() {
  await loadEnv()

  ENDPOINT = process.env.GQL_ENDPOINT || 'https://api.7thseraph.org/v1/gql'
  API_KEY = process.env.AVAKOT_API_KEY

  if (!API_KEY) {
    console.error(
      '\nAVAKOT_API_KEY is not set.\n' +
        '  1. cp .env.example .env\n' +
        '  2. Get a key from https://api.7thseraph.org/apollo (Discord sign-in)\n' +
        '  3. Put it in .env as AVAKOT_API_KEY=…\n\n' +
        'No key? `npm run bootstrap-wiki` seeds the catalogue from the public wiki instead.\n',
    )
    process.exit(1)
  }

  const force = process.argv.includes('--force')

  console.log(`Introspecting ${ENDPOINT}…`)
  const { __schema: schema } = await gql(INTROSPECT, 'introspection')

  const temperInfo = analyze(schema, 'tempers', EXPECTED.Temper)
  const weaponInfo = analyze(schema, 'weapons', EXPECTED.Weapon)

  for (const [label, info] of [
    ['tempers', temperInfo],
    ['weapons', weaponInfo],
  ]) {
    if (!info.ok) throw new Error(`Schema mismatch on ${label}: ${info.reason}`)
    console.log(`  ${label} → ${info.typeName}: ${info.present.length}/${EXPECTED[
      label === 'tempers' ? 'Temper' : 'Weapon'
    ].length} expected fields present`)
    if (info.missing.length) console.warn(`    ! missing: ${info.missing.join(', ')}`)
    if (info.extra.length) console.log(`    + also available: ${info.extra.join(', ')}`)
  }

  // `possibleWeapons` is a nested object list; everything else is scalar.
  const temperSel = selection(temperInfo, { possibleWeapons: 'name' })
  const weaponSel = selection(weaponInfo)

  console.log('\nFetching catalogue…')
  const data = await gql(
    `query Catalogue { tempers { ${temperSel} } weapons { ${weaponSel} } }`,
    'catalogue',
  )

  const rawTempers = (data.tempers ?? []).map(normalizeTemper)
  const rawWeapons = (data.weapons ?? []).map(normalizeWeapon)

  const tempers = rawTempers.filter((t) => !isPlaceholder(t)).sort((a, b) => a.name.localeCompare(b.name))
  const weapons = rawWeapons.filter((w) => !isPlaceholder(w)).sort((a, b) => a.name.localeCompare(b.name))

  const dropped = rawTempers.length - tempers.length + (rawWeapons.length - weapons.length)
  if (dropped > 0) console.log(`  ${dropped} unreleased/placeholder entr${dropped === 1 ? 'y' : 'ies'} filtered out`)

  if (tempers.length === 0) throw new Error('API returned zero tempers, refusing to overwrite the snapshot.')
  if (weapons.length === 0) throw new Error('API returned zero weapons, refusing to overwrite the snapshot.')

  const withEligibility = weapons.filter((w) => w.possibleTempers.length > 0).length
  console.log(`  ${tempers.length} tempers, ${weapons.length} weapons`)
  console.log(`  ${withEligibility}/${weapons.length} weapons carry an explicit possibleTempers list`)
  if (withEligibility === 0) {
    console.warn('    ! none did, so the app will derive eligibility from Origin + weapon type.')
  }

  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(resolve(DATA_DIR, 'tempers.json'), JSON.stringify(tempers, null, 2) + '\n')
  await writeFile(resolve(DATA_DIR, 'weapons.json'), JSON.stringify(weapons, null, 2) + '\n')
  await writeFile(
    resolve(DATA_DIR, 'schema.json'),
    JSON.stringify({ tempers: temperInfo, weapons: weaponInfo }, null, 2) + '\n',
  )
  await writeFile(
    resolve(DATA_DIR, 'meta.json'),
    JSON.stringify(
      {
        source: 'api',
        endpoint: ENDPOINT,
        syncedAt: new Date().toISOString(),
        counts: { tempers: tempers.length, weapons: weapons.length },
        weaponsWithEligibility: withEligibility,
        missingFields: { tempers: temperInfo.missing, weapons: weaponInfo.missing },
      },
      null,
      2,
    ) + '\n',
  )
  console.log('  → src/data/{tempers,weapons,schema,meta}.json')

  const files = [...tempers.map((t) => t.icon), ...weapons.map((w) => w.icon)].filter(Boolean)
  await downloadIcons(files, ORIGIN_FRAMES, { force })

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(`\nSync failed: ${err.message}`)
  process.exit(1)
})
