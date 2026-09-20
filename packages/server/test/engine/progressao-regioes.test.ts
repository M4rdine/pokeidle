import { createRng, hpAt, loadRegistry, xpForLevel, xpOnDefeat, type Area } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'

const registry = loadRegistry()
const TICKS = 3000
const HORAS = TICKS / 5 / 3600

/**
 * Um time do nível da área, com três Pokémon de tipos diferentes — o motor só troca quando o
 * ativo cai, então um time monotipo mede o azar do confronto em vez de medir a área.
 */
const membro = (nome: string, level: number, i: number) => {
  const hp = hpAt(registry.species.get(nome)!.baseStats.hp, level)
  return { id: `p${i}`, speciesName: nome, level, xp: xpForLevel('medium-slow', level), hp, hpMax: hp }
}

function render(area: Area): { xpPorHora: number; derrotas: number } {
  const hunt = registry.hunts.get(area.id)!
  const nivel = area.maxLevel
  const deps = { registry, hunt, rng: createRng(42) }
  const team = [membro('charizard', nivel, 1), membro('blastoise', nivel, 2), membro('venusaur', nivel, 3)]
  const s0 = createHuntState(
    { hunt, sessionId: 'progressao', team, inventory: { potion: 20, 'poke-ball': 5 }, settings: defaultSettings() },
    deps)
  const s = summarizeEvents(simulate(s0, TICKS, deps).events, TICKS)
  return { xpPorHora: s.xpTrainer / HORAS, derrotas: s.defeats }
}

describe('a segunda região é um degrau para cima', () => {
  const de = (regiao: string) => registry.regions.get(regiao)!.areas.map(render)

  /**
   * Comparar a entrada de uma região com o fim da anterior não mede nada: a última área de uma
   * região é o pico dela e a primeira da seguinte é a base, então o degrau sempre pareceria
   * negativo. O que importa é o teto e a média — se a região nova não sobe nos dois, ela é
   * conteúdo lateral, não progressão.
   */
  it('o teto e a média de XP por hora das Terras Altas superam os de Kanto', () => {
    const kanto = de('kanto').map((r) => r.xpPorHora)
    const altas = de('terras-altas').map((r) => r.xpPorHora)
    const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(Math.max(...altas)).toBeGreaterThan(Math.max(...kanto))
    expect(media(altas)).toBeGreaterThan(media(kanto))
  })

  it('nenhuma área da região nova é parede: todas rendem caçada com um time do nível delas', () => {
    for (const area of registry.regions.get('terras-altas')!.areas) {
      // Trinta derrotas em dez minutos é o piso de "dá para jogar", não de "rende bem". Abaixo
      // disso a área é tempo gasto voltando ao Centro, que foi o que a medição pegou em duas
      // delas antes do elenco ser rebalanceado.
      expect(render(area).derrotas, `área ${area.id}`).toBeGreaterThan(30)
    }
  })

  it('o elenco da região nova é mais valioso por derrota que o de Kanto', () => {
    const xpPorDerrota = (regiao: string) =>
      registry.regions.get(regiao)!.areas.flatMap((a) =>
        a.species.map((n) => xpOnDefeat(registry.species.get(n)!, a.maxLevel)))
    expect(Math.min(...xpPorDerrota('terras-altas'))).toBeGreaterThan(Math.max(...xpPorDerrota('kanto')))
  })
})
