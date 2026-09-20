import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon, trainers } from '../src/db/schema.js'
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
    const { hunts } = r.json() as { hunts: { id: string; width: number; height: number; minLevel: number }[] }
    // Duas regiões de oito áreas; a lista vem do registro, então cresce quando o conteúdo cresce.
    expect(hunts).toHaveLength(16)
    expect(hunts[0]).toMatchObject({ id: 'campo-inicial', name: expect.any(String), width: 24, height: 36 })
    expect(hunts.every((h) => h.minLevel >= 1)).toBe(true)
  })

  it('cada área vem com o nível que a abre e se o treinador já pode entrar', async () => {
    const { hunts } = (await api(t.app, cookie).get('/hunts')).json() as
      { hunts: { id: string; minTrainerLevel: number; locked: boolean }[] }
    // Treinador recém-criado está no nível 1: a primeira área abre, a última não.
    expect(hunts[0]).toMatchObject({ id: 'campo-inicial', minTrainerLevel: 1, locked: false })
    const pico = hunts.find((h) => h.id === 'pico-rochoso')!
    expect(pico.minTrainerLevel).toBeGreaterThan(1)
    expect(pico.locked).toBe(true)
  })
})

describe('portão de nível das áreas', () => {
  it('a segunda região barra quem não alcançou o nível dela, e abre quando alcança', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    const barrado = await api(t.app, cookie).post('/hunts/gruta-umida/start')
    expect(barrado.statusCode).toBe(403)
    expect(barrado.json()).toMatchObject({ error: { code: 'area-locked', message: expect.stringContaining('34') } })
    // 34 é o portão da região inteira, e nenhuma área dela abre antes disso. xp = nível³.
    await t.db.update(trainers).set({ xp: 34 ** 3 }).where(eq(trainers.id, trainerId))
    expect((await api(t.app, cookie).post('/hunts/gruta-umida/start')).statusCode).toBe(201)
  })

  it('start numa área acima do nível recusa com 403 e diz o nível que falta', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    const r = await api(t.app, cookie).post('/hunts/pico-rochoso/start')
    expect(r.statusCode).toBe(403)
    expect(r.json()).toMatchObject({ error: { code: 'area-locked', message: expect.stringContaining('nível') } })
    // E nada foi criado: o treinador continua sem caçada.
    expect((await api(t.app, cookie).get('/hunts/active')).json()).toEqual({ session: null })
  })

  it('com xp suficiente a mesma área abre', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.update(trainers).set({ xp: 1_000_000 }).where(eq(trainers.id, trainerId))
    expect((await api(t.app, cookie).post('/hunts/pico-rochoso/start')).statusCode).toBe(201)
  })
})

describe('start / active / stop', () => {
  it('sem inicial → no-starter; hunt inexistente → 404', async () => {
    expect((await api(t.app, cookie).post('/hunts/campo-inicial/start')).json()).toMatchObject({ error: { code: 'no-starter' } })
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).post('/hunts/nope/start')).statusCode).toBe(404)
  })
  it('start cria a sessão; active devolve o snapshot sem seed/rng_state; start duplicado → hunt-active; stop sincroniza', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).get('/hunts/active')).json()).toEqual({ session: null })
    const start = await api(t.app, cookie).post('/hunts/campo-inicial/start')
    expect(start.statusCode).toBe(201)
    expect(start.json()).toMatchObject({ session: { huntId: 'campo-inicial', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), startedAt: T0.toISOString() } })
    expect(JSON.stringify(start.json())).not.toMatch(/seed|rngState|rng_state/)
    const active = await api(t.app, cookie).get('/hunts/active')
    expect(active.json()).toMatchObject({ session: { huntId: 'campo-inicial', state: { tick: 0, huntId: 'campo-inicial', player: { mode: 'searching' } } } })
    expect(JSON.stringify(active.json())).not.toMatch(/seed|rngState|rng_state/)
    expect((await api(t.app, cookie).get('/me')).json()).toMatchObject({ trainer: { activeHuntId: 'campo-inicial' } })
    const dup = await api(t.app, cookie).post('/hunts/campo-inicial/start')
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
    expect((await api(t.app, cookie).post('/hunts/campo-inicial/start')).statusCode).toBe(400)
  })
  it('snapshot corrompido: active → 500 genérico; stop apaga sem sync e permite iniciar de novo', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await api(t.app, cookie).post('/hunts/campo-inicial/start')
    // Com o scheduler, active/stop só voltam a ler o banco quando não há runner vivo em memória
    // (ex.: após um restart do processo) — daí o detach simulando essa situação antes de corromper.
    t.scheduler.detach(trainerId)
    await t.db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))

    const active = await api(t.app, cookie).get('/hunts/active')
    expect(active.statusCode).toBe(500)
    expect(active.json()).toEqual({ error: { code: 'internal', message: 'erro interno' } })

    const stop = await api(t.app, cookie).post('/hunts/stop')
    expect(stop.statusCode).toBe(200)
    expect(stop.json()).toMatchObject({ trainer: { id: trainerId, activeHuntId: null } })
    expect(await t.db.select().from(huntSessions)).toEqual([])

    const start2 = await api(t.app, cookie).post('/hunts/campo-inicial/start')
    expect(start2.statusCode).toBe(201)
  })
})

describe('GET /hunts/:id/map', () => {
  it('devolve o HuntMap completo do registro; 404 para id desconhecido; exige sessão', async () => {
    const r = await api(t.app, cookie).get('/hunts/campo-inicial/map')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ id: 'campo-inicial', width: 24, height: 36, tileSize: 32, spawnPoint: expect.any(Object), pokecenter: expect.any(Object) })
    expect((r.json() as { layers: { ground: unknown[] } }).layers.ground).toHaveLength(24 * 36)
    expect((await api(t.app, cookie).get('/hunts/nope/map')).statusCode).toBe(404)
    expect((await api(t.app).get('/hunts/campo-inicial/map')).statusCode).toBe(401)
  })
})

describe('S2: isolamento entre contas', () => {
  it('conta B não vê nem para a hunt de A; B não reordena o time de A', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await api(t.app, cookie).post('/hunts/campo-inicial/start')
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
    expect((await api(t.app).post('/hunts/campo-inicial/start')).statusCode).toBe(401)
    expect((await api(t.app).post('/hunts/stop')).statusCode).toBe(401)
  })
})
