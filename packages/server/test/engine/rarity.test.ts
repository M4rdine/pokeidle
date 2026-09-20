import { createRng, hpAt, loadRegistry, xpForLevel, type Region, type Registry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { simulate } from '../../src/engine/simulate.js'

const base = loadRegistry()
const TICKS = 3000
const AREA = 'campo-inicial'

/** O mesmo registro, com o degrau de raridade da área trocado. Isola o efeito do multiplicador. */
function comRaridade(rarity: number): Registry {
  const kanto = base.regions.get('kanto')!
  const regiao: Region = { ...kanto, areas: kanto.areas.map((a) => (a.id === AREA ? { ...a, rarity } : a)) }
  return { ...base, regions: new Map([...base.regions, ['kanto', regiao]]) }
}

function correr(registry: Registry, seed: number) {
  const hunt = registry.hunts.get(AREA)!
  const deps = { registry, hunt, rng: createRng(seed) }
  const hp = hpAt(registry.species.get('charmander')!.baseStats.hp, 12)
  const s0 = createHuntState({
    hunt,
    sessionId: 'raridade',
    team: [{ id: 'p1', speciesName: 'charmander', level: 12, xp: xpForLevel('medium-slow', 12), hp, hpMax: hp }],
    inventory: { potion: 3, 'poke-ball': 5 },
    settings: defaultSettings(),
  }, deps)
  const { events } = simulate(s0, TICKS, deps)
  const derrotas = events.filter((e) => e.type === 'wildDefeated')
  return {
    drops: derrotas.reduce((total, e) => total + (e.type === 'wildDefeated' ? e.drops.length : 0), 0),
    ouro: derrotas.reduce((total, e) => total + (e.type === 'wildDefeated' ? e.gold : 0), 0),
    derrotas: derrotas.length,
  }
}

describe('degrau de raridade no motor', () => {
  it.each([42, 9])('a área de degrau alto derruba mais itens, com a mesma seed (seed %i)', (seed) => {
    const facil = correr(comRaridade(1), seed)
    const dificil = correr(comRaridade(8), seed)
    expect(facil.drops).toBeGreaterThan(0)
    expect(dificil.drops).toBeGreaterThan(facil.drops)
  })

  it('o ouro e o número de derrotas não mudam: o multiplicador só toca o drop', () => {
    const facil = correr(comRaridade(1), 42)
    const dificil = correr(comRaridade(8), 42)
    expect(dificil.ouro).toBe(facil.ouro)
    expect(dificil.derrotas).toBe(facil.derrotas)
  })

  it('a área sem degrau declarado no registro corre como degrau 1', () => {
    // Prova de que o motor lê a raridade da região, e não um padrão qualquer.
    expect(correr(comRaridade(1), 7)).toEqual(correr(base, 7))
  })
})
