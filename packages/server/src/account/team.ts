import { teamSlotsFor, trainerLevel, type Registry } from '@pokeidle/shared'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbLike } from '../db/client.js'
import { huntSessions, pokemon, trainers, type PokemonRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const TEAM_MAX = 6
export const TeamOrderSchema = z.object({ slots: z.array(z.string().min(1)).min(1).max(TEAM_MAX).refine((ids) => new Set(ids).size === ids.length, 'ids repetidos') }).strict()

export async function hasActiveHunt(db: DbLike, trainerId: string): Promise<boolean> {
  const [row] = await db.select({ id: huntSessions.trainerId }).from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  return row !== undefined
}

export async function listTeam(db: DbLike, trainerId: string): Promise<{ team: PokemonRow[]; box: PokemonRow[] }> {
  const rows = await db.select().from(pokemon).where(eq(pokemon.trainerId, trainerId)).orderBy(asc(pokemon.teamSlot), asc(pokemon.createdAt))
  return { team: rows.filter((p) => p.teamSlot !== null), box: rows.filter((p) => p.teamSlot === null) }
}

export async function setTeamOrder(db: Db, registry: Registry, trainerId: string, ids: readonly string[], now: Date): Promise<{ team: PokemonRow[]; box: PokemonRow[] }> {
  if (await hasActiveHunt(db, trainerId)) throw new AppError('hunt-active', 'pare a hunt antes de mexer no time')
  const [trainerRow] = await db.select({ xp: trainers.xp }).from(trainers).where(eq(trainers.id, trainerId))
  if (!trainerRow) throw new AppError('not-found', 'treinador não encontrado')
  const level = trainerLevel(registry.unlocks, trainerRow.xp)
  const slots = teamSlotsFor(registry.unlocks, level)
  if (ids.length > slots) throw new AppError('validation', `o time tem ${slots} vagas no nível ${level}`)
  const owned = await db.select({ id: pokemon.id }).from(pokemon).where(and(eq(pokemon.trainerId, trainerId), inArray(pokemon.id, [...ids])))
  if (owned.length !== ids.length) throw new AppError('not-found', 'Pokémon não encontrado')
  await db.transaction(async (tx) => {
    await tx.update(pokemon).set({ teamSlot: null, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot)))
    for (const [slot, id] of ids.entries()) await tx.update(pokemon).set({ teamSlot: slot, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), eq(pokemon.id, id)))
  })
  return listTeam(db, trainerId)
}
