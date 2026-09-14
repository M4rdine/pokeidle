import { describe, expect, it } from 'vitest'
import { xpForLevel } from '@pokeidle/shared'
import { applyDefeat, gainXp, makePokemon } from '../../src/engine/progression.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

describe('makePokemon', () => {
  it('cria com xp da curva e hp cheio', () => {
    const p = makePokemon(miniDeps().registry, 'x', 'charmander', 5)
    expect(p).toEqual({ id: 'x', speciesName: 'charmander', level: 5, xp: xpForLevel('medium-slow', 5), hp: 20, hpMax: 20 })
  })
})

describe('gainXp', () => {
  const registry = miniDeps().registry
  it('sem subir de nível só soma xp', () => {
    const r = gainXp(charmander5(), 10, registry, 7)
    expect(r.pokemon.level).toBe(5)
    expect(r.pokemon.xp).toBe(xpForLevel('medium-slow', 5) + 10)
    expect(r.events).toEqual([])
  })
  it('sobe vários níveis, evolui no 16 e aumenta o hp pelo delta do hpMax', () => {
    const start = { ...charmander5(), hp: 12 }
    const target = xpForLevel('medium-slow', 16)
    const r = gainXp(start, target - start.xp, registry, 3)
    expect(r.pokemon.level).toBe(16)
    expect(r.pokemon.speciesName).toBe('charmeleon')
    expect(r.events.filter((e) => e.type === 'levelUp')).toHaveLength(11)
    expect(r.events.find((e) => e.type === 'evolved')).toEqual({ type: 'evolved', tick: 3, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' })
    // charmeleon L16: hpAt(58,16) = floor(147*16/100)+16+10 = 23+26 = 49
    expect(r.pokemon.hpMax).toBe(49)
    expect(r.pokemon.hp).toBe(12 + (49 - 20))
  })
})

describe('applyDefeat', () => {
  it('dá xp, ouro e drops, agenda respawn e volta a searching', () => {
    const deps = miniDeps(3)
    const s = { ...baseState({}, deps), tick: 40, player: { ...baseState({}, deps).player, mode: 'fighting' as const, targetWildId: 1, path: [{ x: 1, y: 0 }] } }
    const wild = s.wilds[0]!
    const r = applyDefeat(s, deps, wild)
    expect(r.state.wilds).toEqual([])
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: 40 + 2 * 5 }])
    expect(r.state.trainer.xp).toBe(21) // floor(49*3/7)
    expect(r.state.player.team[0]!.xp).toBe(charmander5().xp + 21)
    expect(r.state.trainer.gold).toBeGreaterThanOrEqual(4)
    expect(r.state.trainer.gold).toBeLessThanOrEqual(9)
    expect(r.state.player).toMatchObject({ mode: 'searching', targetWildId: null, path: [] })
    expect(r.events[0]).toMatchObject({ type: 'wildDefeated', tick: 40, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21 })
  })
  it('drops entram no inventário', () => {
    const deps = { ...miniDeps(), rng: { next: () => 0, int: (min: number) => min } }
    const r = applyDefeat(baseState({}, deps), deps, baseState({}, deps).wilds[0]!)
    expect(r.state.inventory['potion']).toBe(2)
    expect(r.state.trainer.gold).toBe(4)
  })
})
