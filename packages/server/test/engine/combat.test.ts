import { describe, expect, it } from 'vitest'
import { attemptCapture, captureApplies, playerAttack, readyMoves, selectBall, wildAttack } from '../../src/engine/combat.js'
import { makePokemon } from '../../src/engine/progression.js'
import { baseState, miniDeps } from './fixtures/mini.js'

const fixed = (v: number) => ({ next: () => v, int: (min: number) => min, state: () => 0 })
const fighting = (deps = miniDeps()) => { const s = baseState({}, deps); return { ...s, tick: 100, player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, position: { x: 3, y: 0 } } } }

describe('readyMoves', () => {
  it('filtra pelo cooldown', () => {
    const r = miniDeps().registry
    expect(readyMoves(r, 'charmander', 5, {}, 0).map((m) => m.name)).toEqual(['scratch', 'ember'])
    expect(readyMoves(r, 'charmander', 5, { ember: 101 }, 100).map((m) => m.name)).toEqual(['scratch'])
    expect(readyMoves(r, 'charmander', 5, { ember: 100 }, 100).map((m) => m.name)).toEqual(['scratch', 'ember'])
  })
})

describe('playerAttack', () => {
  it('usa o melhor golpe, aplica dano, registra cooldown e emite attack', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = fighting(deps)
    const r = playerAttack(s, deps, s.wilds[0]!)
    expect(r.outcome).toBe('hit')
    expect(r.state.wilds[0]!.hp).toBe(16 - 9) // ember: bruto 6 x STAB 1,5
    expect(r.state.player.cooldowns).toEqual({ ember: 110 })
    expect(r.events).toEqual([{ type: 'attack', tick: 100, attacker: 'player', attackerId: 'p1', targetId: '1', move: 'ember', damage: 9, targetHp: 7 }])
  })
  it('com ember em cooldown usa scratch; sem golpe pronto devolve none', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = fighting(deps)
    const withCd = { ...s, player: { ...s.player, cooldowns: { ember: 110 } } }
    expect(playerAttack(withCd, deps, s.wilds[0]!).events[0]).toMatchObject({ move: 'scratch', damage: 6 })
    const allCd = { ...s, player: { ...s.player, cooldowns: { ember: 110, scratch: 110 } } }
    const none = playerAttack(allCd, deps, s.wilds[0]!)
    expect(none.outcome).toBe('none')
    expect(none.state).toBe(allCd)
  })
  it('alvo imune devolve immune sem evento e sem mudar o estado', () => {
    const deps = miniDeps()
    const s = fighting(deps)
    const magnemite = makePokemon(deps.registry, 'm1', 'magnemite', 5)
    const gastly = { ...s.wilds[0]!, speciesName: 'gastly' }
    const st = { ...s, player: { ...s.player, team: [magnemite] }, wilds: [gastly] }
    const r = playerAttack(st, deps, gastly)
    expect(r.outcome).toBe('immune')
    expect(r.events).toEqual([])
    expect(r.state).toBe(st)
  })
})

describe('wildAttack', () => {
  it('zubat L3 leech-life em charmander L5 tira 5 com rng 1', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = fighting(deps)
    const r = wildAttack(s, deps, s.wilds[0]!)
    expect(r.outcome).toBe('hit')
    expect(r.state.player.team[0]!.hp).toBe(20 - 5)
    expect(r.state.wilds[0]!.cooldowns).toEqual({ 'leech-life': 120 })
    expect(r.events[0]).toMatchObject({ attacker: 'wild', attackerId: '1', targetId: 'p1', move: 'leech-life', damage: 5, targetHp: 15 })
  })
})

describe('captura', () => {
  it('selectBall respeita tier fixo e best', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    expect(selectBall(s, deps.registry)?.id).toBe('poke-ball') // best entre {poke-ball: 2}
    expect(selectBall({ ...s, inventory: { 'poke-ball': 1, 'great-ball': 1 } }, deps.registry)?.id).toBe('great-ball')
    const fixedTier = { ...s, settings: { ...s.settings, capture: { ...s.settings.capture, ballTier: 'ultra' as const } } }
    expect(selectBall(fixedTier, deps.registry)).toBeNull()
    expect(selectBall({ ...s, inventory: {} }, deps.registry)).toBeNull()
  })
  it('captureApplies exige hp baixo, espécie nova (ou allowDuplicates), bola e sem tentativa anterior', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const wild = s.wilds[0]!
    expect(captureApplies(s, deps.registry, wild)).toBeNull() // hp cheio
    const low = { ...wild, hp: 4 } // 25 %
    expect(captureApplies(s, deps.registry, low)?.id).toBe('poke-ball')
    expect(captureApplies({ ...s, settings: { ...s.settings, seen: ['zubat'] } }, deps.registry, low)).toBeNull()
    expect(captureApplies({ ...s, settings: { ...s.settings, seen: ['zubat'], capture: { ...s.settings.capture, allowDuplicates: true } } }, deps.registry, low)?.id).toBe('poke-ball')
    expect(captureApplies(s, deps.registry, { ...low, captureTried: true })).toBeNull()
    expect(captureApplies({ ...s, inventory: {} }, deps.registry, low)).toBeNull()
  })
  it('sucesso: consome a bola, entra no time, marca seen, remove e reagenda', () => {
    const deps = { ...miniDeps(), rng: fixed(0) }
    const s = { ...fighting(deps), tick: 50 }
    const low = { ...s.wilds[0]!, hp: 4 }
    const ball = deps.registry.items.get('poke-ball')!
    const r = attemptCapture({ ...s, wilds: [low] }, deps, low, ball)
    expect(r.state.inventory['poke-ball']).toBe(1)
    expect(r.state.player.team).toHaveLength(2)
    expect(r.state.player.team[1]).toMatchObject({ id: 'mini-w1', speciesName: 'zubat', level: 3, hp: 4, hpMax: 16 })
    expect(r.state.settings.seen).toEqual(['zubat'])
    expect(r.state.wilds).toEqual([])
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: 60 }])
    expect(r.state.player.mode).toBe('searching')
    expect(r.events).toEqual([{ type: 'captured', tick: 50, wildId: 1, speciesName: 'zubat', level: 3, ball: 'poke-ball', toBox: false }])
  })
  it('falha: consome a bola, marca captureTried e o selvagem fica', () => {
    const deps = { ...miniDeps(), rng: fixed(0.99) }
    const s = fighting(deps)
    const low = { ...s.wilds[0]!, hp: 4 }
    const r = attemptCapture({ ...s, wilds: [low] }, deps, low, deps.registry.items.get('poke-ball')!)
    expect(r.state.inventory['poke-ball']).toBe(1)
    expect(r.state.wilds[0]).toMatchObject({ id: 1, captureTried: true })
    expect(r.state.player.team).toHaveLength(1)
    expect(r.events).toEqual([{ type: 'captureFailed', tick: 100, wildId: 1, ball: 'poke-ball' }])
  })
  it('time cheio: captura vai para a box', () => {
    const deps = { ...miniDeps(), rng: fixed(0) }
    const s = fighting(deps)
    const team = Array.from({ length: 6 }, (_, i) => ({ ...s.player.team[0]!, id: `p${i}` }))
    const low = { ...s.wilds[0]!, hp: 4 }
    const r = attemptCapture({ ...s, wilds: [low], player: { ...s.player, team } }, deps, low, deps.registry.items.get('poke-ball')!)
    expect(r.state.player.team).toHaveLength(6)
    expect(r.events[0]).toMatchObject({ type: 'captured', toBox: true })
  })
})
