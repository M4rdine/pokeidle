import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { huntSessions } from '../db/schema.js'
import type { HuntState } from '../engine/types.js'
import { parseHuntState } from './state-schema.js'

export interface ActiveHunt {
  readonly huntId: string; readonly sessionId: string; readonly state: HuntState
  readonly seed: number; readonly rngState: number; readonly startedAt: Date; readonly lastSimulatedAt: Date
}

export async function saveSnapshot(db: DbLike, trainerId: string, state: HuntState, rngState: number, simulatedAt: Date, now: Date = simulatedAt): Promise<void> {
  await db.update(huntSessions).set({ state, rngState, lastSimulatedAt: simulatedAt, updatedAt: now }).where(eq(huntSessions.trainerId, trainerId))
}

/**
 * Carrega a hunt ativa do treinador. O tick loop (fase 2c) DEVE chamar com
 * `{ forUpdate: true }` dentro da própria transação para travar a linha antes de simular.
 */
export async function loadActive(db: DbLike, trainerId: string, opts: { forUpdate?: boolean } = {}): Promise<ActiveHunt | null> {
  const query = db.select().from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  const rows = opts.forUpdate ? await query.for('update') : await query
  const [row] = rows
  if (!row) return null
  return { huntId: row.huntId, sessionId: row.sessionId, state: parseHuntState(row.state), seed: row.seed, rngState: row.rngState, startedAt: row.startedAt, lastSimulatedAt: row.lastSimulatedAt }
}
