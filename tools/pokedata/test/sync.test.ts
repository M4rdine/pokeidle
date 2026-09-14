import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sync } from '../src/sync.js'
import { fakeApi } from './fixtures/fake-api.js'

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
