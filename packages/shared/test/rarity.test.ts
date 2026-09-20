import { describe, expect, it } from 'vitest'
import { dropChance, MAX_RARITY, MIN_RARITY } from '../src/loot.js'

describe('degrau de raridade da área', () => {
  it('o degrau mais baixo devolve a chance base, sem mexer em nada', () => {
    for (const base of [0.02, 0.08, 0.5, 1]) expect(dropChance(base, MIN_RARITY)).toBe(base)
  })

  it('a chance cresce com o degrau e nunca alcança a certeza', () => {
    const base = 0.02
    const curva = [1, 2, 4, 6, 8].map((r) => dropChance(base, r))
    for (let i = 1; i < curva.length; i++) expect(curva[i]!).toBeGreaterThan(curva[i - 1]!)
    expect(curva.at(-1)!).toBeLessThan(1)
  })

  it('cresce devagar: o raro fica raro mesmo no topo', () => {
    // 2 % no degrau 8 vira cerca de 15 %, não 16 % linear nem quase-garantido.
    expect(dropChance(0.02, MAX_RARITY)).toBeCloseTo(0.149, 3)
    expect(dropChance(0.08, MAX_RARITY)).toBeCloseTo(0.487, 3)
  })

  it('um item já comum satura em vez de estourar', () => {
    expect(dropChance(0.5, MAX_RARITY)).toBeGreaterThan(0.99)
    expect(dropChance(0.5, MAX_RARITY)).toBeLessThanOrEqual(1)
  })

  it('chance de 1 continua 1 em qualquer degrau, e chance 0 continua 0', () => {
    expect(dropChance(1, MAX_RARITY)).toBe(1)
    expect(dropChance(0, MAX_RARITY)).toBe(0)
  })

  it('recusa degrau fora da faixa, em vez de devolver um número sem sentido', () => {
    expect(() => dropChance(0.1, 0)).toThrow(RangeError)
    expect(() => dropChance(0.1, MAX_RARITY + 1)).toThrow(RangeError)
    expect(() => dropChance(0.1, 1.5)).toThrow(RangeError)
  })

  it('recusa chance fora de [0, 1]', () => {
    expect(() => dropChance(-0.1, 1)).toThrow(RangeError)
    expect(() => dropChance(1.1, 1)).toThrow(RangeError)
  })
})
