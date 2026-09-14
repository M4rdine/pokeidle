import { randomInt, randomUUID } from 'node:crypto'
import { createRng, type Registry } from '@pokeidle/shared'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { hasActiveHunt } from '../account/team.js'
import type { Db } from '../db/client.js'
import { huntSessions, inventory, pokedexEntries, pokemon, trainers, type HuntSessionRow } from '../db/schema.js'
import { createHuntState } from '../engine/create.js'
import { AppError } from '../http/errors.js'
import { toHuntSettings, toPokemonState } from './mappers.js'

/** @internal só para testes — a camada HTTP nunca deve passar isto. */
export interface StartIds { readonly sessionId?: string; readonly seed?: number }

export async function startHunt(
  db: Db,
  registry: Registry,
  trainerId: string,
  huntId: string,
  now: Date,
  /** @internal só para testes — a camada HTTP nunca deve passar isto. */
  ids: StartIds = {},
): Promise<HuntSessionRow> {
  const hunt = registry.hunts.get(huntId)
  if (!hunt) throw new AppError('not-found', `hunt ${huntId} não existe`)
  if (await hasActiveHunt(db, trainerId)) throw new AppError('hunt-active', 'já existe uma hunt ativa')
  const [trainer] = await db.select().from(trainers).where(eq(trainers.id, trainerId))
  if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
  const teamRows = await db.select().from(pokemon).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot))).orderBy(asc(pokemon.teamSlot))
  if (teamRows.length === 0) throw new AppError('no-starter', 'escolha um Pokémon antes de caçar')
  if (!teamRows.some((p) => p.hp > 0)) throw new AppError('validation', 'todo o time está sem HP')
  const items = await db.select().from(inventory).where(eq(inventory.trainerId, trainerId))
  const dex = await db.select({ species: pokedexEntries.speciesName }).from(pokedexEntries).where(and(eq(pokedexEntries.trainerId, trainerId), isNotNull(pokedexEntries.caughtAt)))
  const sessionId = ids.sessionId ?? randomUUID()
  const seed = ids.seed ?? randomInt(0, 2 ** 31)
  const rng = createRng(seed)
  const state = createHuntState({
    hunt, sessionId, team: teamRows.map(toPokemonState),
    inventory: Object.fromEntries(items.filter((i) => i.quantity > 0).map((i) => [i.itemId, i.quantity])),
    settings: toHuntSettings(trainer, dex.map((d) => d.species)), trainer: { xp: trainer.xp, gold: trainer.gold },
  }, { registry, hunt, rng })
  const [row] = await db.insert(huntSessions).values({ trainerId, huntId, sessionId, state, seed, rngState: rng.state(), startedAt: now, lastSimulatedAt: now })
    .onConflictDoNothing({ target: huntSessions.trainerId }).returning()
  // Janela de corrida entre o hasActiveHunt acima e este insert: duas starts concorrentes podem
  // ambas passar na checagem; a PK de hunt_sessions.trainer_id garante que só uma linha existe,
  // e onConflictDoNothing devolve nenhuma linha para a perdedora em vez de um erro 23505 cru.
  if (!row) throw new AppError('hunt-active', 'já existe uma hunt ativa')
  return row
}
