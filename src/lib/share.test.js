import { describe, it, expect } from 'vitest'
import { encodeShare, decodeShare, exportJSON } from './share.js'
import { emptyInventory, addWeapon, setShelf } from './inventory.js'

function sample() {
  let inv = emptyInventory()
  inv = addWeapon(inv, {
    uid: 'u1',
    weaponId: 'Orst-III',
    craftwork: 'Sovereign',
    disposition: 'scrap',
    tempers: [
      { temperId: 'Breakneck', stacks: 2 },
      { temperId: 'Venger', stacks: 1 },
    ],
  })
  inv = addWeapon(inv, { uid: 'u2', weaponId: 'Veilk', craftwork: 'Stock', tempers: [] })
  inv = setShelf(inv, 'Savagery', 3)
  return inv
}

describe('share codec', () => {
  it('round-trips the collection', async () => {
    const before = sample()
    const after = await decodeShare(await encodeShare(before))

    expect(after.weapons).toHaveLength(2)
    const orst = after.weapons.find((w) => w.weaponId === 'Orst-III')
    expect(orst).toMatchObject({ craftwork: 'Sovereign' })
    expect(orst.tempers).toEqual([
      { temperId: 'Breakneck', stacks: 2 },
      { temperId: 'Venger', stacks: 1 },
    ])
    expect(after.shelf).toEqual({ Savagery: 3 })
    expect(after.settings.recipeThreshold).toBe(5)
  })

  it('drops personal working state from a share', async () => {
    const after = await decodeShare(await encodeShare(sample()))
    const orst = after.weapons.find((w) => w.weaponId === 'Orst-III')
    expect(orst.disposition).toBe('undecided')
  })

  it('carries non-default settings across', async () => {
    const inv = { ...sample(), settings: { recipeThreshold: 3, doubleStackCountsTwice: false, theme: 'dark' } }
    const after = await decodeShare(await encodeShare(inv))
    expect(after.settings.recipeThreshold).toBe(3)
    expect(after.settings.doubleStackCountsTwice).toBe(false)
  })

  it('produces a URL-safe code', async () => {
    const code = await encodeShare(sample())
    expect(code).toMatch(/^[a-zA-Z0-9\-_]+$/)
    expect(encodeURIComponent(code)).toBe(code)
  })

  it('compresses better than raw JSON for a real-sized collection', async () => {
    let inv = emptyInventory()
    for (let i = 0; i < 60; i++) {
      inv = addWeapon(inv, {
        weaponId: 'Orst-III',
        craftwork: 'Legendary',
        tempers: [
          { temperId: 'Breakneck', stacks: 2 },
          { temperId: 'Venger', stacks: 1 },
          { temperId: 'Full Force', stacks: 1 },
        ],
      })
    }
    const code = await encodeShare(inv)
    expect(code.length).toBeLessThan(JSON.stringify(inv).length / 4)
  })

  it('rejects a malformed code', async () => {
    await expect(decodeShare('')).rejects.toThrow()
    await expect(decodeShare('Qabcdef')).rejects.toThrow(/Unrecognised/)
  })

  it('exports readable JSON tagged with the app name', () => {
    const parsed = JSON.parse(exportJSON(sample()))
    expect(parsed.app).toBe('temperlist')
    expect(parsed.weapons).toHaveLength(2)
  })
})
