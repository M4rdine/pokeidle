import { describe, expect, it } from 'vitest'
import { ClientMessageSchema, EventSchema, HuntStateSchema, ServerMessageSchema, SettingsPatchSchema, type Event, type HuntState, type ServerMessage } from '../src/protocol/index.js'

const state: HuntState = {
  huntId: 'h', sessionId: 's', tick: 3,
  player: { team: [{ id: 'p1', speciesName: 'charmander', level: 5, xp: 135, hp: 20, hpMax: 20 }], activeIndex: 0, position: { x: 0, y: 0 }, path: [], mode: 'searching', targetWildId: null, healingUntilTick: null, cooldowns: {}, skippedWildIds: [] },
  wilds: [{ id: 1, spawnIndex: 0, speciesName: 'zubat', level: 3, hp: 16, hpMax: 16, position: { x: 3, y: 1 }, cooldowns: {}, captureTried: false }],
  respawns: [{ spawnIndex: 1, atTick: 10 }], nextWildId: 2, trainer: { xp: 0, gold: 0 }, inventory: { potion: 1 },
  settings: { returnHpPercent: 30, potionHpPercent: 50, teamSlots: 6, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false }, seen: [] },
  box: [],
}

describe('HuntStateSchema', () => {
  it('aceita um estado válido e rejeita campo extra', () => {
    expect(HuntStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(() => HuntStateSchema.parse({ ...state, hack: 1 })).toThrow()
  })
  it('aplica padrões aos campos novos de snapshots antigos', () => {
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown> & { settings: Record<string, unknown> }
    // Remove os campos novos de forma imutável para simular um snapshot salvo antes deles existirem.
    const { box: _b, ...rest } = old
    const { potionHpPercent: _p, teamSlots: _t, ...settings } = old.settings
    const parsed = HuntStateSchema.parse({ ...rest, settings })
    expect(parsed.box).toEqual([])
    expect(parsed.settings.potionHpPercent).toBe(50)
    expect(parsed.settings.teamSlots).toBe(6)
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

describe('ServerMessageSchema', () => {
  it('aceita cada tipo de mensagem do servidor e rejeita campo extra ou tipo desconhecido', () => {
    const session = { huntId: 'route-1', sessionId: 's', startedAt: '2026-09-14T12:00:00.000Z' }
    const summary = { ticks: 10, defeats: 1, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 21, gold: 5, drops: { potion: 1 }, levelUps: 0, evolutions: 0, returns: 0 }
    const msgs: ServerMessage[] = [
      { t: 'hunt.snapshot', session, state, serverTime: 1_000 },
      { t: 'hunt.tick', tick: 4, events: [{ type: 'moved', tick: 3, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }], serverTime: 1_200 },
      { t: 'hunt.stopped', reason: 'team-fainted', healed: true },
      { t: 'hunt.catchup', ticksRemaining: 250 },
      { t: 'hunt.summary', summary },
      { t: 'hunt.idle' },
      { t: 'error', code: 'no-hunt', message: 'não há hunt ativa' },
      { t: 'pong' },
    ]
    for (const m of msgs) expect(ServerMessageSchema.parse(m), m.t).toEqual(m)
    expect(() => ServerMessageSchema.parse({ t: 'pong', x: 1 })).toThrow()
    expect(() => ServerMessageSchema.parse({ t: 'hunt.tick', tick: 1, events: [] })).toThrow() // sem serverTime
    expect(() => ServerMessageSchema.parse({ t: 'nope' })).toThrow()
  })
})
