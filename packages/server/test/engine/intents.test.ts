import { describe, expect, it } from 'vitest'
import { applyIntent } from '../../src/engine/intents.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

describe('applyIntent', () => {
  const deps = miniDeps()
  it('stop para a hunt e é idempotente com erro', () => {
    const s = baseState({}, deps)
    const r = applyIntent(s, { type: 'stop' }, deps)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.state.player.mode).toBe('stopped')
    expect(r.events).toEqual([{ type: 'stopped', tick: 0, reason: 'intent' }])
    expect(applyIntent(r.state, { type: 'stop' }, deps)).toMatchObject({ error: { code: 'already-stopped' } })
  })
  it('useItem delega para applyPotion', () => {
    const s = baseState({}, deps)
    const hurt = { ...s, player: { ...s.player, team: [{ ...charmander5(), hp: 5 }] } }
    const r = applyIntent(hurt, { type: 'useItem', itemId: 'potion' }, deps)
    expect(r).toMatchObject({ state: { inventory: { potion: 0 } } })
    expect(applyIntent(s, { type: 'useItem', itemId: 'potion' }, deps)).toMatchObject({ error: { code: 'full-hp' } })
  })
  it('setActive valida e zera cooldowns e skippedWildIds', () => {
    const s = baseState({}, deps)
    const two = { ...s, player: { ...s.player, cooldowns: { ember: 5 }, skippedWildIds: [1], team: [charmander5(), { ...charmander5(), id: 'p2' }, { ...charmander5(), id: 'p3', hp: 0 }] } }
    expect(applyIntent(two, { type: 'setActive', pokemonId: 'zzz' }, deps)).toMatchObject({ error: { code: 'unknown-pokemon' } })
    expect(applyIntent(two, { type: 'setActive', pokemonId: 'p3' }, deps)).toMatchObject({ error: { code: 'fainted' } })
    expect(applyIntent(two, { type: 'setActive', pokemonId: 'p1' }, deps)).toMatchObject({ error: { code: 'already-active' } })
    const r = applyIntent(two, { type: 'setActive', pokemonId: 'p2' }, deps)
    expect(r).toMatchObject({ state: { player: { activeIndex: 1, cooldowns: {}, skippedWildIds: [] } }, events: [{ type: 'switched', tick: 0, pokemonId: 'p2' }] })
  })
  it('updateSettings mescla e valida faixas', () => {
    const s = baseState({}, deps)
    const r = applyIntent(s, { type: 'updateSettings', patch: { returnHpPercent: 50, capture: { ballTier: 'great' } } }, deps)
    expect(r).toMatchObject({ state: { settings: { returnHpPercent: 50, capture: { ballTier: 'great', maxWildHpPercent: 30, allowDuplicates: false } } }, events: [] })
    expect(applyIntent(s, { type: 'updateSettings', patch: { returnHpPercent: 101 } }, deps)).toMatchObject({ error: { code: 'invalid-settings' } })
    expect(applyIntent(s, { type: 'updateSettings', patch: { capture: { maxWildHpPercent: -1 } } }, deps)).toMatchObject({ error: { code: 'invalid-settings' } })
  })
})
