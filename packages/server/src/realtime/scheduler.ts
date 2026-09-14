import { TICK_MS, type Registry } from '@pokeidle/shared'
import type { Db } from '../db/client.js'
import type { TrainerRow } from '../db/schema.js'
import { applyIntent as engineApplyIntent } from '../engine/intents.js'
import type { Intent, IntentResult } from '../engine/types.js'
import { loadActive } from '../hunt-store/snapshot.js'
import { CorruptSnapshotError } from '../hunt-store/state-schema.js'
import { stopHunt } from '../hunt-store/stop.js'
import { AppError } from '../http/errors.js'
import { catchUp, ticksOwedSince } from './catchup.js'
import { MIN_CATCHUP_TICKS, PERSIST_MAX_FAILURES, TICK_LAG_WARN_MS } from './constants.js'
import { finishRunner, flushRunner } from './persist.js'
import type { ServerMessage } from './protocol.js'
import { createRunner, engineDeps, logEntriesOf, markSaved, needsSave, needsSync, tickRunner, toPersistSnapshot, type Runner, type StopReason } from './runner.js'
import type { SocketRegistry } from './sockets.js'

export interface SchedulerLogger { info(obj: object, msg?: string): void; warn(obj: object, msg?: string): void; error(obj: object, msg?: string): void }
export interface SchedulerDeps {
  readonly db: Db; readonly registry: Registry; readonly now: () => Date
  readonly sockets: SocketRegistry; readonly logger: SchedulerLogger
  readonly yieldNow?: () => Promise<void>
}
export interface Scheduler {
  start(): void; stop(): void; isStopping(): boolean
  tick(): void
  attach(trainerId: string): Promise<void>
  detach(trainerId: string): void
  get(trainerId: string): Runner | undefined
  size(): number
  applyIntent(trainerId: string, intent: Intent): IntentResult
  finish(trainerId: string, reason: StopReason): Promise<TrainerRow | null>
  flushAll(): Promise<void>
  whenIdle(trainerId: string): Promise<void>
  idle(): Promise<void>
}

export const snapshotMessage = (r: Runner): ServerMessage => ({
  t: 'hunt.snapshot', session: { huntId: r.huntId, sessionId: r.sessionId, startedAt: r.startedAt.toISOString() }, state: r.state,
})

const healsOn = (reason: StopReason): boolean => reason === 'team-fainted'
const syncsOn = (reason: StopReason): boolean => reason !== 'corrupt' && reason !== 'persist-failed'

/** Um scheduler para todas as hunts vivas. `runners`/`chains` são infraestrutura mutável; cada Runner é imutável e trocado inteiro. */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const runners = new Map<string, Runner>()
  const chains = new Map<string, Promise<void>>()
  let timer: ReturnType<typeof setInterval> | null = null
  let stopping = false
  let lastTickAt: number | null = null

  const enqueue = (trainerId: string, op: () => Promise<void>): Promise<void> => {
    const next = (chains.get(trainerId) ?? Promise.resolve()).then(op).catch((error: unknown) => onPersistError(trainerId, error))
    chains.set(trainerId, next)
    return next
  }

  const onPersistError = (trainerId: string, error: unknown): void => {
    deps.logger.error({ err: error, trainerId }, 'falha ao persistir a hunt')
    const runner = runners.get(trainerId)
    if (!runner) return
    const failures = runner.persistFailures + 1
    runners.set(trainerId, { ...runner, persistFailures: failures })
    if (failures >= PERSIST_MAX_FAILURES) void finish(trainerId, 'persist-failed')
  }

  const persist = (runner: Runner, sync: boolean): Runner => {
    const snap = toPersistSnapshot(runner)
    void enqueue(runner.trainerId, async () => {
      await flushRunner(deps.db, snap, deps.now(), { sync })
      const current = runners.get(runner.trainerId)
      if (current && current.persistFailures > 0) runners.set(runner.trainerId, { ...current, persistFailures: 0 })
    })
    return markSaved(runner, sync)
  }

  const tickOne = (runner: Runner): void => {
    let outcome
    try { outcome = tickRunner(runner, engineDeps(runner, deps.registry)) } catch (error) {
      deps.logger.error({ err: error, trainerId: runner.trainerId }, 'erro no motor; runner removido, sessão preservada')
      runners.delete(runner.trainerId)
      deps.sockets.broadcast(runner.trainerId, { t: 'error', code: 'internal', message: 'erro interno' })
      return
    }
    let next: Runner = { ...outcome.runner, lastSimulatedAt: deps.now() }
    if (outcome.events.length > 0) deps.sockets.broadcast(runner.trainerId, { t: 'hunt.tick', tick: runner.state.tick, events: outcome.events })
    if (outcome.stopped) { runners.set(runner.trainerId, next); void finish(runner.trainerId, outcome.stopped.reason); return }
    if (needsSync(next)) next = persist(next, true)
    else if (needsSave(next)) next = persist(next, false)
    runners.set(runner.trainerId, next)
  }

  const tick = (): void => {
    const startedAt = Date.now()
    if (lastTickAt !== null && startedAt - lastTickAt > TICK_MS + TICK_LAG_WARN_MS) deps.logger.warn({ lagMs: startedAt - lastTickAt, runners: runners.size }, 'tick atrasado')
    lastTickAt = startedAt
    for (const runner of [...runners.values()]) if (!runner.catchingUp) tickOne(runner)
  }

  const finish = async (trainerId: string, reason: StopReason): Promise<TrainerRow | null> => {
    const runner = runners.get(trainerId)
    if (!runner) return null
    runners.delete(trainerId)
    const snap = toPersistSnapshot(runner)
    let trainer: TrainerRow | null = null
    await enqueue(trainerId, async () => { trainer = await finishRunner(deps.db, snap, deps.now(), { sync: syncsOn(reason), healTeam: healsOn(reason) }) })
    deps.sockets.broadcast(trainerId, { t: 'hunt.stopped', reason, healed: healsOn(reason) })
    return trainer
  }

  const attach = async (trainerId: string): Promise<void> => {
    let active
    try { active = await loadActive(deps.db, trainerId) } catch (error) {
      if (!(error instanceof CorruptSnapshotError)) throw error
      deps.logger.error({ err: error, trainerId, issues: error.issues }, 'snapshot corrompido no attach; sessão encerrada sem sync')
      await stopHunt(deps.db, trainerId, deps.now())
      deps.sockets.broadcast(trainerId, { t: 'hunt.stopped', reason: 'corrupt', healed: false })
      return
    }
    if (!active) throw new AppError('no-hunt', 'não há hunt ativa')
    const base = createRunner(trainerId, active)
    const owed = ticksOwedSince(active.lastSimulatedAt, deps.now())
    if (owed < MIN_CATCHUP_TICKS) { runners.set(trainerId, base); deps.sockets.broadcast(trainerId, snapshotMessage(base)); return }
    runners.set(trainerId, { ...base, catchingUp: true })
    deps.sockets.broadcast(trainerId, { t: 'hunt.catchup', ticksRemaining: owed })
    const result = await catchUp(base, owed, engineDeps(base, deps.registry), {
      onSlice: (remaining) => deps.sockets.broadcast(trainerId, { t: 'hunt.catchup', ticksRemaining: remaining }),
      shouldAbort: () => stopping,
      ...(deps.yieldNow && { yieldNow: deps.yieldNow }),
    })
    if (result.stopped) { runners.set(trainerId, result.runner); await finish(trainerId, result.stopped.reason); return }
    const settled = persist({ ...result.runner, catchingUp: false }, true)
    runners.set(trainerId, settled)
    deps.sockets.broadcast(trainerId, { t: 'hunt.summary', summary: result.summary })
    deps.sockets.broadcast(trainerId, snapshotMessage(settled))
  }

  const applyIntent = (trainerId: string, intent: Intent): IntentResult => {
    const runner = runners.get(trainerId)
    if (!runner) return { error: { code: 'no-hunt', message: 'não há hunt ativa' } }
    if (runner.catchingUp) return { error: { code: 'catching-up', message: 'a hunt ainda está recuperando o tempo perdido' } }
    const result = engineApplyIntent(runner.state, intent, engineDeps(runner, deps.registry))
    if ('error' in result) return result
    const next: Runner = { ...runner, state: result.state, pendingLog: [...runner.pendingLog, ...logEntriesOf(result.events, runner.huntId)] }
    runners.set(trainerId, next)
    if (result.events.length > 0) deps.sockets.broadcast(trainerId, { t: 'hunt.tick', tick: runner.state.tick, events: result.events })
    const stopped = result.events.find((e) => e.type === 'stopped')
    if (stopped) void finish(trainerId, 'intent')
    return result
  }

  return {
    start: () => { if (timer) return; timer = setInterval(tick, TICK_MS) },
    stop: () => { stopping = true; if (timer) { clearInterval(timer); timer = null } },
    isStopping: () => stopping,
    tick,
    attach,
    detach: (trainerId) => { runners.delete(trainerId) },
    get: (trainerId) => runners.get(trainerId),
    size: () => runners.size,
    applyIntent,
    finish,
    flushAll: async () => {
      for (const runner of runners.values()) if (!runner.catchingUp) runners.set(runner.trainerId, persist(runner, true))
      await Promise.allSettled([...chains.values()])
    },
    whenIdle: (trainerId) => chains.get(trainerId) ?? Promise.resolve(),
    idle: async () => { await Promise.allSettled([...chains.values()]) },
  }
}
