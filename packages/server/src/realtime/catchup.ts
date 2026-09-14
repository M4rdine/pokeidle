import { TICK_MS } from '@pokeidle/shared'
import { summarizeEvents, type Summary } from '../engine/simulate.js'
import type { EngineDeps } from '../engine/types.js'
import { CATCHUP_SLICE_TICKS, MAX_CATCHUP_TICKS } from './constants.js'
import { tickRunner, type Runner, type StoppedEvent } from './runner.js'

export interface CatchUpHooks {
  readonly onSlice?: (remaining: number) => void
  readonly yieldNow?: () => Promise<void>
  readonly shouldAbort?: () => boolean
}
export interface CatchUpResult { readonly runner: Runner; readonly summary: Summary; readonly stopped: StoppedEvent | null; readonly ticksDone: number }

export const ticksOwedSince = (last: Date, now: Date): number =>
  Math.min(MAX_CATCHUP_TICKS, Math.max(0, Math.floor((now.getTime() - last.getTime()) / TICK_MS)))

export const emptySummary = (): Summary => ({ ticks: 0, defeats: 0, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 0, gold: 0, drops: {}, levelUps: 0, evolutions: 0, returns: 0 })

export function addSummaries(a: Summary, b: Summary): Summary {
  const drops = Object.entries(b.drops).reduce<Record<string, number>>((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), { ...a.drops })
  return {
    ticks: a.ticks + b.ticks, defeats: a.defeats + b.defeats, captures: a.captures + b.captures, captureFailures: a.captureFailures + b.captureFailures,
    faints: a.faints + b.faints, xpTrainer: a.xpTrainer + b.xpTrainer, gold: a.gold + b.gold, drops,
    levelUps: a.levelUps + b.levelUps, evolutions: a.evolutions + b.evolutions, returns: a.returns + b.returns,
  }
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** Simula `ticks` em fatias, cedendo o event loop entre elas. Nunca guarda a lista de eventos: só o resumo e o log. */
export async function catchUp(runner: Runner, ticks: number, deps: EngineDeps, hooks: CatchUpHooks = {}): Promise<CatchUpResult> {
  const yieldNow = hooks.yieldNow ?? defaultYield
  let current = runner
  let summary = emptySummary()
  let done = 0
  let stopped: StoppedEvent | null = null
  while (done < ticks && stopped === null && !(hooks.shouldAbort?.() ?? false)) {
    const slice = Math.min(CATCHUP_SLICE_TICKS, ticks - done)
    for (let i = 0; i < slice && stopped === null; i++) {
      const outcome = tickRunner(current, deps)
      current = outcome.runner
      summary = addSummaries(summary, summarizeEvents(outcome.events, 1))
      stopped = outcome.stopped
      done++
    }
    hooks.onSlice?.(ticks - done)
    if (done < ticks && stopped === null) await yieldNow()
  }
  const lastSimulatedAt = new Date(runner.lastSimulatedAt.getTime() + done * TICK_MS)
  return { runner: { ...current, lastSimulatedAt }, summary, stopped, ticksDone: done }
}
