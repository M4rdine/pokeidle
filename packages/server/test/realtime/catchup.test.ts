import { createRng, TICK_MS } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'
import { addSummaries, catchUp, emptySummary, ticksOwedSince } from '../../src/realtime/catchup.js'
import { CATCHUP_SLICE_TICKS, MAX_CATCHUP_TICKS } from '../../src/realtime/constants.js'
import { createRunner, engineDeps } from '../../src/realtime/runner.js'
import { baseState, miniDeps, miniRegistry } from '../engine/fixtures/mini.js'

const T0 = new Date('2026-09-14T12:00:00Z')
const activeOf = (seed = 1) => { const deps = miniDeps(seed); const state = baseState({}, deps); return { huntId: state.huntId, sessionId: state.sessionId, state, seed, rngState: deps.rng.state(), startedAt: T0, lastSimulatedAt: T0 } }

describe('ticksOwedSince', () => {
  it('arredonda para baixo, nunca negativo, com teto', () => {
    expect(ticksOwedSince(T0, new Date(T0.getTime() + 999))).toBe(4)
    expect(ticksOwedSince(T0, new Date(T0.getTime() - 5000))).toBe(0)
    expect(ticksOwedSince(T0, new Date(T0.getTime() + 13 * 3600 * 1000))).toBe(MAX_CATCHUP_TICKS)
    expect(ticksOwedSince(T0, new Date(T0.getTime() + 12 * 3600 * 1000))).toBe(MAX_CATCHUP_TICKS)
  })
})

describe('addSummaries', () => {
  it('soma campos e mescla drops', () => {
    const a = { ...emptySummary(), ticks: 1, defeats: 1, gold: 5, drops: { potion: 1 } }
    const b = { ...emptySummary(), ticks: 2, defeats: 2, gold: 7, drops: { potion: 2, 'poke-ball': 1 } }
    expect(addSummaries(a, b)).toEqual({ ...emptySummary(), ticks: 3, defeats: 3, gold: 12, drops: { potion: 3, 'poke-ball': 1 } })
  })
})

describe('catchUp', () => {
  it('em fatias dá o mesmo estado e o mesmo resumo que simulate de uma vez', async () => {
    const active = activeOf(9)
    const r0 = createRunner('t1', active)
    const slices: number[] = []
    const res = await catchUp(r0, 4500, engineDeps(r0, miniRegistry()), { onSlice: (n) => slices.push(n), yieldNow: () => Promise.resolve() })
    const ref = simulate(active.state, 4500, { ...miniDeps(9), rng: createRng(9, active.rngState) })
    expect(res.runner.state).toEqual(ref.state)
    expect(res.summary).toEqual(summarizeEvents(ref.events, 4500))
    expect(res.ticksDone).toBe(4500)
    expect(res.stopped).toBeNull()
    expect(slices.length).toBe(18)
    expect(slices[0]).toBe(4250)
    expect(slices.at(-1)).toBe(0)
    expect(res.runner.lastSimulatedAt).toEqual(new Date(T0.getTime() + 4500 * TICK_MS))
    expect(res.runner.pendingLog.filter((e) => !e.captured)).toHaveLength(res.summary.defeats)
  })
  it('para no stopped e devolve os ticks feitos', async () => {
    const active = activeOf()
    const fainted = { ...active, state: { ...active.state, player: { ...active.state.player, mode: 'fighting' as const, team: [{ ...active.state.player.team[0]!, hp: 0 }] } } }
    const r0 = createRunner('t1', fainted)
    const res = await catchUp(r0, 1000, engineDeps(r0, miniRegistry()), { yieldNow: () => Promise.resolve() })
    expect(res.stopped).toMatchObject({ reason: 'team-fainted' })
    expect(res.ticksDone).toBe(1)
  })
  it('aborta entre fatias quando shouldAbort diz sim', async () => {
    const r0 = createRunner('t1', activeOf(2))
    let calls = 0
    const res = await catchUp(r0, CATCHUP_SLICE_TICKS * 3, engineDeps(r0, miniRegistry()), { yieldNow: () => Promise.resolve(), shouldAbort: () => ++calls >= 2 })
    expect(res.ticksDone).toBe(CATCHUP_SLICE_TICKS) // shouldAbort é avaliado no início de cada volta: 1ª falso, 2ª verdadeiro
  })
  it('usa setImmediate por padrão sem travar', async () => {
    const r0 = createRunner('t1', activeOf(4))
    let ran = false
    setImmediate(() => { ran = true })
    const res = await catchUp(r0, CATCHUP_SLICE_TICKS + 1, engineDeps(r0, miniRegistry()))
    expect(res.ticksDone).toBe(CATCHUP_SLICE_TICKS + 1)
    expect(ran).toBe(true)
  })
})
