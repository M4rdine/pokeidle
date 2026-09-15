import { randomInt, randomUUID } from 'node:crypto'
import { createRng, type Registry } from '@pokeidle/shared'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { trainerProgress } from '../account/progress.js'
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
  return db.transaction(async (tx) => {
    // Ordem global de locks: hunt_sessions → trainers → pokemon → inventory → pokedex_entries → hunt_log.
    // O treinador é travado ANTES de checar hunt ativa para fechar a corrida com a loja: sem o
    // FOR UPDATE aqui, uma compra podia entrar entre a checagem e o INSERT em hunt_sessions.
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId)).for('update')
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    if (await hasActiveHunt(tx, trainerId)) throw new AppError('hunt-active', 'já existe uma hunt ativa')
    const rawTeamRows = await tx.select().from(pokemon).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot))).orderBy(asc(pokemon.teamSlot))
    if (rawTeamRows.length === 0) throw new AppError('no-starter', 'escolha um Pokémon antes de caçar')
    if (!rawTeamRows.some((p) => p.hp > 0)) throw new AppError('validation', 'todo o time está sem HP')
    const { teamSlots: slots } = trainerProgress(registry, trainer)
    const overflow = rawTeamRows.length > slots ? rawTeamRows.slice(slots) : []
    if (overflow.length > 0) {
      // Sessões anteriores à 3a herdam team_slot preenchido até o default legado (6); em vez de
      // travar startHunt para sempre com `validation`, rebaixa o excedente (team_slot maior
      // primeiro, já garantido pelo orderBy asc acima) para a mochila.
      await tx.update(pokemon).set({ teamSlot: null, updatedAt: now }).where(inArray(pokemon.id, overflow.map((p) => p.id)))
    }
    const teamRows = overflow.length > 0 ? rawTeamRows.slice(0, slots) : rawTeamRows
    const items = await tx.select().from(inventory).where(eq(inventory.trainerId, trainerId))
    const dex = await tx.select({ species: pokedexEntries.speciesName }).from(pokedexEntries).where(and(eq(pokedexEntries.trainerId, trainerId), isNotNull(pokedexEntries.caughtAt)))
    const sessionId = ids.sessionId ?? randomUUID()
    const seed = ids.seed ?? randomInt(0, 2 ** 31)
    const rng = createRng(seed)
    const state = createHuntState({
      hunt, sessionId, team: teamRows.map(toPokemonState),
      inventory: Object.fromEntries(items.filter((i) => i.quantity > 0).map((i) => [i.itemId, i.quantity])),
      settings: toHuntSettings(trainer, dex.map((d) => d.species), slots), trainer: { xp: trainer.xp, gold: trainer.gold },
    }, { registry, hunt, rng })
    const [row] = await tx.insert(huntSessions).values({ trainerId, huntId, sessionId, state, seed, rngState: rng.state(), startedAt: now, lastSimulatedAt: now })
      .onConflictDoNothing({ target: huntSessions.trainerId }).returning()
    // Com o treinador travado por FOR UPDATE e hasActiveHunt checado dentro desta mesma
    // transação, duas starts concorrentes para o mesmo treinador já são serializadas antes de
    // chegar aqui; o onConflictDoNothing fica como defesa em profundidade (ex.: qualquer outro
    // caminho que insira em hunt_sessions sem passar por este lock).
    if (!row) throw new AppError('hunt-active', 'já existe uma hunt ativa')
    return row
  })
}
