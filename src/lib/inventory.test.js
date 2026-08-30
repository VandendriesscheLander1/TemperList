import { describe, it, expect } from 'vitest'
import {
  emptyInventory,
  migrate,
  addWeapon,
  updateWeapon,
  removeWeapon,
  cycleTemper,
  setShelf,
  updateSettings,
} from './inventory.js'

describe('migrate', () => {
  it('returns a valid inventory for junk input', () => {
    expect(migrate(null)).toEqual(emptyInventory())
    expect(migrate('nope')).toEqual(emptyInventory())
    expect(migrate({})).toEqual(emptyInventory())
  })

  it('drops weapons without an id and tempers without one', () => {
    const out = migrate({
      weapons: [{ weaponId: 'Avex', tempers: [{ temperId: 'X' }, { nope: 1 }] }, { craftwork: 'Stock' }],
    })
    expect(out.weapons).toHaveLength(1)
    expect(out.weapons[0].tempers).toEqual([{ temperId: 'X', stacks: 1 }])
  })

  it('assigns a uid when one is missing', () => {
    const out = migrate({ weapons: [{ weaponId: 'Avex' }] })
    expect(out.weapons[0].uid).toMatch(/^w_/)
  })

  it('clamps stacks to the 1..2 range', () => {
    const out = migrate({ weapons: [{ weaponId: 'A', tempers: [{ temperId: 'X', stacks: 9 }] }] })
    expect(out.weapons[0].tempers[0].stacks).toBe(2)
  })

  it('drops zero and negative shelf counts', () => {
    expect(migrate({ shelf: { A: 3, B: 0, C: -1, D: 'x' } }).shelf).toEqual({ A: 3 })
  })

  it('normalises an unrecognised disposition', () => {
    expect(migrate({ weapons: [{ weaponId: 'A', disposition: 'burn' }] }).weapons[0].disposition).toBe(
      'undecided',
    )
  })

  it('keeps a custom threshold but clamps it into range', () => {
    expect(migrate({ settings: { recipeThreshold: 7 } }).settings.recipeThreshold).toBe(7)
    expect(migrate({ settings: { recipeThreshold: 0 } }).settings.recipeThreshold).toBe(5)
    expect(migrate({ settings: { recipeThreshold: 500 } }).settings.recipeThreshold).toBe(99)
  })

  it('clamps the shortlist size into range', () => {
    expect(migrate({ settings: { shortlistSize: 9 } }).settings.shortlistSize).toBe(9)
    expect(migrate({ settings: { shortlistSize: 1 } }).settings.shortlistSize).toBe(3)
    expect(migrate({ settings: { shortlistSize: 99 } }).settings.shortlistSize).toBe(20)
  })

  // Saves written before the redesign carry per-weapon fields this build no
  // longer models; migrate must strip them rather than pass them through.
  it('drops retired weapon fields', () => {
    const out = migrate({
      weapons: [{ weaponId: 'Avex', moonsteel: true, note: 'old scratch' }],
      targets: ['X'],
    })
    expect(out.weapons[0]).not.toHaveProperty('moonsteel')
    expect(out.weapons[0]).not.toHaveProperty('note')
    expect(out).not.toHaveProperty('targets')
  })
})

describe('mutators', () => {
  it('adds a weapon at the top without mutating the input', () => {
    const before = emptyInventory()
    const after = addWeapon(before, { weaponId: 'Avex', craftwork: 'Noble', tempers: [{ temperId: 'X' }] })
    expect(before.weapons).toHaveLength(0)
    expect(after.weapons[0]).toMatchObject({ weaponId: 'Avex', craftwork: 'Noble' })
    expect(after.weapons[0].tempers[0].stacks).toBe(1)
  })

  it('updates and removes by uid', () => {
    let inv = addWeapon(emptyInventory(), { uid: 'u1', weaponId: 'Avex' })
    inv = updateWeapon(inv, 'u1', { disposition: 'scrap' })
    expect(inv.weapons[0].disposition).toBe('scrap')
    expect(removeWeapon(inv, 'u1').weapons).toHaveLength(0)
  })

  it('cycles a temper absent → ×1 → ×2 → absent', () => {
    let tempers = []
    tempers = cycleTemper(tempers, 'X')
    expect(tempers).toEqual([{ temperId: 'X', stacks: 1 }])
    tempers = cycleTemper(tempers, 'X')
    expect(tempers).toEqual([{ temperId: 'X', stacks: 2 }])
    tempers = cycleTemper(tempers, 'X')
    expect(tempers).toEqual([])
  })

  it('sets and clears shelf counts', () => {
    let inv = setShelf(emptyInventory(), 'X', 4)
    expect(inv.shelf).toEqual({ X: 4 })
    expect(setShelf(inv, 'X', 0).shelf).toEqual({})
  })

  it('merges settings patches', () => {
    const inv = updateSettings(emptyInventory(), { recipeThreshold: 3 })
    expect(inv.settings.recipeThreshold).toBe(3)
    expect(inv.settings.doubleStackCountsTwice).toBe(true)
  })
})
