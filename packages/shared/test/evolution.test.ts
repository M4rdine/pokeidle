import { describe, expect, it } from 'vitest'
import type { Species } from '../src/index.js'
import { nextEvolution } from '../src/evolution.js'

const base = { types: ['fire' as const], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, baseExperience: 62, growthRate: 'medium-slow' as const, captureRate: 45, learnset: [] }
const charmander: Species = { ...base, id: 4, name: 'charmander', evolvesTo: { species: 'charmeleon', level: 16 } }
const charmeleon: Species = { ...base, id: 5, name: 'charmeleon' }
const registry = { species: new Map([['charmander', charmander], ['charmeleon', charmeleon]]) }

describe('nextEvolution', () => {
  it('devolve o alvo a partir do nível de evolução', () => {
    expect(nextEvolution(charmander, 15, registry)).toBeUndefined()
    expect(nextEvolution(charmander, 16, registry)?.name).toBe('charmeleon')
    expect(nextEvolution(charmander, 99, registry)?.name).toBe('charmeleon')
  })
  it('espécie sem evolução devolve undefined', () => {
    expect(nextEvolution(charmeleon, 100, registry)).toBeUndefined()
  })
  it('lança se o alvo não existir no registro', () => {
    expect(() => nextEvolution(charmander, 16, { species: new Map() })).toThrow(/charmeleon/)
  })
})
