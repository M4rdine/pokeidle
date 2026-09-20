import { describe, expect, it } from 'vitest'
import { UnlocksSchema } from '../src/schemas/unlocks.js'
import { regionUnlockLevel, itemUnlockLevel, nextUnlock, teamSlotsFor, trainerLevel, xpToNextLevel } from '../src/unlocks.js'
import { loadRegistry } from '../src/registry-full.js'

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
  it('itens e regiões', () => {
    expect(itemUnlockLevel(u, 'potion')).toBe(0)
    expect(itemUnlockLevel(u, 'super-potion')).toBe(20)
    expect(itemUnlockLevel(u, 'hyper-potion')).toBe(30)
    expect(itemUnlockLevel(u, 'ultra-ball')).toBe(40)
    expect(regionUnlockLevel(u, 'kanto')).toBe(1)
    expect(regionUnlockLevel(u, 'terras-altas')).toBe(34)
    // Região que não existe no registro devolve 0: sem portão, em vez de quebrar.
    expect(regionUnlockLevel(u, 'johto')).toBe(0)
  })
  it('nextUnlock caminha pela tabela', () => {
    expect(nextUnlock(u, 1, items)).toEqual({ level: 10, what: '4 vagas no time' })
    expect(nextUnlock(u, 10, items)).toEqual({ level: 20, what: 'Super Poção, Great Bola, 5 vagas no time' })
    // Depois do nível 30 a meta é a região nova, não um item: ela abre antes da Ultra Bola.
    expect(nextUnlock(u, 30, items)).toEqual({ level: 34, what: 'região terras-altas' })
    expect(nextUnlock(u, 34, items)).toEqual({ level: 40, what: 'Ultra Bola' })
    expect(nextUnlock(u, 40, items)).toBeNull()
  })
  it('schema valida growthRate e teamSlots', () => {
    expect(() => UnlocksSchema.parse({ growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 3 }], items: {}, regions: {} })).not.toThrow()
    expect(() => UnlocksSchema.parse({ growthRate: 'nope', teamSlots: [], items: {}, regions: {} })).toThrow()
  })
})
