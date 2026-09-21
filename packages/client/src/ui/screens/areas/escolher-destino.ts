/**
 * Escolher destino: abas de região, o mapa, e o analisador ao lado.
 *
 * É UM componente, usado pelo modal do Mapa e pela tela de áreas. Eram dois desenhos diferentes
 * da mesma decisão — e o da tela era o ruim: mapa em cima, depois dezesseis LINHAS de ficha, e o
 * detalhe abrindo como SANFONA dentro da lista. Três formas de ver a mesma área na mesma tela,
 * empurrando o mapa para fora da primeira dobra justamente onde ele decide.
 *
 * A regra que sobrou: **o mapa é a interface**. Escolher onde caçar é uma decisão sobre o mundo,
 * e o mundo se vê de relance. O analisador responde depois da escolha, num painel fixo ao lado,
 * que não empurra nada e não muda de lugar conforme a área.
 */
import { estimateArea, type TeamMember } from '@pokeidle/shared'
import type { AppContext } from '../../../app-context.js'
import { el } from '../../dom.js'
import { areaAnalyzer } from './AreaAnalyzer.js'
import { mapaRegiao, type AreaNoMapa } from './MapaRegiao.js'

/** Melhor bola do inventário, em bônus de captura. Sem inventário carregado, a Poké Bola. */
export const BALL_BONUS = 1

export interface DadosDoTreinador {
  readonly team: readonly TeamMember[]
  readonly caught: readonly string[]
}

interface Props {
  readonly ctx: AppContext
  readonly regiaoId: string
  readonly areaId: string | null
  /** `null` enquanto o time não chegou: distingue "ainda não sei" de "seu time não fere". */
  readonly dados: DadosDoTreinador | null
  readonly erro: string
  readonly aoTrocarRegiao: (id: string) => void
  readonly aoEscolherArea: (id: string | null) => void
  /** O que o botão de ação faz. Devolver `null` esconde o botão — área atual, área travada. */
  readonly acao: (area: AreaNoMapa) => HTMLElement | null
}

/** As áreas da região que o servidor conhece, já com a estimativa para o time de agora. */
function areasDaRegiao(ctx: AppContext, regiaoId: string, dados: DadosDoTreinador | null): readonly AreaNoMapa[] {
  const regiao = ctx.registry.regions.get(regiaoId)
  if (!regiao) return []
  return regiao.areas.flatMap((area): AreaNoMapa[] => {
    const hunt = ctx.session.get().hunts.find((h) => h.id === area.id)
    if (!hunt) return []
    return [{
      id: area.id, name: hunt.name, minLevel: hunt.minLevel, maxLevel: hunt.maxLevel,
      minTrainerLevel: hunt.minTrainerLevel, locked: hunt.locked, species: area.species,
      rarity: area.rarity, noMapa: area.noMapa,
      estimate: estimateArea({
        registry: ctx.registry, area,
        team: dados?.team ?? [], caught: dados?.caught ?? [], ballBonus: BALL_BONUS,
      }),
    }]
  })
}

export function escolherDestino(props: Props): HTMLElement {
  const { ctx, regiaoId, areaId, dados, erro } = props
  const regioes = [...ctx.registry.regions.values()].sort((a, b) => a.order - b.order)
  const areas = areasDaRegiao(ctx, regiaoId, dados)
  const escolhida = areas.find((a) => a.id === areaId)

  const abas = el('div', { class: 'mapa-abas', role: 'tablist' },
    ...regioes.map((r) => {
      const portao = ctx.registry.unlocks.regions[r.id] ?? 0
      const ativa = r.id === regiaoId
      const aba = el('button', {
        type: 'button', role: 'tab', class: `mapa-aba${ativa ? ' tab-active' : ''}`,
        'aria-selected': ativa ? 'true' : 'false',
      }, el('span', {}, r.name), el('span', { class: 'mapa-aba-nivel' }, `nv ${Math.max(1, portao)}`))
      // Trocar de região limpa a área escolhida: um analisador de Kanto ao lado do mapa das
      // Terras Altas seria um número certo apontando para o lugar errado.
      aba.addEventListener('click', () => props.aoTrocarRegiao(r.id))
      return aba
    }))

  const tiposDe = (species: string): readonly string[] => ctx.registry.species.get(species)?.types ?? []
  const temNaPokedex = (species: string): boolean => dados?.caught.includes(species) ?? false
  const nomeDoItem = (id: string): string => ctx.registry.items.get(id)?.name ?? id

  const analise = escolhida === undefined
    ? el('aside', { class: 'mapa-analise panel' },
        el('p', { class: 'cabeca cabeca-barra' }, 'Analisador'),
        el('p', { class: 'mapa-analise-vazio muted' }, 'Escolha uma área no mapa para ver o que ela rende.'))
    : el('aside', { class: 'mapa-analise panel' },
        el('div', { class: 'cabeca-barra mapa-analise-topo' },
          el('h3', {}, escolhida.name),
          el('span', { class: 'chip chip-nivel' }, `nv ${escolhida.minLevel}–${escolhida.maxLevel}`)),
        el('div', { class: 'mapa-analise-corpo' },
          dados === null
            ? el('p', { class: 'muted', 'aria-busy': 'true' }, 'Medindo com o seu time…')
            : areaAnalyzer({ estimate: escolhida.estimate, atlas: ctx.atlas, tiposDe, temNaPokedex, ballBonus: BALL_BONUS, nomeDoItem }),
          props.acao(escolhida),
          erro ? el('p', { class: 'form-error', role: 'alert' }, erro) : null))

  const regiao = ctx.registry.regions.get(regiaoId)
  return el('div', { class: 'mapa-modal' },
    abas,
    el('div', { class: 'mapa-palco' },
      regiao && areas.length > 0
        ? mapaRegiao({
            regiaoId: regiao.id, regiaoNome: regiao.name, townMapId: regiao.townMap,
            atlas: ctx.atlas, areas, selecionada: areaId,
            aoEscolher: (id) => props.aoEscolherArea(areaId === id ? null : id),
          })
        : el('p', { class: 'muted' }, 'Esta região ainda não tem áreas liberadas.'),
      analise))
}
