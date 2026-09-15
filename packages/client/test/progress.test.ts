import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { trainerProgress, unlockedBetween } from '../src/state/progress.js'

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
