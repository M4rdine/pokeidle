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
    expect(r).toMatchObject({ trainerId: 't1', huntId: active.huntId, sessionId: active.sessionId, seed: 7, pendingLog: [], catchingUp: false, catchupRemaining: null, persistFailures: 0, lastSimulatedAt: T0 })
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
    // Fase zerada de propósito: o que este caso mede é o PERÍODO, e a fase de `createRunner`
    // desloca o primeiro corte por treinador (ver o caso da rajada, mais abaixo).
    const r0 = { ...createRunner('t1', activeOf()), lastSaveTick: 0, lastSyncTick: 0 }
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

describe('a gravação não chega em rajada', () => {
  /*
   * `needsSave` compara `tick - lastSaveTick`. Com todo runner nascendo em `lastSaveTick =
   * state.tick`, as caçadas que começam no mesmo instante ficam ALINHADAS PARA SEMPRE: todas
   * gravam no mesmo tick, para sempre, contra um pool de 10 conexões.
   *
   * A sonda de carga (`pnpm --filter @pokeidle/server carga`) mediu isso com 52 caçadas: 171
   * gravações a 2.322 ms cada, 100% acima de 200 ms, e o servidor a 57,8% da velocidade do
   * relógio. O motor não era o gargalo — a 17 caçadas ele gasta 0,14 ms por caçada por tick.
   */
  const ativa = activeOf()
  const primeiroCorte = (trainerId: string): number => {
    const r = createRunner(trainerId, ativa)
    for (let tick = 0; tick <= SNAPSHOT_EVERY_TICKS; tick++) {
      if (needsSave({ ...r, state: { ...r.state, tick } })) return tick
    }
    return -1
  }

  it('cinquenta treinadores não gravam todos no mesmo tick', () => {
    const cortes = Array.from({ length: 50 }, (_, i) => primeiroCorte(`treinador-${i}`))
    expect(cortes).not.toContain(-1)
    // Com fase por treinador, cortes distintos em ~32 dos 50 é o esperado de uma distribuição
    // uniforme em 50 baldes. Sem fase nenhuma, este número é 1.
    expect(new Set(cortes).size).toBeGreaterThanOrEqual(20)
  })

  it('a fase é estável: reanexar o mesmo treinador não embaralha o ritmo dele', () => {
    expect(primeiroCorte('treinador-7')).toBe(primeiroCorte('treinador-7'))
  })

  it('o período continua sendo o de sempre depois do primeiro corte', () => {
    // Deslocar a fase encurta só o PRIMEIRO intervalo; o que vem depois é o ritmo normal, porque
    // `markSaved` fixa `lastSaveTick` no tick em que gravou.
    const r = markSaved({ ...createRunner('treinador-3', ativa), state: { ...ativa.state, tick: 120 } }, false)
    expect(needsSave({ ...r, state: { ...r.state, tick: 120 + SNAPSHOT_EVERY_TICKS - 1 } })).toBe(false)
    expect(needsSave({ ...r, state: { ...r.state, tick: 120 + SNAPSHOT_EVERY_TICKS } })).toBe(true)
  })

  it('a fase nunca adianta a gravação para antes do primeiro tick', () => {
    // Fase igual ao período gravaria no tick 0, antes de o runner ter simulado qualquer coisa —
    // uma escrita do estado que acabou de ser lido do banco.
    for (let i = 0; i < 200; i++) {
      const r = createRunner(`treinador-${i}`, ativa)
      expect(needsSave(r), `treinador-${i}`).toBe(false)
      expect(needsSync(r), `treinador-${i}`).toBe(false)
    }
  })
})
