/**
 * Game rules and constants, sourced from wiki.avakot.org/Tempers and /Weapons.
 *
 * These are the only place game mechanics are encoded. Everything else derives
 * from here, so a balance change means editing this file and nothing else.
 */

/**
 * Craftwork is the per-copy quality of a weapon and is what gates how many
 * Tempers it can carry. It is rolled on drop and raised by Refining.
 * It is NOT in the API (which only knows the weapon definition), so it's always user-entered.
 */
export const CRAFTWORK = [
  { name: 'Stock', min: 0, max: 1, damage: 0, color: 'var(--craftwork-stock)' },
  { name: 'Military', min: 1, max: 3, damage: 4, color: 'var(--craftwork-military)' },
  { name: 'Officer', min: 2, max: 4, damage: 8, color: 'var(--craftwork-officer)' },
  { name: 'Noble', min: 3, max: 5, damage: 12, color: 'var(--craftwork-noble)' },
  { name: 'Sovereign', min: 4, max: 6, damage: 16, color: 'var(--craftwork-sovereign)' },
  { name: 'Legendary', min: 5, max: 8, damage: 20, color: 'var(--craftwork-legendary)' },
]

export const CRAFTWORK_NAMES = CRAFTWORK.map((c) => c.name)

const CRAFTWORK_BY_NAME = new Map(CRAFTWORK.map((c) => [c.name, c]))

export function craftwork(name) {
  return CRAFTWORK_BY_NAME.get(name) ?? CRAFTWORK[0]
}

/** Slot capacity of a craftwork tier. Unknown tiers fall back to Stock. */
export function slotCapacity(name) {
  return craftwork(name).max
}

/** Weapon Origin. Determines which origin-locked Tempers can roll on it. */
export const ORIGINS = ['Universal', 'Cassid', 'Dendrit', 'Feykin', 'Mendicant', "Ode'n"]

export const ORIGIN_COLORS = {
  Universal: 'var(--origin-universal)',
  Cassid: 'var(--origin-cassid)',
  Dendrit: 'var(--origin-dendrit)',
  Feykin: 'var(--origin-feykin)',
  Mendicant: 'var(--origin-mendicant)',
  "Ode'n": 'var(--origin-oden)',
}

/** The weapon-type gate on a Temper. 'All Weapons' means ungated. */
export const WEAPON_TYPES = ['All Weapons', 'Melee', 'Bow', 'Magick']

/** Combat Arts, each with its own perk tree. */
export const COMBAT_ARTS = [
  'Bow',
  'Flyblade',
  'Heavy',
  'Long Blade',
  'Magick',
  'Polearm',
  'Shield',
  'Short Blade',
]

/**
 * Which broad weapon type each Combat Art belongs to, for temper gating.
 * Note Flyblade maps to Melee but has no Flyblade-specific Tempers of its own, so
 * it only ever sees Universal / 'All Weapons' tempers.
 */
export const ART_TO_WEAPON_TYPE = {
  Bow: 'Bow',
  Magick: 'Magick',
  Heavy: 'Melee',
  'Long Blade': 'Melee',
  Polearm: 'Melee',
  Shield: 'Melee',
  'Short Blade': 'Melee',
  Flyblade: 'Melee',
}

/** Up to two of the same Temper may roll on one weapon (a "Double-Stack"). */
export const MAX_STACKS = 2

/** Default number of dismantles needed to unlock a recipe. Unconfirmed, so user-configurable. */
export const DEFAULT_RECIPE_THRESHOLD = 5

/** How many rows the Overview's "closest to unlocking" shortlist shows. */
export const DEFAULT_SHORTLIST_SIZE = 6

/** Craftwork tiers cheap enough to feed the forge without a second thought. */
export const LOW_CRAFTWORK = ['Stock', 'Military']

/** Normalise the many spellings of "no weapon-type restriction". */
function normalizeWeaponType(value) {
  if (!value) return 'All Weapons'
  const v = String(value).trim()
  if (/^(all|all weapons|any|universal|none)$/i.test(v)) return 'All Weapons'
  for (const t of WEAPON_TYPES) if (t.toLowerCase() === v.toLowerCase()) return t
  return v
}

/** Does this temper's weapon-type gate admit this weapon's Combat Art? */
export function temperTypeAllows(temper, weapon) {
  const gate = normalizeWeaponType(temper.weaponType)
  if (gate === 'All Weapons') return true
  const artType = ART_TO_WEAPON_TYPE[weapon.art]
  // Unknown art: don't silently hide tempers the player may legitimately have.
  if (!artType) return true
  return gate === artType
}

/** Does this temper's Origin lock admit this weapon? */
export function temperOriginAllows(temper, weapon) {
  const origin = temper.origin || 'Universal'
  if (origin === 'Universal') return true
  if (!weapon.origin) return true
  return origin === weapon.origin
}

/**
 * Tempers that can roll on a given weapon.
 *
 * The API's `possibleTempers` is authoritative when present. Otherwise we derive
 * it from the Origin + weapon-type rules, which is how the wiki describes the
 * system and matches it for every case we can check.
 */
export function eligibleTempers(weapon, allTempers) {
  if (!weapon) return []

  const explicit = weapon.possibleTempers
  if (Array.isArray(explicit) && explicit.length > 0) {
    const wanted = new Set(explicit.map((v) => String(v).toLowerCase()))
    const matched = allTempers.filter(
      (t) => wanted.has(String(t.id).toLowerCase()) || wanted.has(String(t.name).toLowerCase()),
    )
    // Only trust the explicit list if we actually resolved most of it; a stale or
    // differently-keyed list shouldn't leave the user with an empty picker.
    if (matched.length >= Math.min(explicit.length, 1)) return matched
  }

  return allTempers.filter((t) => temperOriginAllows(t, weapon) && temperTypeAllows(t, weapon))
}

/** Total slots consumed by a set of rolled tempers (a double-stack takes two). */
export function slotsUsed(tempers = []) {
  return tempers.reduce((sum, t) => sum + (t.stacks || 1), 0)
}

/**
 * Validate a weapon instance against the craftwork slot rules.
 * Returns `{ ok, used, capacity, errors[], warnings[] }`.
 *
 * Under-filling is a warning rather than an error: a player may not have
 * finished typing in all of a weapon's tempers yet, and we shouldn't block saving.
 */
export function validateInstance(instance) {
  const cw = craftwork(instance.craftwork)
  const used = slotsUsed(instance.tempers)
  const errors = []
  const warnings = []

  if (used > cw.max) {
    errors.push(`${cw.name} holds at most ${cw.max} temper${cw.max === 1 ? '' : 's'}, but ${used} are assigned.`)
  }
  if (used < cw.min) {
    warnings.push(`${cw.name} rolls at least ${cw.min}, only ${used} assigned.`)
  }
  for (const t of instance.tempers || []) {
    if (t.stacks > MAX_STACKS) errors.push(`${t.temperId} can stack at most ${MAX_STACKS}×.`)
  }

  return { ok: errors.length === 0, used, capacity: cw.max, errors, warnings }
}
