import type { BaseStats } from './schemas/species.js'

const MAX_IV = 31
const STAT_OFFSET = 5
const HP_OFFSET = 10

export interface Stats extends BaseStats {}

export function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) throw new RangeError(`nível inválido: ${level}`)
}

export function statAt(base: number, level: number): number {
  assertLevel(level)
  return Math.floor(((2 * base + MAX_IV) * level) / 100) + STAT_OFFSET
}

export function hpAt(base: number, level: number): number {
  assertLevel(level)
  return Math.floor(((2 * base + MAX_IV) * level) / 100) + level + HP_OFFSET
}

export function statsAt(base: BaseStats, level: number): Stats {
  return {
    hp: hpAt(base.hp, level),
    attack: statAt(base.attack, level),
    defense: statAt(base.defense, level),
    spAttack: statAt(base.spAttack, level),
    spDefense: statAt(base.spDefense, level),
    speed: statAt(base.speed, level),
  }
}
