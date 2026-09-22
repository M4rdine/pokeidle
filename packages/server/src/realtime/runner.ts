import { createRng, type Registry, type Rng } from '@pokeidle/shared'
import { step } from '../engine/step.js'
import type { EngineDeps, Event, HuntState } from '../engine/types.js'
import type { ActiveHunt } from '../hunt-store/snapshot.js'
import { AppError } from '../http/errors.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from './constants.js'

export type StoppedEvent = Extract<Event, { type: 'stopped' }>
export type { StopReason } from '@pokeidle/shared/protocol'

export interface LogEntry {
  readonly huntId: string; readonly speciesName: string; readonly level: number
  readonly xpTrainer: number; readonly gold: number
  readonly drops: readonly { readonly item: string; readonly quantity: number }[]
  readonly captured: boolean
}

/** Registro imutável de uma hunt viva. `rng` é o único mutável, encapsulado no motor. */
export interface Runner {
  readonly trainerId: string; readonly huntId: string; readonly sessionId: string; readonly seed: number
  readonly rng: Rng
  readonly state: HuntState
  readonly pendingLog: readonly LogEntry[]
  readonly lastSaveTick: number; readonly lastSyncTick: number
  readonly catchingUp: boolean
  /** Ticks que ainda faltam no catch-up em andamento; `null` fora de um catch-up. */
  readonly catchupRemaining: number | null
  readonly lastSimulatedAt: Date; readonly startedAt: Date
  readonly persistFailures: number
}

export interface PersistSnapshot {
  readonly trainerId: string; readonly huntId: string; readonly state: HuntState; readonly rngState: number
  readonly pendingLog: readonly LogEntry[]; readonly lastSimulatedAt: Date
}
export interface TickOutcome { readonly runner: Runner; readonly events: readonly Event[]; readonly stopped: StoppedEvent | null }

/**
 * A FASE de gravação deste treinador dentro do período, em ticks.
 *
 * `needsSave` compara `tick - lastSaveTick`. Com todo runner nascendo em `lastSaveTick =
 * state.tick`, as caçadas que começam no mesmo instante ficam alinhadas PARA SEMPRE: gravam todas
 * no mesmo tick, tick após tick, contra um pool de dez conexões. Não é hipótese — a sonda de carga
 * mediu com 52 caçadas: 171 gravações a 2.322 ms cada, 100% acima de 200 ms, e o servidor a 57,8%
 * da velocidade do relógio. O motor não era o gargalo; a 17 caçadas ele gasta 0,14 ms por caçada.
 *
 * FNV-1a sobre o id do treinador, e não `Math.random()`: a fase precisa ser ESTÁVEL. Sorteada a
 * cada anexo, um jogador que reconecta muda de ritmo toda vez, e duas caçadas que se separaram
 * podem voltar a coincidir no próximo boot — que é justamente quando todas reanexam juntas.
 *
 * O resultado fica em `[0, periodo)`, nunca no período cheio: fase igual ao período gravaria no
 * tick 0, antes de o runner ter simulado qualquer coisa, escrevendo de volta o estado que acabou
 * de ser lido do banco.
 */
function faseDe(trainerId: string, periodo: number): number {
  let h = 2166136261
  for (let i = 0; i < trainerId.length; i++) {
    h ^= trainerId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % periodo
}

export function createRunner(trainerId: string, active: ActiveHunt): Runner {
  return {
    trainerId, huntId: active.huntId, sessionId: active.sessionId, seed: active.seed,
    rng: createRng(active.seed, active.rngState), state: active.state, pendingLog: [],
    // Recuar o relógio de gravação encurta só o PRIMEIRO intervalo; do primeiro corte em diante
    // `markSaved` fixa o marco no tick em que gravou, e o período volta a ser o de sempre.
    lastSaveTick: active.state.tick - faseDe(trainerId, SNAPSHOT_EVERY_TICKS),
    lastSyncTick: active.state.tick - faseDe(trainerId, SYNC_EVERY_TICKS),
    catchingUp: false, catchupRemaining: null,
    lastSimulatedAt: active.lastSimulatedAt, startedAt: active.startedAt, persistFailures: 0,
  }
}

export function engineDeps(runner: Runner, registry: Registry): EngineDeps {
  const hunt = registry.hunts.get(runner.huntId)
  if (!hunt) throw new AppError('not-found', `hunt ${runner.huntId} não existe`)
  return { registry, hunt, rng: runner.rng }
}

export function logEntriesOf(events: readonly Event[], huntId: string): LogEntry[] {
  return events.flatMap((e): LogEntry[] => {
    if (e.type === 'wildDefeated') return [{ huntId, speciesName: e.speciesName, level: e.level, xpTrainer: e.xpTrainer, gold: e.gold, drops: e.drops, captured: false }]
    if (e.type === 'captured') return [{ huntId, speciesName: e.speciesName, level: e.level, xpTrainer: 0, gold: 0, drops: [], captured: true }]
    return []
  })
}

export function tickRunner(runner: Runner, deps: EngineDeps): TickOutcome {
  const result = step(runner.state, deps)
  const stopped = result.events.find((e): e is StoppedEvent => e.type === 'stopped') ?? null
  const next: Runner = { ...runner, state: result.state, pendingLog: [...runner.pendingLog, ...logEntriesOf(result.events, runner.huntId)] }
  return { runner: next, events: result.events, stopped }
}

export const needsSave = (r: Runner): boolean => r.state.tick - r.lastSaveTick >= SNAPSHOT_EVERY_TICKS
export const needsSync = (r: Runner): boolean => r.state.tick - r.lastSyncTick >= SYNC_EVERY_TICKS

export const markSaved = (r: Runner, sync: boolean): Runner =>
  sync ? { ...r, lastSaveTick: r.state.tick, lastSyncTick: r.state.tick, pendingLog: [] } : { ...r, lastSaveTick: r.state.tick }

export const toPersistSnapshot = (r: Runner): PersistSnapshot => ({
  trainerId: r.trainerId, huntId: r.huntId, state: r.state, rngState: r.rng.state(),
  pendingLog: r.pendingLog, lastSimulatedAt: r.lastSimulatedAt,
})
