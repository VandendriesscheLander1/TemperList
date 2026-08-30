import { describe, it, expect } from 'vitest'
import {
  tallyTempers,
  temperRows,
  groupRows,
  sourceBreakdown,
  summarize,
  summarizeByOrigin,
  closestToUnlocking,
  attentionCounts,
  arsenalRows,
  GROUP_BY,
  STATUS,
} from './derive.js'
import { emptyInventory } from './inventory.js'

const TEMPERS = [
  { id: 'Breakneck', name: 'Breakneck', origin: 'Universal', weaponType: 'All Weapons' },
  { id: 'Dual Cast', name: 'Dual Cast', origin: 'Feykin', weaponType: 'Magick' },
  { id: 'Quick Draw', name: 'Quick Draw', origin: 'Universal', weaponType: 'Bow' },
  { id: 'Savagery', name: 'Savagery', origin: 'Cassid', weaponType: 'Melee' },
]

const WEAPONS = [
  { id: 'Orst-III', name: 'Orst-III', origin: "Ode'n", art: 'Long Blade' },
  { id: 'Veilk', name: 'Veilk', origin: 'Feykin', art: 'Magick' },
  { id: 'Avex', name: 'Avex', origin: "Ode'n", art: 'Bow' },
]

const catalogue = {
  tempers: TEMPERS,
  weapons: WEAPONS,
  temperById: new Map(TEMPERS.map((t) => [t.id, t])),
  weaponById: new Map(WEAPONS.map((w) => [w.id, w])),
}

function inv(over = {}) {
  return { ...emptyInventory(), ...over }
}

const instance = (uid, weaponId, tempers, over = {}) => ({
  uid,
  weaponId,
  craftwork: 'Legendary',
  disposition: 'undecided',
  tempers,
  ...over,
})

describe('tallyTempers', () => {
  it('sums stacks across weapons and the shelf', () => {
    const inventory = inv({
      weapons: [
        instance('a', 'Orst-III', [{ temperId: 'Breakneck', stacks: 2 }]),
        instance('b', 'Veilk', [{ temperId: 'Breakneck', stacks: 1 }]),
      ],
      shelf: { Breakneck: 3 },
    })
    const row = tallyTempers(inventory).get('Breakneck')
    expect(row.fromWeapons).toBe(3)
    expect(row.fromShelf).toBe(3)
    expect(row.held).toBe(6)
    expect(row.weaponCount).toBe(2)
  })

  it('counts a double-stack once when the setting is off', () => {
    const inventory = inv({
      weapons: [instance('a', 'Orst-III', [{ temperId: 'Breakneck', stacks: 2 }])],
      settings: { ...emptyInventory().settings, doubleStackCountsTwice: false },
    })
    expect(tallyTempers(inventory).get('Breakneck').held).toBe(1)
  })

  it('records shelf-only tempers held on no weapon', () => {
    const row = tallyTempers(inv({ shelf: { Savagery: 4 } })).get('Savagery')
    expect(row.held).toBe(4)
    expect(row.weapons).toHaveLength(0)
  })

  it('ignores zero-count shelf entries', () => {
    expect(tallyTempers(inv({ shelf: { Savagery: 0 } })).has('Savagery')).toBe(false)
  })
})

describe('temperRows', () => {
  it('includes every catalogue temper, even unheld ones', () => {
    const rows = temperRows(catalogue, inv())
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.status === STATUS.MISSING)).toBe(true)
  })

  it('computes status against the configurable threshold', () => {
    const inventory = inv({ shelf: { Breakneck: 5, 'Dual Cast': 2 } })
    const byId = Object.fromEntries(temperRows(catalogue, inventory).map((r) => [r.temper.id, r]))
    expect(byId.Breakneck.status).toBe(STATUS.READY)
    expect(byId.Breakneck.remaining).toBe(0)
    expect(byId['Dual Cast'].status).toBe(STATUS.PARTIAL)
    expect(byId['Dual Cast'].remaining).toBe(3)
    expect(byId['Dual Cast'].progress).toBeCloseTo(0.4)
  })

  it('respects a non-default threshold', () => {
    const inventory = inv({
      shelf: { Breakneck: 3 },
      settings: { ...emptyInventory().settings, recipeThreshold: 3 },
    })
    const row = temperRows(catalogue, inventory).find((r) => r.temper.id === 'Breakneck')
    expect(row.status).toBe(STATUS.READY)
  })

  it('caps progress at 1 when overstocked', () => {
    const row = temperRows(catalogue, inv({ shelf: { Breakneck: 99 } })).find(
      (r) => r.temper.id === 'Breakneck',
    )
    expect(row.progress).toBe(1)
    expect(row.remaining).toBe(0)
  })
})

describe('groupRows', () => {
  const rows = temperRows(catalogue, inv())

  it('groups by Origin in canonical order', () => {
    const groups = groupRows(rows, GROUP_BY.ORIGIN, catalogue)
    expect(groups.map((g) => g.key)).toEqual(['Universal', 'Cassid', 'Feykin'])
    expect(groups[0].rows.map((r) => r.temper.id)).toEqual(['Breakneck', 'Quick Draw'])
  })

  it('groups by weapon type without duplicating All Weapons', () => {
    const groups = groupRows(rows, GROUP_BY.WEAPON_TYPE, catalogue)
    expect(groups.map((g) => g.key)).toEqual(['All Weapons', 'Melee', 'Bow', 'Magick'])
    expect(groups.flatMap((g) => g.rows)).toHaveLength(4)
  })

  it('lists an All Weapons temper under every Combat Art', () => {
    const groups = groupRows(rows, GROUP_BY.ART, catalogue)
    const inEvery = groups.every((g) => g.rows.some((r) => r.temper.id === 'Breakneck'))
    expect(inEvery).toBe(true)
    expect(groups.find((g) => g.key === 'Bow').rows.map((r) => r.temper.id)).toEqual([
      'Breakneck',
      'Quick Draw',
    ])
  })

  it('shows a Melee temper under Flyblade only via All Weapons', () => {
    const groups = groupRows(rows, GROUP_BY.ART, catalogue)
    const flyblade = groups.find((g) => g.key === 'Flyblade')
    // Savagery is Melee-gated and Flyblade counts as Melee, so it appears.
    expect(flyblade.rows.map((r) => r.temper.id)).toContain('Savagery')
  })

  it('groups by source weapon, biggest holder first', () => {
    const inventory = inv({
      weapons: [
        instance('a', 'Orst-III', [
          { temperId: 'Breakneck', stacks: 2 },
          { temperId: 'Savagery', stacks: 1 },
        ]),
        instance('b', 'Veilk', [{ temperId: 'Breakneck', stacks: 1 }]),
      ],
    })
    const groups = groupRows(temperRows(catalogue, inventory), GROUP_BY.SOURCE, catalogue)
    expect(groups.map((g) => g.label)).toEqual(['Orst-III', 'Veilk'])
    expect(groups[0].rows.map((r) => [r.temper.id, r.held])).toEqual([
      ['Breakneck', 2],
      ['Savagery', 1],
    ])
  })

  it('flattens to a single A→Z group', () => {
    const groups = groupRows(rows, GROUP_BY.NONE, catalogue)
    expect(groups).toHaveLength(1)
    expect(groups[0].rows.map((r) => r.temper.name)).toEqual([
      'Breakneck',
      'Dual Cast',
      'Quick Draw',
      'Savagery',
    ])
  })
})

describe('sourceBreakdown', () => {
  it('aggregates per weapon and sorts by count', () => {
    const inventory = inv({
      weapons: [
        instance('a', 'Veilk', [{ temperId: 'Breakneck', stacks: 1 }]),
        instance('b', 'Orst-III', [{ temperId: 'Breakneck', stacks: 2 }]),
        instance('c', 'Orst-III', [{ temperId: 'Breakneck', stacks: 1 }]),
      ],
    })
    const row = temperRows(catalogue, inventory).find((r) => r.temper.id === 'Breakneck')
    const breakdown = sourceBreakdown(row, catalogue)
    expect(breakdown.map((b) => [b.weaponId, b.count])).toEqual([
      ['Orst-III', 3],
      ['Veilk', 1],
    ])
    expect(breakdown[0].weapon.name).toBe('Orst-III')
  })
})

describe('summaries', () => {
  const inventory = inv({ shelf: { Breakneck: 5, 'Dual Cast': 2 } })
  const rows = temperRows(catalogue, inventory)

  it('counts ready / partial / missing', () => {
    expect(summarize(rows)).toMatchObject({ total: 4, ready: 1, partial: 1, missing: 2, percent: 25 })
  })

  it('reports per-origin progress, skipping empty origins', () => {
    const byOrigin = summarizeByOrigin(rows)
    expect(byOrigin.map((o) => o.origin)).toEqual(['Universal', 'Cassid', 'Feykin'])
    expect(byOrigin.find((o) => o.origin === 'Universal')).toMatchObject({ total: 2, ready: 1 })
  })

  it('ranks the nearest-to-unlocking first', () => {
    const near = inv({ shelf: { Breakneck: 4, 'Dual Cast': 1, Savagery: 3 } })
    const list = closestToUnlocking(temperRows(catalogue, near))
    expect(list.map((r) => r.temper.id)).toEqual(['Breakneck', 'Savagery', 'Dual Cast'])
  })

  it('breaks remaining-count ties alphabetically', () => {
    const tied = inv({ shelf: { Breakneck: 3, Savagery: 3 } })
    const list = closestToUnlocking(temperRows(catalogue, tied))
    expect(list.map((r) => r.temper.id)).toEqual(['Breakneck', 'Savagery'])
  })
})

describe('attentionCounts', () => {
  it('counts recipes one dismantle out', () => {
    const inventory = inv({ shelf: { Breakneck: 4, Savagery: 2 } })
    expect(attentionCounts(temperRows(catalogue, inventory), inventory).oneAway).toBe(1)
  })

  it('counts weapons holding the only copy of something still short', () => {
    const inventory = inv({
      weapons: [
        instance('sole', 'Orst-III', [{ temperId: 'Breakneck', stacks: 1 }]),
        instance('dupA', 'Veilk', [{ temperId: 'Savagery', stacks: 1 }]),
        instance('dupB', 'Veilk', [{ temperId: 'Savagery', stacks: 1 }]),
      ],
    })
    expect(attentionCounts(temperRows(catalogue, inventory), inventory).lastCopy).toBe(1)
  })

  it('ignores the last copy of a recipe already at threshold', () => {
    const inventory = inv({
      weapons: [instance('sole', 'Orst-III', [{ temperId: 'Breakneck', stacks: 1 }])],
      shelf: { Breakneck: 5 },
    })
    expect(attentionCounts(temperRows(catalogue, inventory), inventory).lastCopy).toBe(0)
  })
})

describe('arsenalRows', () => {
  it('joins instances to the catalogue', () => {
    const inventory = inv({
      weapons: [instance('a', 'Orst-III', [{ temperId: 'Breakneck', stacks: 2 }])],
    })
    const [row] = arsenalRows(catalogue, inventory)
    expect(row.weapon.name).toBe('Orst-III')
    expect(row.tempers[0].temper.name).toBe('Breakneck')
  })

  it('degrades gracefully for ids no longer in the catalogue', () => {
    const inventory = inv({ weapons: [instance('a', 'Deleted', [{ temperId: 'Gone', stacks: 1 }])] })
    const [row] = arsenalRows(catalogue, inventory)
    expect(row.weapon.unknown).toBe(true)
    expect(row.tempers[0].temper.unknown).toBe(true)
  })
})
