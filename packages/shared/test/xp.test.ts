import { describe, expect, it } from 'vitest'
import { GROWTH_RATES } from '../src/index.js'
import { levelFromXp, xpForLevel, xpOnDefeat } from '../src/xp.js'

describe('xpForLevel', () => {
  it('nível 1 é zero em todas as curvas', () => {
    for (const r of GROWTH_RATES) expect(xpForLevel(r, 1)).toBe(0)
  })
  it('valores oficiais no nível 100', () => {
    expect(xpForLevel('fast', 100)).toBe(800_000)
    expect(xpForLevel('medium-fast', 100)).toBe(1_000_000)
    expect(xpForLevel('medium-slow', 100)).toBe(1_059_860)
    expect(xpForLevel('slow', 100)).toBe(1_250_000)
  })
  it('medium-slow nos primeiros níveis nunca é negativo e é monotônica', () => {
    expect(xpForLevel('medium-slow', 2)).toBe(9)
    expect(xpForLevel('medium-slow', 3)).toBe(57)
    for (let l = 2; l <= 600; l++) expect(xpForLevel('medium-slow', l)).toBeGreaterThan(xpForLevel('medium-slow', l - 1))
  })
  it('sem teto', () => {
    expect(xpForLevel('medium-fast', 300)).toBe(27_000_000)
  })
})

describe('levelFromXp', () => {
  it('é a inversa de xpForLevel de 1 a 500 em todas as curvas', () => {
    for (const r of GROWTH_RATES) for (let l = 1; l <= 500; l++) {
      const xp = xpForLevel(r, l)
      expect(levelFromXp(r, xp)).toBe(l)
      if (l > 1) expect(levelFromXp(r, xp - 1)).toBe(l - 1)
    }
  })
  it('xp 0 ou negativo é nível 1', () => {
    expect(levelFromXp('slow', 0)).toBe(1)
    expect(levelFromXp('slow', -5)).toBe(1)
  })
})

describe('xpOnDefeat', () => {
  it('floor(baseExperience * level / 7)', () => {
    expect(xpOnDefeat({ baseExperience: 62 }, 10)).toBe(88)
    expect(xpOnDefeat({ baseExperience: 240 }, 150)).toBe(5142)
  })
})
