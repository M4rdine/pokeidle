import { createRng } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate.js'
import type { Event } from '../../src/engine/types.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from '../../src/realtime/constants.js'
import { createRunner, engineDeps, logEntriesOf, markSaved, needsSave, needsSync, tickRunner, toPersistSnapshot } from '../../src/realtime/runner.js'
import { baseState, miniDeps, miniRegistry } from '../engine/fixtures/mini.js'

const T0 = new Date('2026-09-14T12:00:00Z')
const activeOf = (seed = 1) => {
  const deps = miniDeps(seed)
  const state = baseState({}, deps)
  return { huntId: state.huntId, sessionId: state.sessionId, state, seed, rngState: deps.rng.state(), startedAt: T0, lastSimulatedAt: T0 }
}

describe('createRunner / engineDeps', () => {
  it('nasce do ActiveHunt com rng retomado do rngState', () => {
    const active = activeOf(7)
    const r = createRunner('t1', active)
    expect(r).toMatchObject({ trainerId: 't1', huntId: active.huntId, sessionId: active.sessionId, seed: 7, pendingLog: [], lastSaveTick: 0, lastSyncTick: 0, catchingUp: false, persistFailures: 0, lastSimulatedAt: T0 })
    expect(r.rng.state()).toBe(active.rngState)
    const deps = engineDeps(r, miniRegistry())
    expect(deps.hunt.id).toBe(active.huntId)
    expect(deps.rng).toBe(r.rng)
  })
  it('engineDeps falha com hunt desconhecida', () => {
    const r = { ...createRunner('t1', activeOf()), huntId: 'nope' }
    expect(() => engineDeps(r, miniRegistry())).toThrow(/nope/)
  })
})

describe('tickRunner', () => {
  it('avança um tick igual ao motor e acumula o log só de derrotas e capturas', () => {
    const active = activeOf(3)
    const r0 = createRunner('t1', active)
    const registry = miniRegistry()
    let r = r0
    const collected: Event[] = []
    for (let i = 0; i < 200; i++) { const o = tickRunner(r, engineDeps(r, registry)); r = o.runner; collected.push(...o.events) }
    const ref = simulate(active.state, 200, { ...miniDeps(3), rng: createRng(3, active.rngState) })
    expect(r.state).toEqual(ref.state)
    expect(collected).toEqual(ref.events)
    const expectedLog = logEntriesOf(ref.events, active.huntId)
    expect(r.pendingLog).toEqual(expectedLog)
    expect(expectedLog.length).toBeGreaterThan(0)
    expect(expectedLog.every((e) => e.huntId === active.huntId)).toBe(true)
    expect(expectedLog.some((e) => !e.captured && e.xpTrainer > 0)).toBe(true)
  })
  it('sinaliza stopped', () => {
    const active = activeOf()
    const fainted = { ...active, state: { ...active.state, player: { ...active.state.player, mode: 'fighting' as const, team: [{ ...active.state.player.team[0]!, hp: 0 }] } } }
    const r = createRunner('t1', fainted)
    const o = tickRunner(r, engineDeps(r, miniRegistry()))
    expect(o.stopped).toMatchObject({ type: 'stopped', reason: 'team-fainted' })
  })
})

describe('logEntriesOf', () => {
  it('mapeia wildDefeated e captured e ignora o resto', () => {
    const events: Event[] = [
      { type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: 'wildDefeated', tick: 2, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] },
      { type: 'captured', tick: 3, wildId: 2, speciesName: 'gastly', level: 8, ball: 'poke-ball', toBox: false },
    ]
    expect(logEntriesOf(events, 'mini')).toEqual([
      { huntId: 'mini', speciesName: 'zubat', level: 3, xpTrainer: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }], captured: false },
      { huntId: 'mini', speciesName: 'gastly', level: 8, xpTrainer: 0, gold: 0, drops: [], captured: true },
    ])
  })
})

describe('save/sync', () => {
  it('needsSave e needsSync por contagem de ticks; markSaved zera o log só no sync', () => {
    const r0 = createRunner('t1', activeOf())
    const at = (tick: number) => ({ ...r0, state: { ...r0.state, tick }, pendingLog: [{ huntId: 'mini', speciesName: 'zubat', level: 3, xpTrainer: 1, gold: 1, drops: [], captured: false }] })
    expect(needsSave(at(SNAPSHOT_EVERY_TICKS - 1))).toBe(false)
    expect(needsSave(at(SNAPSHOT_EVERY_TICKS))).toBe(true)
    expect(needsSync(at(SYNC_EVERY_TICKS - 1))).toBe(false)
    expect(needsSync(at(SYNC_EVERY_TICKS))).toBe(true)
    const saved = markSaved(at(50), false)
    expect(saved).toMatchObject({ lastSaveTick: 50, lastSyncTick: 0 })
    expect(saved.pendingLog).toHaveLength(1)
    const synced = markSaved(at(300), true)
    expect(synced).toMatchObject({ lastSaveTick: 300, lastSyncTick: 300, pendingLog: [] })
  })
  it('toPersistSnapshot captura o rngState no momento', () => {
    const r = createRunner('t1', activeOf(5))
    const snap = toPersistSnapshot(r)
    expect(snap).toEqual({ trainerId: 't1', huntId: r.huntId, state: r.state, rngState: r.rng.state(), pendingLog: [], lastSimulatedAt: r.lastSimulatedAt })
    r.rng.next()
    expect(snap.rngState).not.toBe(r.rng.state())
  })
})
