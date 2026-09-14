import { describe, expect, it } from 'vitest'
import { xpForLevel } from '@pokeidle/shared'
import { applyPotion, weakestPotion } from '../../src/engine/items.js'
import { pickTarget, stepPlayer } from '../../src/engine/player.js'
import { resolveConsequences, step } from '../../src/engine/step.js'
import type { HuntState } from '../../src/engine/types.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

function run(state: HuntState, deps = miniDeps(), ticks = 1) {
  let cur = { state, events: [] as readonly unknown[] }
  for (let i = 0; i < ticks; i++) { const r = step(cur.state, deps); cur = { state: r.state, events: [...cur.events, ...r.events] } }
  return cur
}

describe('pickTarget e caminhada', () => {
  it('escolhe o zubat e traça caminho até ficar adjacente', () => {
    const deps = miniDeps()
    const t = pickTarget(baseState({}, deps), deps)
    expect(t).toEqual({ wildId: 1, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] })
  })
  it('searching → walking → fighting em 4 ticks, com eventos moved', () => {
    const deps = miniDeps()
    const r = run(baseState({}, deps), deps, 4)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.state.player.position).toEqual({ x: 3, y: 0 })
    expect(r.events.filter((e) => (e as { type: string }).type === 'moved')).toHaveLength(3)
    expect(r.state.tick).toBe(4)
  })
  it('sem selvagens fica searching parado', () => {
    const deps = miniDeps()
    const r = stepPlayer({ ...baseState({}, deps), wilds: [] }, deps)
    expect(r.state.player.mode).toBe('searching')
    expect(r.events).toEqual([])
  })
})

describe('combate até a derrota e respawn', () => {
  it('derrota o zubat, agenda respawn e ele volta', () => {
    const deps = miniDeps(1)
    const r = run(baseState({}, deps), deps, 60)
    const defeated = r.events.filter((e) => (e as { type: string }).type === 'wildDefeated')
    expect(defeated.length).toBeGreaterThanOrEqual(1)
    expect(r.events.filter((e) => (e as { type: string }).type === 'spawned').length).toBeGreaterThanOrEqual(1)
    expect(r.state.trainer.xp).toBeGreaterThan(0)
    expect(r.state.player.team[0]!.hp).toBeGreaterThan(0)
  })
  it('é determinístico para a mesma seed', () => {
    const a = run(baseState({}, miniDeps(7)), miniDeps(7), 100)
    const b = run(baseState({}, miniDeps(7)), miniDeps(7), 100)
    expect(a.state).toEqual(b.state)
    expect(a.events).toEqual(b.events)
  })
})

describe('resolveConsequences', () => {
  it('usa a poção mais fraca quando o hp cai abaixo do limite', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const low = { ...s, player: { ...s.player, mode: 'fighting' as const, team: [{ ...charmander5(), hp: 5 }] }, inventory: { potion: 1, 'super-potion': 1 } }
    expect(weakestPotion(low, deps.registry)?.id).toBe('potion')
    const r = resolveConsequences(low, deps)
    expect(r.state.player.team[0]!.hp).toBe(9) // 5 + ceil(20*20/100)
    expect(r.state.inventory['potion']).toBe(0)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.events).toEqual([{ type: 'itemUsed', tick: 0, itemId: 'potion', pokemonId: 'p1', hp: 9 }])
  })
  it('sem poção entra em returning', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const low = { ...s, player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, team: [{ ...charmander5(), hp: 5 }] }, inventory: {} }
    const r = resolveConsequences(low, deps)
    expect(r.state.player).toMatchObject({ mode: 'returning', targetWildId: null, path: [] })
    expect(r.events).toEqual([{ type: 'returning', tick: 0 }])
  })
  it('ativo caído troca para o próximo; time inteiro caído para', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const two = { ...s, player: { ...s.player, mode: 'fighting' as const, cooldowns: { ember: 9 }, team: [{ ...charmander5(), hp: 0 }, { ...charmander5(), id: 'p2' }] } }
    const r = resolveConsequences(two, deps)
    expect(r.state.player.activeIndex).toBe(1)
    expect(r.state.player.cooldowns).toEqual({})
    expect(r.events.map((e) => e.type)).toEqual(['pokemonFainted', 'switched'])
    const one = { ...s, player: { ...s.player, mode: 'fighting' as const, team: [{ ...charmander5(), hp: 0 }] } }
    const r2 = resolveConsequences(one, deps)
    expect(r2.state.player.mode).toBe('stopped')
    expect(r2.events.map((e) => e.type)).toEqual(['pokemonFainted', 'stopped'])
  })
})

describe('returning e healing', () => {
  it('anda até o Centro, cura o time em 25 ticks e volta a searching', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const start = { ...s, wilds: [], player: { ...s.player, mode: 'returning' as const, team: [{ ...charmander5(), hp: 5 }] }, inventory: {} }
    const r = run(start, deps, 8) // (0,0) → adjacente de (4,4) são 7 passos
    expect(r.state.player.mode).toBe('healing')
    expect(r.state.player.healingUntilTick).toBe(r.state.tick - 1 + 25)
    const healed = run(r.state, deps, 26)
    expect(healed.state.player.mode).toBe('searching')
    expect(healed.state.player.team[0]!.hp).toBe(20)
    expect(healed.events.some((e) => (e as { type: string }).type === 'healed')).toBe(true)
  })
})

describe('alvo imune', () => {
  it('pula o selvagem e não fica preso', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const magnemite = { id: 'm1', speciesName: 'magnemite', level: 5, xp: 0, hp: 30, hpMax: 30 }
    const gastly = { ...s.wilds[0]!, speciesName: 'gastly' }
    const st = { ...s, wilds: [gastly], player: { ...s.player, team: [magnemite] } }
    const r = run(st, deps, 6)
    expect(r.events.some((e) => (e as { type: string }).type === 'skipped')).toBe(true)
    expect(r.state.player.skippedWildIds).toEqual([1])
    expect(r.state.player.mode).toBe('searching')
  })
})

describe('applyPotion', () => {
  it('valida item, estoque e hp cheio', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    expect(applyPotion(s, deps.registry, 'nope')).toEqual({ error: { code: 'unknown-item', message: expect.any(String) } })
    expect(applyPotion(s, deps.registry, 'poke-ball')).toMatchObject({ error: { code: 'not-a-potion' } })
    expect(applyPotion({ ...s, inventory: {} }, deps.registry, 'potion')).toMatchObject({ error: { code: 'out-of-stock' } })
    expect(applyPotion(s, deps.registry, 'potion')).toMatchObject({ error: { code: 'full-hp' } })
  })
})

describe('resolveLowHp com returnHpPercent inválido (regressão)', () => {
  it('returnHpPercent > 100 no HP cheio não lança e não altera time/inventário', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const high = { ...s, settings: { ...s.settings, returnHpPercent: 150 } }
    expect(() => resolveConsequences(high, deps)).not.toThrow()
    const r = resolveConsequences(high, deps)
    expect(r.state.player.team).toEqual(high.player.team)
    expect(r.state.inventory).toEqual(high.inventory)
    expect(r.events).toEqual([])
  })
})

describe('skippedWildIds é limpo quando a imunidade pode ter mudado', () => {
  it('trocar de Pokémon ativo limpa a lista', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const st = {
      ...s,
      player: { ...s.player, mode: 'fighting' as const, skippedWildIds: [1], team: [{ ...charmander5(), hp: 0 }, { ...charmander5(), id: 'p2' }] },
    }
    const r = resolveConsequences(st, deps)
    expect(r.state.player.activeIndex).toBe(1)
    expect(r.state.player.skippedWildIds).toEqual([])
  })
  it('curar no Centro limpa a lista', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const st = {
      ...s,
      wilds: [],
      player: { ...s.player, mode: 'healing' as const, healingUntilTick: 0, skippedWildIds: [1], team: [{ ...charmander5(), hp: 5 }] },
    }
    const r = stepPlayer(st, deps)
    expect(r.events.some((e) => (e as { type: string }).type === 'healed')).toBe(true)
    expect(r.state.player.skippedWildIds).toEqual([])
  })
  it('subir de nível limpa a lista', () => {
    const deps = miniDeps(3)
    const s = baseState({}, deps)
    const nearLevelUp = { ...charmander5(), xp: xpForLevel('medium-slow', 6) - 1 }
    const st = {
      ...s,
      wilds: [{ ...s.wilds[0]!, hp: 0 }],
      player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, skippedWildIds: [1], team: [nearLevelUp] },
    }
    const r = resolveConsequences(st, deps)
    expect(r.events.some((e) => e.type === 'levelUp')).toBe(true)
    expect(r.state.player.skippedWildIds).toEqual([])
  })
})
