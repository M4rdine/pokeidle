import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db, Tx } from '../db/client.js'
import { inventory, pokedexEntries, pokemon, trainers } from '../db/schema.js'
import type { HuntState } from '../engine/types.js'

async function syncTeam(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  const team = state.player.team
  const existing = new Set((await tx.select({ id: pokemon.id }).from(pokemon).where(and(eq(pokemon.trainerId, trainerId), inArray(pokemon.id, team.map((p) => p.id))))).map((r) => r.id))
  await tx.update(pokemon).set({ teamSlot: null, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot)))
  for (const [slot, p] of team.entries()) {
    const fields = { speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: slot, updatedAt: now }
    if (existing.has(p.id)) await tx.update(pokemon).set(fields).where(eq(pokemon.id, p.id))
    else await tx.insert(pokemon).values({ id: p.id, trainerId, ...fields })
  }
}

async function syncInventory(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  for (const [itemId, quantity] of Object.entries(state.inventory)) {
    await tx.insert(inventory).values({ trainerId, itemId, quantity, updatedAt: now })
      .onConflictDoUpdate({ target: [inventory.trainerId, inventory.itemId], set: { quantity, updatedAt: now } })
  }
  await tx.delete(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.quantity, 0)))
}

async function syncPokedex(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  const species = new Set([...state.player.team.map((p) => p.speciesName), ...state.settings.seen])
  for (const speciesName of species) {
    await tx.insert(pokedexEntries).values({ trainerId, speciesName, seenAt: now, caughtAt: now })
      .onConflictDoUpdate({ target: [pokedexEntries.trainerId, pokedexEntries.speciesName], set: { caughtAt: sql`coalesce(${pokedexEntries.caughtAt}, excluded.caught_at)` } })
  }
}

/** Mesma coisa que syncToTables, mas dentro de uma transação já aberta (usado por stopHunt). */
export async function syncWithin(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  await syncTeam(tx, trainerId, state, now)
  await syncInventory(tx, trainerId, state, now)
  await tx.update(trainers).set({ xp: state.trainer.xp, gold: state.trainer.gold, updatedAt: now }).where(eq(trainers.id, trainerId))
  await syncPokedex(tx, trainerId, state, now)
}

/** Escreve de volta ao banco o que o snapshot diz. Idempotente: rodar duas vezes com o mesmo estado não muda nada. */
export const syncToTables = (db: Db, trainerId: string, state: HuntState, now: Date): Promise<void> =>
  db.transaction((tx) => syncWithin(tx, trainerId, state, now))
