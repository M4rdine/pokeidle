/**
 * Barra de filtros do navegador de áreas. Cada grupo é um `fieldset` com legenda: o leitor de
 * tela anuncia "Tipo, 18 opções" em vez de despejar dezoito botões soltos no meio da página.
 */
import { TYPE_NAMES, type TypeName } from '@pokeidle/shared'
import { emptyFilters, isEmpty, type AreaFilters, type MatchupFilter } from '../../../state/area-filters.js'
import { el } from '../../dom.js'

interface Props {
  readonly filters: AreaFilters
  readonly onChange: (filters: AreaFilters) => void
  /** Tipos que alguma área realmente tem; os outros não viram botão. */
  readonly disponiveis: ReadonlySet<TypeName>
}

const grupo = (legenda: string, ...filhos: HTMLElement[]): HTMLElement =>
  el('fieldset', { class: 'filter-group' }, el('legend', {}, legenda), ...filhos)

function tipos({ filters, onChange, disponiveis }: Props): HTMLElement {
  // Um tipo já marcado continua aparecendo mesmo se sumir da lista: senão o filtro ficaria
  // ativo sem nenhum botão que o desligue.
  const visiveis = TYPE_NAMES.filter((t: TypeName) => disponiveis.has(t) || filters.types.includes(t))
  const botoes = visiveis.map((tipo: TypeName) => {
    const ativo = filters.types.includes(tipo)
    return el('button', {
      type: 'button',
      class: `type type-${tipo} filter-type`,
      'aria-pressed': ativo ? 'true' : 'false',
      onclick: () => onChange({
        ...filters,
        types: ativo ? filters.types.filter((t) => t !== tipo) : [...filters.types, tipo],
      }),
    }, tipo)
  })
  return grupo('Tipo', el('div', { class: 'filter-types' }, ...botoes))
}

function nivel({ filters, onChange }: Props): HTMLElement {
  const campo = (rotulo: string, valor: number | null, chave: 'minLevel' | 'maxLevel'): HTMLElement => {
    const input = el('input', {
      type: 'number', min: '1', max: '100', inputmode: 'numeric',
      id: `filtro-${chave}`, class: 'filter-level',
      value: valor === null ? '' : String(valor),
      oninput: (ev) => {
        const bruto = (ev.target as HTMLInputElement).value
        const n = Number(bruto)
        onChange({ ...filters, [chave]: bruto !== '' && Number.isInteger(n) && n > 0 ? n : null })
      },
    })
    return el('span', { class: 'filter-level-field' }, el('label', { for: `filtro-${chave}` }, rotulo), input)
  }
  return grupo('Nível', campo('de', filters.minLevel, 'minLevel'), campo('até', filters.maxLevel, 'maxLevel'))
}

function confronto({ filters, onChange }: Props): HTMLElement {
  const opcao = (valor: Exclude<MatchupFilter, null>, rotulo: string): HTMLElement => {
    const ativo = filters.matchup === valor
    return el('button', {
      type: 'button', class: 'filter-toggle', 'aria-pressed': ativo ? 'true' : 'false',
      onclick: () => onChange({ ...filters, matchup: ativo ? null : valor }),
    }, rotulo)
  }
  return grupo('Meu time', opcao('strong', 'leva vantagem'), opcao('weak', 'leva desvantagem'))
}

function pokedex({ filters, onChange }: Props): HTMLElement {
  return grupo('Pokédex', el('button', {
    type: 'button', class: 'filter-toggle', 'aria-pressed': filters.missingOnly ? 'true' : 'false',
    onclick: () => onChange({ ...filters, missingOnly: !filters.missingOnly }),
  }, 'tem espécie que falta'))
}

export function areaFilters(props: Props): HTMLElement {
  return el('form', { class: 'area-filters panel', onsubmit: (ev) => ev.preventDefault() },
    tipos(props), nivel(props), confronto(props), pokedex(props))
}

/** Fica no cabeçalho, junto da contagem: é ela que o botão muda. */
export function clearFiltersButton(props: Pick<Props, 'filters' | 'onChange'>): HTMLElement {
  return el('button', {
    type: 'button', class: 'filter-clear', disabled: isEmpty(props.filters),
    onclick: () => props.onChange(emptyFilters()),
  }, 'Limpar filtros')
}
