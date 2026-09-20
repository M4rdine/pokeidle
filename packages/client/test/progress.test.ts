import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { nivelDaVaga, trainerProgress, unlockedBetween } from '../src/state/progress.js'

const registry = loadRegistry()
describe('progress', () => {
  it('nível, barra e próximo destrave a partir do xp', () => {
    expect(trainerProgress(registry, 0)).toEqual({ level: 1, xpInto: 0, xpSpan: 8, next: { level: 10, what: '4 vagas no time' } }) // medium-fast: L1 = 0, L2 = 8 (n³)
    expect(trainerProgress(registry, 1000)).toMatchObject({ level: 10, xpInto: 0, xpSpan: 331 })
    expect(trainerProgress(registry, 125000).next).toBeNull()
  })
  it('unlockedBetween lista o que destravou entre dois níveis', () => {
    expect(unlockedBetween(registry, 9, 10)).toEqual(['4 vagas no time'])
    expect(unlockedBetween(registry, 19, 20)).toEqual(['Super Poção, Great Bola, 5 vagas no time'])
    expect(unlockedBetween(registry, 10, 10)).toEqual([])
  })
})

describe('nível que destrava cada vaga do time', () => {
  const unlocks = {
    growthRate: 'medium-fast' as const,
    teamSlots: [{ level: 1, slots: 1 }, { level: 5, slots: 3 }, { level: 30, slots: 6 }],
    items: {},
    regions: {},
  }

  it('devolve o primeiro nível cuja regra já concede a vaga', () => {
    // Índice é base zero: a vaga 0 é a primeira, concedida pelo nível 1.
    expect(nivelDaVaga(unlocks, 0)).toBe(1)
    // As vagas 1 e 2 chegam juntas no nível 5, que é quando o total passa de 1 para 3.
    expect(nivelDaVaga(unlocks, 1)).toBe(5)
    expect(nivelDaVaga(unlocks, 2)).toBe(5)
    expect(nivelDaVaga(unlocks, 3)).toBe(30)
    expect(nivelDaVaga(unlocks, 5)).toBe(30)
  })

  it('devolve null para vaga que nenhuma regra concede, em vez de inventar um nível', () => {
    expect(nivelDaVaga(unlocks, 6)).toBeNull()
  })

  it('não depende da ordem das regras no arquivo', () => {
    const fora = { ...unlocks, teamSlots: [{ level: 30, slots: 6 }, { level: 1, slots: 1 }, { level: 5, slots: 3 }] }
    expect(nivelDaVaga(fora, 2)).toBe(5)
    expect(nivelDaVaga(fora, 3)).toBe(30)
  })
})
