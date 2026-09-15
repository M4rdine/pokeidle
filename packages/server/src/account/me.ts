import type { Registry } from '@pokeidle/shared'
import { count, eq } from 'drizzle-orm'
import type { AuthContext } from '../auth/plugin.js'
import type { DbLike } from '../db/client.js'
import type { TrainerRow } from '../db/schema.js'
import { huntSessions, pokemon } from '../db/schema.js'
import { trainerDto, userDto } from './dto.js'
import { trainerProgress } from './progress.js'

export async function trainerExtra(db: DbLike, trainerId: string): Promise<{ hasStarter: boolean; activeHuntId: string | null }> {
  const [c] = await db.select({ n: count() }).from(pokemon).where(eq(pokemon.trainerId, trainerId))
  const [h] = await db.select({ huntId: huntSessions.huntId }).from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  return { hasStarter: (c?.n ?? 0) > 0, activeHuntId: h?.huntId ?? null }
}

export async function trainerView(db: DbLike, registry: Registry, trainer: TrainerRow) {
  return trainerDto(trainer, await trainerExtra(db, trainer.id), trainerProgress(registry, trainer))
}

export async function getMe(db: DbLike, registry: Registry, auth: AuthContext) {
  return { user: userDto(auth.user), trainer: await trainerView(db, registry, auth.trainer) }
}
