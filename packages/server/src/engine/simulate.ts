import type { Summary } from '@pokeidle/shared/protocol'
import { step } from './step.js'
import type { EngineDeps, Event, HuntState, StepResult } from './types.js'

export type { Summary } from '@pokeidle/shared/protocol'

export function simulate(state: HuntState, ticks: number, deps: EngineDeps): StepResult {
  if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`ticks inválido: ${ticks}`)
  const events: Event[] = []
  let current = state
  for (let i = 0; i < ticks; i++) {
    const next = step(current, deps)
    events.push(...next.events)
    current = next.state
  }
  return { state: current, events }
}

export function summarizeEvents(events: readonly Event[], ticks: number): Summary {
  return events.reduce<Summary>((s, e) => {
    switch (e.type) {
      case 'wildDefeated':
        return { ...s, defeats: s.defeats + 1, xpTrainer: s.xpTrainer + e.xpTrainer, gold: s.gold + e.gold, drops: e.drops.reduce((d, x) => ({ ...d, [x.item]: (d[x.item] ?? 0) + x.quantity }), s.drops) }
      case 'captured':
        return { ...s, captures: s.captures + 1 }
      case 'captureFailed':
        return { ...s, captureFailures: s.captureFailures + 1 }
      case 'pokemonFainted':
        return { ...s, faints: s.faints + 1 }
      case 'levelUp':
        return { ...s, levelUps: s.levelUps + 1 }
      case 'evolved':
        return { ...s, evolutions: s.evolutions + 1 }
      case 'returning':
        return { ...s, returns: s.returns + 1 }
      default:
        return s
    }
  }, { ticks, defeats: 0, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 0, gold: 0, drops: {}, levelUps: 0, evolutions: 0, returns: 0 })
}
