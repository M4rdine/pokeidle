/**
 * O Reviver: o que transforma "a caçada acabou" em "custou caro".
 *
 * Time inteiro caído PARA a hunt e manda todo mundo ao Centro — foi o defeito mais caro que a
 * medição de balanceamento encontrou, porque a caçada vira ida e volta e o jogador que estava
 * fora perde as horas seguintes. O motor tinha duas respostas para "estou ferido" (poção e voltar
 * ao Centro) e nenhuma para "caí".
 *
 * A regra é de ÚLTIMO RECURSO, e isso é o desenho: o Reviver só entra quando não sobrou nenhum
 * Pokémon de pé. Usá-lo antes disso gastaria um item caro para evitar uma troca que é de graça.
 */
import { hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../src/engine/create.js'
import { resolveConsequences } from '../../src/engine/step.js'
import type { EngineDeps, HuntState, PokemonState } from '../../src/engine/types.js'
import { miniDeps } from './fixtures/mini.js'

const registry = loadRegistry()
const deps = (): EngineDeps => ({ registry, hunt: miniDeps().hunt, rng: miniDeps().rng })

const membro = (nome: string, i: number, hp: number): PokemonState => {
  const hpMax = hpAt(registry.species.get(nome)!.baseStats.hp, 20)
  return { id: `p${i}`, speciesName: nome, level: 20, xp: xpForLevel('medium-slow', 20), hp, hpMax }
}

const estado = (time: readonly PokemonState[], inventory: Record<string, number>): HuntState => ({
  huntId: 'x', sessionId: 'rev', tick: 0,
  player: {
    team: time, activeIndex: 0, position: { x: 0, y: 0 }, path: [],
    mode: 'fighting', targetWildId: null, healingUntilTick: null, cooldowns: {}, skippedWildIds: [],
  },
  wilds: [], box: [], respawns: [], nextWildId: 1,
  trainer: { xp: 0, gold: 0 }, inventory, settings: defaultSettings(),
})

const tipos = (r: { events: readonly { type: string }[] }) => r.events.map((e) => e.type)

describe('Reviver', () => {
  it('com o time todo caído e um Reviver na bolsa, a caçada CONTINUA', () => {
    const time = [membro('charizard', 0, 0), membro('venusaur', 1, 0)]
    const r = resolveConsequences(estado(time, { revive: 2 }), deps())

    expect(tipos(r)).toContain('revived')
    expect(tipos(r)).not.toContain('stopped')
    expect(r.state.player.mode).not.toBe('stopped')
    expect(r.state.inventory['revive']).toBe(1)
  })

  it('o revivido volta com metade do HP, e é ele que entra em campo', () => {
    const time = [membro('charizard', 0, 0), membro('venusaur', 1, 0)]
    const r = resolveConsequences(estado(time, { revive: 1 }), deps())
    const ativo = r.state.player.team[r.state.player.activeIndex]!

    expect(ativo.hp).toBe(Math.ceil(ativo.hpMax / 2))
    expect(ativo.hp).toBeGreaterThan(0)
  })

  it('o Reviver Máximo devolve o HP inteiro', () => {
    const time = [membro('charizard', 0, 0)]
    const r = resolveConsequences(estado(time, { 'max-revive': 1 }), deps())
    const ativo = r.state.player.team[0]!

    expect(ativo.hp).toBe(ativo.hpMax)
    expect(r.state.inventory['max-revive']).toBe(0)
  })

  it('usa o MAIS FRACO que resolve: com os dois na bolsa, gasta o comum', () => {
    // Mesma regra da poção. Gastar o caro quando o barato serve é o erro que o jogador não vê
    // acontecer, porque ele está fora da tela quando acontece.
    const time = [membro('charizard', 0, 0)]
    const r = resolveConsequences(estado(time, { revive: 1, 'max-revive': 1 }), deps())

    expect(r.state.inventory['revive']).toBe(0)
    expect(r.state.inventory['max-revive']).toBe(1)
  })

  it('sem Reviver, a caçada para como antes', () => {
    const time = [membro('charizard', 0, 0)]
    const r = resolveConsequences(estado(time, { potion: 9 }), deps())

    expect(tipos(r)).toContain('stopped')
    expect(r.state.player.mode).toBe('stopped')
  })

  it('com alguém de pé, o Reviver NÃO é gasto: trocar é de graça', () => {
    /*
     * O ponto do desenho. Reviver é caro e a troca não custa nada — usá-lo enquanto há um
     * Pokémon inteiro no banco seria queimar item para evitar o que o motor já faz sozinho.
     */
    const time = [membro('charizard', 0, 0), membro('venusaur', 1, 200)]
    const r = resolveConsequences(estado(time, { revive: 3 }), deps())

    expect(tipos(r)).toContain('switched')
    expect(tipos(r)).not.toContain('revived')
    expect(r.state.inventory['revive']).toBe(3)
  })
})
