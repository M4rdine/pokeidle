/**
 * A pedra no motor: quem evolui, quem não evolui, e o que acontece com o HP.
 *
 * O contrato mais importante aqui é o do ERRO: a pedra errada não é gasta. Cinco mil de ouro
 * sumindo porque o jogador clicou na pedra errada é o tipo de perda que ele não tem como desfazer
 * e não tem como prever.
 */
import { hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../src/engine/create.js'
import { applyIntent } from '../../src/engine/intents.js'
import type { EngineDeps, HuntState, PokemonState } from '../../src/engine/types.js'
import { miniDeps } from './fixtures/mini.js'

const registry = loadRegistry()
const deps = (): EngineDeps => ({ registry, hunt: miniDeps().hunt, rng: miniDeps().rng })

const membro = (nome: string, i: number, fracaoHp = 1): PokemonState => {
  const hpMax = hpAt(registry.species.get(nome)!.baseStats.hp, 20)
  return { id: `p${i}`, speciesName: nome, level: 20, xp: xpForLevel('medium-fast', 20), hp: Math.ceil(hpMax * fracaoHp), hpMax }
}

const estado = (time: readonly PokemonState[], inventory: Record<string, number>): HuntState => ({
  huntId: 'x', sessionId: 'pedra', tick: 0,
  player: {
    team: time, activeIndex: 0, position: { x: 0, y: 0 }, path: [],
    mode: 'fighting', targetWildId: null, healingUntilTick: null, cooldowns: {}, skippedWildIds: [],
  },
  wilds: [], box: [], respawns: [], nextWildId: 1,
  trainer: { xp: 0, gold: 0 }, inventory, settings: defaultSettings(),
})

const usar = (s: HuntState, itemId: string, pokemonId?: string) =>
  applyIntent(s, { type: 'useItem', itemId, ...(pokemonId !== undefined && { pokemonId }) }, deps())

describe('pedra de evolução', () => {
  it('a Pedra do Trovão transforma Pikachu em Raichu e gasta a pedra', () => {
    const r = usar(estado([membro('pikachu', 0)], { 'thunder-stone': 2 }), 'thunder-stone')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.state.player.team[0]!.speciesName).toBe('raichu')
    expect(r.state.inventory['thunder-stone']).toBe(1)
    expect(r.events.map((e) => e.type)).toEqual(['evolved'])
  })

  it('evolui um Pokémon DO BANCO, sem trocar quem está em campo', () => {
    // É o caso normal: ninguém troca o time só para evoluir. Sem o alvo, a pedra cairia no ativo.
    const time = [membro('charizard', 0), membro('pikachu', 1)]
    const r = usar(estado(time, { 'thunder-stone': 1 }), 'thunder-stone', 'p1')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.state.player.team[1]!.speciesName).toBe('raichu')
    expect(r.state.player.team[0]!.speciesName).toBe('charizard')
    expect(r.state.player.activeIndex).toBe(0)
  })

  it('o HP é REESCALADO, não copiado: o evoluído não nasce mais ferido do que estava', () => {
    const r = usar(estado([membro('pikachu', 0, 0.5)], { 'thunder-stone': 1 }), 'thunder-stone')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    const evoluido = r.state.player.team[0]!
    expect(evoluido.hpMax).toBe(hpAt(registry.species.get('raichu')!.baseStats.hp, 20))
    expect(evoluido.hp / evoluido.hpMax).toBeCloseTo(0.5, 1)
  })

  it('a pedra ERRADA não evolui e NÃO É GASTA', () => {
    // O contrato que mais importa: o jogador não pode perder cinco mil de ouro por um clique.
    const s = estado([membro('pikachu', 0)], { 'fire-stone': 1 })
    const r = usar(s, 'fire-stone')
    expect('error' in r).toBe(true)
    if (!('error' in r)) return
    expect(r.error.code).toBe('wrong-stone')
    expect(s.inventory['fire-stone']).toBe(1)
  })

  it('sem a pedra no inventário, recusa sem tocar em nada', () => {
    const r = usar(estado([membro('pikachu', 0)], {}), 'thunder-stone')
    expect('error' in r && r.error.code).toBe('out-of-stock')
  })

  it('o Pokémon que não existe no time é recusado', () => {
    const r = usar(estado([membro('pikachu', 0)], { 'thunder-stone': 1 }), 'thunder-stone', 'nao-existe')
    expect('error' in r && r.error.code).toBe('unknown-pokemon')
  })

  it('usar poção continua funcionando pelo mesmo intent', () => {
    // O tipo do item é que decide o que `useItem` faz; um segundo intent obrigaria o cliente a
    // conhecer a taxonomia do registro.
    const r = usar(estado([membro('pikachu', 0, 0.3)], { potion: 1 }), 'potion')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.events.map((e) => e.type)).toEqual(['itemUsed'])
  })
})
