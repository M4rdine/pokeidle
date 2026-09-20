/**
 * Filtro do navegador de áreas. Puro e sem DOM: recebe as áreas já anotadas com confronto e
 * faltas, devolve as que passam. O estado vive na URL para o jogador poder guardar ou mandar
 * "onde farmar fogo entre 10 e 20" como um link.
 */
import { TYPE_NAMES, type ContentRegistry, type TypeName } from '@pokeidle/shared'

export type MatchupFilter = 'strong' | 'weak' | null

export interface AreaFilters {
  readonly types: readonly TypeName[]
  /** `null` nos dois quando a faixa não foi pedida. */
  readonly minLevel: number | null
  readonly maxLevel: number | null
  readonly matchup: MatchupFilter
  readonly missingOnly: boolean
}

export interface FilterableArea {
  readonly id: string
  readonly species: readonly string[]
  readonly minLevel: number
  readonly maxLevel: number
  /** Multiplicador médio do time contra a área: acima de 1 é vantagem. */
  readonly matchup: number
  /** Espécies da área que faltam na Pokédex. */
  readonly missing: readonly string[]
}

export const emptyFilters = (): AreaFilters =>
  ({ types: [], minLevel: null, maxLevel: null, matchup: null, missingOnly: false })

export const isEmpty = (f: AreaFilters): boolean =>
  f.types.length === 0 && f.minLevel === null && f.maxLevel === null && f.matchup === null && !f.missingOnly

const temTipo = (area: FilterableArea, types: readonly TypeName[], registry: ContentRegistry): boolean =>
  area.species.some((nome) => registry.species.get(nome)?.types.some((t) => types.includes(t)) ?? false)

/** Faixas se cruzam: basta a área ter algum nível dentro do pedido. */
const cruzaFaixa = (area: FilterableArea, min: number | null, max: number | null): boolean =>
  (max === null || area.minLevel <= max) && (min === null || area.maxLevel >= min)

export function applyFilters(
  areas: readonly FilterableArea[],
  filters: AreaFilters,
  registry: ContentRegistry,
): readonly FilterableArea[] {
  return areas.filter((area) => {
    if (filters.types.length > 0 && !temTipo(area, filters.types, registry)) return false
    if (!cruzaFaixa(area, filters.minLevel, filters.maxLevel)) return false
    if (filters.matchup === 'strong' && area.matchup <= 1) return false
    if (filters.matchup === 'weak' && area.matchup >= 1) return false
    if (filters.missingOnly && area.missing.length === 0) return false
    return true
  })
}

const MATCHUP_NA_URL: Readonly<Record<string, MatchupFilter>> = { forte: 'strong', fraco: 'weak' }
const MATCHUP_PARA_URL: Readonly<Record<'strong' | 'weak', string>> = { strong: 'forte', weak: 'fraco' }

const lerTipos = (valor: string | null): TypeName[] =>
  (valor ?? '').split(',').filter((t): t is TypeName => (TYPE_NAMES as readonly string[]).includes(t))

const lerNivel = (parte: string | undefined): number | null => {
  const n = Number(parte)
  return parte !== undefined && parte !== '' && Number.isInteger(n) && n > 0 ? n : null
}

/** Lê o que dá e ignora o resto: uma URL editada à mão nunca deve deixar a tela em branco. */
export function filtersFromSearch(search: string): AreaFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const [min, max] = (params.get('nivel') ?? '').split('-')
  return {
    types: lerTipos(params.get('tipo')),
    minLevel: lerNivel(min),
    maxLevel: lerNivel(max),
    matchup: MATCHUP_NA_URL[params.get('confronto') ?? ''] ?? null,
    missingOnly: params.get('falta') === '1',
  }
}

export function searchFromFilters(filters: AreaFilters): string {
  const params = new URLSearchParams()
  if (filters.types.length > 0) params.set('tipo', filters.types.join(','))
  if (filters.minLevel !== null || filters.maxLevel !== null) {
    params.set('nivel', `${filters.minLevel ?? ''}-${filters.maxLevel ?? ''}`)
  }
  if (filters.matchup !== null) params.set('confronto', MATCHUP_PARA_URL[filters.matchup])
  if (filters.missingOnly) params.set('falta', '1')
  const texto = params.toString()
  return texto === '' ? '' : `?${texto}`
}
