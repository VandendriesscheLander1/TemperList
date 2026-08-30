/**
 * Normalization from raw API payloads to the app's internal shape.
 *
 * Shared by `scripts/sync-data.mjs` (build time) and `catalogue.js` (live mode)
 * so the two paths can never drift.
 *
 * The raw field names are inconsistent in case and some are speculative, so the
 * sync script introspects the schema and reports mismatches rather than
 * silently producing empty columns.
 */

/** Read the first present key from a list of candidates. */
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/** Coerce `possibleTempers` / `possibleWeapons`, which may be strings or objects. */
function toNameList(value) {
  if (!value) return []
  const arr = Array.isArray(value) ? value : [value]
  return arr
    .map((v) => {
      if (typeof v === 'string') return v
      if (v && typeof v === 'object') return pick(v, 'name', 'Name', 'ItemID', 'id')
      return undefined
    })
    .filter(Boolean)
    .map(String)
}

/**
 * Effect strings carry a `$1` token marking where the value is substituted
 * (e.g. "$1 Poison Proc Chance" with Ranks "10%/20%"). We render the ranks in
 * their own column, so the token is just noise.
 */
function cleanEffect(text) {
  return String(text)
    .replace(/\$\d+\s*/g, '')
    .trim()
}

/** `Stats` may arrive as a JSON string, an array, or an object. Keep it renderable. */
function toStats(value) {
  if (!value) return []
  let v = value
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        v = JSON.parse(trimmed)
      } catch {
        return [{ effect: trimmed }]
      }
    } else {
      return [{ effect: trimmed }]
    }
  }
  const arr = Array.isArray(v) ? v : [v]
  return arr
    .map((s) => {
      if (typeof s === 'string') return { effect: cleanEffect(s) }
      if (s && typeof s === 'object') {
        return {
          effect: cleanEffect(pick(s, 'Effect', 'effect', 'name', 'Name') ?? ''),
          ranks: pick(s, 'Ranks', 'ranks', 'value', 'Value'),
          notes: pick(s, 'Notes', 'notes'),
        }
      }
      return null
    })
    .filter((s) => s && s.effect)
}

const KNOWN_ORIGINS = ['Universal', 'Cassid', 'Dendrit', 'Feykin', 'Mendicant', "Ode'n"]

/** Map assorted spellings onto the canonical Origin names. */
function toOrigin(value) {
  if (!value) return 'Universal'
  const v = String(value).trim()
  for (const o of KNOWN_ORIGINS) {
    if (o.toLowerCase() === v.toLowerCase()) return o
  }
  // Ode'n shows up with straight and curly apostrophes, and sometimes as "Oden".
  if (/^ode.?n$/i.test(v)) return "Ode'n"
  return v
}

function toWeaponType(value) {
  if (!value) return 'All Weapons'
  const v = String(value).trim()
  if (/^(all|all weapons|any|universal|none)$/i.test(v)) return 'All Weapons'
  for (const t of ['Melee', 'Bow', 'Magick']) {
    if (t.toLowerCase() === v.toLowerCase()) return t
  }
  return v
}

/** Strip the wiki's bold markup that leaks into some Description fields. */
function cleanText(value) {
  if (!value) return ''
  return String(value)
    .replace(/'''(.+?)'''/g, '$1')
    .replace(/''(.+?)''/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .trim()
}

/**
 * Unreleased/dev entries leak into both the wiki and the game data with raw
 * internal names (e.g. "PH AspectCassidParryStaggerName"). They aren't things a
 * player can hold, so they'd only inflate the denominator on every progress bar.
 */
export function isPlaceholder(item) {
  const name = item?.name ?? item?.Name ?? item?.ItemID ?? ''
  return /^PH[\s_]/i.test(name) || /^Aspect[A-Z]/.test(name) || /PlaceHolder/i.test(name)
}

export function normalizeTemper(raw) {
  const name = String(pick(raw, 'Name', 'name', 'ItemID', 'id') ?? 'Unknown')
  return {
    id: String(pick(raw, 'ItemID', 'id', 'Name', 'name') ?? name),
    name,
    description: cleanText(pick(raw, 'Description', 'description')),
    icon: pick(raw, 'Icon', 'icon', 'ImgIcon') ?? null,
    origin: toOrigin(pick(raw, 'faction', 'Faction', 'Origin', 'origin')),
    weaponType: toWeaponType(pick(raw, 'TemperType', 'temperType', 'Weapon', 'weaponType')),
    subcategory: pick(raw, 'subcategory', 'Subcategory', 'SubCategory') ?? null,
    stats: toStats(pick(raw, 'Stats', 'stats')),
    possibleWeapons: toNameList(pick(raw, 'possibleWeapons', 'PossibleWeapons')),
  }
}

export function normalizeWeapon(raw) {
  // The documented `weapons` query returns no display name; ItemID stands in.
  const name = String(pick(raw, 'Name', 'name', 'ItemID', 'id') ?? 'Unknown')
  return {
    id: String(pick(raw, 'ItemID', 'id', 'Name', 'name') ?? name),
    name,
    description: cleanText(pick(raw, 'Description', 'description')),
    slot: pick(raw, 'Slot', 'slot') ?? 'Weapon',
    rarity: pick(raw, 'Rarity', 'rarity') ?? null,
    art: pick(raw, 'Art', 'art') ?? null,
    origin: toOrigin(pick(raw, 'Origin', 'origin')),
    icon: pick(raw, 'ImgIcon', 'imgIcon', 'Icon', 'icon') ?? null,
    possibleTempers: toNameList(pick(raw, 'possibleTempers', 'PossibleTempers')),
  }
}
