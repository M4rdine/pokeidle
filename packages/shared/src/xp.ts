import type { GrowthRate, Species } from './schemas/species.js'
import { assertLevel } from './stats.js'

const XP_DIVISOR = 7

const CURVES: Record<GrowthRate, (l: number) => number> = {
  fast: (l) => (4 * l ** 3) / 5,
  'medium-fast': (l) => l ** 3,
  'medium-slow': (l) => (6 * l ** 3) / 5 - 15 * l ** 2 + 100 * l - 140,
  slow: (l) => (5 * l ** 3) / 4,
}

export function xpForLevel(rate: GrowthRate, level: number): number {
  assertLevel(level)
  if (level === 1) return 0
  return Math.max(0, Math.floor(CURVES[rate](level)))
}

export function levelFromXp(rate: GrowthRate, xp: number): number {
  if (xp <= 0) return 1
  let hi = 2
  while (xpForLevel(rate, hi) <= xp) hi *= 2
  let lo = 1
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (xpForLevel(rate, mid) <= xp) lo = mid
    else hi = mid
  }
  return lo
}

export function xpOnDefeat(defeated: Pick<Species, 'baseExperience'>, defeatedLevel: number): number {
  assertLevel(defeatedLevel)
  return Math.floor((defeated.baseExperience * defeatedLevel) / XP_DIVISOR)
}
