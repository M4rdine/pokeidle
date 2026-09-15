import { eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../db/client.js'
import { huntLog, huntSessions, pokemon, trainers, type TrainerRow } from '../db/schema.js'
import { saveSnapshot } from '../hunt-store/snapshot.js'
import { syncWithin } from '../hunt-store/sync.js'
import { AppError } from '../http/errors.js'
import { LOG_INSERT_CHUNK } from './constants.js'
import type { LogEntry, PersistSnapshot } from './runner.js'

const chunksOf = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/** Insere em lotes de `LOG_INSERT_CHUNK` linhas, todos na mesma transação: um `pendingLog`
 * grande (ex.: acumulado num catch-up longo) pode facilmente passar do teto de 65 535
 * parâmetros por statement do Postgres numa única chamada `insert().values(...)`. */
export async function insertLog(tx: Tx, trainerId: string, entries: readonly LogEntry[]): Promise<void> {
  for (const chunk of chunksOf(entries, LOG_INSERT_CHUNK)) {
    await tx.insert(huntLog).values(chunk.map((e) => ({ trainerId, huntId: e.huntId, speciesName: e.speciesName, level: e.level, xpTrainer: e.xpTrainer, gold: e.gold, drops: e.drops, captured: e.captured })))
  }
}

/** Snapshot sempre; com `sync`, tabelas + hunt_log na mesma transação. */
export async function flushRunner(db: Db, snap: PersistSnapshot, now: Date, opts: { readonly sync: boolean }): Promise<void> {
  if (!opts.sync) { await saveSnapshot(db, snap.trainerId, snap.state, snap.rngState, snap.lastSimulatedAt, now); return }
  await db.transaction(async (tx) => {
    await saveSnapshot(tx, snap.trainerId, snap.state, snap.rngState, snap.lastSimulatedAt, now)
    await syncWithin(tx, snap.trainerId, snap.state, now)
    await insertLog(tx, snap.trainerId, snap.pendingLog)
  })
}

/** Encerra a hunt a partir do estado em memória: lock da linha, sync opcional, cura opcional, apaga a sessão. */
export async function finishRunner(db: Db, snap: PersistSnapshot, now: Date, opts: { readonly sync: boolean; readonly healTeam: boolean }): Promise<TrainerRow> {
  return db.transaction(async (tx) => {
    const locked = await tx.select({ trainerId: huntSessions.trainerId }).from(huntSessions).where(eq(huntSessions.trainerId, snap.trainerId)).for('update')
    if (locked.length === 0) throw new AppError('no-hunt', 'não há hunt ativa')
    if (opts.sync) { await syncWithin(tx, snap.trainerId, snap.state, now); await insertLog(tx, snap.trainerId, snap.pendingLog) }
    if (opts.healTeam) await tx.update(pokemon).set({ hp: sql`${pokemon.hpMax}`, updatedAt: now }).where(eq(pokemon.trainerId, snap.trainerId))
    await tx.delete(huntSessions).where(eq(huntSessions.trainerId, snap.trainerId))
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, snap.trainerId))
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    return trainer
  })
}
