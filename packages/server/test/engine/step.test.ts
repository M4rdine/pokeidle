import { describe, expect, it } from 'vitest'
import { xpForLevel } from '@pokeidle/shared'
import { applyPotion, choosePotion } from '../../src/engine/items.js'
import { pickTarget, stepPlayer } from '../../src/engine/player.js'
import { resolveConsequences, step } from '../../src/engine/step.js'
import type { HuntState } from '../../src/engine/types.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

function run(state: HuntState, deps = miniDeps(), ticks = 1) {
  let cur = { state, events: [] as readonly unknown[] }
  for (let i = 0; i < ticks; i++) { const r = step(cur.state, deps); cur = { state: r.state, events: [...cur.events, ...r.events] } }
  return cur
}

const fixed = (v: number) => ({ next: () => v, int: (min: number) => min, state: () => 0 })

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
  it('dois selvagens equidistantes: escolhe o de menor id', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const wilds = [
      { ...s.wilds[0]!, id: 5, position: { x: 2, y: 0 } },
      { ...s.wilds[0]!, id: 3, position: { x: 0, y: 2 } },
    ]
    const t = pickTarget({ ...s, wilds }, deps)
    expect(t).toEqual({ wildId: 3, path: [{ x: 0, y: 1 }] })
  })
  it('selvagem cercado é ignorado; escolhe o outro alcançável', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const surrounded = { ...s.wilds[0]!, id: 9, position: { x: 4, y: 4 } }
    const blockerA = { ...s.wilds[0]!, id: 10, position: { x: 3, y: 4 }, hp: 0 }
    const blockerB = { ...s.wilds[0]!, id: 11, position: { x: 4, y: 3 }, hp: 0 }
    const wilds = [s.wilds[0]!, surrounded, blockerA, blockerB]
    const t = pickTarget({ ...s, wilds }, deps)
    expect(t).toEqual({ wildId: 1, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] })
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

describe('returning sem rota até o Centro', () => {
  it('Centro cercado de selvagens para a hunt com stopped/no-route', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const blockers = [
      { ...s.wilds[0]!, id: 1, position: { x: 3, y: 4 } },
      { ...s.wilds[0]!, id: 2, position: { x: 4, y: 3 } },
    ]
    const st = { ...s, wilds: blockers, player: { ...s.player, mode: 'returning' as const } }
    const r = step(st, deps)
    expect(r.events).toEqual([{ type: 'stopped', tick: 0, reason: 'no-route' }])
    expect(r.state.player.mode).toBe('stopped')
    expect(r.state.player.targetWildId).toBeNull()
    expect(r.state.player.path).toEqual([])
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

describe('poções e limiares', () => {
  const deps = miniDeps()
  const active = (hp: number) => ({ ...charmander5(), hp, hpMax: 20 }) // hpMax fixo: Poção cura 4, Super 10, Hiper 20
  const at = (hp: number, inventory: Record<string, number>, over: Partial<HuntState['settings']> = {}): HuntState => {
    const s = baseState({}, deps)
    return { ...s, inventory, settings: { ...s.settings, ...over }, player: { ...s.player, mode: 'fighting', team: [active(hp)] } }
  }
  it('choosePotion: a mais fraca que cobre; senão a mais forte; senão null', () => {
    expect(choosePotion(at(17, { potion: 1, 'super-potion': 1 }), deps.registry, active(17))?.id).toBe('potion') // faltam 3
    expect(choosePotion(at(5, { potion: 1, 'super-potion': 1 }), deps.registry, active(5))?.id).toBe('super-potion') // faltam 15: nenhuma cobre
    expect(choosePotion(at(5, { potion: 1, 'super-potion': 1, 'hyper-potion': 1 }), deps.registry, active(5))?.id).toBe('hyper-potion') // a Hiper cobre
    expect(choosePotion(at(5, { potion: 3, 'super-potion': 0 }), deps.registry, active(5))?.id).toBe('potion')
    expect(choosePotion(at(5, {}), deps.registry, active(5))).toBeNull()
  })
  it('abaixo de potionHpPercent com poção usa a poção escolhida', () => {
    const r = resolveConsequences(at(9, { potion: 1, 'super-potion': 1 }), deps) // 45 % < 50; faltam 11: nenhuma cobre → Super
    expect(r.state.player.team[0]!.hp).toBe(19)
    expect(r.state.inventory['super-potion'] ?? 0).toBe(0)
    expect(r.state.inventory['potion']).toBe(1)
    expect(r.events).toEqual([{ type: 'itemUsed', tick: 0, itemId: 'super-potion', pokemonId: 'p1', hp: 19 }])
  })
  it('entre os limiares sem poção não faz nada; abaixo do retorno sem poção volta', () => {
    expect(resolveConsequences(at(9, {}), deps).events).toEqual([]) // 45 %: < 50 mas sem poção; ≥ 30
    const r = resolveConsequences(at(5, {}), deps) // 25 % < 30
    expect(r.state.player.mode).toBe('returning')
    expect(r.events).toEqual([{ type: 'returning', tick: 0 }])
  })
  it('abaixo do retorno COM poção usa poção e não volta', () => {
    const r = resolveConsequences(at(5, { potion: 1 }), deps)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.events[0]?.type).toBe('itemUsed')
  })
  it('potionHpPercent 150 com HP cheio não lança nem muda o estado', () => {
    const s = at(20, { potion: 1 }, { potionHpPercent: 150 })
    const r = resolveConsequences(s, deps)
    expect(r.state.player.team).toEqual(s.player.team)
    expect(r.state.inventory).toEqual(s.inventory)
    expect(r.events).toEqual([])
  })
})

describe('quem chega ataca primeiro', () => {
  it('o selvagem só revida no tick seguinte ao engajamento', () => {
    const deps = miniDeps()
    let s = baseState({}, deps)
    let arrival: ReturnType<typeof step> | null = null
    for (let i = 0; i < 10 && !arrival; i++) { const r = step(s, deps); s = r.state; if (r.state.player.mode === 'fighting') arrival = r }
    expect(arrival).not.toBeNull()
    const wildAttacks = (r: ReturnType<typeof step>) => r.events.filter((e) => e.type === 'attack' && e.attacker === 'wild')
    expect(wildAttacks(arrival!)).toHaveLength(0)
    expect(wildAttacks(step(arrival!.state, deps))).toHaveLength(1)
  })
})

describe('hunt parada (bug: eventos repetidos)', () => {
  it('depois de parar, só processa respawns; não repete pokemonFainted/stopped', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const dying = { ...s, player: { ...s.player, mode: 'fighting' as const, team: [{ ...charmander5(), hp: 0 }] } }
    const first = step(dying, deps)
    expect(first.events.map((e) => e.type)).toEqual(['pokemonFainted', 'stopped'])
    expect(first.state.player.mode).toBe('stopped')
    const second = step(first.state, deps)
    const third = step(second.state, deps)
    expect(second.events).toEqual([])
    expect(third.events).toEqual([])
    expect(third.state.player).toEqual(first.state.player)
    expect(third.state.tick).toBe(first.state.tick + 2)
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

describe('derrota e captura no mesmo tick', () => {
  it('selvagem com hp 1 morre no ataque do jogador; nenhum ataque do selvagem no mesmo tick', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = baseState({}, deps)
    const wild = { ...s.wilds[0]!, hp: 1, captureTried: true }
    const st = { ...s, wilds: [wild], player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, position: { x: 3, y: 0 } } }
    const r = step(st, deps)
    const attacks = r.events.filter((e) => e.type === 'attack')
    expect(attacks).toHaveLength(1)
    expect(attacks[0]).toMatchObject({ attacker: 'player' })
    expect(r.events.some((e) => e.type === 'wildDefeated')).toBe(true)
    expect(r.events.some((e) => e.type === 'attack' && (e as { attacker: string }).attacker === 'wild')).toBe(false)
  })
  it('captura acontece no mesmo tick: nenhum ataque do selvagem, modo final searching', () => {
    const deps = { ...miniDeps(), rng: fixed(0) }
    const s = baseState({}, deps)
    const wild = { ...s.wilds[0]!, hp: 3, hpMax: 16 } // 20% do hpMax
    const st = { ...s, wilds: [wild], player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, position: { x: 3, y: 0 } } }
    const r = step(st, deps)
    expect(r.events.some((e) => e.type === 'captured')).toBe(true)
    expect(r.events.some((e) => e.type === 'attack')).toBe(false)
    expect(r.state.player.mode).toBe('searching')
  })
})
