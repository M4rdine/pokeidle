import { asc, eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { pokedexEntries } from '../db/schema.js'

export async function listPokedex(db: DbLike, trainerId: string): Promise<{ speciesName: string; seenAt: Date; caughtAt: Date | null }[]> {
  return db.select({ speciesName: pokedexEntries.speciesName, seenAt: pokedexEntries.seenAt, caughtAt: pokedexEntries.caughtAt })
    .from(pokedexEntries).where(eq(pokedexEntries.trainerId, trainerId)).orderBy(asc(pokedexEntries.speciesName))
}
