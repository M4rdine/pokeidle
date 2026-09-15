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
  /** @internal só para testes */
  readonly hooks?: { onPersistStart?(kind: 'save' | 'sync' | 'finish', trainerId: string): void }
  /** @internal só para testes */
  readonly persistence?: { readonly flush: typeof flushRunner; readonly finish: typeof finishRunner }
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

export const snapshotMessage = (r: Runner, now: Date): ServerMessage => ({
  t: 'hunt.snapshot', session: { huntId: r.huntId, sessionId: r.sessionId, startedAt: r.startedAt.toISOString() }, state: r.state, serverTime: now.getTime(),
})

const healsOn = (reason: StopReason): boolean => reason === 'team-fainted'
const syncsOn = (reason: StopReason): boolean => reason !== 'corrupt' && reason !== 'persist-failed'

/** Um scheduler para todas as hunts vivas. `runners`/`chains`/`inFlight` são infraestrutura mutável; cada Runner é imutável e trocado inteiro. */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const runners = new Map<string, Runner>()
  const chains = new Map<string, Promise<void>>()
  const inFlight = new Set<Promise<void>>()
  // Infraestrutura do attach single-flight (C1): `attaching` guarda a promise em voo por
  // treinador (concorrentes recebem a mesma); `attachGen` invalida um catch-up em andamento
  // quando `finish`/`detach` assumem a sessão antes dele terminar.
  const attaching = new Map<string, Promise<void>>()
  const attachGen = new Map<string, number>()
  const bumpGen = (trainerId: string): number => {
    const gen = (attachGen.get(trainerId) ?? 0) + 1
    attachGen.set(trainerId, gen)
    return gen
  }
  const flush = deps.persistence?.flush ?? flushRunner
  const finishFn = deps.persistence?.finish ?? finishRunner
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
    if (failures >= PERSIST_MAX_FAILURES) finishInBackground(trainerId, 'persist-failed')
  }

  const persist = (runner: Runner, sync: boolean): Runner => {
    const snap = toPersistSnapshot(runner)
    void enqueue(runner.trainerId, async () => {
      deps.hooks?.onPersistStart?.(sync ? 'sync' : 'save', runner.trainerId)
      try {
        await flush(deps.db, snap, deps.now(), { sync })
      } catch (error) {
        // Um sync já limpou `pendingLog` no runner em memória (via `markSaved`) antes mesmo
        // do flush rodar; se ele falhar, essas entradas (derrotas/capturas) seriam perdidas
        // pra sempre sem isto. A ordem original é preservada; o próximo sync tenta de novo
        // com tudo junto. Um `save` (sem sync) nunca mexe em `pendingLog`, então devolver
        // `snap.pendingLog` aqui duplicaria o que o runner atual já tem.
        if (sync) {
          const cur = runners.get(runner.trainerId)
          if (cur) runners.set(runner.trainerId, { ...cur, pendingLog: [...snap.pendingLog, ...cur.pendingLog] })
        }
        throw error
      }
      const current = runners.get(runner.trainerId)
      if (current && current.persistFailures > 0) runners.set(runner.trainerId, { ...current, persistFailures: 0 })
    })
    return markSaved(runner, sync)
  }

  const tickOne = (runner: Runner): void => {
    try {
      const outcome = tickRunner(runner, engineDeps(runner, deps.registry))
      let next: Runner = { ...outcome.runner, lastSimulatedAt: deps.now() }
      if (outcome.events.length > 0) deps.sockets.broadcast(runner.trainerId, { t: 'hunt.tick', tick: runner.state.tick, events: outcome.events, serverTime: deps.now().getTime() })
      if (outcome.stopped) { runners.set(runner.trainerId, next); finishInBackground(runner.trainerId, outcome.stopped.reason); return }
      if (needsSync(next)) next = persist(next, true)
      else if (needsSave(next)) next = persist(next, false)
      runners.set(runner.trainerId, next)
    } catch (error) {
      // Idempotente: se outra via (ex.: finishInBackground) já removeu o runner e tratou o erro, não duplica.
      if (runners.has(runner.trainerId)) {
        runners.delete(runner.trainerId)
        deps.logger.error({ err: error, trainerId: runner.trainerId }, 'erro no tick; runner removido, sessão preservada')
        deps.sockets.broadcast(runner.trainerId, { t: 'error', code: 'internal', message: 'erro interno' })
      }
    }
  }

  const tick = (): void => {
    const startedAt = Date.now()
    if (lastTickAt !== null && startedAt - lastTickAt > TICK_MS + TICK_LAG_WARN_MS) deps.logger.warn({ lagMs: startedAt - lastTickAt, runners: runners.size }, 'tick atrasado')
    lastTickAt = startedAt
    for (const runner of [...runners.values()]) if (!runner.catchingUp) tickOne(runner)
  }

  const finishInner = async (trainerId: string, reason: StopReason): Promise<TrainerRow | null> => {
    const runner = runners.get(trainerId)
    if (!runner) return null
    runners.delete(trainerId)
    const snap = toPersistSnapshot(runner)
    let trainer: TrainerRow | null = null
    let failure: unknown
    await enqueue(trainerId, async () => {
      deps.hooks?.onPersistStart?.('finish', trainerId)
      try { trainer = await finishFn(deps.db, snap, deps.now(), { sync: syncsOn(reason), healTeam: healsOn(reason) }) }
      catch (error) { failure = error }
    })
    if (failure) {
      deps.logger.error({ err: failure, trainerId }, 'falha ao encerrar a hunt')
      deps.sockets.broadcast(trainerId, { t: 'error', code: 'internal', message: 'erro interno' })
      throw new AppError('internal', 'não foi possível encerrar a hunt')
    }
    deps.sockets.broadcast(trainerId, { t: 'hunt.stopped', reason, healed: healsOn(reason) })
    return trainer
  }

  /**
   * Se um catch-up estiver em voo para este treinador, espera ele terminar (ignorando
   * rejeição) antes de finalizar — evita apagar a sessão com o runner pré-catch-up enquanto
   * `runCatchUp` ainda está simulando o tempo perdido (C1). Em seguida invalida a geração:
   * qualquer fatia de catch-up que ainda não rodou (não deveria haver nenhuma, já que
   * esperamos o catch-up acabar) não resiste o runner que acabamos de apagar.
   */
  const finish = async (trainerId: string, reason: StopReason): Promise<TrainerRow | null> => {
    const pending = attaching.get(trainerId)
    if (pending) await pending.catch(() => {})
    bumpGen(trainerId)
    return finishInner(trainerId, reason)
  }

  // `finish` já loga e transmite o erro internamente antes de rejeitar; aqui só evitamos uma rejeição solta.
  const finishInBackground = (trainerId: string, reason: StopReason): void => { void finish(trainerId, reason).catch(() => {}) }

  const runCatchUp = async (trainerId: string, base: Runner, owed: number, gen: number): Promise<void> => {
    const isCurrent = (): boolean => attachGen.get(trainerId) === gen && runners.has(trainerId)
    try {
      const result = await catchUp(base, owed, engineDeps(base, deps.registry), {
        onSlice: (remaining) => {
          // Por fatia, só atualiza o runner em memória (`hunt.catchup` do `ws.ts` no connect
          // lê `catchupRemaining` dali) e transmite se ainda formos a geração corrente (C1):
          // se um `finish`/`detach` concorrente já assumiu a sessão, quem assumiu já cuidou dela.
          if (!isCurrent()) return
          runners.set(trainerId, { ...runners.get(trainerId)!, catchupRemaining: remaining })
          deps.sockets.broadcast(trainerId, { t: 'hunt.catchup', ticksRemaining: remaining })
        },
        shouldAbort: () => stopping,
        ...(deps.yieldNow && { yieldNow: deps.yieldNow }),
      })
      if (result.stopped) {
        // Um `finish`/`detach` concorrente já assumiu a sessão durante o catch-up: quem assumiu
        // já cuidou dela, e ressuscitar o runner aqui apagaria o que essa outra geração fez.
        if (!isCurrent()) return
        // Chamada interna (mesmo fluxo de `attachInner`, não concorrente): usa `finishInner`
        // direto — `finish` esperaria por esta própria promise em `attaching` e travaria.
        runners.set(trainerId, { ...result.runner, catchupRemaining: null })
        await finishInner(trainerId, result.stopped.reason)
        return
      }
      if (!isCurrent()) return // geração mudou: quem mudou já cuidou da sessão, sem persistir nem transmitir
      if (result.ticksDone < owed) {
        // Abortado (processo encerrando): persiste o tempo realmente simulado e sai da memória,
        // sem sumário nem snapshot — o próximo attach retoma o catch-up de onde parou.
        persist({ ...result.runner, catchingUp: false, catchupRemaining: null }, true)
        runners.delete(trainerId)
        return
      }
      const settled = persist({ ...result.runner, catchingUp: false, catchupRemaining: null }, true)
      runners.set(trainerId, settled)
      deps.sockets.broadcast(trainerId, { t: 'hunt.summary', summary: result.summary })
      deps.sockets.broadcast(trainerId, snapshotMessage(settled, deps.now()))
    } catch (error) {
      // Idempotente: se `finishInner` (chamado acima, já awaited) já removeu o runner e tratou o erro, não duplica.
      if (attachGen.get(trainerId) === gen && runners.has(trainerId)) {
        runners.delete(trainerId)
        deps.logger.error({ err: error, trainerId }, 'erro no catch-up; runner removido, sessão preservada')
        deps.sockets.broadcast(trainerId, { t: 'error', code: 'internal', message: 'erro interno' })
      }
      throw error
    }
  }

  const attachInner = async (trainerId: string, gen: number): Promise<void> => {
    let active
    try { active = await loadActive(deps.db, trainerId) } catch (error) {
      if (!(error instanceof CorruptSnapshotError)) throw error
      deps.logger.error({ err: error, trainerId, issues: error.issues }, 'snapshot corrompido no attach; sessão encerrada sem sync')
      await stopHunt(deps.db, trainerId, deps.now())
      deps.sockets.broadcast(trainerId, { t: 'hunt.stopped', reason: 'corrupt', healed: false })
      return
    }
    if (!active) throw new AppError('no-hunt', 'não há hunt ativa')
    if (attachGen.get(trainerId) !== gen) return // finish/detach assumiu a sessão enquanto líamos o banco
    const base = createRunner(trainerId, active)
    const owed = ticksOwedSince(active.lastSimulatedAt, deps.now())
    if (owed < MIN_CATCHUP_TICKS) { runners.set(trainerId, base); deps.sockets.broadcast(trainerId, snapshotMessage(base, deps.now())); return }
    runners.set(trainerId, { ...base, catchingUp: true, catchupRemaining: owed })
    deps.sockets.broadcast(trainerId, { t: 'hunt.catchup', ticksRemaining: owed })
    await runCatchUp(trainerId, base, owed, gen)
  }

  const attach = (trainerId: string): Promise<void> => {
    if (runners.has(trainerId)) return Promise.resolve()
    const existing = attaching.get(trainerId)
    if (existing) return existing
    const gen = bumpGen(trainerId)
    const p = attachInner(trainerId, gen)
    attaching.set(trainerId, p)
    inFlight.add(p)
    const cleanup = (): void => { attaching.delete(trainerId); inFlight.delete(p) }
    p.then(cleanup, cleanup)
    return p
  }

  const applyIntent = (trainerId: string, intent: Intent): IntentResult => {
    const runner = runners.get(trainerId)
    if (!runner) return { error: { code: 'no-hunt', message: 'não há hunt ativa' } }
    if (runner.catchingUp) return { error: { code: 'catching-up', message: 'a hunt ainda está recuperando o tempo perdido' } }
    const result = engineApplyIntent(runner.state, intent, engineDeps(runner, deps.registry))
    if ('error' in result) return result
    const next: Runner = { ...runner, state: result.state, pendingLog: [...runner.pendingLog, ...logEntriesOf(result.events, runner.huntId)] }
    runners.set(trainerId, next)
    if (result.events.length > 0) deps.sockets.broadcast(trainerId, { t: 'hunt.tick', tick: runner.state.tick, events: result.events, serverTime: deps.now().getTime() })
    const stopped = result.events.find((e) => e.type === 'stopped')
    if (stopped) finishInBackground(trainerId, 'intent')
    return result
  }

  return {
    start: () => { if (timer) return; stopping = false; timer = setInterval(tick, TICK_MS) },
    stop: () => { stopping = true; if (timer) { clearInterval(timer); timer = null } },
    isStopping: () => stopping,
    tick,
    attach,
    detach: (trainerId) => { runners.delete(trainerId); bumpGen(trainerId) },
    get: (trainerId) => runners.get(trainerId),
    size: () => runners.size,
    applyIntent,
    finish,
    flushAll: async () => {
      await Promise.allSettled([...inFlight])
      for (const runner of runners.values()) if (!runner.catchingUp) runners.set(runner.trainerId, persist(runner, true))
      await Promise.allSettled([...chains.values()])
    },
    whenIdle: (trainerId) => chains.get(trainerId) ?? Promise.resolve(),
    idle: async () => {
      await Promise.allSettled([...inFlight])
      await Promise.allSettled([...chains.values()])
    },
  }
}
