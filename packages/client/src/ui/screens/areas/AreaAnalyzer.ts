/**
 * O detalhe de uma área: uma linha por espécie, com o que ela vale e o que ela custa.
 *
 * QUATRO COLUNAS, e não sete. Eram Espécie, XP, Ouro, Tempo, Captura, Confronto e Drops, num
 * painel de 400 px — o confronto e os drops saíam CORTADOS na borda, e ninguém lê o que não vê.
 * O que caiu e por quê:
 *
 *  - **Tempo** saiu. Ele é derivado do dano do time, então dentro de uma área ele é praticamente
 *    o mesmo número em todas as linhas: "1,6s / 1,6s / 1,6s" é uma coluna que não separa nada.
 *  - **Confronto** virou etiqueta ao lado do nome. Ele é um atributo da espécie, não um valor a
 *    comparar em coluna — e como palavra solta numa célula estreita ele quebrava em duas linhas.
 *  - **Drops** desceu para uma linha abaixo da tabela. São poucos e repetidos entre espécies; em
 *    coluna, eram a célula mais larga a serviço do dado menos decisivo.
 *
 * Sobra a coluna que decide: quanto rende, quanto paga, e qual a chance de capturar.
 */
import type { AreaEstimate } from '@pokeidle/shared'
import type { AtlasData } from '../../../scene/atlas.js'
import { el, typeBadge } from '../../dom.js'
import { spriteThumb } from '../../sprite-css.js'
import { compact, matchupClass, matchupLabel, percent } from './format.js'

interface Props {
  readonly estimate: AreaEstimate
  /** Nome legível do item; o id cru não diz nada a quem joga. */
  readonly nomeDoItem: (id: string) => string
  readonly atlas: AtlasData
  readonly tiposDe: (species: string) => readonly string[]
  readonly temNaPokedex: (species: string) => boolean
  /** Bônus da bola usada no cálculo da captura; a nota diz qual é. */
  readonly ballBonus: number
}

const cabecalho = (): HTMLElement => el('tr', {},
  el('th', { scope: 'col' }, 'Espécie'),
  el('th', { scope: 'col', class: 'num' }, 'XP'),
  el('th', { scope: 'col', class: 'num' }, 'Ouro'),
  el('th', { scope: 'col', class: 'num' }, 'Captura'))

const BOLA_PADRAO = 'Poké Bola'

export function areaAnalyzer({ estimate, atlas, tiposDe, temNaPokedex, ballBonus, nomeDoItem }: Props): HTMLElement {
  // O nível é o mesmo em todas as linhas (é a média da área): como legenda ele informa, como
  // coluna ele só repetia o mesmo número e tomava a largura de quem varia.
  const nivel = estimate.species[0]?.level
  const linhas = estimate.species.map((s) => {
    const sprite = spriteThumb(atlas, s.speciesName)
    const nova = !temNaPokedex(s.speciesName)
    return el('tr', { class: nova ? 'especie-nova' : '' },
      el('th', { scope: 'row' },
        el('span', { class: 'especie-nome' }, sprite, s.speciesName),
        ...tiposDe(s.speciesName).map(typeBadge),
        nova ? el('span', { class: 'area-missing' }, 'falta') : null,
        // O confronto é o aviso de perigo da linha, e vem junto do nome: quem lê "dratini
        // desvantagem" já sabe que não é por ali, sem varrer até a sétima coluna.
        el('span', { class: `matchup ${matchupClass(s.matchup)}` }, matchupLabel(s.matchup))),
      el('td', { class: 'num' }, compact(s.xpPerDefeat)),
      el('td', { class: 'num' }, compact(s.goldPerDefeat)),
      el('td', { class: 'num' }, percent(s.captureChance)))
  })

  /** Os drops de todas as espécies, uma linha só, sem repetir o que é igual entre elas. */
  const porItem = new Map<string, number>()
  for (const s of estimate.species) {
    for (const d of s.drops) porItem.set(d.item, Math.max(porItem.get(d.item) ?? 0, d.chance))
  }
  const drops = porItem.size === 0 ? null : el('p', { class: 'drops' },
    el('span', { class: 'drops-rotulo' }, 'Drops'),
    ...[...porItem].map(([item, chance]) =>
      el('span', { class: 'drop' }, nomeDoItem(item), el('span', { class: 'muted' }, ` ${percent(chance)}`))))

  const nota = el('p', { class: 'analyzer-note muted' },
    nivel === undefined ? '' : `Selvagens no nível ${nivel}, a média da área. `,
    `XP e ouro por derrota estimados com o seu time atual; a captura, com ${ballBonus > 1 ? 'a melhor bola do inventário' : BOLA_PADRAO}`,
    ' e o HP em 30%. A caçada real varia com a sorte dos golpes.')

  return el('div', { class: 'area-analyzer' },
    el('table', { class: 'analyzer-table' },
      el('thead', {}, cabecalho()),
      el('tbody', {}, ...linhas)),
    drops,
    nota)
}
