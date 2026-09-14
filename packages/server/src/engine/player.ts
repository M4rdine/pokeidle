import { HEAL_TICKS } from './constants.js'
import { attemptCapture, captureApplies, playerAttack } from './combat.js'
import { findPath, isAdjacent, samePoint } from './grid.js'
import { blockedAt, isWalkable } from './spawn.js'
import type { EngineDeps, Event, HuntState, PlayerState, Point, StepResult, WildState } from './types.js'

const withPlayer = (state: HuntState, patch: Partial<PlayerState>): HuntState => ({ ...state, player: { ...state.player, ...patch } })
const idle = (state: HuntState): StepResult => ({ state, events: [] })
const toSearching = (state: HuntState): HuntState => withPlayer(state, { mode: 'searching', targetWildId: null, path: [] })

function pathTo(state: HuntState, deps: EngineDeps, target: Point, isGoal: (p: Point) => boolean, ignoreWildId: number | null): Point[] | null {
  const isBlocked = (p: Point): boolean => blockedAt(deps.hunt, p) || state.wilds.some((w) => w.id !== ignoreWildId && samePoint(w.position, p)) || (ignoreWildId !== null && samePoint(target, p))
  return findPath({ from: state.player.position, target, isBlocked, isGoal, width: deps.hunt.width, height: deps.hunt.height })
}

export function pickTarget(state: HuntState, deps: EngineDeps): { wildId: number; path: Point[] } | null {
  const candidates = state.wilds.filter((w) => w.hp > 0 && !state.player.skippedWildIds.includes(w.id))
  let best: { wildId: number; path: Point[] } | null = null
  for (const w of [...candidates].sort((a, b) => a.id - b.id)) {
    const path = pathTo(state, deps, w.position, (p) => isAdjacent(p, w.position), w.id)
    if (path && (best === null || path.length < best.path.length)) best = { wildId: w.id, path }
  }
  return best
}

const targetOf = (state: HuntState): WildState | undefined => state.wilds.find((w) => w.id === state.player.targetWildId && w.hp > 0)

function searching(state: HuntState, deps: EngineDeps): StepResult {
  const target = pickTarget(state, deps)
  if (!target) return idle(state)
  return idle(withPlayer(state, { targetWildId: target.wildId, path: target.path, mode: target.path.length === 0 ? 'fighting' : 'walking' }))
}

function advance(state: HuntState, next: Point, rest: readonly Point[]): StepResult {
  const from = state.player.position
  const event: Event = { type: 'moved', tick: state.tick, from, to: next }
  return { state: withPlayer(state, { position: next, path: rest }), events: [event] }
}

function walking(state: HuntState, deps: EngineDeps): StepResult {
  const wild = targetOf(state)
  if (!wild) return idle(toSearching(state))
  const [next, ...rest] = state.player.path
  if (!next) return isAdjacent(state.player.position, wild.position) ? idle(withPlayer(state, { mode: 'fighting' })) : idle(toSearching(state))
  if (!isWalkable(state, deps.hunt, next)) {
    const path = pathTo(state, deps, wild.position, (p) => isAdjacent(p, wild.position), wild.id)
    return path === null ? idle(toSearching(state)) : idle(withPlayer(state, { path }))
  }
  const moved = advance(state, next, rest)
  const arrived = isAdjacent(next, wild.position)
  return { state: arrived ? withPlayer(moved.state, { mode: 'fighting', path: [] }) : moved.state, events: moved.events }
}

function fighting(state: HuntState, deps: EngineDeps): StepResult {
  const wild = targetOf(state)
  if (!wild) return idle(toSearching(state))
  if (!isAdjacent(state.player.position, wild.position)) return idle(withPlayer(state, { mode: 'walking', path: [] }))
  const ball = captureApplies(state, deps.registry, wild)
  if (ball) return attemptCapture(state, deps, wild, ball)
  const attack = playerAttack(state, deps, wild)
  if (attack.outcome !== 'immune') return attack
  const skipped: Event = { type: 'skipped', tick: state.tick, wildId: wild.id }
  return { state: toSearching(withPlayer(state, { skippedWildIds: [...state.player.skippedWildIds, wild.id] })), events: [skipped] }
}

function stopNoRoute(state: HuntState): StepResult {
  const event: Event = { type: 'stopped', tick: state.tick, reason: 'no-route' }
  return { state: withPlayer(state, { mode: 'stopped', targetWildId: null, path: [] }), events: [event] }
}

function returning(state: HuntState, deps: EngineDeps): StepResult {
  const center = deps.hunt.pokecenter
  const atCenter = (p: Point) => samePoint(p, center) || isAdjacent(p, center)
  if (atCenter(state.player.position)) return idle(withPlayer(state, { mode: 'healing', healingUntilTick: state.tick + HEAL_TICKS, path: [] }))
  if (state.player.path.length > 0) {
    const [next, ...rest] = state.player.path
    if (next && isWalkable(state, deps.hunt, next)) return advance(state, next, rest)
    return idle(withPlayer(state, { path: [] }))
  }
  const path = pathTo(state, deps, center, atCenter, null)
  if (path === null) return stopNoRoute(state)
  const [next, ...rest] = path
  if (!next || !isWalkable(state, deps.hunt, next)) return idle(withPlayer(state, { path: [] }))
  return advance(state, next, rest)
}

function healing(state: HuntState): StepResult {
  if (state.player.healingUntilTick === null || state.tick < state.player.healingUntilTick) return idle(state)
  const team = state.player.team.map((p) => ({ ...p, hp: p.hpMax }))
  return { state: withPlayer(state, { team, mode: 'searching', healingUntilTick: null, skippedWildIds: [] }), events: [{ type: 'healed', tick: state.tick }] }
}

export function stepPlayer(state: HuntState, deps: EngineDeps): StepResult {
  switch (state.player.mode) {
    case 'searching': return searching(state, deps)
    case 'walking': return walking(state, deps)
    case 'fighting': return fighting(state, deps)
    case 'returning': return returning(state, deps)
    case 'healing': return healing(state)
    case 'stopped': return idle(state)
  }
}
