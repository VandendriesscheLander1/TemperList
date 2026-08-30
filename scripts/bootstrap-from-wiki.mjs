/**
 * Bootstrap a catalogue snapshot from the public Soulframe wiki.
 *
 * No API key required. Used to seed src/data/ so the app is buildable before
 * anyone runs `sync-data`, and as a fallback if the API is unreachable.
 *
 * Caveat: the wiki's data modules carry no `possibleTempers` mapping, so weapon
 * → temper eligibility falls back to the Origin + weapon-type rules in
 * src/lib/rules.js. Run `npm run sync-data` for the authoritative lists.
 *
 *   node scripts/bootstrap-from-wiki.mjs [--no-icons]
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseLuaTable } from './lua-table.mjs'
import { normalizeTemper, normalizeWeapon, isPlaceholder } from '../src/lib/normalize.js'
import { downloadIcons, ORIGIN_FRAMES } from './icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(ROOT, 'src/data')
const WIKI = 'https://wiki.avakot.org/w/index.php'
const UA = 'TemperList/0.1 (Soulframe temper tracker; contact via avakot Discord)'

async function fetchRaw(title) {
  const url = `${WIKI}?title=${encodeURIComponent(title)}&action=raw`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`)
  return res.text()
}

async function main() {
  const skipIcons = process.argv.includes('--no-icons')

  console.log('Fetching wiki data modules…')
  const [temperSrc, weaponSrc] = await Promise.all([
    fetchRaw('Module:Data/Tempers'),
    fetchRaw('Module:Data/Weapons'),
  ])

  const temperTable = parseLuaTable(temperSrc)
  const weaponTable = parseLuaTable(weaponSrc)

  const tempers = Object.entries(temperTable)
    .filter(([, v]) => v && v.Art !== 'Unreleased' && v.Tags !== 'Upcoming')
    .map(([name, v]) =>
      normalizeTemper({
        ItemID: name,
        Name: name,
        Description: v.Description,
        Icon: v.Icon,
        faction: v.Origin,
        TemperType: v.Weapon,
        Stats: v.Stats,
      }),
    )
    .filter((t) => !isPlaceholder(t))
    .sort((a, b) => a.name.localeCompare(b.name))

  const weapons = Object.entries(weaponTable)
    .filter(([, v]) => v && v.Art !== 'Unreleased')
    .map(([name, v]) =>
      normalizeWeapon({
        ItemID: name,
        Name: name,
        Description: v.Description,
        Slot: v.Slot,
        Rarity: v.Rarity,
        Art: v.Art,
        Origin: v.Origin,
        ImgIcon: v.ImgIcon,
        // Deliberately absent; rules.js derives eligibility instead.
        possibleTempers: [],
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(resolve(DATA_DIR, 'tempers.json'), JSON.stringify(tempers, null, 2) + '\n')
  await writeFile(resolve(DATA_DIR, 'weapons.json'), JSON.stringify(weapons, null, 2) + '\n')
  await writeFile(
    resolve(DATA_DIR, 'meta.json'),
    JSON.stringify(
      {
        source: 'wiki',
        note: 'Bootstrapped from wiki.avakot.org. Weapon→temper eligibility is derived, not authoritative. Run `npm run sync-data` for API data.',
        syncedAt: new Date().toISOString(),
        counts: { tempers: tempers.length, weapons: weapons.length },
      },
      null,
      2,
    ) + '\n',
  )

  console.log(`  ${tempers.length} tempers, ${weapons.length} weapons → src/data/`)

  if (!skipIcons) {
    const files = [
      ...tempers.map((t) => t.icon).filter(Boolean),
      ...weapons.map((w) => w.icon).filter(Boolean),
    ]
    await downloadIcons(files, ORIGIN_FRAMES)
  }
}

main().catch((err) => {
  console.error(`\nBootstrap failed: ${err.message}`)
  process.exit(1)
})
