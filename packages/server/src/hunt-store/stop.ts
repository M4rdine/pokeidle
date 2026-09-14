import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { huntSessions, trainers, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'
import { loadActive } from './snapshot.js'
import { CorruptSnapshotError } from './state-schema.js'
import { syncWithin } from './sync.js'

export async function stopHunt(db: Db, trainerId: string, now: Date): Promise<TrainerRow> {
  return db.transaction(async (tx) => {
    let active
    try {
      active = await loadActive(tx, trainerId, { forUpdate: true })
    } catch (error) {
      if (!(error instanceof CorruptSnapshotError)) throw error
      // Snapshot ilegível: não dá pra sincronizar, então apaga a sessão sem sync (o jogador
      // perde só o progresso desde o último sync) e segue como uma parada normal.
      await tx.delete(huntSessions).where(eq(huntSessions.trainerId, trainerId))
      const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId))
      if (!trainer) throw new AppError('no-hunt', 'não há hunt ativa')
      return trainer
    }
    if (!active) throw new AppError('no-hunt', 'não há hunt ativa')
    await syncWithin(tx, trainerId, active.state, now)
    await tx.delete(huntSessions).where(eq(huntSessions.trainerId, trainerId))
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId))
    return trainer!
  })
}
