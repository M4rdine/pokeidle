import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { hpAt, xpForLevel, type Registry } from '@pokeidle/shared'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { pokedexEntries, pokemon, type PokemonRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const STARTERS = ['charmander', 'bulbasaur', 'squirtle'] as const
export const STARTER_LEVEL = 10
export const StarterSchema = z.object({ species: z.enum(STARTERS) }).strict()

export async function chooseStarter(db: Db, registry: Registry, trainerId: string, species: (typeof STARTERS)[number], now: Date): Promise<PokemonRow> {
  const sp = registry.species.get(species)
  if (!sp) throw new AppError('not-found', `espécie ${species} não existe`)
  const hpMax = hpAt(sp.baseStats.hp, STARTER_LEVEL)
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ n: count() }).from(pokemon).where(eq(pokemon.trainerId, trainerId))
    if ((c?.n ?? 0) > 0) throw new AppError('starter-already-chosen', 'o inicial já foi escolhido')
    const [row] = await tx.insert(pokemon).values({
      id: `st-${randomUUID()}`, trainerId, speciesName: species, level: STARTER_LEVEL,
      xp: xpForLevel(sp.growthRate, STARTER_LEVEL), hp: hpMax, hpMax, teamSlot: 0,
    }).returning()
    await tx.insert(pokedexEntries).values({ trainerId, speciesName: species, seenAt: now, caughtAt: now })
      .onConflictDoUpdate({ target: [pokedexEntries.trainerId, pokedexEntries.speciesName], set: { caughtAt: now } })
    return row!
  })
}
