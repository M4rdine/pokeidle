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
  it('searching → walking → fighting: fecha a distância e engaja, andando pelo caminho', () => {
    /*
     * A coreografia exata foi trocada por um limite, e de propósito. O teste antigo cravava
     * "quatro tiques, três passos, parando em (3,0)": isso só valia num mundo de estátuas, onde
     * a presa esperava. Com selvagens que andam — e com o jogador atirando de longe quando tem
     * golpe especial — o número de passos depende do encontro. O que continua verdade, e é o que
     * importa, é que ele ACHA, FECHA e ENGAJA sem se perder no caminho.
     */
    const deps = miniDeps()
    const r = run(baseState({}, deps), deps, 6)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.events.filter((e) => (e as { type: string }).type === 'moved').length).toBeGreaterThan(0)
    expect(r.state.tick).toBe(6)
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
  it('Centro cercado de selvagens NÃO para a hunt: o bicho sai do caminho', () => {
    /*
     * Esta regra foi invertida de propósito, e a inversão veio de medir.
     *
     * Antes, selvagem contava como parede na volta ao Centro, e o motor encerrava com `no-route`.
     * Nos mapas recortados do mundo OpenTibia isso virou desastre: num corredor de caverna não há
     * desvio, um bicho na passagem zerava a rota e a caçada ACABAVA com o time inteiro de pé —
     * três cavernas paravam assim, com uma derrota em dez minutos.
     *
     * Agora o caminho é traçado ignorando os selvagens, e quem resolve o encontro é o passo a
     * passo: o jogador espera o bicho sair do tile, que é o que um jogador faria.
     */
    const deps = miniDeps()
    const s = baseState({}, deps)
    const blockers = [
      { ...s.wilds[0]!, id: 1, position: { x: 3, y: 4 } },
      { ...s.wilds[0]!, id: 2, position: { x: 4, y: 3 } },
    ]
    const st = { ...s, wilds: blockers, player: { ...s.player, mode: 'returning' as const } }
    const r = step(st, deps)
    expect(r.events.some((e) => e.type === 'stopped')).toBe(false)
    expect(r.state.player.mode).toBe('returning')
  })

  it('mas o isolamento GEOMÉTRICO ainda para: sem rota é sem rota', () => {
    // O `no-route` continua existindo para o que ele sempre quis cobrir — parede, não bicho.
    const deps = miniDeps()
    const hunt = { ...deps.hunt, layers: { ...deps.hunt.layers, blocking: deps.hunt.layers.blocking.map((_, i) => i === 3 * 5 + 4 || i === 4 * 5 + 3) } }
    const comParede = { ...deps, hunt }
    const s = baseState({}, comParede)
    const st = { ...s, wilds: [], player: { ...s.player, mode: 'returning' as const } }
    const r = step(st, comParede)
    expect(r.events).toEqual([{ type: 'stopped', tick: 0, reason: 'no-route' }])
    expect(r.state.player.mode).toBe('stopped')
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
    // returnHpPercent fixado em 30 aqui (o padrão real é 50 desde a fase 3a) para exercitar os
    // dois limiares como valores distintos.
    expect(resolveConsequences(at(9, {}, { returnHpPercent: 30 }), deps).events).toEqual([]) // 45 %: < 50 mas sem poção; ≥ 30
    const r = resolveConsequences(at(5, {}, { returnHpPercent: 30 }), deps) // 25 % < 30
    expect(r.state.player.mode).toBe('returning')
    expect(r.events).toEqual([{ type: 'returning', tick: 0 }])
  })
  it('abaixo do retorno COM poção usa poção e não volta', () => {
    const r = resolveConsequences(at(5, { potion: 1 }), deps)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.events[0]?.type).toBe('itemUsed')
  })
  it('limiar exato (hp = 50 % de 20): o < é estrito, então nada acontece com ou sem poção', () => {
    const withPotion = resolveConsequences(at(10, { potion: 1 }), deps) // 50 % não é < potionHpPercent(50) nem < returnHpPercent(50)
    expect(withPotion.events).toEqual([])
    expect(withPotion.state.player.team[0]!.hp).toBe(10)
    const withoutPotion = resolveConsequences(at(10, {}, { returnHpPercent: 50 }), deps)
    expect(withoutPotion.events).toEqual([])
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
  it('o selvagem não revida no tick em que o jogador entra no alcance dele', () => {
    /*
     * A regra continua; o que mudou é o que a dispara. Antes era o ENGAJAMENTO — o jogador
     * escolher o alvo e encostar. Agora é o ALCANCE, medido contra onde o jogador estava no
     * início do tique, e vale igual para o golpe que encosta e para o que viaja.
     *
     * O caso direto, com as duas posições controladas, mora em `wild-ai.test.ts`; aqui fica a
     * versão de ponta a ponta, passando pelo `step`: em nenhum tique um selvagem ataca de um
     * lugar de onde ele não alcançaria o jogador ANTES de o jogador se mexer.
     */
    const deps = miniDeps()
    let s = baseState({}, deps)
    for (let i = 0; i < 12; i++) {
      const antes = s.player.position
      const r = step(s, deps)
      for (const e of r.events) {
        if (e.type !== 'attack' || e.attacker !== 'wild') continue
        const w = s.wilds.find((x) => String(x.id) === e.attackerId)!
        const distanciaAntes = Math.abs(w.position.x - antes.x) + Math.abs(w.position.y - antes.y)
        // `leech-life` é físico: alcance 1. Nenhum ataque pode sair de mais longe do que isso.
        expect(distanciaAntes, `tique ${i}`).toBeLessThanOrEqual(1)
      }
      s = r.state
    }
  })
  it('kill no tick de chegada: selvagem com 1 de HP morre no primeiro ataque e nunca revida', () => {
    const deps = miniDeps()
    let s = baseState({}, deps)
    // Sem bolas: força playerAttack em vez de attemptCapture (hp% baixo dispararia captura).
    s = { ...s, inventory: {}, wilds: s.wilds.map((w) => ({ ...w, hp: 1 })) }
    const events: unknown[] = []
    for (let i = 0; i < 8; i++) {
      const r = step(s, deps)
      s = r.state
      events.push(...r.events)
    }
    const asType = (e: unknown) => (e as { type: string }).type
    expect(events.some((e) => asType(e) === 'wildDefeated')).toBe(true)
    expect(events.filter((e) => asType(e) === 'attack' && (e as { attacker: string }).attacker === 'wild')).toHaveLength(0)
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
