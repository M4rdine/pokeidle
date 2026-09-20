import { createRng, estimateArea, hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../src/engine/create.js'
import { simulate, summarizeEvents } from '../src/engine/simulate.js'

const registry = loadRegistry()
const kanto = registry.regions.get('kanto')!
const TICKS = 3000 // 10 minutos a 200 ms
const HORAS = TICKS / 5 / 3600
/**
 * O analisador é aproximação: nível médio, dano esperado, deslocamento fixo e teto de
 * renascimento, sem poção, sem troca de Pokémon e sem volta ao Centro. A régua aceita de 0,6 a
 * 1,8 vez o número real de derrotas — folga suficiente para a variação de seed e de geometria,
 * apertada o bastante para acusar uma fórmula errada, que é o risco de verdade. Um analisador
 * que mente é pior que nenhum, porque o jogador escolhe a área por ele.
 */
const MIN_FATOR = 0.6
const MAX_FATOR = 1.8

const charmander = (level: number) => {
  const base = registry.species.get('charmander')!.baseStats.hp
  return { id: 'p1', speciesName: 'charmander', level, xp: xpForLevel('medium-slow', level), hp: hpAt(base, level), hpMax: hpAt(base, level) }
}

const derrotasReaisPorHora = (areaId: string, level: number, seed: number): number => {
  const hunt = registry.hunts.get(areaId)!
  const deps = { registry, hunt, rng: createRng(seed) }
  const s0 = createHuntState(
    { hunt, sessionId: 'calibracao', team: [charmander(level)], inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() },
    deps)
  return summarizeEvents(simulate(s0, TICKS, deps).events, TICKS).defeats / HORAS
}

const derrotasEstimadasPorHora = (areaId: string, level: number): number => {
  const area = kanto.areas.find((a) => a.id === areaId)!
  const e = estimateArea({ registry, area, team: [{ speciesName: 'charmander', level }] })
  const xpMedio = e.species.reduce((total, s) => total + s.xpPerDefeat, 0) / e.species.length
  return e.xpPerHour / xpMedio
}

describe('o analisador bate com o motor por ordem de grandeza', () => {
  // Quatro áreas de densidade e bioma diferentes: a de muitos selvagens (limitada pelo combate),
  // as de poucos (limitadas pelo renascimento) e uma de nível alto.
  it.each([
    ['campo-inicial', 12, 42],
    ['campo-inicial', 12, 9],
    ['bosque-denso', 15, 42],
    ['trilha-pedregosa', 20, 42],
    ['caverna-funda', 40, 42],
  ])('%s com Charmander %i, 10 minutos, seed %i', (areaId, level, seed) => {
    const real = derrotasReaisPorHora(areaId as string, level as number, seed as number)
    const estimado = derrotasEstimadasPorHora(areaId as string, level as number)

    expect(real, 'a simulação precisa derrotar alguém para servir de régua').toBeGreaterThan(0)
    expect(estimado).toBeGreaterThan(real * MIN_FATOR)
    expect(estimado).toBeLessThan(real * MAX_FATOR)
  })
})
