import { describe, expect, it } from 'vitest'
import { TYPE_NAMES, createRng, type Move, type TypeChart, type TypeName } from '../src/index.js'
import { bestMove, computeDamage, expectedDamage, typeMultiplier, type Combatant } from '../src/damage.js'
import { statsAt } from '../src/stats.js'

const baseRow = Object.fromEntries(TYPE_NAMES.map((d) => [d, 1])) as TypeChart[TypeName]
const baseChart = Object.fromEntries(TYPE_NAMES.map((a) => [a, baseRow])) as TypeChart
const chart: TypeChart = {
  ...baseChart,
  fire: { ...baseRow, grass: 2, water: 0.5, fire: 0.5, bug: 2 },
  electric: { ...baseRow, ground: 0 },
}

const ember: Move = { name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' }
const scratch: Move = { name: 'scratch', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' }
const charmander5: Combatant = { level: 5, types: ['fire'], stats: statsAt({ hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, 5) }
const bulbasaur5: Combatant = { level: 5, types: ['grass', 'poison'], stats: statsAt({ hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 }, 5) }
const fixed = (v: number) => ({ next: () => v, int: () => 0 })

describe('typeMultiplier', () => {
  it('multiplica sobre os tipos do defensor', () => {
    expect(typeMultiplier(chart, 'fire', ['grass', 'poison'])).toBe(2)
    expect(typeMultiplier(chart, 'fire', ['grass', 'bug'])).toBe(4)
    expect(typeMultiplier(chart, 'electric', ['ground'])).toBe(0)
  })
})

describe('computeDamage', () => {
  it('Charmander 5 Ember em Bulbasaur 5: bruto 4, x2 tipo, x1,5 STAB → 12 com rng 1,0 e 10 com rng 0', () => {
    expect(computeDamage({ attacker: charmander5, defender: bulbasaur5, move: ember, chart, rng: fixed(1) })).toBe(12)
    expect(computeDamage({ attacker: charmander5, defender: bulbasaur5, move: ember, chart, rng: fixed(0) })).toBe(10)
  })
  it('golpe físico usa attack e defense; sem STAB fica no bruto', () => {
    // scratch: A=11, D=11 → floor(floor(4*40*11/11)/50)+2 = floor(160/50)+2 = 5
    expect(computeDamage({ attacker: charmander5, defender: bulbasaur5, move: scratch, chart, rng: fixed(1) })).toBe(5)
  })
  it('imunidade dá dano 0', () => {
    const thunder: Move = { name: 'thunder-shock', type: 'electric', power: 40, accuracy: 100, damageClass: 'special' }
    expect(computeDamage({ attacker: charmander5, defender: { ...bulbasaur5, types: ['ground'] }, move: thunder, chart, rng: fixed(1) })).toBe(0)
  })
  it('resistência dupla (0,25x, não imunidade) ainda dá pelo menos 1 de dano', () => {
    const doubleResist: Combatant = { ...bulbasaur5, types: ['water', 'fire'] }
    expect(computeDamage({ attacker: charmander5, defender: doubleResist, move: ember, chart, rng: fixed(1) })).toBe(1)
  })
  it('com PRNG seedado é determinístico e fica entre 85% e 100% do máximo', () => {
    const a = createRng(9), b = createRng(9)
    const run = (rng: ReturnType<typeof createRng>) => Array.from({ length: 1000 }, () => computeDamage({ attacker: charmander5, defender: bulbasaur5, move: ember, chart, rng }))
    const xs = run(a)
    expect(xs).toEqual(run(b))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10)
    expect(Math.max(...xs)).toBe(11) // rng.next() < 1, então 12 só sai com rng fixo em 1,0
    expect(new Set(xs).size).toBeGreaterThan(1)
  })
})

describe('bestMove', () => {
  it('escolhe o de maior dano esperado e mantém o primeiro em empate', () => {
    expect(bestMove([scratch, ember], charmander5, bulbasaur5, chart)?.name).toBe('ember')
    expect(bestMove([scratch, { ...scratch, name: 'tackle' }], charmander5, bulbasaur5, chart)?.name).toBe('scratch')
    expect(bestMove([], charmander5, bulbasaur5, chart)).toBeUndefined()
  })
})

describe('expectedDamage', () => {
  it('Charmander 5 Ember em Bulbasaur 5 → 12 (determinístico, sem RNG injetado)', () => {
    expect(expectedDamage(charmander5, bulbasaur5, ember, chart)).toBe(12)
  })
  it('imunidade → 0', () => {
    const thunder: Move = { name: 'thunder-shock', type: 'electric', power: 40, accuracy: 100, damageClass: 'special' }
    expect(expectedDamage(charmander5, { ...bulbasaur5, types: ['ground'] }, thunder, chart)).toBe(0)
  })
})
