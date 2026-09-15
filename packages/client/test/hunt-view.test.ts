import { hpAt, loadRegistry, cooldownTicks } from '@pokeidle/shared'
import type { Event, HuntState, ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { activePokemon, applyEvent, applyServerMessage, applySnapshot, emptyHuntView, type HuntView } from '../src/state/hunt-view.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const rec = fixture as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }>; ticks: Extract<ServerMessage, { t: 'hunt.tick' }>[]; final: HuntState }
const base = (): HuntView => applySnapshot(emptyHuntView(), rec.snapshot)
const ev = (e: Event, v: HuntView = base()) => applyEvent(v, e, registry)
const wildId = rec.snapshot.state.wilds[0]!.id
const zubat = registry.species.get(rec.snapshot.state.wilds[0]!.speciesName)!

describe('applySnapshot', () => {
  it('substitui o estado inteiro, deriva cooldowns e alvo, fase active', () => {
    const v = base()
    expect(v.state).toEqual(rec.snapshot.state)
    expect(v.session).toEqual(rec.snapshot.session)
    expect(v).toMatchObject({ phase: 'active', tick: 0, serverTime: rec.snapshot.serverTime, catchup: null, derived: { cooldownUntil: {}, targetWildId: null } })
    expect(activePokemon(v)?.speciesName).toBe('charmander')
  })
})

describe('applyEvent (tabela da spec §4)', () => {
  it('spawned cria o selvagem com hp = hpMax = hpAt', () => {
    const v = ev({ type: 'spawned', tick: 1, wildId: 99, speciesName: 'zubat', level: 5, position: { x: 2, y: 2 } })
    const hpMax = hpAt(zubat.baseStats.hp, 5)
    expect(v.state!.wilds.find((w) => w.id === 99)).toMatchObject({ speciesName: 'zubat', level: 5, hp: hpMax, hpMax, position: { x: 2, y: 2 } })
  })
  it('moved muda a posição e o modo', () => {
    const v = ev({ type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } })
    expect(v.state!.player).toMatchObject({ position: { x: 1, y: 0 }, mode: 'walking' })
  })
  it('attack do jogador: hp do selvagem, alvo, cooldown do golpe, modo fighting', () => {
    const v = ev({ type: 'attack', tick: 7, attacker: 'player', attackerId: 'p1', targetId: String(wildId), move: 'ember', damage: 9, targetHp: 7 })
    expect(v.state!.wilds.find((w) => w.id === wildId)!.hp).toBe(7)
    expect(v.derived).toEqual({ cooldownUntil: { ember: 7 + cooldownTicks(registry.moves.get('ember')!) }, targetWildId: wildId })
    expect(v.state!.player.mode).toBe('fighting')
    // state.player.cooldowns fica em sincronia com derived.cooldownUntil (Fix round 1).
    expect(v.state!.player.cooldowns['ember']).toBe(v.derived.cooldownUntil['ember'])
  })
  it('attack do selvagem: hp do Pokémon alvo', () => {
    const v = ev({ type: 'attack', tick: 8, attacker: 'wild', attackerId: String(wildId), targetId: 'p1', move: 'tackle', damage: 4, targetHp: 20 })
    expect(activePokemon(v)!.hp).toBe(20)
  })
  it('wildDefeated remove o selvagem, soma xp/ouro/drops e xp do ativo, limpa o alvo', () => {
    const before = base()
    const v = ev({ type: 'wildDefeated', tick: 9, wildId, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] }, { ...before, derived: { ...before.derived, targetWildId: wildId } })
    expect(v.state!.wilds.some((w) => w.id === wildId)).toBe(false)
    expect(v.state!.trainer).toEqual({ xp: 21, gold: 5 })
    expect(v.state!.inventory['potion']).toBe(before.state!.inventory['potion']! + 1)
    expect(activePokemon(v)!.xp).toBe(activePokemon(before)!.xp + 21)
    expect(v.derived.targetWildId).toBeNull()
  })
  it('captured: bola −1, remove o selvagem, Pokémon novo no time (ou na box com toBox) e seen', () => {
    const wild = rec.snapshot.state.wilds[0]!
    const v = ev({ type: 'captured', tick: 9, wildId, speciesName: wild.speciesName, level: wild.level, ball: 'poke-ball', toBox: false })
    expect(v.state!.inventory['poke-ball']).toBe(4)
    expect(v.state!.wilds.some((w) => w.id === wildId)).toBe(false)
    expect(v.state!.player.team.at(-1)).toMatchObject({ id: `rec-w${wildId}`, speciesName: wild.speciesName, level: wild.level, hp: wild.hp, hpMax: wild.hpMax })
    expect(v.state!.settings.seen).toContain(wild.speciesName)
    const boxed = ev({ type: 'captured', tick: 9, wildId, speciesName: wild.speciesName, level: wild.level, ball: 'poke-ball', toBox: true })
    expect(boxed.state!.player.team).toHaveLength(1)
    expect(boxed.state!.box).toHaveLength(1)
  })
  it('captureFailed só gasta a bola', () => {
    const v = ev({ type: 'captureFailed', tick: 9, wildId, ball: 'poke-ball' })
    expect(v.state!.inventory['poke-ball']).toBe(4)
    expect(v.state!.wilds).toHaveLength(rec.snapshot.state.wilds.length)
  })
  it('pokemonFainted, switched, levelUp, evolved, itemUsed', () => {
    const two = { ...base(), state: { ...base().state!, player: { ...base().state!.player, team: [...base().state!.player.team, { id: 'p2', speciesName: 'bulbasaur', level: 10, xp: 1000, hp: 30, hpMax: 30 }] } } }
    const fainted = ev({ type: 'pokemonFainted', tick: 1, pokemonId: 'p1' }, two)
    expect(fainted.state!.player.team[0]!.hp).toBe(0)
    const switched = ev({ type: 'switched', tick: 1, pokemonId: 'p2' }, { ...fainted, derived: { cooldownUntil: { ember: 50 }, targetWildId: null } })
    expect(switched.state!.player.activeIndex).toBe(1)
    expect(switched.derived.cooldownUntil).toEqual({})
    // switched limpa state.player.cooldowns também, não só derived (Fix round 1).
    expect(switched.state!.player.cooldowns).toEqual({})
    const p1 = activePokemon(base())!
    const up = ev({ type: 'levelUp', tick: 1, pokemonId: 'p1', level: p1.level + 1 })
    const hpMax = hpAt(registry.species.get('charmander')!.baseStats.hp, p1.level + 1)
    expect(activePokemon(up)).toMatchObject({ level: p1.level + 1, hpMax, hp: p1.hp + (hpMax - p1.hpMax) })
    const evo = ev({ type: 'evolved', tick: 1, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' })
    expect(activePokemon(evo)!.speciesName).toBe('charmeleon')
    expect(activePokemon(evo)!.hpMax).toBe(hpAt(registry.species.get('charmeleon')!.baseStats.hp, p1.level))
    const used = ev({ type: 'itemUsed', tick: 1, itemId: 'potion', pokemonId: 'p1', hp: 18 })
    expect(activePokemon(used)!.hp).toBe(18)
    expect(used.state!.inventory['potion']).toBe(2)
  })
  it('returning, healed, stopped, skipped', () => {
    const ret = ev({ type: 'returning', tick: 1 }, { ...base(), derived: { cooldownUntil: {}, targetWildId: wildId } })
    expect(ret.state!.player.mode).toBe('returning')
    expect(ret.derived.targetWildId).toBeNull()
    const hurt = { ...ret, state: { ...ret.state!, player: { ...ret.state!.player, team: [{ ...ret.state!.player.team[0]!, hp: 3 }] } }, derived: { cooldownUntil: { ember: 9 }, targetWildId: null } }
    const healed = ev({ type: 'healed', tick: 30 }, hurt)
    expect(healed.state!.player.team[0]!.hp).toBe(healed.state!.player.team[0]!.hpMax)
    expect(healed.state!.player.mode).toBe('searching')
    expect(healed.derived.cooldownUntil).toEqual({})
    expect(healed.state!.player.cooldowns).toEqual({})
    const stopped = ev({ type: 'stopped', tick: 31, reason: 'team-fainted' })
    expect(stopped).toMatchObject({ phase: 'stopped', stoppedInfo: { reason: 'team-fainted', healed: false } })
    expect(stopped.state!.player.mode).toBe('stopped')
    expect(ev({ type: 'skipped', tick: 1, wildId }, { ...base(), derived: { cooldownUntil: {}, targetWildId: wildId } }).derived.targetWildId).toBeNull()
  })
  it('evento sem estado (tick antes do snapshot) é ignorado', () => {
    expect(applyEvent(emptyHuntView(), { type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, registry)).toEqual(emptyHuntView())
  })
})

describe('applyServerMessage', () => {
  it('tick aplica eventos e avança tick/serverTime; catchup, summary, stopped, idle mudam a fase', () => {
    let v = base()
    v = applyServerMessage(v, rec.ticks[0]!, registry)
    expect(v.tick).toBe(rec.ticks[0]!.tick)
    expect(v.serverTime).toBe(rec.ticks[0]!.serverTime)
    // state.tick fica em sincronia com view.tick após um hunt.tick (Fix round 1).
    expect(v.state!.tick).toBe(rec.ticks[0]!.tick)
    expect(applyServerMessage(v, { t: 'hunt.catchup', ticksRemaining: 500 }, registry)).toMatchObject({ phase: 'catching-up', catchup: { remaining: 500 } })
    const summary = { ticks: 1, defeats: 0, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 0, gold: 0, drops: {}, levelUps: 0, evolutions: 0, returns: 0 }
    expect(applyServerMessage(v, { t: 'hunt.summary', summary }, registry).lastSummary).toEqual(summary)
    expect(applyServerMessage(v, { t: 'hunt.stopped', reason: 'intent', healed: false }, registry)).toMatchObject({ phase: 'stopped', stoppedInfo: { reason: 'intent', healed: false } })
    const idle = applyServerMessage(v, { t: 'hunt.idle' }, registry)
    expect(idle).toMatchObject({ phase: 'idle', state: null, session: null })
    expect(applyServerMessage(v, { t: 'pong' }, registry)).toBe(v)
    expect(applyServerMessage(v, { t: 'error', code: 'x', message: 'y' }, registry)).toBe(v)
  })
  it('replay da gravação: o espelho bate com o estado final do motor', () => {
    const v = rec.ticks.reduce((acc, m) => applyServerMessage(acc, m, registry), base())
    /**
     * Campos deliberadamente fora da projeção, em dois grupos:
     * (a) bookkeeping só do servidor — o cliente nunca recebe nem precisa destes: `respawns`,
     *     `nextWildId`, `player.path`, `player.skippedWildIds`, `player.healingUntilTick`,
     *     `wilds[].spawnIndex`, `wilds[].cooldowns`, `wilds[].captureTried`.
     * (b) aproximados pelo espelho porque não há evento para a transição: `player.mode` (o motor
     *     volta a 'searching' depois de `removeWild` sem emitir evento, e a transição
     *     'returning' → 'healing' também não tem evento próprio — só `healed` fecha o ciclo) e
     *     `player.targetWildId` (o motor mira o selvagem antes do primeiro golpe; o espelho só
     *     sabe o alvo a partir do primeiro `attack`).
     * `tick` e `player.cooldowns` ENTRARAM na projeção (Fix round 1): agora são mantidos em
     * sincronia pelo espelho (ver `applyServerMessage`/`attack`/`switched`/`healed`) e devem
     * bater 1:1 com o motor — se não baterem, o diff abaixo mostra exatamente onde.
     */
    const project = (s: HuntState) => ({
      tick: s.tick,
      trainer: s.trainer, inventory: s.inventory, box: s.box,
      team: s.player.team, activeIndex: s.player.activeIndex, position: s.player.position, cooldowns: s.player.cooldowns,
      wilds: s.wilds.map((w) => ({ id: w.id, speciesName: w.speciesName, level: w.level, hp: w.hp, hpMax: w.hpMax, position: w.position })), seen: s.settings.seen,
    })
    expect(project(v.state!)).toEqual(project(rec.final))
    expect(v.tick).toBe(rec.final.tick)
  })
})
