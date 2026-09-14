import { createRng, type Registry, type Rng } from '@pokeidle/shared'
import { step } from '../engine/step.js'
import type { EngineDeps, Event, HuntState } from '../engine/types.js'
import type { ActiveHunt } from '../hunt-store/snapshot.js'
import { AppError } from '../http/errors.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from './constants.js'

export type StoppedEvent = Extract<Event, { type: 'stopped' }>
export type StopReason = StoppedEvent['reason'] | 'corrupt' | 'persist-failed'

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
  readonly lastSimulatedAt: Date; readonly startedAt: Date
  readonly persistFailures: number
}

export interface PersistSnapshot {
  readonly trainerId: string; readonly huntId: string; readonly state: HuntState; readonly rngState: number
  readonly pendingLog: readonly LogEntry[]; readonly lastSimulatedAt: Date
}
export interface TickOutcome { readonly runner: Runner; readonly events: readonly Event[]; readonly stopped: StoppedEvent | null }

export function createRunner(trainerId: string, active: ActiveHunt): Runner {
  return {
    trainerId, huntId: active.huntId, sessionId: active.sessionId, seed: active.seed,
    rng: createRng(active.seed, active.rngState), state: active.state, pendingLog: [],
    lastSaveTick: active.state.tick, lastSyncTick: active.state.tick, catchingUp: false,
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
