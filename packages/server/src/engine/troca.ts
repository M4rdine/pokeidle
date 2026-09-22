import { availableMoves, bestMove, expectedDamage, type Registry } from '@pokeidle/shared'
import { combatantOf } from './combat.js'
import { VANTAGEM_MINIMA_DE_TROCA } from './constants.js'
import { choosePotion } from './items.js'
import type { EngineDeps, Event, HuntState, PokemonState, StepResult, WildState } from './types.js'

/**
 * A troca proativa de Pokémon: o terceiro degrau da escada de decisão, entre "usar poção" e
 * "voltar ao Centro".
 *
 * O motor só trocava quando o ativo CAÍA, e por isso um contra-tipo duro não tinha resposta. Na
 * `usina-velha`, o Thunderbolt do Raichu tirava 83% do HP do Charizard; a resposta do motor era
 * gastar poção — 20% de cura contra 83% de dano por golpe — até cair ou desistir e caminhar até o
 * Centro. As duas ferramentas que ele tinha resolvem o mesmo problema (estou ferido) e nenhuma
 * resolve o outro (este confronto é perdido).
 *
 * A distinção que este módulo faz é MACHUCADO contra MATCHUP, e ela decide o desenho inteiro:
 *
 *  - O gatilho tem DUAS partes, e a segunda foi cobrada pela medição. A primeira é o machucado, o
 *    mesmo limiar da poção — sem ela o motor viraria um otimizador que troca de Pokémon a cada
 *    encontro pelo melhor tipo, e aí o time deixaria de ser um time para virar tabela de consulta.
 *    A segunda é a poção NÃO ACOMPANHAR o golpe: enquanto ela repõe o que o selvagem tira, curar é
 *    mais barato e mantém em campo quem está matando.
 *  - A COMPARAÇÃO é de matchup, e por isso sempre no HP CHEIO. No HP atual qualquer companheiro
 *    inteiro "aguenta mais" que um ativo ferido, e o motor rodaria o time todo em vez de curar —
 *    exatamente o contrário do que se quer: poção é mais barata que trocar.
 */

const golpeDoSelvagem = (registry: Registry, wild: WildState, alvo: PokemonState) => {
  const especie = registry.species.get(wild.speciesName)
  if (!especie) throw new Error(`espécie ${wild.speciesName} não existe no registro`)
  const atacante = combatantOf(registry, wild.speciesName, wild.level)
  const defensor = combatantOf(registry, alvo.speciesName, alvo.level)
  // Todos os golpes da espécie, e não só os fora de recarga: o que se mede é o confronto, não o
  // turno. A recarga passa em segundos; o matchup vale pela luta inteira.
  const move = bestMove(availableMoves(especie, wild.level, registry.moves), atacante, defensor, registry.typeChart)
  return move && { atacante, defensor, move }
}

/**
 * Golpes do selvagem que `membro` aguenta, medido no HP CHEIO.
 *
 * `Infinity` quando o selvagem não tem como feri-lo — é o matchup perfeito, e o número certo para
 * a comparação: nada supera quem não pode ser ferido.
 */
function golpesAteCair(registry: Registry, wild: WildState, membro: PokemonState): number {
  const g = golpeDoSelvagem(registry, wild, membro)
  if (!g) return Number.POSITIVE_INFINITY
  const dano = expectedDamage(g.atacante, g.defensor, g.move, registry.typeChart)
  return dano <= 0 ? Number.POSITIVE_INFINITY : membro.hpMax / dano
}

/**
 * O dano esperado do selvagem no ativo. É o número que decide se a poção dá conta.
 */
function danoNoAtivo(registry: Registry, wild: WildState, ativo: PokemonState): number {
  const g = golpeDoSelvagem(registry, wild, ativo)
  return g ? expectedDamage(g.atacante, g.defensor, g.move, registry.typeChart) : 0
}

/**
 * Se a poção que o motor usaria repõe pelo menos o que o selvagem tira por golpe.
 *
 * Este é o gatilho, e a primeira versão errou justamente aqui. Ela trocava sempre que o ativo
 * estivesse ferido, e a medição com time subnivelado mostrou o preço: nas áreas em que não havia
 * queda nenhuma a evitar, a troca custou 5,7% do XP/h na `trilha-pedregosa` e 3,7% na
 * `praia-longa` — porque trocou o atacante forte por um mais duro que mata mais devagar, para
 * resolver um problema que a poção já resolvia.
 *
 * Quando a cura repõe o golpe, curar é a resposta certa e mais barata: mantém em campo quem está
 * matando. A troca só é melhor quando a cura NÃO ACOMPANHA — e aí ela deixa de ser preferência e
 * vira a única saída que não é caminhar até o Centro.
 */
function curaAcompanha(state: HuntState, registry: Registry, ativo: PokemonState, dano: number): boolean {
  const potion = choosePotion(state, registry, ativo)
  if (!potion) return false
  return Math.ceil((ativo.hpMax * potion.healPercent) / 100) >= dano
}

/** Se `membro` consegue tirar HP do selvagem. Quem não fere transforma queda em travamento. */
function feriria(registry: Registry, membro: PokemonState, wild: WildState): boolean {
  const especie = registry.species.get(membro.speciesName)
  if (!especie) throw new Error(`espécie ${membro.speciesName} não existe no registro`)
  const atacante = combatantOf(registry, membro.speciesName, membro.level)
  const defensor = combatantOf(registry, wild.speciesName, wild.level)
  const move = bestMove(availableMoves(especie, membro.level, registry.moves), atacante, defensor, registry.typeChart)
  return move !== undefined && expectedDamage(atacante, defensor, move, registry.typeChart) > 0
}

/**
 * O índice do companheiro que deve entrar, ou `null` para ficar como está.
 *
 * Exportada para teste direto: a decisão tem cinco condições e cada uma existe por um motivo
 * distinto; medi-las pelo resultado de uma caçada inteira diria "rendeu menos" sem dizer qual
 * delas quebrou.
 */
export function escolherTroca(state: HuntState, deps: EngineDeps, wild: WildState): number | null {
  const { registry } = deps
  const ativo = state.player.team[state.player.activeIndex]
  if (!ativo || ativo.hp <= 0) return null
  // O gatilho é o mesmo da poção: enquanto o ativo está inteiro, não há o que responder.
  if ((ativo.hp / ativo.hpMax) * 100 >= state.settings.potionHpPercent) return null

  const dano = danoNoAtivo(registry, wild, ativo)
  if (dano <= 0) return null
  if (curaAcompanha(state, registry, ativo, dano)) return null

  const resistencia = ativo.hpMax / dano

  let melhor: { indice: number; resistencia: number } | null = null
  state.player.team.forEach((membro, indice) => {
    if (indice === state.player.activeIndex || membro.hp <= 0) return
    // Companheiro já ferido entraria só para cair em seguida — e aí a troca teria custado um
    // Pokémon em vez de salvar um. O piso é o mesmo limiar de voltar ao Centro.
    if ((membro.hp / membro.hpMax) * 100 < state.settings.returnHpPercent) return
    if (!feriria(registry, membro, wild)) return
    const r = golpesAteCair(registry, wild, membro)
    if (melhor === null || r > melhor.resistencia) melhor = { indice, resistencia: r }
  })

  if (melhor === null) return null
  const escolhido: { indice: number; resistencia: number } = melhor
  // A margem existe para a troca ser uma RESPOSTA e não um tique: sem ela, uma diferença de 1% de
  // resistência bastaria, e o motor passaria a caçada trocando de Pokémon.
  return escolhido.resistencia >= resistencia * VANTAGEM_MINIMA_DE_TROCA ? escolhido.indice : null
}

/** Aplica a troca, se ela for o caso. Roda entre o desmaio e a poção, na cadeia de consequências. */
export function resolveTroca(state: HuntState, deps: EngineDeps): StepResult {
  if (state.player.mode !== 'fighting') return { state, events: [] }
  const wild = state.wilds.find((w) => w.id === state.player.targetWildId && w.hp > 0)
  if (!wild) return { state, events: [] }
  const indice = escolherTroca(state, deps, wild)
  if (indice === null) return { state, events: [] }
  const entra = state.player.team[indice]!
  const event: Event = { type: 'switched', tick: state.tick, pokemonId: entra.id }
  return {
    // Cooldowns e pulados zeram como no desmaio: a recarga é do Pokémon que saiu, e o que entra
    // pode ter golpe para um selvagem que o anterior não tocava.
    state: { ...state, player: { ...state.player, activeIndex: indice, cooldowns: {}, skippedWildIds: [] } },
    events: [event],
  }
}
