import { count, eq } from 'drizzle-orm'
import type { AuthContext } from '../auth/plugin.js'
import type { DbLike } from '../db/client.js'
import { huntSessions, pokemon } from '../db/schema.js'
import { trainerDto, userDto } from './dto.js'

export async function trainerExtra(db: DbLike, trainerId: string): Promise<{ hasStarter: boolean; activeHuntId: string | null }> {
  const [c] = await db.select({ n: count() }).from(pokemon).where(eq(pokemon.trainerId, trainerId))
  const [h] = await db.select({ huntId: huntSessions.huntId }).from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  return { hasStarter: (c?.n ?? 0) > 0, activeHuntId: h?.huntId ?? null }
}

export async function getMe(db: DbLike, auth: AuthContext) {
  return { user: userDto(auth.user), trainer: trainerDto(auth.trainer, await trainerExtra(db, auth.trainer.id)) }
}
