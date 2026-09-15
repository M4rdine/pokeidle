import type { PokemonRow, TrainerRow, UserRow } from '../db/schema.js'
import type { TrainerProgress } from './progress.js'

export const userDto = (u: UserRow) => ({ id: u.id, email: u.email, role: u.role })

export const settingsDto = (t: TrainerRow) => ({
  returnHpPercent: t.returnHpPercent,
  potionHpPercent: t.potionHpPercent,
  capture: { ballTier: t.ballTier, maxWildHpPercent: t.maxWildHpPercent, allowDuplicates: t.allowDuplicates },
})

export const trainerDto = (t: TrainerRow, extra: { hasStarter: boolean; activeHuntId: string | null }, progress: TrainerProgress) => ({
  id: t.id,
  name: t.name,
  xp: t.xp,
  gold: t.gold,
  settings: settingsDto(t),
  hasStarter: extra.hasStarter,
  activeHuntId: extra.activeHuntId,
  ...progress,
})

export const pokemonDto = (p: PokemonRow) => ({ id: p.id, speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: p.teamSlot })
