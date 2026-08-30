/**
 * Dismantle planner.
 *
 * Problem: you hold N weapons; dismantling one banks all of its tempers. Which
 * weapons should you scrap to unlock the most recipes, while not throwing away
 * a weapon you actually want to keep?
 *
 * This is a weighted max-coverage problem (NP-hard), so we use the standard
 * greedy approximation: repeatedly take the weapon with the best marginal
 * score. Greedy is within (1 - 1/e) of optimal for coverage problems and is
 * instant at inventory scale (tens to low hundreds of weapons).
 */

import { DEFAULT_RECIPE_THRESHOLD, LOW_CRAFTWORK } from './rules.js'
import { tallyTempers } from './derive.js'

/**
 * Which weapons a plan is allowed to spend. Every pool excludes anything marked
 * 'keep' — that flag is the user's veto and nothing here overrides it.
 */
export const PLANNER_POOLS = [
  {
    key: 'scrap',
    label: 'Marked to scrap',
    match: (w) => w.disposition === 'scrap',
  },
  {
    key: 'low',
    label: `${LOW_CRAFTWORK.join(' & ')} only`,
    match: (w) => w.disposition !== 'keep' && LOW_CRAFTWORK.includes(w.craftwork),
  },
  {
    key: 'all',
    label: 'Everything not kept',
    match: (w) => w.disposition !== 'keep',
  },
]

const POOL_BY_KEY = new Map(PLANNER_POOLS.map((p) => [p.key, p]))

/** Weapons a given pool would consider. Exported so the UI can show counts. */
export function poolCandidates(inventory, poolKey) {
  const pool = POOL_BY_KEY.get(poolKey) ?? PLANNER_POOLS[0]
  return (inventory.weapons || []).filter(pool.match)
}

/**
 * @param catalogue  normalized catalogue
 * @param inventory  current inventory state
 * @param options.pool  one of PLANNER_POOLS' keys; 'scrap' by default
 * @param options.limit maximum number of weapons to recommend
 */
export function planDismantles(catalogue, inventory, options = {}) {
  const { pool = 'scrap', limit = 25 } = options
  const threshold = inventory.settings?.recipeThreshold ?? DEFAULT_RECIPE_THRESHOLD
  const doubles = inventory.settings?.doubleStackCountsTwice ?? true

  const candidates = poolCandidates(inventory, pool)

  // Everything already banked, plus everything held on weapons we are NOT
  // considering scrapping. Those counts are unavailable until dismantled, so
  // they don't count toward a recipe. Only the shelf does.
  const banked = new Map(Object.entries(inventory.shelf || {}).map(([k, v]) => [k, v]))
  const held = tallyTempers(inventory)

  const steps = []
  const remaining = new Set(candidates.map((w) => w.uid))
  const byUid = new Map(candidates.map((w) => [w.uid, w]))

  while (steps.length < limit && remaining.size > 0) {
    let best = null

    for (const uid of remaining) {
      const scored = scoreWeapon(byUid.get(uid), banked, threshold, doubles)
      if (!best || scored.score > best.score || (scored.score === best.score && scored.unlocks.length > best.unlocks.length)) {
        best = scored
      }
    }

    // Once no candidate advances anything, further scrapping is just cleanup.
    if (!best || best.score <= 0) break

    for (const [temperId, n] of best.gains) {
      banked.set(temperId, (banked.get(temperId) ?? 0) + n)
    }
    remaining.delete(best.uid)
    steps.push({
      uid: best.uid,
      weaponId: best.weaponId,
      unlocks: best.unlocks,
      advances: best.advances,
      score: best.score,
    })
  }

  return {
    steps,
    unlocked: steps.flatMap((s) => s.unlocks),
    warnings: buildWarnings(candidates, inventory, held, threshold),
    consideredCount: candidates.length,
    truncated: remaining.size > 0 && steps.length >= limit,
  }
}

function scoreWeapon(weapon, banked, threshold, doubles) {
  const gains = new Map()
  for (const entry of weapon.tempers || []) {
    const n = doubles ? entry.stacks || 1 : 1
    gains.set(entry.temperId, (gains.get(entry.temperId) ?? 0) + n)
  }

  const unlocks = []
  const advances = []
  let score = 0

  for (const [temperId, n] of gains) {
    const before = banked.get(temperId) ?? 0
    if (before >= threshold) continue // already unlocked; this copy is dead weight

    const after = before + n
    // Only progress that actually moves you toward the threshold counts.
    const useful = Math.min(after, threshold) - before

    if (after >= threshold) {
      unlocks.push(temperId)
      // Completing a recipe is worth far more than inching toward one.
      score += threshold + useful
    } else {
      advances.push({ temperId, from: before, to: after })
      score += useful
    }
  }

  return { uid: weapon.uid, weaponId: weapon.weaponId, gains, unlocks, advances, score }
}

/**
 * Flag weapons whose loss would hurt: the last copy of a temper you're still
 * short on, where scrapping the weapon doesn't itself complete the recipe.
 */
function buildWarnings(candidates, inventory, held, threshold) {
  const scrapUids = new Set(candidates.map((w) => w.uid))
  const warnings = []

  for (const weapon of candidates) {
    for (const entry of weapon.tempers || []) {
      const row = held.get(entry.temperId)
      if (!row) continue
      if (row.held >= threshold) continue

      const elsewhere = row.weapons.filter((s) => s.uid !== weapon.uid && !scrapUids.has(s.uid))
      if (elsewhere.length === 0 && (inventory.shelf?.[entry.temperId] ?? 0) === 0) {
        warnings.push({
          uid: weapon.uid,
          weaponId: weapon.weaponId,
          temperId: entry.temperId,
          message: `Only source of ${entry.temperId} you're keeping (${row.held}/${threshold}).`,
        })
      }
    }
  }
  return warnings
}

/**
 * Apply a plan: move each weapon's tempers onto the shelf and drop the instance.
 * Returns a NEW inventory; the caller decides whether to commit it.
 */
export function applyPlan(inventory, uids) {
  const doomed = new Set(uids)
  const doubles = inventory.settings?.doubleStackCountsTwice ?? true
  const shelf = { ...(inventory.shelf || {}) }

  for (const weapon of inventory.weapons || []) {
    if (!doomed.has(weapon.uid)) continue
    for (const entry of weapon.tempers || []) {
      shelf[entry.temperId] = (shelf[entry.temperId] ?? 0) + (doubles ? entry.stacks || 1 : 1)
    }
  }

  return {
    ...inventory,
    shelf,
    weapons: (inventory.weapons || []).filter((w) => !doomed.has(w.uid)),
  }
}
