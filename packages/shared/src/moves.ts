import type { Move } from './schemas/moves.js'
import type { Species } from './schemas/species.js'

const POWER_PER_SECOND = 20
const MIN_COOLDOWN_S = 1
const MAX_COOLDOWN_S = 8
const TICKS_PER_SECOND = 5

export function availableMoves(species: Species, level: number, moves: ReadonlyMap<string, Move>): Move[] {
  const seen = new Set<string>()
  const result: Move[] = []
  for (const entry of species.learnset) {
    if (entry.level > level || seen.has(entry.move)) continue
    const move = moves.get(entry.move)
    if (!move) throw new Error(`espécie ${species.name}: golpe ${entry.move} não existe no registro`)
    seen.add(entry.move)
    result.push(move)
  }
  return result
}

export function cooldownTicks(move: Pick<Move, 'power'>): number {
  const seconds = Math.min(MAX_COOLDOWN_S, Math.max(MIN_COOLDOWN_S, Math.round(move.power / POWER_PER_SECOND)))
  return seconds * TICKS_PER_SECOND
}
