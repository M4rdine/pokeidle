import { describe, expect, it } from 'vitest'
import { estimateArea, type EstimateInput } from '../src/analyzer.js'
import { loadRegistry } from '../src/registry-full.js'

const registry = loadRegistry()
const kanto = registry.regions.get('kanto')!
const areaDe = (id: string) => kanto.areas.find((a) => a.id === id)!

const entrada = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  registry,
  area: areaDe('campo-inicial'),
  team: [{ speciesName: 'charmander', level: 12 }],
  ...over,
})

describe('estimateArea', () => {
  it('é determinística: mesma entrada, mesma saída', () => {
    expect(estimateArea(entrada())).toEqual(estimateArea(entrada()))
  })

  it('dá uma linha por espécie da área, com nível dentro da faixa', () => {
    const area = areaDe('campo-inicial')
    const e = estimateArea(entrada())
    expect(e.species.map((s) => s.speciesName)).toEqual([...area.species])
    for (const s of e.species) {
      expect(s.level).toBeGreaterThanOrEqual(area.minLevel)
      expect(s.level).toBeLessThanOrEqual(area.maxLevel)
      expect(s.xpPerDefeat).toBeGreaterThan(0)
    }
  })

  it('área de nível mais alto rende mais XP por derrota que a inicial', () => {
    const inicial = estimateArea(entrada())
    const funda = estimateArea(entrada({ area: areaDe('caverna-funda'), team: [{ speciesName: 'charizard', level: 40 }] }))
    const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(media(funda.species.map((s) => s.xpPerDefeat))).toBeGreaterThan(media(inicial.species.map((s) => s.xpPerDefeat)))
  })

  it('time mais forte derruba mais rápido e rende mais por hora', () => {
    const fraco = estimateArea(entrada({ team: [{ speciesName: 'charmander', level: 5 }] }))
    const forte = estimateArea(entrada({ team: [{ speciesName: 'charizard', level: 50 }] }))
    expect(forte.xpPerHour).toBeGreaterThan(fraco.xpPerHour)
    expect(forte.goldPerHour).toBeGreaterThan(0)
  })

  it('time que não fere a espécie vira tempo nulo, não um número inventado', () => {
    // Diglett de nível 1 só sabe scratch, que é normal, e normal não toca fantasma: a imunidade
    // é total e não depende de sorte de golpe.
    const so = estimateArea(entrada({
      area: { ...areaDe('campo-inicial'), species: ['gastly'] },
      team: [{ speciesName: 'diglett', level: 1 }],
    }))
    const linha = so.species[0]!
    expect(linha.secondsPerDefeat).toBeNull()
    expect(linha.matchup).toBe(0)
    expect(so.xpPerHour).toBe(0)
    expect(so.goldPerHour).toBe(0)
    // Mesmo sem conseguir lutar, a linha continua informando o que a espécie vale.
    expect(linha.xpPerDefeat).toBeGreaterThan(0)
  })

  it('sem time, nada é estimado — mas as espécies continuam listadas', () => {
    const e = estimateArea(entrada({ team: [] }))
    expect(e.xpPerHour).toBe(0)
    expect(e.species).toHaveLength(areaDe('campo-inicial').species.length)
    expect(e.species.every((s) => s.secondsPerDefeat === null)).toBe(true)
  })

  it('missing lista só as espécies fora da Pokédex', () => {
    const area = areaDe('campo-inicial')
    const e = estimateArea(entrada({ caught: [area.species[0]!] }))
    expect(e.missing).toEqual(area.species.slice(1))
    expect(estimateArea(entrada({ caught: [...area.species] })).missing).toEqual([])
  })

  it('bola melhor aumenta a chance de captura estimada', () => {
    const pokeBall = estimateArea(entrada({ ballBonus: 1 }))
    const ultraBall = estimateArea(entrada({ ballBonus: 2 }))
    expect(ultraBall.species[0]!.captureChance).toBeGreaterThan(pokeBall.species[0]!.captureChance)
    expect(ultraBall.species[0]!.captureChance).toBeLessThanOrEqual(1)
  })

  it('os drops vêm com a chance do degrau da área, não com a chance base', () => {
    const area = areaDe('campo-inicial')
    const facil = estimateArea(entrada({ area: { ...area, rarity: 1 } }))
    const dificil = estimateArea(entrada({ area: { ...area, rarity: 8 } }))
    const chanceDe = (e: typeof facil, especie: string) =>
      e.species.find((s) => s.speciesName === especie)!.drops[0]!.chance
    expect(chanceDe(facil, 'zubat')).toBeGreaterThan(0)
    expect(chanceDe(dificil, 'zubat')).toBeGreaterThan(chanceDe(facil, 'zubat'))
    expect(chanceDe(dificil, 'zubat')).toBeLessThan(1)
  })

  it('o confronto médio reflete a vantagem de tipo do time', () => {
    // Bellsprout é planta: fogo arrasa, água não faz nada de especial.
    const soPlanta = { ...areaDe('campo-inicial'), species: ['bellsprout'] }
    const fogo = estimateArea(entrada({ area: soPlanta, team: [{ speciesName: 'charmander', level: 20 }] }))
    const agua = estimateArea(entrada({ area: soPlanta, team: [{ speciesName: 'squirtle', level: 20 }] }))
    expect(fogo.matchup).toBeGreaterThan(agua.matchup)
  })
})
