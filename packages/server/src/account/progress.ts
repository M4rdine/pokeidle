import { nextUnlock, teamSlotsFor, trainerLevel, xpToNextLevel, type Registry } from '@pokeidle/shared'
import type { TrainerRow } from '../db/schema.js'

export interface TrainerProgress {
  readonly level: number
  readonly xpToNext: number
  readonly teamSlots: number
  readonly nextUnlock: { level: number; what: string } | null
}

export function trainerProgress(registry: Registry, trainer: Pick<TrainerRow, 'xp'>): TrainerProgress {
  const level = trainerLevel(registry.unlocks, trainer.xp)
  return {
    level,
    xpToNext: xpToNextLevel(registry.unlocks, trainer.xp),
    teamSlots: teamSlotsFor(registry.unlocks, level),
    nextUnlock: nextUnlock(registry.unlocks, level, registry.items),
  }
}
