import { describe, expect, it } from 'vitest'
import type { Move, Species } from '../src/index.js'
import { availableMoves, cooldownTicks } from '../src/moves.js'

const moves = new Map<string, Move>([
  ['ember', { name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' }],
  ['scratch', { name: 'scratch', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' }],
  ['flamethrower', { name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' }],
])
const charmander: Species = {
  id: 4, name: 'charmander', types: ['fire'], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
  baseExperience: 62, growthRate: 'medium-slow', captureRate: 45,
  learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }, { move: 'flamethrower', level: 34 }, { move: 'ember', level: 40 }],
}

describe('availableMoves', () => {
  it('filtra pelo nível e remove duplicatas mantendo a ordem', () => {
    expect(availableMoves(charmander, 5, moves).map((m) => m.name)).toEqual(['scratch', 'ember'])
    expect(availableMoves(charmander, 40, moves).map((m) => m.name)).toEqual(['scratch', 'ember', 'flamethrower'])
  })
  it('lança se o learnset referencia golpe desconhecido', () => {
    expect(() => availableMoves({ ...charmander, learnset: [{ move: 'nope', level: 1 }] }, 1, moves)).toThrow(/nope/)
  })
})

describe('cooldownTicks', () => {
  it('poder 40 → 10 ticks, 90 → 25, 110 → 30, 15 → 5 (piso), 250 → 40 (teto)', () => {
    expect(cooldownTicks({ power: 40 })).toBe(10)
    expect(cooldownTicks({ power: 90 })).toBe(25)
    expect(cooldownTicks({ power: 110 })).toBe(30)
    expect(cooldownTicks({ power: 15 })).toBe(5)
    expect(cooldownTicks({ power: 250 })).toBe(40)
  })
})
