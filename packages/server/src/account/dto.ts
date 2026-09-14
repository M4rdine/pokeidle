import type { PokemonRow, TrainerRow, UserRow } from '../db/schema.js'

export const userDto = (u: UserRow) => ({ id: u.id, email: u.email, role: u.role })

export const settingsDto = (t: TrainerRow) => ({
  returnHpPercent: t.returnHpPercent,
  capture: { ballTier: t.ballTier, maxWildHpPercent: t.maxWildHpPercent, allowDuplicates: t.allowDuplicates },
})

export const trainerDto = (t: TrainerRow, extra: { hasStarter: boolean; activeHuntId: string | null }) => ({
  id: t.id,
  name: t.name,
  xp: t.xp,
  gold: t.gold,
  settings: settingsDto(t),
  hasStarter: extra.hasStarter,
  activeHuntId: extra.activeHuntId,
})

export const pokemonDto = (p: PokemonRow) => ({ id: p.id, speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: p.teamSlot })
