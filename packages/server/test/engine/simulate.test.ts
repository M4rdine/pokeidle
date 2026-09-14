import { describe, expect, it } from 'vitest'
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
})
