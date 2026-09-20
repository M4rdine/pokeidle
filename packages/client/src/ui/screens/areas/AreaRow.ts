/**
 * Uma linha da ficha de áreas. Colunas de largura fixa, iguais em todas as linhas: a tarefa aqui
 * é comparar oito áreas de relance, e comparar é ler a mesma coluna de cima a baixo. O corpo da
 * linha é um botão que abre o detalhe; "Caçar" fica fora dele, porque botão dentro de botão não
 * existe em HTML e quebra o leitor de tela.
 */
import type { AreaEstimate } from '@pokeidle/shared'
import type { AtlasData } from '../../../scene/atlas.js'
import { el, typeBadge } from '../../dom.js'
import { spriteThumb } from '../../sprite-css.js'
import { compact, matchupClass, matchupLabel } from './format.js'

export interface AreaView {
  readonly id: string
  readonly name: string
  readonly minLevel: number
  readonly maxLevel: number
  readonly minTrainerLevel: number
  readonly locked: boolean
  readonly species: readonly string[]
  readonly estimate: AreaEstimate
}

interface Props {
  readonly area: AreaView
  readonly atlas: AtlasData
  readonly tipoDe: (species: string) => string
  readonly selecionada: boolean
  readonly onSelect: (id: string) => void
  readonly onStart: (id: string, botao: HTMLElement) => void
}

/** Até quatro sprites; acima disso o excedente vira contagem, para a coluna não crescer. */
const MAX_SPRITES = 4
const MAX_TIPOS = 3

function especies(area: AreaView, atlas: AtlasData, tipoDe: (s: string) => string): HTMLElement {
  const mostrar = area.species.slice(0, MAX_SPRITES)
  const sobra = area.species.length - mostrar.length
  const icones = mostrar.map((nome) => {
    const thumb = spriteThumb(atlas, nome)
    thumb.setAttribute('title', nome)
    return thumb
  })
  const tipos = [...new Set(area.species.map(tipoDe))].slice(0, MAX_TIPOS).map(typeBadge)
  return el('span', { class: 'area-species' },
    el('span', { class: 'area-sprites' },
      ...icones,
      sobra > 0 ? el('span', { class: 'area-more muted', title: `mais ${sobra} espécie(s)` }, `+${sobra}`) : null),
    el('span', { class: 'area-types' }, ...tipos))
}

const metrica = (valor: string, rotulo: string, extra = ''): HTMLElement =>
  el('span', { class: `area-metric ${extra}`.trim() },
    el('strong', {}, valor),
    el('span', { class: 'muted' }, rotulo))

function numeros(area: AreaView): HTMLElement {
  const { estimate } = area
  const semDados = estimate.xpPerHour === 0
  return el('span', { class: 'area-metrics' },
    metrica(semDados ? '—' : compact(estimate.xpPerHour), 'xp/h'),
    metrica(semDados ? '—' : compact(estimate.goldPerHour), 'ouro/h'),
    metrica(matchupLabel(estimate.matchup), 'confronto', matchupClass(estimate.matchup)))
}

/** Rótulo curto para quem navega por leitor de tela, no lugar do despejo de todas as colunas. */
const rotulo = (area: AreaView): string => {
  const faltam = area.estimate.missing.length
  const pokedex = faltam > 0 ? `, ${faltam} espécie(s) faltando na Pokédex` : ''
  const portao = area.locked ? `, bloqueada até o nível ${area.minTrainerLevel}` : ''
  return `${area.name}, níveis ${area.minLevel} a ${area.maxLevel}${pokedex}${portao}. Ver detalhes`
}

export function areaRow(props: Props): HTMLElement {
  const { area, selecionada } = props

  const corpo = el('button', {
    type: 'button',
    class: 'area-main',
    'aria-expanded': selecionada ? 'true' : 'false',
    'aria-label': rotulo(area),
    onclick: () => props.onSelect(area.id),
  },
    el('span', { class: 'area-name' },
      el('span', { class: 'area-title' }, area.name),
      area.estimate.missing.length > 0
        ? el('span', { class: 'area-missing' }, `${area.estimate.missing.length} na Pokédex`)
        : null),
    el('span', { class: 'area-levels' },
      el('strong', {}, `${area.minLevel}–${area.maxLevel}`),
      el('span', { class: 'muted' }, 'níveis')),
    especies(area, props.atlas, props.tipoDe),
    numeros(area))

  const acao = area.locked
    ? el('span', { class: 'area-gate' }, `nível ${area.minTrainerLevel}`)
    : el('button', {
        type: 'button', class: 'primary area-start',
        onclick: (ev) => props.onStart(area.id, ev.currentTarget as HTMLElement),
      }, 'Caçar')

  return el('li', {
    class: `area-row${area.locked ? ' area-row-locked' : ''}${selecionada ? ' area-row-open' : ''}`,
    'data-area': area.id,
  }, corpo, acao)
}
