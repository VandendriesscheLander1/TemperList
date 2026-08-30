import { describe, it, expect } from 'vitest'
import { normalizeTemper, normalizeWeapon, isPlaceholder } from './normalize.js'

describe('normalizeTemper', () => {
  it('maps the documented API field names', () => {
    const t = normalizeTemper({
      ItemID: 'Breakneck',
      Name: 'Breakneck',
      Description: 'Heavy Attacks charge more quickly.',
      Icon: 'Breakneck.png',
      faction: 'Universal',
      TemperType: 'Melee',
      subcategory: 'Speed',
      possibleWeapons: [{ name: 'Orst-III' }, { name: 'Veilk' }],
    })
    expect(t).toMatchObject({
      id: 'Breakneck',
      name: 'Breakneck',
      origin: 'Universal',
      weaponType: 'Melee',
      subcategory: 'Speed',
      possibleWeapons: ['Orst-III', 'Veilk'],
    })
  })

  it("canonicalises Ode'n across apostrophe styles", () => {
    for (const v of ["Ode'n", 'Ode’n', 'Oden', "ODE'N"]) {
      expect(normalizeTemper({ Name: 'x', faction: v }).origin).toBe("Ode'n")
    }
  })

  it('treats an absent or "All" gate as All Weapons', () => {
    for (const v of [undefined, 'All', 'all weapons', 'Any', 'None']) {
      expect(normalizeTemper({ Name: 'x', TemperType: v }).weaponType).toBe('All Weapons')
    }
  })

  it('strips the $1 substitution token from effect text', () => {
    const t = normalizeTemper({
      Name: 'x',
      Stats: [{ Effect: '$1 Poison Proc Chance', Ranks: '10%/20%' }],
    })
    expect(t.stats[0]).toEqual({ effect: 'Poison Proc Chance', ranks: '10%/20%', notes: undefined })
  })

  it('accepts Stats as a JSON string, an array, or a bare string', () => {
    expect(normalizeTemper({ Name: 'x', Stats: '[{"Effect":"A"}]' }).stats).toEqual([{ effect: 'A', ranks: undefined, notes: undefined }])
    expect(normalizeTemper({ Name: 'x', Stats: 'Just prose' }).stats).toEqual([{ effect: 'Just prose' }])
    expect(normalizeTemper({ Name: 'x', Stats: null }).stats).toEqual([])
  })

  it('accepts possibleWeapons as plain strings', () => {
    expect(normalizeTemper({ Name: 'x', possibleWeapons: ['Avex'] }).possibleWeapons).toEqual(['Avex'])
  })

  it('strips wiki markup from descriptions', () => {
    const t = normalizeTemper({ Name: 'x', Description: "'''Bold''' and [[Weapons|a link]]." })
    expect(t.description).toBe('Bold and a link.')
  })
})

describe('normalizeWeapon', () => {
  it('falls back to ItemID when the query returns no Name', () => {
    const w = normalizeWeapon({ ItemID: 'Orst-III', Art: 'Heavy', Origin: "Ode'n", ImgIcon: 'Orst.png' })
    expect(w).toMatchObject({ id: 'Orst-III', name: 'Orst-III', art: 'Heavy', icon: 'Orst.png' })
  })

  it('reads possibleTempers as strings or objects', () => {
    expect(normalizeWeapon({ ItemID: 'A', possibleTempers: ['Breakneck'] }).possibleTempers).toEqual(['Breakneck'])
    expect(
      normalizeWeapon({ ItemID: 'A', possibleTempers: [{ Name: 'Breakneck' }] }).possibleTempers,
    ).toEqual(['Breakneck'])
  })

  it('defaults a missing slot to Weapon', () => {
    expect(normalizeWeapon({ ItemID: 'A' }).slot).toBe('Weapon')
  })
})

describe('isPlaceholder', () => {
  it('catches unreleased dev stubs', () => {
    expect(isPlaceholder({ name: 'PH AspectCassidParryStaggerName' })).toBe(true)
    expect(isPlaceholder({ name: 'AspectSomethingName' })).toBe(true)
    expect(isPlaceholder({ Name: 'PlaceHolder Thing' })).toBe(true)
  })

  it('leaves real entries alone', () => {
    expect(isPlaceholder({ name: 'Breakneck' })).toBe(false)
    expect(isPlaceholder({ name: 'Phalanx' })).toBe(false)
    expect(isPlaceholder({ name: "Hunter's Relish" })).toBe(false)
  })
})
