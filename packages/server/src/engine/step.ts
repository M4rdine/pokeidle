import { wildAttack } from './combat.js'
import { isAdjacent } from './grid.js'
import { applyPotion, weakestPotion } from './items.js'
import { stepPlayer } from './player.js'
import { applyDefeat } from './progression.js'
import { processRespawns } from './spawn.js'
import type { EngineDeps, Event, HuntState, StepResult } from './types.js'

const chain = (a: StepResult, f: (s: HuntState) => StepResult): StepResult => { const b = f(a.state); return { state: b.state, events: [...a.events, ...b.events] } }

function engagedWildAttack(state: HuntState, deps: EngineDeps): StepResult {
  if (state.player.mode !== 'fighting') return { state, events: [] }
  const wild = state.wilds.find((w) => w.id === state.player.targetWildId)
  if (!wild || wild.hp <= 0 || !isAdjacent(state.player.position, wild.position)) return { state, events: [] }
  return wildAttack(state, deps, wild)
}

function resolveDefeats(state: HuntState, deps: EngineDeps): StepResult {
  return state.wilds.filter((w) => w.hp <= 0).reduce<StepResult>((acc, w) => chain(acc, (s) => applyDefeat(s, deps, w)), { state, events: [] })
}

function resolveFaint(state: HuntState): StepResult {
  const active = state.player.team[state.player.activeIndex]
  if (!active || active.hp > 0) return { state, events: [] }
  const fainted: Event = { type: 'pokemonFainted', tick: state.tick, pokemonId: active.id }
  const next = state.player.team.findIndex((p) => p.hp > 0)
  if (next === -1) {
    return { state: { ...state, player: { ...state.player, mode: 'stopped', targetWildId: null, path: [] } }, events: [fainted, { type: 'stopped', tick: state.tick, reason: 'team-fainted' }] }
  }
  const switched: Event = { type: 'switched', tick: state.tick, pokemonId: state.player.team[next]!.id }
  return { state: { ...state, player: { ...state.player, activeIndex: next, cooldowns: {} } }, events: [fainted, switched] }
}

function resolveLowHp(state: HuntState, deps: EngineDeps): StepResult {
  const active = state.player.team[state.player.activeIndex]
  const mode = state.player.mode
  if (!active || active.hp <= 0 || !(mode === 'searching' || mode === 'walking' || mode === 'fighting')) return { state, events: [] }
  if ((active.hp / active.hpMax) * 100 >= state.settings.returnHpPercent) return { state, events: [] }
  const potion = weakestPotion(state, deps.registry)
  if (potion) { const r = applyPotion(state, deps.registry, potion.id); if ('error' in r) throw new Error(r.error.message); return r }
  return { state: { ...state, player: { ...state.player, mode: 'returning', targetWildId: null, path: [] } }, events: [{ type: 'returning', tick: state.tick }] }
}

export function resolveConsequences(state: HuntState, deps: EngineDeps): StepResult {
  return chain(chain(resolveDefeats(state, deps), resolveFaint), (s) => resolveLowHp(s, deps))
}

export function step(state: HuntState, deps: EngineDeps): StepResult {
  const r = chain(chain(chain(processRespawns(state, deps), (s) => stepPlayer(s, deps)), (s) => engagedWildAttack(s, deps)), (s) => resolveConsequences(s, deps))
  return { state: { ...r.state, tick: r.state.tick + 1 }, events: r.events }
}
