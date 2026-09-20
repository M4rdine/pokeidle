/**
 * O detalhe de uma área: uma linha por espécie, com o que ela vale e o que ela custa. Abre
 * dentro da ficha, logo abaixo da linha escolhida, em vez de num modal — comparar áreas exige
 * poder abrir uma, olhar, fechar e abrir a vizinha sem perder o lugar na lista.
 */
import type { AreaEstimate } from '@pokeidle/shared'
import type { AtlasData } from '../../../scene/atlas.js'
import { el, typeBadge } from '../../dom.js'
import { spriteThumb } from '../../sprite-css.js'
import { compact, matchupClass, matchupLabel, percent, seconds } from './format.js'

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
  el('th', { scope: 'col', class: 'num' }, 'Tempo'),
  el('th', { scope: 'col', class: 'num' }, 'Captura'),
  el('th', { scope: 'col' }, 'Confronto'),
  el('th', { scope: 'col' }, 'Drops'))

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
        nova ? el('span', { class: 'area-missing' }, 'falta') : null),
      el('td', { class: 'num' }, compact(s.xpPerDefeat)),
      el('td', { class: 'num' }, compact(s.goldPerDefeat)),
      el('td', { class: 'num' }, seconds(s.secondsPerDefeat)),
      el('td', { class: 'num' }, percent(s.captureChance)),
      el('td', { class: matchupClass(s.matchup) }, matchupLabel(s.matchup)),
      el('td', { class: 'drops' }, ...s.drops.map((d) =>
        el('span', { class: 'drop' }, nomeDoItem(d.item), el('span', { class: 'muted' }, ` ${percent(d.chance)}`)))))
  })

  const nota = el('p', { class: 'analyzer-note muted' },
    nivel === undefined ? '' : `Selvagens no nível ${nivel}, a média da área. `,
    `XP, ouro e tempo por derrota estimados com o seu time atual; a captura, com ${ballBonus > 1 ? 'a melhor bola do inventário' : BOLA_PADRAO}`,
    ' e o HP em 30%. A caçada real varia com a sorte dos golpes.')

  return el('div', { class: 'area-analyzer' },
    el('table', { class: 'analyzer-table' },
      el('thead', {}, cabecalho()),
      el('tbody', {}, ...linhas)),
    nota)
}
