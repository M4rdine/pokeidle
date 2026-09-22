/**
 * A troca proativa: o terceiro degrau, entre "usar poção" e "voltar ao Centro".
 *
 * O motor só trocava de Pokémon quando o ativo CAÍA. Com isso, um contra-tipo duro não tinha
 * resposta nenhuma: na `usina-velha` o Thunderbolt do Raichu tirava 83% do HP do Charizard, e o
 * motor respondia gastando poção atrás de poção num confronto que a poção não alcança — 20% de
 * cura contra 83% de dano por golpe — até cair ou desistir e caminhar até o Centro.
 *
 * O que faltava era distinguir MACHUCADO de MATCHUP. Poção resolve machucado; só a troca resolve
 * matchup. Por isso a medida de aqui é sempre no HP CHEIO: no HP atual, qualquer companheiro
 * inteiro "aguenta mais" que um ativo ferido, e o motor trocaria o time inteiro em vez de curar.
 */
import { hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../src/engine/create.js'
import { resolveConsequences } from '../../src/engine/step.js'
import { escolherTroca, resolveTroca } from '../../src/engine/troca.js'
import type { EngineDeps, HuntState, PokemonState, WildState } from '../../src/engine/types.js'
import { baseState, miniDeps } from './fixtures/mini.js'

const registry = loadRegistry()

const membro = (nome: string, level: number, i: number, hpFracao = 1): PokemonState => {
  const hpMax = hpAt(registry.species.get(nome)!.baseStats.hp, level)
  return { id: `p${i}`, speciesName: nome, level, xp: xpForLevel('medium-slow', level), hp: Math.ceil(hpMax * hpFracao), hpMax }
}

const selvagem = (nome: string, level: number): WildState => {
  const hpMax = hpAt(registry.species.get(nome)!.baseStats.hp, level)
  return { id: 1, spawnIndex: 0, speciesName: nome, level, hp: hpMax, hpMax, position: { x: 1, y: 0 }, cooldowns: {}, captureTried: false }
}

/** Estado mínimo em combate com o time dado. Não passa pelo mapa: o que se mede aqui é a decisão. */
const emCombate = (time: readonly PokemonState[], over: Partial<HuntState> = {}): HuntState => ({
  huntId: 'x', sessionId: 'troca', tick: 0,
  player: {
    team: time, activeIndex: 0, position: { x: 0, y: 0 }, path: [],
    mode: 'fighting', targetWildId: 1, healingUntilTick: null, cooldowns: {}, skippedWildIds: [],
  },
  wilds: [selvagem('raichu', 56)], box: [], respawns: [], nextWildId: 2,
  // Poção comum, de propósito: 20% de cura contra os 83% que o Thunderbolt do Raichu tira é
  // exatamente o confronto em que curar não acompanha — que é quando a troca existe para agir.
  trainer: { xp: 0, gold: 0 }, inventory: { potion: 9 },
  settings: defaultSettings(),
  ...over,
})

const deps = (): EngineDeps => ({ registry, hunt: miniDeps().hunt, rng: miniDeps().rng })

describe('escolherTroca: por matchup, não por machucado', () => {
  it('o Charizard ferido contra o Raichu dá lugar ao Venusaur, que não é fraco a elétrico', () => {
    // O caso que motivou a feature. Elétrico bate 2× no Charizard (fire/flying) e 2× no Blastoise
    // (water); no Venusaur (grass/poison) é neutro — é o único que aguenta a troca de golpes.
    const time = [membro('charizard', 56, 0, 0.3), membro('blastoise', 56, 1), membro('venusaur', 56, 2)]
    const state = emCombate(time)
    expect(escolherTroca(state, deps(), state.wilds[0]!)).toBe(2)
  })

  it('com o ativo inteiro não troca: a troca é resposta a perigo, não otimização de cada encontro', () => {
    const time = [membro('charizard', 56, 0), membro('blastoise', 56, 1), membro('venusaur', 56, 2)]
    const state = emCombate(time)
    expect(escolherTroca(state, deps(), state.wilds[0]!)).toBeNull()
  })

  it('não troca quando o companheiro também é fraco ao mesmo golpe', () => {
    // Blastoise sofre o mesmo 2× do elétrico: trocar só passaria o problema adiante.
    const time = [membro('charizard', 56, 0, 0.3), membro('blastoise', 56, 1)]
    const state = emCombate(time)
    expect(escolherTroca(state, deps(), state.wilds[0]!)).toBeNull()
  })

  it('ignora o companheiro que também está ferido: ele entraria só para cair em seguida', () => {
    const time = [membro('charizard', 56, 0, 0.3), membro('venusaur', 56, 1, 0.2)]
    const state = emCombate(time)
    expect(escolherTroca(state, deps(), state.wilds[0]!)).toBeNull()
  })

  it('ignora o companheiro que não consegue ferir o selvagem', () => {
    // Trocar por quem aguenta mas não machuca troca uma queda por um travamento: a luta nunca
    // acaba, o selvagem não morre e a caçada para de render.
    const d = miniDeps()
    const gastly: WildState = { id: 1, spawnIndex: 0, speciesName: 'gastly', level: 5, hp: 20, hpMax: 20, position: { x: 1, y: 0 }, cooldowns: {}, captureTried: false }
    const s = baseState({}, d)
    const ferido = { ...s.player.team[0]!, hp: 1 }
    // magnemite só tem `tackle` (normal), e normal não toca em ghost no gráfico da fixture.
    const suporte: PokemonState = { id: 'p2', speciesName: 'magnemite', level: 30, xp: 0, hp: 200, hpMax: 200 }
    const state: HuntState = { ...s, wilds: [gastly], player: { ...s.player, team: [ferido, suporte], mode: 'fighting', targetWildId: 1 } }
    expect(escolherTroca(state, d, gastly)).toBeNull()
  })
})

describe('resolveTroca: o efeito no estado', () => {
  it('troca o ativo, zera os cooldowns e emite `switched`', () => {
    const time = [membro('charizard', 56, 0, 0.3), membro('blastoise', 56, 1), membro('venusaur', 56, 2)]
    const state = emCombate(time, { player: { ...emCombate(time).player, cooldowns: { 'flamethrower': 99 } } })
    const r = resolveTroca(state, deps())
    expect(r.state.player.activeIndex).toBe(2)
    expect(r.state.player.cooldowns).toEqual({})
    expect(r.events).toEqual([{ type: 'switched', tick: 0, pokemonId: 'p2' }])
  })

  it('fora de combate não troca: quem está a caminho ou curando não tem selvagem em campo', () => {
    const time = [membro('charizard', 56, 0, 0.3), membro('venusaur', 56, 1)]
    const base = emCombate(time)
    const state: HuntState = { ...base, player: { ...base.player, mode: 'searching', targetWildId: null } }
    expect(resolveTroca(state, deps()).events).toEqual([])
  })

  it('limpa os selvagens pulados: o novo ativo pode ter golpe para quem o anterior não tocava', () => {
    const time = [membro('charizard', 56, 0, 0.3), membro('venusaur', 56, 1)]
    const base = emCombate(time)
    const state: HuntState = { ...base, player: { ...base.player, skippedWildIds: [7, 8] } }
    expect(resolveTroca(state, deps()).state.player.skippedWildIds).toEqual([])
  })
})

describe('a escada de decisão', () => {
  it('trocar vem ANTES de curar: no confronto perdido a poção seria jogada fora', () => {
    /*
     * O degrau que a feature inteira existe para criar. Com o Charizard a 30% contra o Raichu, o
     * motor gastava Hiper Poção num confronto em que o selvagem tira 83% por golpe — cura que a
     * luta desfaz no turno seguinte. Agora ele passa a vez ao Venusaur e o estoque fica intacto.
     */
    const time = [membro('charizard', 56, 0, 0.3), membro('venusaur', 56, 1)]
    const r = resolveConsequences(emCombate(time), deps())
    expect(r.state.player.activeIndex).toBe(1)
    expect(r.state.inventory['potion']).toBe(9)
    expect(r.events.map((e) => e.type)).toEqual(['switched'])
  })

  it('sem companheiro melhor, a poção continua sendo a resposta', () => {
    // A troca não substitui a cura: ela só cobre o caso que a cura não cobria.
    const time = [membro('charizard', 56, 0, 0.3), membro('blastoise', 56, 1)]
    const r = resolveConsequences(emCombate(time), deps())
    expect(r.state.player.activeIndex).toBe(0)
    expect(r.state.inventory['potion']).toBe(8)
    expect(r.events.map((e) => e.type)).toEqual(['itemUsed'])
  })

  it('quando a poção REPÕE o golpe, cura e mantém em campo quem está matando', () => {
    /*
     * O portão que a primeira versão não tinha, e que a medição cobrou. Sem ele a troca disparava
     * em qualquer luta com o ativo ferido, inclusive nas que a poção resolvia: com time
     * subnivelado isso custou 5,7% do XP/h na `trilha-pedregosa` e 3,7% na `praia-longa`, sem
     * evitar queda nenhuma, porque trocou o atacante forte por um mais duro que mata mais devagar.
     *
     * Com Hiper Poção na bolsa o mesmo confronto do primeiro caso deixa de pedir troca: a cura
     * acompanha o golpe, e curar é mais barato que trocar.
     */
    const time = [membro('charizard', 56, 0, 0.3), membro('venusaur', 56, 1)]
    const r = resolveConsequences(emCombate(time, { inventory: { 'hyper-potion': 9 } }), deps())
    expect(r.state.player.activeIndex).toBe(0)
    expect(r.events.map((e) => e.type)).toEqual(['itemUsed'])
  })

  it('sem poção nenhuma, a troca é a única saída que não é caminhar até o Centro', () => {
    const time = [membro('charizard', 56, 0, 0.3), membro('venusaur', 56, 1)]
    const r = resolveConsequences(emCombate(time, { inventory: {} }), deps())
    expect(r.state.player.activeIndex).toBe(1)
    expect(r.events.map((e) => e.type)).toEqual(['switched'])
  })
})
