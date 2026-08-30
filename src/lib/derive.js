/**
 * Pure derivations over the inventory. No state, no side effects: everything
 * here is a function of (inventory, catalogue) so it is trivially testable.
 */

import { ART_TO_WEAPON_TYPE, COMBAT_ARTS, ORIGINS, DEFAULT_RECIPE_THRESHOLD } from './rules.js'

/**
 * How many of `temperId` a single weapon instance contributes.
 * With `doubleStackCountsTwice` off, a double-stacked temper still only counts
 * once. One weapon dismantled is one weapon dismantled.
 */
function contribution(entry, doubleStackCountsTwice) {
  return doubleStackCountsTwice ? entry.stacks || 1 : 1
}

/**
 * Per-temper tally across the whole inventory.
 *
 * Returns a Map keyed by temperId:
 *   { temperId, fromWeapons, fromShelf, held, weapons: [{ uid, weaponId, stacks }], weaponCount }
 */
export function tallyTempers(inventory) {
  const doubles = inventory.settings?.doubleStackCountsTwice ?? true
  const tally = new Map()

  const ensure = (temperId) => {
    let row = tally.get(temperId)
    if (!row) {
      row = { temperId, fromWeapons: 0, fromShelf: 0, held: 0, weapons: [], weaponCount: 0 }
      tally.set(temperId, row)
    }
    return row
  }

  for (const w of inventory.weapons || []) {
    for (const entry of w.tempers || []) {
      const row = ensure(entry.temperId)
      const n = contribution(entry, doubles)
      row.fromWeapons += n
      row.weaponCount += 1
      row.weapons.push({ uid: w.uid, weaponId: w.weaponId, stacks: entry.stacks || 1, contributes: n })
    }
  }

  for (const [temperId, count] of Object.entries(inventory.shelf || {})) {
    if (!count) continue
    ensure(temperId).fromShelf += count
  }

  for (const row of tally.values()) row.held = row.fromWeapons + row.fromShelf
  return tally
}

export const STATUS = {
  MISSING: 'missing',
  PARTIAL: 'partial',
  READY: 'ready',
}

export function statusFor(held, threshold) {
  if (held <= 0) return STATUS.MISSING
  if (held >= threshold) return STATUS.READY
  return STATUS.PARTIAL
}

/**
 * Join the temper catalogue with the inventory tally into the rows the UI renders.
 * Every catalogue temper appears, including ones held zero times.
 */
export function temperRows(catalogue, inventory) {
  const threshold = inventory.settings?.recipeThreshold ?? DEFAULT_RECIPE_THRESHOLD
  const tally = tallyTempers(inventory)

  return catalogue.tempers.map((temper) => {
    const row = tally.get(temper.id) ?? {
      fromWeapons: 0,
      fromShelf: 0,
      held: 0,
      weapons: [],
      weaponCount: 0,
    }
    const held = row.held
    return {
      temper,
      held,
      fromWeapons: row.fromWeapons,
      fromShelf: row.fromShelf,
      weaponCount: row.weaponCount,
      sources: row.weapons,
      remaining: Math.max(0, threshold - held),
      progress: threshold > 0 ? Math.min(1, held / threshold) : 1,
      status: statusFor(held, threshold),
    }
  })
}

/** Per-temper breakdown of which of your weapons carry it, heaviest first. */
export function sourceBreakdown(row, catalogue) {
  const byWeapon = new Map()
  for (const src of row.sources) {
    const existing = byWeapon.get(src.weaponId) ?? { weaponId: src.weaponId, count: 0, instances: [] }
    existing.count += src.contributes
    existing.instances.push(src)
    byWeapon.set(src.weaponId, existing)
  }
  return [...byWeapon.values()]
    .map((w) => ({ ...w, weapon: catalogue.weaponById.get(w.weaponId) }))
    .sort((a, b) => b.count - a.count || a.weaponId.localeCompare(b.weaponId))
}

/* ---------------------------------------------------------------- groupings */

export const GROUP_BY = {
  ORIGIN: 'origin',
  ART: 'art',
  WEAPON_TYPE: 'weaponType',
  SOURCE: 'source',
  NONE: 'none',
}

export const GROUP_BY_LABELS = {
  [GROUP_BY.ORIGIN]: 'Origin',
  [GROUP_BY.ART]: 'Combat Art',
  [GROUP_BY.WEAPON_TYPE]: 'Weapon type',
  [GROUP_BY.SOURCE]: 'Source weapon',
  [GROUP_BY.NONE]: 'A → Z',
}

/**
 * Group temper rows for display. Returns `[{ key, label, rows }]` in a stable,
 * meaningful order (canonical game order where one exists, else alphabetical).
 */
export function groupRows(rows, groupBy, catalogue) {
  if (groupBy === GROUP_BY.NONE) {
    return [{ key: 'all', label: 'All Tempers', rows: sortByName(rows) }]
  }

  if (groupBy === GROUP_BY.ORIGIN) {
    return orderedGroups(rows, ORIGINS, (r) => [r.temper.origin || 'Universal'])
  }

  if (groupBy === GROUP_BY.WEAPON_TYPE) {
    // 'All Weapons' tempers genuinely belong to every type; list them separately
    // rather than duplicating them into Melee/Bow/Magick.
    return orderedGroups(rows, ['All Weapons', 'Melee', 'Bow', 'Magick'], (r) => [
      r.temper.weaponType || 'All Weapons',
    ])
  }

  if (groupBy === GROUP_BY.ART) {
    // A temper gated to "Melee" appears under every melee Art, because that is
    // where you'd go looking for it when deciding what to farm.
    return orderedGroups(rows, [...COMBAT_ARTS], (r) => {
      const gate = r.temper.weaponType || 'All Weapons'
      if (gate === 'All Weapons') return [...COMBAT_ARTS]
      return COMBAT_ARTS.filter((art) => ART_TO_WEAPON_TYPE[art] === gate)
    })
  }

  if (groupBy === GROUP_BY.SOURCE) {
    // Keyed by the weapons you actually own that carry each temper.
    const groups = new Map()
    for (const row of rows) {
      if (row.sources.length === 0) continue
      for (const src of row.sources) {
        const g = groups.get(src.weaponId) ?? { key: src.weaponId, rows: new Map() }
        const prev = g.rows.get(row.temper.id)
        if (prev) prev.held += src.contributes
        else g.rows.set(row.temper.id, { ...row, held: src.contributes })
        groups.set(src.weaponId, g)
      }
    }
    return [...groups.values()]
      .map((g) => ({
        key: g.key,
        label: catalogue.weaponById.get(g.key)?.name ?? g.key,
        rows: sortByName([...g.rows.values()]),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label))
  }

  return [{ key: 'all', label: 'All Tempers', rows: sortByName(rows) }]
}

function orderedGroups(rows, order, keysOf) {
  const buckets = new Map(order.map((k) => [k, []]))
  for (const row of rows) {
    for (const key of keysOf(row)) {
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(row)
    }
  }
  return [...buckets.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, label: key, rows: sortByName(list) }))
}

function sortByName(rows) {
  return [...rows].sort((a, b) => a.temper.name.localeCompare(b.temper.name))
}

/* --------------------------------------------------------------- dashboard */

/** Headline counts: how many recipes are unlockable, in progress, or untouched. */
export function summarize(rows) {
  const total = rows.length
  const ready = rows.filter((r) => r.status === STATUS.READY).length
  const partial = rows.filter((r) => r.status === STATUS.PARTIAL).length
  const missing = total - ready - partial
  return {
    total,
    ready,
    partial,
    missing,
    percent: total ? Math.round((ready / total) * 100) : 0,
  }
}

/** Per-Origin progress rings for the dashboard. */
export function summarizeByOrigin(rows) {
  return ORIGINS.map((origin) => {
    const inOrigin = rows.filter((r) => (r.temper.origin || 'Universal') === origin)
    return { origin, ...summarize(inOrigin) }
  }).filter((s) => s.total > 0)
}

/** Tempers you're closest to unlocking: the "go dismantle these" shortlist. */
export function closestToUnlocking(rows, limit = 8) {
  return rows
    .filter((r) => r.status === STATUS.PARTIAL)
    .sort(
      (a, b) =>
        a.remaining - b.remaining ||
        b.held - a.held ||
        a.temper.name.localeCompare(b.temper.name),
    )
    .slice(0, limit)
}

/**
 * The two facts the Overview opens with, both of which need the weapon list and
 * not just the temper rows:
 *
 * - `oneAway`   recipes a single dismantle short of the threshold.
 * - `lastCopy`  weapons carrying the only copy you own of a temper that is
 *               still short — the ones it would hurt to scrap blind.
 */
export function attentionCounts(rows, inventory) {
  const oneAway = rows.filter((r) => r.remaining === 1).length

  const scarce = new Set(
    rows.filter((r) => r.status !== STATUS.READY && r.weaponCount === 1).map((r) => r.temper.id),
  )
  const lastCopy = (inventory.weapons || []).filter((w) =>
    (w.tempers || []).some((t) => scarce.has(t.temperId)),
  ).length

  return { oneAway, lastCopy }
}

/** Rows for the Arsenal view: each owned weapon joined to its catalogue entry. */
export function arsenalRows(catalogue, inventory) {
  return (inventory.weapons || []).map((instance) => ({
    instance,
    weapon: catalogue.weaponById.get(instance.weaponId) ?? {
      id: instance.weaponId,
      name: instance.weaponId,
      unknown: true,
    },
    tempers: (instance.tempers || []).map((entry) => ({
      ...entry,
      temper: catalogue.temperById.get(entry.temperId) ?? {
        id: entry.temperId,
        name: entry.temperId,
        unknown: true,
      },
    })),
  }))
}
