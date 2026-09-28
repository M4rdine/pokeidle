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
    /*
     * A CURVA INTEIRA, e não degraus soltos.
     *
     * Enumerada assim, ela é a documentação do ritmo de progressão: algo novo a cada dois a seis
     * níveis, do 10 ao 60. Escrita degrau a degrau, cada item novo no jogo quebrava o teste num
     * ponto diferente e a forma da curva nunca aparecia em lugar nenhum.
     */
    const curva: readonly (readonly [number, number, string])[] = [
      [1, 10, '4 vagas no time'],
      [10, 12, 'Bola Ninho'],
      [12, 15, 'Pedra do Fogo, Pedra do Trovão, Pedra da Lua'],
      [15, 18, 'Bola Rede'],
      [18, 20, 'Super Poção, Great Bola, 5 vagas no time'],
      [20, 22, 'Bola Rápida'],
      [22, 25, 'Reviver'],
      [25, 28, 'Bola Repetida'],
      [28, 30, 'Hiper Poção, 6 vagas no time'],
      // Depois do 30 a meta é a região nova, não um item: ela abre antes da Ultra Bola.
      [30, 34, 'região terras-altas'],
      [34, 40, 'Ultra Bola'],
      [40, 45, 'Reviver Máximo'],
      [45, 60, 'Master Bola'],
    ]
    for (const [de, nivel, what] of curva) {
      expect(nextUnlock(u, de, items), `a partir do nível ${de}`).toEqual({ level: nivel, what })
    }
    expect(nextUnlock(u, 60, items)).toBeNull()
  })
  it('schema valida growthRate e teamSlots', () => {
    expect(() => UnlocksSchema.parse({ growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 3 }], items: {}, regions: {} })).not.toThrow()
    expect(() => UnlocksSchema.parse({ growthRate: 'nope', teamSlots: [], items: {}, regions: {} })).toThrow()
  })
})
