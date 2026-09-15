import { EventSchema, HuntStateSchema } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { simulate } from '../src/engine/simulate.js'
import { baseState, miniDeps } from './engine/fixtures/mini.js'

describe('contrato de fio × motor', () => {
  it('todo evento e o estado final de 300 ticks passam pelos schemas do shared', () => {
    const deps = miniDeps(3)
    const r = simulate(baseState({}, deps), 300, deps)
    expect(r.events.length).toBeGreaterThan(50)
    for (const e of r.events) expect(EventSchema.parse(e)).toEqual(e)
    expect(HuntStateSchema.parse(JSON.parse(JSON.stringify(r.state)))).toEqual(r.state)
  })
})
