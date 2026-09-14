import type { Rng } from './rng.js'
import type { Move } from './schemas/moves.js'
import type { TypeChart, TypeName } from './schemas/type-chart.js'
import type { Stats } from './stats.js'

const STAB = 1.5
const RANDOM_MIN = 0.85
const RANDOM_SPAN = 0.15
const MIN_DAMAGE = 1

export interface Combatant {
  readonly level: number
  readonly types: readonly TypeName[]
  readonly stats: Stats
}

export interface DamageInput {
  readonly attacker: Combatant
  readonly defender: Combatant
  readonly move: Move
  readonly chart: TypeChart
  readonly rng: Rng
}

export function typeMultiplier(chart: TypeChart, moveType: TypeName, defenderTypes: readonly TypeName[]): number {
  return defenderTypes.reduce((acc, t) => acc * chart[moveType][t], 1)
}

function baseDamage(attacker: Combatant, defender: Combatant, move: Move): number {
  const [a, d] = move.damageClass === 'physical'
    ? [attacker.stats.attack, defender.stats.defense]
    : [attacker.stats.spAttack, defender.stats.spDefense]
  const levelFactor = Math.floor((2 * attacker.level) / 5 + 2)
  return Math.floor(Math.floor((levelFactor * move.power * a) / d) / 50) + 2
}

function modifiers(attacker: Combatant, defender: Combatant, move: Move, chart: TypeChart): number {
  const stab = attacker.types.includes(move.type) ? STAB : 1
  return typeMultiplier(chart, move.type, defender.types) * stab
}

export function computeDamage({ attacker, defender, move, chart, rng }: DamageInput): number {
  const random = RANDOM_MIN + rng.next() * RANDOM_SPAN
  const total = Math.floor(baseDamage(attacker, defender, move) * modifiers(attacker, defender, move, chart) * random)
  return Math.max(MIN_DAMAGE, total)
}

export function bestMove(candidates: readonly Move[], attacker: Combatant, defender: Combatant, chart: TypeChart): Move | undefined {
  return candidates.reduce<{ move: Move; dmg: number } | undefined>((best, move) => {
    const dmg = Math.floor(baseDamage(attacker, defender, move) * modifiers(attacker, defender, move, chart))
    return best === undefined || dmg > best.dmg ? { move, dmg } : best
  }, undefined)?.move
}
