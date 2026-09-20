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
  readonly atlas: AtlasData
  readonly tiposDe: (species: string) => readonly string[]
  readonly temNaPokedex: (species: string) => boolean
}

const cabecalho = (): HTMLElement => el('tr', {},
  el('th', { scope: 'col' }, 'Espécie'),
  el('th', { scope: 'col' }, 'Nível'),
  el('th', { scope: 'col', class: 'num' }, 'XP'),
  el('th', { scope: 'col', class: 'num' }, 'Ouro'),
  el('th', { scope: 'col', class: 'num' }, 'Tempo'),
  el('th', { scope: 'col', class: 'num' }, 'Captura'),
  el('th', { scope: 'col' }, 'Confronto'))

export function areaAnalyzer({ estimate, atlas, tiposDe, temNaPokedex }: Props): HTMLElement {
  const linhas = estimate.species.map((s) => {
    const sprite = spriteThumb(atlas, s.speciesName)
    const nova = !temNaPokedex(s.speciesName)
    return el('tr', { class: nova ? 'especie-nova' : '' },
      el('th', { scope: 'row' },
        el('span', { class: 'especie-nome' }, sprite, s.speciesName),
        ...tiposDe(s.speciesName).map(typeBadge),
        nova ? el('span', { class: 'area-missing' }, 'falta') : null),
      el('td', {}, String(s.level)),
      el('td', { class: 'num' }, compact(s.xpPerDefeat)),
      el('td', { class: 'num' }, compact(s.goldPerDefeat)),
      el('td', { class: 'num' }, seconds(s.secondsPerDefeat)),
      el('td', { class: 'num' }, percent(s.captureChance)),
      el('td', { class: matchupClass(s.matchup) }, matchupLabel(s.matchup)))
  })

  const nota = el('p', { class: 'analyzer-note muted' },
    'XP, ouro e tempo por derrota, estimados com o nível médio da área e o seu time atual. ',
    'A caçada real varia com a sorte dos golpes.')

  return el('div', { class: 'area-analyzer' },
    el('table', { class: 'analyzer-table' },
      el('thead', {}, cabecalho()),
      el('tbody', {}, ...linhas)),
    nota)
}
