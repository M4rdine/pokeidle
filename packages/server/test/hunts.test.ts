import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0; ({ cookie, trainerId } = await registerAndLogin(t.app)) })

describe('GET /hunts', () => {
  it('lista hunts do registro com faixa de nível', async () => {
    const r = await api(t.app, cookie).get('/hunts')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ hunts: [{ id: 'route-1', name: expect.any(String), width: 40, height: 30, minLevel: 2, maxLevel: 12 }] })
  })
})

describe('start / active / stop', () => {
  it('sem inicial → no-starter; hunt inexistente → 404', async () => {
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).json()).toMatchObject({ error: { code: 'no-starter' } })
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).post('/hunts/nope/start')).statusCode).toBe(404)
  })
  it('start cria a sessão; active devolve o snapshot sem seed/rng_state; start duplicado → hunt-active; stop sincroniza', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).get('/hunts/active')).json()).toEqual({ session: null })
    const start = await api(t.app, cookie).post('/hunts/route-1/start')
    expect(start.statusCode).toBe(201)
    expect(start.json()).toMatchObject({ session: { huntId: 'route-1', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), startedAt: T0.toISOString() } })
    expect(JSON.stringify(start.json())).not.toMatch(/seed|rngState|rng_state/)
    const active = await api(t.app, cookie).get('/hunts/active')
    expect(active.json()).toMatchObject({ session: { huntId: 'route-1', state: { tick: 0, huntId: 'route-1', player: { mode: 'searching' } } } })
    expect(JSON.stringify(active.json())).not.toMatch(/seed|rngState|rng_state/)
    expect((await api(t.app, cookie).get('/me')).json()).toMatchObject({ trainer: { activeHuntId: 'route-1' } })
    const dup = await api(t.app, cookie).post('/hunts/route-1/start')
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ error: { code: 'hunt-active' } })
    const stop = await api(t.app, cookie).post('/hunts/stop')
    expect(stop.statusCode).toBe(200)
    expect(stop.json()).toMatchObject({ trainer: { id: trainerId, activeHuntId: null } })
    expect(await t.db.select().from(huntSessions)).toEqual([])
    expect((await api(t.app, cookie).post('/hunts/stop')).json()).toMatchObject({ error: { code: 'no-hunt' } })
  })
  it('time todo sem HP → validation', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.update(pokemon).set({ hp: 0 })
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).statusCode).toBe(400)
  })
  it('snapshot corrompido: active → 500 genérico; stop apaga sem sync e permite iniciar de novo', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await api(t.app, cookie).post('/hunts/route-1/start')
    await t.db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))

    const active = await api(t.app, cookie).get('/hunts/active')
    expect(active.statusCode).toBe(500)
    expect(active.json()).toEqual({ error: { code: 'internal', message: 'erro interno' } })

    const stop = await api(t.app, cookie).post('/hunts/stop')
    expect(stop.statusCode).toBe(200)
    expect(stop.json()).toMatchObject({ trainer: { id: trainerId, activeHuntId: null } })
    expect(await t.db.select().from(huntSessions)).toEqual([])

    const start2 = await api(t.app, cookie).post('/hunts/route-1/start')
    expect(start2.statusCode).toBe(201)
  })
})

describe('S2: isolamento entre contas', () => {
  it('conta B não vê nem para a hunt de A; B não reordena o time de A', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await api(t.app, cookie).post('/hunts/route-1/start')
    const b = await registerAndLogin(t.app, 2)
    expect((await api(t.app, b.cookie).get('/hunts/active')).json()).toEqual({ session: null })
    expect((await api(t.app, b.cookie).post('/hunts/stop')).json()).toMatchObject({ error: { code: 'no-hunt' } })
    const [aPokemon] = await t.db.select().from(pokemon)
    expect((await api(t.app, b.cookie).put('/trainer/team', { slots: [aPokemon!.id] })).statusCode).toBe(404)
    expect((await api(t.app, b.cookie).get('/trainer/team')).json()).toEqual({ team: [], box: [] })
    expect(await t.db.select().from(huntSessions)).toHaveLength(1)
  })
  it('todas as rotas de hunt exigem login', async () => {
    expect((await api(t.app).get('/hunts')).statusCode).toBe(401)
    expect((await api(t.app).get('/hunts/active')).statusCode).toBe(401)
    expect((await api(t.app).post('/hunts/route-1/start')).statusCode).toBe(401)
    expect((await api(t.app).post('/hunts/stop')).statusCode).toBe(401)
  })
})
