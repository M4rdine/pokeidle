import { loadRegistry } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chooseStarter } from '../src/account/starter.js'
import { huntSessions, pokedexEntries, pokemon, trainers } from '../src/db/schema.js'
import { AppError } from '../src/http/errors.js'
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
  it('duas escolhas concorrentes do inicial: só uma vence, a outra recebe starter-already-chosen', async () => {
    const registry = loadRegistry()
    const results = await Promise.allSettled([
      chooseStarter(t.db, registry, trainerId, 'charmander', T0),
      chooseStarter(t.db, registry, trainerId, 'squirtle', T0),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const [{ reason }] = rejected as [PromiseRejectedResult]
    expect(reason).toBeInstanceOf(AppError)
    expect((reason as AppError).code).toBe('starter-already-chosen')
    const rows = await t.db.select().from(pokemon).where(eq(pokemon.trainerId, trainerId))
    expect(rows).toHaveLength(1)
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
    const empty = await api(t.app, cookie).patch('/trainer/settings', {})
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual({ settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } } })
    const r = await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 50, capture: { ballTier: 'great' } })
    expect(r.json()).toEqual({ settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'great', maxWildHpPercent: 30, allowDuplicates: false } } })
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
    expect((await api(t.app).put('/trainer/team', { slots: ['x-w1'] })).statusCode).toBe(401)
    expect((await api(t.app).patch('/trainer/settings', { returnHpPercent: 50 })).statusCode).toBe(401)
  })
})

describe('nível e destraves', () => {
  it('/me expõe nível, xpToNext, vagas e próximo destrave', async () => {
    await t.db.update(trainers).set({ xp: 1000 }).where(eq(trainers.id, trainerId))
    const me = (await api(t.app, cookie).get('/me')).json() as { trainer: Record<string, unknown> }
    expect(me.trainer).toMatchObject({ level: 10, xpToNext: 331, teamSlots: 4, nextUnlock: { level: 20, what: expect.stringContaining('5 vagas') }, settings: { potionHpPercent: 50 } })
  })
  it('PUT /trainer/team respeita as vagas do nível', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.insert(pokemon).values([1, 2, 3].map((i) => ({ id: `x-w${i}`, trainerId, speciesName: 'zubat', level: 4, xp: 100, hp: 10, hpMax: 18, teamSlot: null })))
    const ids = (await t.db.select({ id: pokemon.id }).from(pokemon).where(eq(pokemon.trainerId, trainerId))).map((r) => r.id)
    const r = await api(t.app, cookie).put('/trainer/team', { slots: ids }) // 4 no nível 1 (3 vagas)
    expect(r.statusCode).toBe(400)
    expect((r.json() as { error: { message: string } }).error.message).toMatch(/3 vagas/)
    expect((await api(t.app, cookie).put('/trainer/team', { slots: ids.slice(0, 3) })).statusCode).toBe(200)
  })
  it('PATCH settings aceita potionHpPercent', async () => {
    const r = await api(t.app, cookie).patch('/trainer/settings', { potionHpPercent: 65 })
    expect(r.json()).toMatchObject({ settings: { potionHpPercent: 65 } })
    expect((await api(t.app, cookie).patch('/trainer/settings', { potionHpPercent: 101 })).statusCode).toBe(400)
  })
})
