/**
 * Inventory shape, migrations, and pure mutators.
 *
 * Kept free of Svelte so it can be unit-tested directly. `store.svelte.js`
 * wraps these in reactive state and handles persistence.
 */

import { DEFAULT_RECIPE_THRESHOLD, DEFAULT_SHORTLIST_SIZE, MAX_STACKS } from './rules.js'

export const SCHEMA_VERSION = 1

export function emptyInventory() {
  return {
    version: SCHEMA_VERSION,
    weapons: [],
    shelf: {},
    settings: {
      recipeThreshold: DEFAULT_RECIPE_THRESHOLD,
      doubleStackCountsTwice: true,
      shortlistSize: DEFAULT_SHORTLIST_SIZE,
      theme: 'dark',
    },
  }
}

/** Coerce arbitrary parsed JSON into a valid inventory, dropping junk. */
export function migrate(raw) {
  const base = emptyInventory()
  if (!raw || typeof raw !== 'object') return base

  const weapons = Array.isArray(raw.weapons)
    ? raw.weapons
        .filter((w) => w && typeof w.weaponId === 'string')
        .map((w) => ({
          uid: typeof w.uid === 'string' ? w.uid : newUid(),
          weaponId: w.weaponId,
          craftwork: typeof w.craftwork === 'string' ? w.craftwork : 'Stock',
          disposition: ['keep', 'scrap', 'undecided'].includes(w.disposition) ? w.disposition : 'undecided',
          tempers: Array.isArray(w.tempers)
            ? w.tempers
                .filter((t) => t && typeof t.temperId === 'string')
                .map((t) => ({
                  temperId: t.temperId,
                  stacks: clamp(Number(t.stacks) || 1, 1, MAX_STACKS),
                }))
            : [],
        }))
    : []

  const shelf = {}
  if (raw.shelf && typeof raw.shelf === 'object') {
    for (const [k, v] of Object.entries(raw.shelf)) {
      const n = Math.max(0, Math.floor(Number(v) || 0))
      if (n > 0) shelf[k] = n
    }
  }

  return {
    version: SCHEMA_VERSION,
    weapons,
    shelf,
    settings: {
      ...base.settings,
      ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}),
      recipeThreshold: clamp(Number(raw.settings?.recipeThreshold) || DEFAULT_RECIPE_THRESHOLD, 1, 99),
      shortlistSize: clamp(Number(raw.settings?.shortlistSize) || DEFAULT_SHORTLIST_SIZE, 3, 20),
    },
  }
}

let uidCounter = 0
export function newUid() {
  uidCounter += 1
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `w_${rand}${uidCounter.toString(36)}`
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/* ------------------------------------------------------------- mutators */
/* Each returns a new inventory object; none mutate their argument. */

export function addWeapon(inventory, draft) {
  const instance = {
    uid: draft.uid ?? newUid(),
    weaponId: draft.weaponId,
    craftwork: draft.craftwork ?? 'Stock',
    disposition: draft.disposition ?? 'undecided',
    tempers: (draft.tempers ?? []).map((t) => ({
      temperId: t.temperId,
      stacks: clamp(t.stacks || 1, 1, MAX_STACKS),
    })),
  }
  return { ...inventory, weapons: [instance, ...inventory.weapons] }
}

export function updateWeapon(inventory, uid, patch) {
  return {
    ...inventory,
    weapons: inventory.weapons.map((w) => (w.uid === uid ? { ...w, ...patch } : w)),
  }
}

export function removeWeapon(inventory, uid) {
  return { ...inventory, weapons: inventory.weapons.filter((w) => w.uid !== uid) }
}

/** Cycle a temper on a draft weapon: absent → ×1 → ×2 → absent. */
export function cycleTemper(tempers, temperId) {
  const existing = tempers.find((t) => t.temperId === temperId)
  if (!existing) return [...tempers, { temperId, stacks: 1 }]
  if (existing.stacks < MAX_STACKS) {
    return tempers.map((t) => (t.temperId === temperId ? { ...t, stacks: t.stacks + 1 } : t))
  }
  return tempers.filter((t) => t.temperId !== temperId)
}

export function setShelf(inventory, temperId, count) {
  const shelf = { ...inventory.shelf }
  const n = Math.max(0, Math.floor(count) || 0)
  if (n > 0) shelf[temperId] = n
  else delete shelf[temperId]
  return { ...inventory, shelf }
}

export function updateSettings(inventory, patch) {
  return { ...inventory, settings: { ...inventory.settings, ...patch } }
}
