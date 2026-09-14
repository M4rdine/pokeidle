import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TYPE_NAMES } from '@pokeidle/shared'
import { createPokeApi } from '../src/pokeapi.js'
import { sync } from '../src/sync.js'

function fakeApi(cacheDir: string) {
  const vg = { level_learned_at: 1, move_learn_method: { name: 'level-up' }, version_group: { name: 'firered-leafgreen' } }
  const stats = (hp: number) => ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((n, i) => ({ base_stat: i === 0 ? hp : 50, stat: { name: n } }))
  const data: Record<string, unknown> = {
    'pokemon/charmander': { id: 4, name: 'charmander', base_experience: 62, types: [{ slot: 1, type: { name: 'fire' } }], stats: stats(39), moves: [{ move: { name: 'ember' }, version_group_details: [vg] }, { move: { name: 'growl' }, version_group_details: [vg] }] },
    'pokemon/squirtle': { id: 7, name: 'squirtle', base_experience: 63, types: [{ slot: 1, type: { name: 'water' } }], stats: stats(44), moves: [{ move: { name: 'bubble' }, version_group_details: [vg] }] },
    'pokemon-species/charmander': { name: 'charmander', capture_rate: 45, growth_rate: { name: 'medium-slow' }, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' } },
    'pokemon-species/squirtle': { name: 'squirtle', capture_rate: 45, growth_rate: { name: 'medium-slow' }, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/3/' } },
    'evolution-chain/2': { chain: { species: { name: 'charmander' }, evolution_details: [], evolves_to: [] } },
    'evolution-chain/3': { chain: { species: { name: 'squirtle' }, evolution_details: [], evolves_to: [] } },
    'move/ember': { name: 'ember', power: 40, accuracy: 100, type: { name: 'fire' }, damage_class: { name: 'special' } },
    'move/growl': { name: 'growl', power: null, accuracy: 100, type: { name: 'normal' }, damage_class: { name: 'status' } },
    'move/bubble': { name: 'bubble', power: 40, accuracy: 100, type: { name: 'water' }, damage_class: { name: 'special' } },
  }
  for (const t of TYPE_NAMES) data[`type/${t}`] = { name: t, damage_relations: { double_damage_to: [], half_damage_to: [], no_damage_to: [] } }
  const calls: string[] = []
  const api = createPokeApi({ cacheDir, fetchJson: async (url) => { calls.push(url); const key = url.replace('https://pokeapi.co/api/v2/', '').replace(/\/$/, ''); if (!(key in data)) throw new Error(`404 ${url}`); return data[key] } })
  return { api, calls }
}

describe('sync', () => {
  it('gera species.json, moves.json e type-chart.json validados e ordenados', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokedata-'))
    const { api } = fakeApi(join(dir, 'cache'))
    const warnings: string[] = []
    const result = await sync({ api, speciesNames: ['squirtle', 'charmander'], outDir: join(dir, 'out'), warn: (m) => warnings.push(m) })
    expect(result).toEqual({ species: 2, moves: 2 })
    const species = JSON.parse(await readFile(join(dir, 'out', 'species.json'), 'utf8'))
    expect(species.map((s: { name: string }) => s.name)).toEqual(['charmander', 'squirtle'])
    const moves = JSON.parse(await readFile(join(dir, 'out', 'moves.json'), 'utf8'))
    expect(moves.map((m: { name: string }) => m.name)).toEqual(['bubble', 'ember'])
    const chart = JSON.parse(await readFile(join(dir, 'out', 'type-chart.json'), 'utf8'))
    expect(Object.keys(chart)).toHaveLength(18)
    expect(warnings.some((w) => /growl/.test(w))).toBe(true)
  })

  it('usa o cache em disco na segunda chamada', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokedata-'))
    const { api, calls } = fakeApi(join(dir, 'cache'))
    await api.get('pokemon/charmander')
    await api.get('pokemon/charmander')
    expect(calls).toHaveLength(1)
  })
})
