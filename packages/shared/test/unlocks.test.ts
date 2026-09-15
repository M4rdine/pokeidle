import { describe, expect, it } from 'vitest'
import { loadRegistry } from '../src/registry.js'
import { UnlocksSchema } from '../src/schemas/unlocks.js'
import { huntUnlockLevel, itemUnlockLevel, nextUnlock, teamSlotsFor, trainerLevel, xpToNextLevel } from '../src/unlocks.js'

const registry = loadRegistry()
const u = registry.unlocks
const items = registry.items

describe('unlocks', () => {
  it('tabela do GDD: xp → nível → vagas', () => {
    const rows: [number, number, number][] = [[0, 1, 3], [1000, 10, 4], [8000, 20, 5], [27000, 30, 6], [64000, 40, 6], [125000, 50, 6]]
    for (const [xp, level, slots] of rows) { expect(trainerLevel(u, xp), `xp ${xp}`).toBe(level); expect(teamSlotsFor(u, level)).toBe(slots) }
    expect(trainerLevel(u, 999)).toBe(9)
    expect(xpToNextLevel(u, 1000)).toBe(331) // 11³ − 1000
  })
  it('itens e hunts', () => {
    expect(itemUnlockLevel(u, 'potion')).toBe(0)
    expect(itemUnlockLevel(u, 'super-potion')).toBe(20)
    expect(itemUnlockLevel(u, 'hyper-potion')).toBe(30)
    expect(itemUnlockLevel(u, 'ultra-ball')).toBe(40)
    expect(huntUnlockLevel(u, 'route-1')).toBe(0)
    expect(huntUnlockLevel(u, 'route-2')).toBe(50)
  })
  it('nextUnlock caminha pela tabela', () => {
    expect(nextUnlock(u, 1, items)).toEqual({ level: 10, what: '4 vagas no time' })
    expect(nextUnlock(u, 10, items)).toEqual({ level: 20, what: 'Super Poção, Great Bola, 5 vagas no time' })
    expect(nextUnlock(u, 30, items)).toEqual({ level: 40, what: 'Ultra Bola' })
    expect(nextUnlock(u, 40, items)).toEqual({ level: 50, what: 'hunt route-2' })
    expect(nextUnlock(u, 50, items)).toBeNull()
  })
  it('schema rejeita item inexistente no registro', () => {
    expect(() => UnlocksSchema.parse({ growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 3 }], items: {}, hunts: {} })).not.toThrow()
    expect(() => UnlocksSchema.parse({ growthRate: 'nope', teamSlots: [], items: {}, hunts: {} })).toThrow()
  })
})
