import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings, simulate } from '../src/engine/index.js'
import { parseHuntState } from '../src/hunt-store/state-schema.js'
import { baseState, miniDeps } from './engine/fixtures/mini.js'

describe('HuntStateSchema', () => {
  it('aceita um estado real do motor após ida e volta em JSON, antes e depois de simular', () => {
    const deps = miniDeps()
    const s0 = baseState({}, deps)
    expect(parseHuntState(JSON.parse(JSON.stringify(s0)))).toEqual(s0)
    const s1 = simulate(s0, 300, deps).state
    expect(parseHuntState(JSON.parse(JSON.stringify(s1)))).toEqual(s1)
  })
  it('rejeita lixo e campos desconhecidos', () => {
    expect(() => parseHuntState({})).toThrow()
    const deps = miniDeps()
    const s = createHuntState({ hunt: deps.hunt, sessionId: 'x', team: baseState({}, deps).player.team, inventory: {}, settings: defaultSettings() }, deps)
    expect(() => parseHuntState({ ...s, hack: true })).toThrow()
    expect(() => parseHuntState({ ...s, trainer: { xp: 'muito' } })).toThrow()
  })
})
