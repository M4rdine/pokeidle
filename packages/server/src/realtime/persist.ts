import { eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../db/client.js'
import { huntLog, huntSessions, pokemon, trainers, type TrainerRow } from '../db/schema.js'
import { saveSnapshot } from '../hunt-store/snapshot.js'
import { syncWithin } from '../hunt-store/sync.js'
import { AppError } from '../http/errors.js'
import type { LogEntry, PersistSnapshot } from './runner.js'

export async function insertLog(tx: Tx, trainerId: string, entries: readonly LogEntry[]): Promise<void> {
  if (entries.length === 0) return
  await tx.insert(huntLog).values(entries.map((e) => ({ trainerId, huntId: e.huntId, speciesName: e.speciesName, level: e.level, xpTrainer: e.xpTrainer, gold: e.gold, drops: e.drops, captured: e.captured })))
}

/** Snapshot sempre; com `sync`, tabelas + hunt_log na mesma transação. */
export async function flushRunner(db: Db, snap: PersistSnapshot, now: Date, opts: { readonly sync: boolean }): Promise<void> {
  if (!opts.sync) { await saveSnapshot(db, snap.trainerId, snap.state, snap.rngState, now); return }
  await db.transaction(async (tx) => {
    await saveSnapshot(tx, snap.trainerId, snap.state, snap.rngState, now)
    await syncWithin(tx, snap.trainerId, snap.state, now)
    await insertLog(tx, snap.trainerId, snap.pendingLog)
  })
}

/** Encerra a hunt a partir do estado em memória: lock da linha, sync opcional, cura opcional, apaga a sessão. */
export async function finishRunner(db: Db, snap: PersistSnapshot, now: Date, opts: { readonly sync: boolean; readonly healTeam: boolean }): Promise<TrainerRow> {
  return db.transaction(async (tx) => {
    await tx.select({ trainerId: huntSessions.trainerId }).from(huntSessions).where(eq(huntSessions.trainerId, snap.trainerId)).for('update')
    if (opts.sync) { await syncWithin(tx, snap.trainerId, snap.state, now); await insertLog(tx, snap.trainerId, snap.pendingLog) }
    if (opts.healTeam) await tx.update(pokemon).set({ hp: sql`${pokemon.hpMax}`, updatedAt: now }).where(eq(pokemon.trainerId, snap.trainerId))
    await tx.delete(huntSessions).where(eq(huntSessions.trainerId, snap.trainerId))
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, snap.trainerId))
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    return trainer
  })
}
