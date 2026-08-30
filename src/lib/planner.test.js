import { describe, it, expect } from 'vitest'
import { planDismantles, poolCandidates, applyPlan } from './planner.js'
import { emptyInventory } from './inventory.js'

const catalogue = { tempers: [], weapons: [], temperById: new Map(), weaponById: new Map() }

const w = (uid, weaponId, tempers, disposition = 'scrap', craftwork = 'Legendary') => ({
  uid,
  weaponId,
  craftwork,
  disposition,
  tempers: tempers.map((t) => (typeof t === 'string' ? { temperId: t, stacks: 1 } : t)),
})

function inv(weapons, over = {}) {
  return { ...emptyInventory(), weapons, ...over }
}

describe('planDismantles', () => {
  it('returns nothing when no weapon is marked for scrap', () => {
    const plan = planDismantles(catalogue, inv([w('a', 'Orst-III', ['Breakneck'], 'keep')]))
    expect(plan.steps).toHaveLength(0)
    expect(plan.consideredCount).toBe(0)
  })

  it('picks the five weapons that complete a recipe', () => {
    const weapons = ['a', 'b', 'c', 'd', 'e'].map((id) => w(id, 'Orst-III', ['Breakneck']))
    const plan = planDismantles(catalogue, inv(weapons))
    expect(plan.steps).toHaveLength(5)
    expect(plan.unlocked).toEqual(['Breakneck'])
  })

  it('prefers weapons that unlock over weapons that merely advance', () => {
    const inventory = inv(
      [
        w('spread', 'A', ['X', 'Y', 'Z']),
        w('closer', 'B', ['Breakneck']),
      ],
      { shelf: { Breakneck: 4 } },
    )
    const plan = planDismantles(catalogue, inventory)
    expect(plan.steps[0].uid).toBe('closer')
    expect(plan.steps[0].unlocks).toEqual(['Breakneck'])
  })

  it('counts a double-stack twice toward the threshold', () => {
    const weapons = ['a', 'b', 'c'].map((id) => w(id, 'Orst-III', [{ temperId: 'Breakneck', stacks: 2 }]))
    const plan = planDismantles(catalogue, inv(weapons))
    // 2 + 2 + 2 = 6 >= 5, so three weapons suffice.
    expect(plan.steps).toHaveLength(3)
    expect(plan.unlocked).toEqual(['Breakneck'])
  })

  it('counts a double-stack once when the setting is off', () => {
    const settings = { ...emptyInventory().settings, doubleStackCountsTwice: false }
    const weapons = ['a', 'b', 'c'].map((id) => w(id, 'Orst-III', [{ temperId: 'Breakneck', stacks: 2 }]))
    const plan = planDismantles(catalogue, inv(weapons, { settings }))
    expect(plan.unlocked).toHaveLength(0)
  })

  it('stops once no candidate advances anything', () => {
    const inventory = inv([w('a', 'A', ['Done']), w('b', 'B', ['Done'])], { shelf: { Done: 5 } })
    expect(planDismantles(catalogue, inventory).steps).toHaveLength(0)
  })

  it('includes weapons left undecided when the pool is "all"', () => {
    const inventory = inv([w('a', 'A', ['X'], 'undecided'), w('b', 'B', ['X'], 'keep')])
    expect(planDismantles(catalogue, inventory, { pool: 'all' }).consideredCount).toBe(1)
  })

  it('limits the "low" pool to cheap craftwork that is not marked keep', () => {
    const inventory = inv([
      w('stock', 'A', ['X'], 'undecided', 'Stock'),
      w('military', 'B', ['X'], 'scrap', 'Military'),
      w('officer', 'C', ['X'], 'undecided', 'Officer'),
      w('keptStock', 'D', ['X'], 'keep', 'Stock'),
    ])
    expect(poolCandidates(inventory, 'low').map((x) => x.uid)).toEqual(['stock', 'military'])
    expect(planDismantles(catalogue, inventory, { pool: 'low' }).consideredCount).toBe(2)
  })

  it('honours the step limit and reports truncation', () => {
    const weapons = Array.from({ length: 10 }, (_, i) => w(`w${i}`, 'A', [`T${i}`]))
    const plan = planDismantles(catalogue, inv(weapons), { limit: 3 })
    expect(plan.steps).toHaveLength(3)
    expect(plan.truncated).toBe(true)
  })

  it('warns when scrapping the last source of an incomplete temper', () => {
    const plan = planDismantles(catalogue, inv([w('a', 'Orst-III', ['Rare'])]))
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toMatchObject({ uid: 'a', temperId: 'Rare' })
  })

  it('does not warn when a kept weapon still carries the temper', () => {
    const inventory = inv([w('a', 'A', ['Rare']), w('b', 'B', ['Rare'], 'keep')])
    expect(planDismantles(catalogue, inventory).warnings).toHaveLength(0)
  })

  it('does not warn when the temper is already banked on the shelf', () => {
    const inventory = inv([w('a', 'A', ['Rare'])], { shelf: { Rare: 2 } })
    expect(planDismantles(catalogue, inventory).warnings).toHaveLength(0)
  })
})

describe('applyPlan', () => {
  it('moves tempers to the shelf and drops the instances', () => {
    const inventory = inv([
      w('a', 'A', [{ temperId: 'Breakneck', stacks: 2 }, 'Venger']),
      w('b', 'B', ['Breakneck']),
    ])
    const next = applyPlan(inventory, ['a'])
    expect(next.weapons.map((x) => x.uid)).toEqual(['b'])
    expect(next.shelf).toEqual({ Breakneck: 2, Venger: 1 })
  })

  it('adds to an existing shelf count rather than replacing it', () => {
    const inventory = inv([w('a', 'A', ['Breakneck'])], { shelf: { Breakneck: 3 } })
    expect(applyPlan(inventory, ['a']).shelf.Breakneck).toBe(4)
  })

  it('leaves the original inventory untouched', () => {
    const inventory = inv([w('a', 'A', ['Breakneck'])])
    applyPlan(inventory, ['a'])
    expect(inventory.weapons).toHaveLength(1)
    expect(inventory.shelf).toEqual({})
  })
})
