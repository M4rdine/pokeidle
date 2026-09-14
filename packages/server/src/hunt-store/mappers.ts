import type { PokemonRow, TrainerRow } from '../db/schema.js'
import type { HuntSettings, PokemonState } from '../engine/types.js'

export const toPokemonState = (row: PokemonRow): PokemonState => ({ id: row.id, speciesName: row.speciesName, level: row.level, xp: row.xp, hp: row.hp, hpMax: row.hpMax })

export const toHuntSettings = (trainer: TrainerRow, seen: readonly string[]): HuntSettings => ({
  returnHpPercent: trainer.returnHpPercent,
  capture: { ballTier: trainer.ballTier, maxWildHpPercent: trainer.maxWildHpPercent, allowDuplicates: trainer.allowDuplicates },
  seen,
})
