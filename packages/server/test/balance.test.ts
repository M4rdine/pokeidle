import { createRng, hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../src/engine/create.js'
import { simulate, summarizeEvents } from '../src/engine/simulate.js'

const registry = loadRegistry()
const hunt = registry.hunts.get('campo-inicial')!
const TICKS = 3000 // 10 minutos a 200 ms

const charmander10 = () => {
  const base = registry.species.get('charmander')!.baseStats.hp
  return { id: 'p1', speciesName: 'charmander', level: 10, xp: xpForLevel('medium-slow', 10), hp: hpAt(base, 10), hpMax: hpAt(base, 10) }
}

describe('balanceamento da área inicial (GDD §2 e §6)', () => {
  it.each([42, 9, 7])('Charmander 10 com os padrões, 10 minutos, seed %i: ≥150 derrotas, 0 quedas, ≥3 capturas', (seed) => {
    const deps = { registry, hunt, rng: createRng(seed) }
    const s0 = createHuntState({ hunt, sessionId: 'balance', team: [charmander10()], inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, deps)
    const s = summarizeEvents(simulate(s0, TICKS, deps).events, TICKS)
    expect(s.defeats).toBeGreaterThanOrEqual(150)
    expect(s.faints).toBe(0)
    expect(s.captures).toBeGreaterThanOrEqual(3)
  })

  /**
   * A régua da economia, travada no que o motor rende hoje: cerca de 3200 de ouro em dez minutos.
   * O GDD §2 ainda diz ~1500, número medido na Rota 1 antiga; a área inicial ficou com cinco
   * espécies e vinte selvagens no sprint 5 para alcançar as 150 derrotas e as 3 capturas que o
   * próprio GDD exige, e o ouro dobrou junto. Rebalancear a loja em cima disso é decisão de
   * design de jogo, não de teste — este aqui só impede que o número mude de novo sem ninguém ver.
   */
  it.each([42, 9, 7])('o ouro de dez minutos fica na faixa medida hoje, seed %i', (seed) => {
    const deps = { registry, hunt, rng: createRng(seed) }
    const s0 = createHuntState({ hunt, sessionId: 'economia', team: [charmander10()], inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, deps)
    const s = summarizeEvents(simulate(s0, TICKS, deps).events, TICKS)
    expect(s.gold).toBeGreaterThan(2500)
    expect(s.gold).toBeLessThan(4000)
  })
})
