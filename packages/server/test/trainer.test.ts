import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokedexEntries, pokemon } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0; ({ cookie, trainerId } = await registerAndLogin(t.app)) })

describe('inicial', () => {
  it('cria o inicial no nível 10 com HP cheio, slot 0 e Pokédex; só uma vez', async () => {
    const r = await api(t.app, cookie).post('/trainer/starter', { species: 'squirtle' })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({ pokemon: { speciesName: 'squirtle', level: 10, hp: 31, hpMax: 31, xp: 560, teamSlot: 0 } }) // hpAt(44,10)=31; medium-slow L10 = 560
    expect((r.json() as { pokemon: { id: string } }).pokemon.id).toMatch(/^st-[0-9a-f-]{36}$/)
    const [dex] = await t.db.select().from(pokedexEntries)
    expect(dex).toMatchObject({ trainerId, speciesName: 'squirtle', seenAt: T0, caughtAt: T0 })
    expect((await api(t.app, cookie).get('/me')).json()).toMatchObject({ trainer: { hasStarter: true } })
    const again = await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ error: { code: 'starter-already-chosen' } })
  })
  it('rejeita espécie fora da lista', async () => {
    expect((await api(t.app, cookie).post('/trainer/starter', { species: 'mewtwo' })).statusCode).toBe(400)
  })
})

describe('time', () => {
  beforeEach(async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.insert(pokemon).values([
      { id: 'x-w1', trainerId, speciesName: 'zubat', level: 4, xp: 100, hp: 10, hpMax: 18, teamSlot: 1 },
      { id: 'x-w2', trainerId, speciesName: 'diglett', level: 6, xp: 200, hp: 0, hpMax: 20, teamSlot: null },
    ])
  })
  it('lista time ordenado e mochila', async () => {
    const r = await api(t.app, cookie).get('/trainer/team')
    expect(r.json()).toMatchObject({ team: [{ speciesName: 'charmander', teamSlot: 0 }, { id: 'x-w1', teamSlot: 1 }], box: [{ id: 'x-w2', teamSlot: null }] })
  })
  it('reordena e manda o resto para a mochila', async () => {
    const r = await api(t.app, cookie).put('/trainer/team', { slots: ['x-w2', 'x-w1'] })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ team: [{ id: 'x-w2', teamSlot: 0 }, { id: 'x-w1', teamSlot: 1 }], box: [{ speciesName: 'charmander', teamSlot: null }] })
  })
  it('valida: vazio, repetido, mais de 6, id alheio, hunt ativa', async () => {
    expect((await api(t.app, cookie).put('/trainer/team', { slots: [] })).statusCode).toBe(400)
    expect((await api(t.app, cookie).put('/trainer/team', { slots: ['x-w1', 'x-w1'] })).statusCode).toBe(400)
    expect((await api(t.app, cookie).put('/trainer/team', { slots: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).statusCode).toBe(400)
    const other = await registerAndLogin(t.app, 2)
    await t.db.insert(pokemon).values({ id: 'y-w1', trainerId: other.trainerId, speciesName: 'zubat', level: 4, xp: 100, hp: 10, hpMax: 18, teamSlot: 0 })
    const alien = await api(t.app, cookie).put('/trainer/team', { slots: ['y-w1'] })
    expect(alien.statusCode).toBe(404)
    await t.db.insert(huntSessions).values({ trainerId, huntId: 'route-1', sessionId: 's', state: {}, seed: 1, rngState: 1, startedAt: T0, lastSimulatedAt: T0 })
    const busy = await api(t.app, cookie).put('/trainer/team', { slots: ['x-w1'] })
    expect(busy.statusCode).toBe(409)
    expect(busy.json()).toMatchObject({ error: { code: 'hunt-active' } })
  })
})

describe('settings, inventário e pokédex', () => {
  it('PATCH settings mescla e valida', async () => {
    const r = await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 50, capture: { ballTier: 'great' } })
    expect(r.json()).toEqual({ settings: { returnHpPercent: 50, capture: { ballTier: 'great', maxWildHpPercent: 30, allowDuplicates: false } } })
    expect((await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 101 })).statusCode).toBe(400)
    expect((await api(t.app, cookie).patch('/trainer/settings', { capture: { ballTier: 'master' } })).statusCode).toBe(400)
    expect((await api(t.app, cookie).patch('/trainer/settings', { xp: 1 })).statusCode).toBe(400)
  })
  it('inventário lista só quantidade > 0', async () => {
    const r = await api(t.app, cookie).get('/trainer/inventory')
    expect(r.json()).toEqual({ items: [{ itemId: 'poke-ball', quantity: 5 }, { itemId: 'potion', quantity: 3 }] })
  })
  it('pokédex lista entradas', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'bulbasaur' })
    const r = await api(t.app, cookie).get('/trainer/pokedex')
    expect(r.json()).toEqual({ entries: [{ speciesName: 'bulbasaur', seenAt: T0.toISOString(), caughtAt: T0.toISOString() }] })
  })
  it('todas exigem login', async () => {
    for (const [m, url] of [['get', '/trainer/team'], ['get', '/trainer/inventory'], ['get', '/trainer/pokedex']] as const) expect((await api(t.app)[m](url)).statusCode).toBe(401)
    expect((await api(t.app).post('/trainer/starter', { species: 'charmander' })).statusCode).toBe(401)
  })
})
