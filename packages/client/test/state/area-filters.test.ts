import { loadContentRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import {
  applyFilters, emptyFilters, filtersFromSearch, searchFromFilters, type AreaFilters, type FilterableArea,
} from '../../src/state/area-filters.js'

const registry = loadContentRegistry()
const areas: readonly FilterableArea[] = registry.regions.get('kanto')!.areas.map((a) => ({
  id: a.id, species: a.species, minLevel: a.minLevel, maxLevel: a.maxLevel, matchup: 1, missing: [...a.species],
}))
const ids = (as: readonly FilterableArea[]) => as.map((a) => a.id)
const com = (patch: Partial<AreaFilters>): AreaFilters => ({ ...emptyFilters(), ...patch })

describe('filtro de áreas', () => {
  it('sem filtro, devolve tudo na ordem recebida', () => {
    expect(ids(applyFilters(areas, emptyFilters(), registry))).toEqual(ids(areas))
  })

  it('tipo: só as áreas que têm alguma espécie daquele tipo', () => {
    const agua = applyFilters(areas, com({ types: ['water'] }), registry)
    expect(agua.length).toBeGreaterThan(0)
    for (const area of agua) {
      expect(area.species.some((n) => registry.species.get(n)!.types.includes('water')), area.id).toBe(true)
    }
    // Área de caverna sem nada de água fica de fora.
    expect(ids(agua)).not.toContain('pico-rochoso')
  })

  it('tipo aceita mais de um e soma os conjuntos', () => {
    const um = applyFilters(areas, com({ types: ['water'] }), registry)
    const dois = applyFilters(areas, com({ types: ['water', 'fire'] }), registry)
    expect(dois.length).toBeGreaterThanOrEqual(um.length)
  })

  it('faixa de nível: basta a área cruzar a faixa pedida', () => {
    const faixa = applyFilters(areas, com({ minLevel: 10, maxLevel: 16 }), registry)
    for (const area of faixa) {
      expect(area.minLevel, area.id).toBeLessThanOrEqual(16)
      expect(area.maxLevel, area.id).toBeGreaterThanOrEqual(10)
    }
    expect(ids(faixa)).toContain('margem-do-lago')
    expect(ids(faixa)).not.toContain('pico-rochoso')
  })

  it('confronto: forte pede vantagem do time, fraco pede desvantagem', () => {
    const comConfronto = areas.map((a, i) => ({ ...a, matchup: i === 0 ? 2 : i === 1 ? 0.5 : 1 }))
    expect(ids(applyFilters(comConfronto, com({ matchup: 'strong' }), registry))).toEqual([areas[0]!.id])
    expect(ids(applyFilters(comConfronto, com({ matchup: 'weak' }), registry))).toEqual([areas[1]!.id])
  })

  it('falta na Pokédex: só áreas com espécie que o treinador ainda não tem', () => {
    const comFaltas = areas.map((a, i) => ({ ...a, missing: i === 2 ? [a.species[0]!] : [] }))
    expect(ids(applyFilters(comFaltas, com({ missingOnly: true }), registry))).toEqual([areas[2]!.id])
  })

  it('os filtros compõem: cada um só estreita o conjunto', () => {
    const so = com({ types: ['water'] })
    const dois = { ...so, minLevel: 10, maxLevel: 16 }
    const aA = applyFilters(areas, so, registry)
    const aB = applyFilters(areas, dois, registry)
    expect(aB.length).toBeLessThanOrEqual(aA.length)
    for (const area of aB) expect(ids(aA)).toContain(area.id)
  })

  it('estado vai e volta pela URL sem perder nada', () => {
    const filtros = com({ types: ['water', 'fire'], minLevel: 8, maxLevel: 22, matchup: 'strong', missingOnly: true })
    expect(filtersFromSearch(searchFromFilters(filtros))).toEqual(filtros)
  })

  it('URL vazia dá o filtro vazio, e filtro vazio não suja a URL', () => {
    expect(filtersFromSearch('')).toEqual(emptyFilters())
    expect(searchFromFilters(emptyFilters())).toBe('')
  })

  it('URL com lixo não quebra a tela: o que não dá para ler é ignorado', () => {
    expect(filtersFromSearch('?tipo=banana&nivel=abc&confronto=talvez&falta=quem-sabe')).toEqual(emptyFilters())
    // E o que dá para ler no meio do lixo sobrevive.
    expect(filtersFromSearch('?tipo=banana,fire&nivel=5-')).toMatchObject({ types: ['fire'] })
  })
})
