import { describe, expect, it } from 'vitest'
import { createRng, loadRegistry } from '@pokeidle/shared'
import { blockedAt } from '../../src/engine/spawn.js'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { makePokemon } from '../../src/engine/progression.js'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'
import { step } from '../../src/engine/step.js'
import type { EngineDeps, HuntState } from '../../src/engine/types.js'

const registry = loadRegistry()
const hunt = registry.hunts.get('route-1')!
const deps = (seed: number): EngineDeps => ({ registry, hunt, rng: createRng(seed) })
const start = (d: EngineDeps): HuntState => createHuntState({ hunt, sessionId: 'route1-test', team: [makePokemon(registry, 'p1', 'charmander', 12)], inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, d)

function checkInvariants(before: HuntState, after: HuntState): void {
  for (const p of after.player.team) { expect(p.hp).toBeGreaterThanOrEqual(0); expect(p.hp).toBeLessThanOrEqual(p.hpMax); expect(p.xp).toBeGreaterThanOrEqual(before.player.team.find((q) => q.id === p.id)?.xp ?? 0) }
  for (const w of after.wilds) { expect(w.hp).toBeGreaterThanOrEqual(0); expect(w.hp).toBeLessThanOrEqual(w.hpMax); expect(blockedAt(hunt, w.position)).toBe(false) }
  expect(blockedAt(hunt, after.player.position)).toBe(false)
  expect(after.trainer.xp).toBeGreaterThanOrEqual(before.trainer.xp)
  const total = hunt.spawns.reduce((n, s) => n + s.count, 0)
  expect(after.wilds.length + after.respawns.length).toBe(total)
  for (const r of after.respawns) expect(r.atTick).toBeGreaterThan(before.tick)
  expect(after.tick).toBe(before.tick + 1)
}

describe('Rota 1 com o registro real', () => {
  it('3000 ticks mantêm as invariantes e produzem progresso', () => {
    const d = deps(42)
    let state = start(d)
    let defeats = 0, returns = 0, items = 0
    for (let i = 0; i < 3000; i++) {
      const r = step(state, d)
      checkInvariants(state, r.state)
      for (const e of r.events) { if (e.type === 'wildDefeated') defeats++; if (e.type === 'returning') returns++; if (e.type === 'itemUsed') items++ }
      state = r.state
    }
    expect(defeats).toBeGreaterThanOrEqual(5)
    expect(state.trainer.xp).toBeGreaterThan(0)
    expect(state.player.mode).not.toBe('stopped')
    // Charmander 12 apanha dano em 10 minutos: usou poção ou voltou ao Centro
    expect(returns + items).toBeGreaterThanOrEqual(1)
  })
  it('é determinístico com a mesma seed', () => {
    const a = simulate(start(deps(9)), 3000, deps(9))
    const b = simulate(start(deps(9)), 3000, deps(9))
    expect(a.state).toEqual(b.state)
    expect(summarizeEvents(a.events, 3000)).toEqual(summarizeEvents(b.events, 3000))
  })
  it('captura acontece quando há bola e a espécie é nova', () => {
    const r = simulate(start(deps(9)), 3000, deps(9))
    const s = summarizeEvents(r.events, 3000)
    expect(s.captures + s.captureFailures).toBeGreaterThanOrEqual(1)
    if (s.captures > 0) expect(r.state.player.team.length).toBeGreaterThan(1)
  })
})

