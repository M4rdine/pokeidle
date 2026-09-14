import { describe, expect, it } from 'vitest'
import type { Move, Species } from '../src/index.js'
import { STRUGGLE, availableMoves, cooldownTicks } from '../src/moves.js'

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
const lateBloomer: Species = {
  id: 999, name: 'late-bloomer', types: ['normal'], baseStats: { hp: 40, attack: 40, defense: 40, spAttack: 40, spDefense: 40, speed: 40 },
  baseExperience: 60, growthRate: 'medium-fast', captureRate: 45,
  learnset: [{ move: 'scratch', level: 9 }],
}

describe('availableMoves', () => {
  it('filtra pelo nível e remove duplicatas mantendo a ordem', () => {
    expect(availableMoves(charmander, 5, moves).map((m) => m.name)).toEqual(['scratch', 'ember'])
    expect(availableMoves(charmander, 40, moves).map((m) => m.name)).toEqual(['scratch', 'ember', 'flamethrower'])
  })
  it('lança se o learnset referencia golpe desconhecido', () => {
    expect(() => availableMoves({ ...charmander, learnset: [{ move: 'nope', level: 1 }] }, 1, moves)).toThrow(/nope/)
  })
  it('retorna [STRUGGLE] quando nenhum golpe do learnset foi aprendido ainda', () => {
    expect(availableMoves(lateBloomer, 5, moves)).toEqual([STRUGGLE])
  })
  it('não inclui STRUGGLE quando já existe golpe real disponível', () => {
    expect(availableMoves(lateBloomer, 9, moves).map((m) => m.name)).toEqual(['scratch'])
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
  it('STRUGGLE (poder 50) → 15 ticks', () => {
    expect(cooldownTicks(STRUGGLE)).toBe(15)
  })
})
