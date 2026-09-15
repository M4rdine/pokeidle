import { type Registry } from '@pokeidle/shared'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbLike, Tx } from '../db/client.js'
import { huntSessions, pokemon, trainers, type PokemonRow, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'
import { trainerProgress } from './progress.js'

export const TEAM_MAX = 6
export const TeamOrderSchema = z.object({ slots: z.array(z.string().min(1)).min(1).max(TEAM_MAX).refine((ids) => new Set(ids).size === ids.length, 'ids repetidos') }).strict()

export async function hasActiveHunt(db: DbLike, trainerId: string): Promise<boolean> {
  const [row] = await db.select({ id: huntSessions.trainerId }).from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  return row !== undefined
}

/**
 * Abre uma transação, trava a linha do treinador com `FOR UPDATE` e só então checa hunt ativa —
 * ordem única de locks compartilhada pela loja e pelo time (trainers → o resto de `fn`), fechando
 * a corrida entre uma escrita concorrente e a checagem de hunt-active. 404 se o treinador não
 * existir; `hunt-active` com `huntActiveMessage` se houver hunt em andamento.
 */
export async function withLockedTrainer<T>(
  db: Db,
  trainerId: string,
  fn: (tx: Tx, trainer: TrainerRow) => Promise<T>,
  huntActiveMessage = 'pare a hunt antes de usar a loja',
): Promise<T> {
  return db.transaction(async (tx) => {
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId)).for('update')
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    if (await hasActiveHunt(tx, trainerId)) throw new AppError('hunt-active', huntActiveMessage)
    return fn(tx, trainer)
  })
}

export async function listTeam(db: DbLike, trainerId: string): Promise<{ team: PokemonRow[]; box: PokemonRow[] }> {
  const rows = await db.select().from(pokemon).where(eq(pokemon.trainerId, trainerId)).orderBy(asc(pokemon.teamSlot), asc(pokemon.createdAt))
  return { team: rows.filter((p) => p.teamSlot !== null), box: rows.filter((p) => p.teamSlot === null) }
}

export async function setTeamOrder(db: Db, registry: Registry, trainerId: string, ids: readonly string[], now: Date): Promise<{ team: PokemonRow[]; box: PokemonRow[] }> {
  await withLockedTrainer(db, trainerId, async (tx, trainer) => {
    const { level, teamSlots: slots } = trainerProgress(registry, trainer)
    if (ids.length > slots) throw new AppError('validation', `o time tem ${slots} vagas no nível ${level}`)
    const owned = await tx.select({ id: pokemon.id }).from(pokemon).where(and(eq(pokemon.trainerId, trainerId), inArray(pokemon.id, [...ids])))
    if (owned.length !== ids.length) throw new AppError('not-found', 'Pokémon não encontrado')
    await tx.update(pokemon).set({ teamSlot: null, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot)))
    for (const [slot, id] of ids.entries()) await tx.update(pokemon).set({ teamSlot: slot, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), eq(pokemon.id, id)))
  }, 'pare a hunt antes de mexer no time')
  return listTeam(db, trainerId)
}
