import { describe, expect, it } from 'vitest'
import { createRng, type LootTable, type Species } from '../src/index.js'
import { lootTableFor, rollLoot } from '../src/loot.js'

const zubat: Species = { id: 41, name: 'zubat', types: ['poison', 'flying'], baseStats: { hp: 40, attack: 45, defense: 35, spAttack: 30, spDefense: 40, speed: 55 }, baseExperience: 49, growthRate: 'medium-fast', captureRate: 255, learnset: [] }
const table: LootTable = { species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.08 }, { item: 'poke-ball', chance: 0.5 }] }
const loot = new Map([['zubat', table]])

describe('lootTableFor', () => {
  it('usa a entrada explícita quando existe', () => {
    expect(lootTableFor(zubat, loot)).toBe(table)
  })
  it('gera padrão a partir do baseExperience quando não existe', () => {
    expect(lootTableFor(zubat, new Map())).toEqual({ species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.05 }] })
  })
})

describe('rollLoot', () => {
  it('ouro dentro da faixa e drops conforme o sorteio', () => {
    const r = rollLoot(zubat, loot, { int: (min, max) => max, next: () => 0.3, state: () => 0 })
    expect(r).toEqual({ gold: 9, drops: [{ item: 'poke-ball', quantity: 1 }] })
  })
  it('com PRNG seedado é determinístico e respeita a faixa em mil rolagens', () => {
    const a = createRng(5), b = createRng(5)
    const xs = Array.from({ length: 1000 }, () => rollLoot(zubat, loot, a))
    expect(xs).toEqual(Array.from({ length: 1000 }, () => rollLoot(zubat, loot, b)))
    for (const x of xs) { expect(x.gold).toBeGreaterThanOrEqual(4); expect(x.gold).toBeLessThanOrEqual(9) }
    const balls = xs.filter((x) => x.drops.some((d) => d.item === 'poke-ball')).length
    expect(balls).toBeGreaterThan(400); expect(balls).toBeLessThan(600)
  })
})
