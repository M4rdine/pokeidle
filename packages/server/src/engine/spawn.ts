import { hpAt, type HuntMap, type HuntSpawn } from '@pokeidle/shared'
import { RESPAWN_RETRY_TICKS } from './constants.js'
import { inBounds, samePoint } from './grid.js'
import type { EngineDeps, Event, HuntState, Point, StepResult, WildState } from './types.js'

export const blockedAt = (hunt: HuntMap, p: Point): boolean => hunt.layers.blocking[p.y * hunt.width + p.x] === true
export const occupiedAt = (state: HuntState, p: Point): boolean => samePoint(state.player.position, p) || state.wilds.some((w) => samePoint(w.position, p))
export const isWalkable = (state: HuntState, hunt: HuntMap, p: Point): boolean => inBounds(p, hunt.width, hunt.height) && !blockedAt(hunt, p) && !occupiedAt(state, p)

export function spawnTiles(spawn: HuntSpawn, hunt: HuntMap): Point[] {
  const tiles: Point[] = []
  for (let y = spawn.y - spawn.radius; y <= spawn.y + spawn.radius; y++) {
    for (let x = spawn.x - spawn.radius; x <= spawn.x + spawn.radius; x++) {
      const p = { x, y }
      if (inBounds(p, hunt.width, hunt.height) && !blockedAt(hunt, p)) tiles.push(p)
    }
  }
  return tiles
}

export function spawnWild(state: HuntState, deps: EngineDeps, spawnIndex: number): StepResult {
  const spawn = deps.hunt.spawns[spawnIndex]
  if (!spawn) throw new Error(`spawn ${spawnIndex} não existe na hunt ${deps.hunt.id}`)
  const free = spawnTiles(spawn, deps.hunt).filter((p) => !occupiedAt(state, p))
  if (free.length === 0) {
    return { state: { ...state, respawns: [...state.respawns, { spawnIndex, atTick: state.tick + RESPAWN_RETRY_TICKS }] }, events: [] }
  }
  const species = deps.registry.species.get(spawn.speciesName)
  if (!species) throw new Error(`espécie ${spawn.speciesName} não existe no registro`)
  const level = deps.rng.int(spawn.minLevel, spawn.maxLevel)
  const position = free[deps.rng.int(0, free.length - 1)]!
  const hpMax = hpAt(species.baseStats.hp, level)
  const wild: WildState = { id: state.nextWildId, spawnIndex, speciesName: species.name, level, hp: hpMax, hpMax, position, cooldowns: {}, captureTried: false }
  const event: Event = { type: 'spawned', tick: state.tick, wildId: wild.id, speciesName: wild.speciesName, level, position }
  return { state: { ...state, wilds: [...state.wilds, wild], nextWildId: state.nextWildId + 1 }, events: [event] }
}

export function processRespawns(state: HuntState, deps: EngineDeps): StepResult {
  const due = state.respawns.filter((r) => r.atTick <= state.tick)
  const pending = state.respawns.filter((r) => r.atTick > state.tick)
  return due.reduce<StepResult>(
    (acc, r) => { const next = spawnWild(acc.state, deps, r.spawnIndex); return { state: next.state, events: [...acc.events, ...next.events] } },
    { state: { ...state, respawns: pending }, events: [] },
  )
}
