import { describe, expect, it } from 'vitest'
import { ClientMessageSchema, EventSchema, HuntStateSchema, SettingsPatchSchema, type Event, type HuntState } from '../src/protocol/index.js'

const state: HuntState = {
  huntId: 'h', sessionId: 's', tick: 3,
  player: { team: [{ id: 'p1', speciesName: 'charmander', level: 5, xp: 135, hp: 20, hpMax: 20 }], activeIndex: 0, position: { x: 0, y: 0 }, path: [], mode: 'searching', targetWildId: null, healingUntilTick: null, cooldowns: {}, skippedWildIds: [] },
  wilds: [{ id: 1, spawnIndex: 0, speciesName: 'zubat', level: 3, hp: 16, hpMax: 16, position: { x: 3, y: 1 }, cooldowns: {}, captureTried: false }],
  respawns: [{ spawnIndex: 1, atTick: 10 }], nextWildId: 2, trainer: { xp: 0, gold: 0 }, inventory: { potion: 1 },
  settings: { returnHpPercent: 30, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false }, seen: [] },
}

describe('HuntStateSchema', () => {
  it('aceita um estado válido e rejeita campo extra', () => {
    expect(HuntStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(() => HuntStateSchema.parse({ ...state, hack: 1 })).toThrow()
  })
})

describe('EventSchema', () => {
  it('aceita um de cada tipo e rejeita tipo desconhecido', () => {
    const events: Event[] = [
      { type: 'spawned', tick: 0, wildId: 1, speciesName: 'zubat', level: 3, position: { x: 3, y: 1 } },
      { type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: 'attack', tick: 2, attacker: 'player', attackerId: 'p1', targetId: '1', move: 'ember', damage: 9, targetHp: 7 },
      { type: 'wildDefeated', tick: 3, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] },
      { type: 'captured', tick: 4, wildId: 2, speciesName: 'gastly', level: 8, ball: 'poke-ball', toBox: false },
      { type: 'captureFailed', tick: 5, wildId: 2, ball: 'poke-ball' },
      { type: 'pokemonFainted', tick: 6, pokemonId: 'p1' }, { type: 'switched', tick: 6, pokemonId: 'p2' },
      { type: 'levelUp', tick: 7, pokemonId: 'p1', level: 6 }, { type: 'evolved', tick: 7, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' },
      { type: 'itemUsed', tick: 8, itemId: 'potion', pokemonId: 'p1', hp: 9 },
      { type: 'returning', tick: 9 }, { type: 'healed', tick: 10 }, { type: 'stopped', tick: 11, reason: 'intent' }, { type: 'skipped', tick: 12, wildId: 3 },
    ]
    for (const e of events) expect(EventSchema.parse(e), e.type).toEqual(e)
    expect(() => EventSchema.parse({ type: 'hack', tick: 0 })).toThrow()
  })
})

describe('mensagens', () => {
  it('ClientMessageSchema e SettingsPatchSchema são estritos', () => {
    expect(ClientMessageSchema.parse({ t: 'item.use', itemId: 'potion' })).toEqual({ t: 'item.use', itemId: 'potion' })
    expect(() => ClientMessageSchema.parse({ t: 'ping', x: 1 })).toThrow()
    expect(() => SettingsPatchSchema.parse({ returnHpPercent: 101 })).toThrow()
  })
})
