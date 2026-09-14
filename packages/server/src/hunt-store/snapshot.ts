import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { huntSessions } from '../db/schema.js'
import type { HuntState } from '../engine/types.js'
import { parseHuntState } from './state-schema.js'

export interface ActiveHunt {
  readonly huntId: string; readonly sessionId: string; readonly state: HuntState
  readonly seed: number; readonly rngState: number; readonly startedAt: Date; readonly lastSimulatedAt: Date
}

export async function saveSnapshot(db: DbLike, trainerId: string, state: HuntState, rngState: number, now: Date): Promise<void> {
  await db.update(huntSessions).set({ state, rngState, lastSimulatedAt: now, updatedAt: now }).where(eq(huntSessions.trainerId, trainerId))
}

export async function loadActive(db: DbLike, trainerId: string): Promise<ActiveHunt | null> {
  const [row] = await db.select().from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  if (!row) return null
  return { huntId: row.huntId, sessionId: row.sessionId, state: parseHuntState(row.state), seed: row.seed, rngState: row.rngState, startedAt: row.startedAt, lastSimulatedAt: row.lastSimulatedAt }
}
