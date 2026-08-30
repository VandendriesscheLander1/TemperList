import { describe, it, expect } from 'vitest'
import {
  CRAFTWORK,
  craftwork,
  slotCapacity,
  slotsUsed,
  validateInstance,
  eligibleTempers,
  temperTypeAllows,
  temperOriginAllows,
} from './rules.js'

const temper = (over = {}) => ({
  id: 'T',
  name: 'T',
  origin: 'Universal',
  weaponType: 'All Weapons',
  ...over,
})
const weapon = (over = {}) => ({ id: 'W', name: 'W', origin: "Ode'n", art: 'Long Blade', ...over })

describe('craftwork', () => {
  it('matches the wiki slot ranges', () => {
    expect(CRAFTWORK.map((c) => [c.name, c.min, c.max])).toEqual([
      ['Stock', 0, 1],
      ['Military', 1, 3],
      ['Officer', 2, 4],
      ['Noble', 3, 5],
      ['Sovereign', 4, 6],
      ['Legendary', 5, 8],
    ])
  })

  it('falls back to Stock for unknown tiers', () => {
    expect(craftwork('Nonsense').name).toBe('Stock')
    expect(slotCapacity('Legendary')).toBe(8)
  })
})

describe('slotsUsed', () => {
  it('counts a double-stack as two slots', () => {
    expect(slotsUsed([{ temperId: 'a', stacks: 2 }, { temperId: 'b', stacks: 1 }])).toBe(3)
  })

  it('treats a missing stack count as one', () => {
    expect(slotsUsed([{ temperId: 'a' }])).toBe(1)
  })
})

describe('validateInstance', () => {
  it('accepts a Stock weapon with no tempers', () => {
    const v = validateInstance({ craftwork: 'Stock', tempers: [] })
    expect(v.ok).toBe(true)
    expect(v.warnings).toHaveLength(0)
  })

  it('rejects overfilling a Stock weapon', () => {
    const v = validateInstance({
      craftwork: 'Stock',
      tempers: [{ temperId: 'a', stacks: 1 }, { temperId: 'b', stacks: 1 }],
    })
    expect(v.ok).toBe(false)
    expect(v.errors[0]).toMatch(/at most 1 temper/)
  })

  it('allows a Legendary filled by four double-stacks', () => {
    const v = validateInstance({
      craftwork: 'Legendary',
      tempers: ['a', 'b', 'c', 'd'].map((temperId) => ({ temperId, stacks: 2 })),
    })
    expect(v.ok).toBe(true)
    expect(v.used).toBe(8)
    expect(v.capacity).toBe(8)
  })

  it('warns but does not fail when under the tier minimum', () => {
    const v = validateInstance({ craftwork: 'Sovereign', tempers: [{ temperId: 'a', stacks: 1 }] })
    expect(v.ok).toBe(true)
    expect(v.warnings[0]).toMatch(/at least 4/)
  })

  it('rejects a stack above 2', () => {
    const v = validateInstance({ craftwork: 'Legendary', tempers: [{ temperId: 'a', stacks: 3 }] })
    expect(v.ok).toBe(false)
  })
})

describe('temper gating', () => {
  it('lets Universal tempers onto any weapon', () => {
    expect(temperOriginAllows(temper({ origin: 'Universal' }), weapon({ origin: 'Cassid' }))).toBe(true)
  })

  it('locks origin-specific tempers to their origin', () => {
    const feykin = temper({ origin: 'Feykin' })
    expect(temperOriginAllows(feykin, weapon({ origin: 'Feykin' }))).toBe(true)
    expect(temperOriginAllows(feykin, weapon({ origin: 'Cassid' }))).toBe(false)
  })

  it('gates Magick tempers to Magick arts', () => {
    const magick = temper({ weaponType: 'Magick' })
    expect(temperTypeAllows(magick, weapon({ art: 'Magick' }))).toBe(true)
    expect(temperTypeAllows(magick, weapon({ art: 'Long Blade' }))).toBe(false)
  })

  it('treats every melee art as Melee', () => {
    const melee = temper({ weaponType: 'Melee' })
    for (const art of ['Heavy', 'Long Blade', 'Polearm', 'Shield', 'Short Blade']) {
      expect(temperTypeAllows(melee, weapon({ art }))).toBe(true)
    }
  })

  it('admits Flyblades to Melee tempers (they have none of their own)', () => {
    expect(temperTypeAllows(temper({ weaponType: 'Melee' }), weapon({ art: 'Flyblade' }))).toBe(true)
    expect(temperTypeAllows(temper({ weaponType: 'Bow' }), weapon({ art: 'Flyblade' }))).toBe(false)
  })
})

describe('eligibleTempers', () => {
  const all = [
    temper({ id: 'universal-all' }),
    temper({ id: 'feykin-magick', origin: 'Feykin', weaponType: 'Magick' }),
    temper({ id: 'cassid-melee', origin: 'Cassid', weaponType: 'Melee' }),
    temper({ id: 'any-bow', weaponType: 'Bow' }),
  ]

  it('derives eligibility from origin and type when the API list is absent', () => {
    const ids = eligibleTempers(weapon({ origin: 'Feykin', art: 'Magick' }), all).map((t) => t.id)
    expect(ids).toEqual(['universal-all', 'feykin-magick'])
  })

  it('excludes off-origin tempers', () => {
    const ids = eligibleTempers(weapon({ origin: 'Dendrit', art: 'Long Blade' }), all).map((t) => t.id)
    expect(ids).toEqual(['universal-all'])
  })

  it('prefers an explicit possibleTempers list from the API', () => {
    const w = weapon({ origin: 'Dendrit', art: 'Long Blade', possibleTempers: ['feykin-magick'] })
    expect(eligibleTempers(w, all).map((t) => t.id)).toEqual(['feykin-magick'])
  })

  it('matches an explicit list by name as well as id', () => {
    const named = [temper({ id: 'x1', name: 'Breakneck' })]
    const w = weapon({ possibleTempers: ['Breakneck'] })
    expect(eligibleTempers(w, named).map((t) => t.id)).toEqual(['x1'])
  })

  it('falls back to derived rules when an explicit list resolves to nothing', () => {
    const w = weapon({ origin: 'Feykin', art: 'Magick', possibleTempers: ['does-not-exist'] })
    expect(eligibleTempers(w, all).map((t) => t.id)).toEqual(['universal-all', 'feykin-magick'])
  })
})
