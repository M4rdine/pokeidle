/**
 * As insígnias: uma por área, ganha ao completar a Pokédex dela.
 *
 * O jogo não tinha nenhum OBJETO de progresso — só um nível e uma barra. E a Pokédex não tinha
 * recompensa nenhuma: capturar a última espécie de uma área não mudava nada em lugar nenhum.
 * A insígnia junta os dois problemas numa peça só, e sem inventar mecânica: o dado de conclusão
 * já existe, é o cruzamento entre `area.species` e o que o treinador capturou.
 */
import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { insignias } from '../../src/state/insignias.js'

const registry = loadRegistry()
const regioes = registry.regions
const areas = [...regioes.values()].sort((a, b) => a.order - b.order).flatMap((r) => r.areas)
const capturado = (nomes: readonly string[]) => nomes.map((speciesName) => ({ speciesName, seenAt: 'x', caughtAt: 'y' }))

describe('insígnias', () => {
  it('há uma por área do jogo, na ordem em que o jogo as abre', () => {
    const lista = insignias(regioes, [], [])
    expect(lista).toHaveLength(areas.length)
    expect(lista.map((i) => i.areaId)).toEqual(areas.map((a) => a.id))
    // A numeração é a do acervo de insígnias: 1 a 8 é Kanto, 9 a 16 é a região seguinte.
    expect(lista.map((i) => i.numero)).toEqual(areas.map((_a, n) => n + 1))
  })

  it('sem nenhuma captura, nenhuma está conquistada', () => {
    expect(insignias(regioes, [], []).some((i) => i.conquistada)).toBe(false)
  })

  it('capturar TODAS as espécies de uma área conquista a insígnia dela, e só a dela', () => {
    const alvo = areas[0]!
    const lista = insignias(regioes, capturado(alvo.species), [])
    const ganhas = lista.filter((i) => i.conquistada)
    expect(ganhas.map((i) => i.areaId)).toContain(alvo.id)
    // Áreas compartilham espécie, então outra pode ser conquistada junto — o que não pode é
    // conquistar uma área cujas espécies não estejam todas na lista.
    const porId = new Map(areas.map((a) => [a.id, a]))
    const capturadas = new Set(alvo.species)
    for (const g of ganhas) expect(porId.get(g.areaId)!.species.every((s) => capturadas.has(s))).toBe(true)
  })

  it('falta uma espécie e a insígnia não vem — completar é completar', () => {
    const alvo = areas[0]!
    const menosUma = alvo.species.slice(0, -1)
    const lista = insignias(regioes, capturado(menosUma), [])
    const dela = lista.find((i) => i.areaId === alvo.id)!
    expect(dela.conquistada).toBe(false)
    expect(dela.capturados).toBe(menosUma.length)
    expect(dela.total).toBe(alvo.species.length)
  })

  it('o que foi visto na caçada de agora conta junto com a Pokédex do servidor', () => {
    // O espelho da sessão sabe de capturas que o `/trainer/pokedex` ainda não devolveu: sem
    // somar os dois, a insígnia só apareceria depois de recarregar a página.
    const alvo = areas[0]!
    const lista = insignias(regioes, capturado(alvo.species.slice(0, -1)), [alvo.species.at(-1)!])
    expect(lista.find((i) => i.areaId === alvo.id)!.conquistada).toBe(true)
  })

  it('a entrada apenas VISTA não conquista: insígnia é de captura', () => {
    const alvo = areas[0]!
    const soVistas = alvo.species.map((speciesName) => ({ speciesName, seenAt: 'x', caughtAt: null }))
    expect(insignias(regioes, soVistas, []).find((i) => i.areaId === alvo.id)!.conquistada).toBe(false)
  })
})
