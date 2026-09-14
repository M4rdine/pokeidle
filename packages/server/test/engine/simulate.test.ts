import { describe, expect, it } from 'vitest'
import { step } from '../../src/engine/step.js'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'
import { baseState, miniDeps } from './fixtures/mini.js'

describe('simulate', () => {
  it('avança N ticks e resume os eventos', () => {
    const deps = miniDeps(2)
    const r = simulate(baseState({}, deps), 200, deps)
    expect(r.state.tick).toBe(200)
    const s = summarizeEvents(r.events, 200)
    expect(s.ticks).toBe(200)
    expect(s.defeats).toBeGreaterThanOrEqual(1)
    expect(s.xpTrainer).toBe(r.state.trainer.xp)
    expect(s.gold).toBe(r.state.trainer.gold)
  })
  it('rejeita ticks negativos e aceita zero', () => {
    const deps = miniDeps()
    expect(() => simulate(baseState({}, deps), -1, deps)).toThrow(RangeError)
    expect(simulate(baseState({}, deps), 0, deps).events).toEqual([])
  })
  it('acumula eventos de forma linear em uma janela grande de ticks', () => {
    const deps = miniDeps(3)
    const r = simulate(baseState({}, deps), 5000, deps)
    expect(r.state.tick).toBe(5000)

    const manualDeps = miniDeps(3)
    let manualState = baseState({}, manualDeps)
    let manualEventCount = 0
    for (let i = 0; i < 5000; i++) {
      const next = step(manualState, manualDeps)
      manualEventCount += next.events.length
      manualState = next.state
    }
    expect(r.events.length).toBe(manualEventCount)
  })
})
