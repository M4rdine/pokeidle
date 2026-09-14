import { describe, expect, it } from 'vitest'
import { hpAt, statAt, statsAt } from '../src/stats.js'

describe('stat e hp', () => {
  it('bate com o oficial no nível 100 com IV máximo (Charizard)', () => {
    expect(hpAt(78, 100)).toBe(297)
    expect(statAt(84, 100)).toBe(204)
    expect(statAt(100, 100)).toBe(236)
  })
  it('continua linear sem teto', () => {
    expect(hpAt(78, 300)).toBe(871)
    expect(statAt(84, 300)).toBe(602)
  })
  it('nível 1 e 5 (Charmander base hp 39, spAttack 60)', () => {
    expect(hpAt(39, 1)).toBe(12)
    expect(statAt(60, 5)).toBe(12)
  })
  it('statsAt mapeia os seis stats', () => {
    const s = statsAt({ hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, 5)
    expect(s).toEqual({ hp: 20, attack: 11, defense: 10, spAttack: 12, spDefense: 11, speed: 13 })
  })
  it('rejeita nível inválido', () => {
    expect(() => statAt(50, 0)).toThrow(RangeError)
    expect(() => hpAt(50, 1.5)).toThrow(RangeError)
  })
})
