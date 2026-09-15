import type { PokemonRow, TrainerRow } from '../db/schema.js'
import { MAX_TEAM_SIZE, POTION_HP_PERCENT_DEFAULT } from '../engine/constants.js'
import type { HuntSettings, PokemonState } from '../engine/types.js'

export const toPokemonState = (row: PokemonRow): PokemonState => ({ id: row.id, speciesName: row.speciesName, level: row.level, xp: row.xp, hp: row.hp, hpMax: row.hpMax })

// potionHpPercent e teamSlots ainda não são persistidos por treinador (sem colunas/API); usam os
// padrões do motor até uma task futura trazer preferência de poção e vagas por progressão.
export const toHuntSettings = (trainer: TrainerRow, seen: readonly string[]): HuntSettings => ({
  returnHpPercent: trainer.returnHpPercent,
  potionHpPercent: POTION_HP_PERCENT_DEFAULT,
  teamSlots: MAX_TEAM_SIZE,
  capture: { ballTier: trainer.ballTier, maxWildHpPercent: trainer.maxWildHpPercent, allowDuplicates: trainer.allowDuplicates },
  seen,
})
