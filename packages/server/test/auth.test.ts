import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, TOUCH_INTERVAL_MS, hashToken } from '../src/auth/session.js'
import { loadConfig } from '../src/config.js'
import { buildApp } from '../src/http/app.js'
import { inventory, sessions, trainers, users } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, cookieOf, ORIGIN, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0 })

const good = { email: 'Ash@Test.dev', password: 'senha-forte-123', name: 'Ash' }

describe('registro', () => {
  it('cria usuário, treinador, inventário inicial e sessão; e-mail normalizado', async () => {
    const res = await api(t.app).post('/auth/register', good)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ user: { email: 'ash@test.dev', role: 'player' }, trainer: { name: 'Ash', xp: 0, gold: 0, hasStarter: false, activeHuntId: null, settings: { returnHpPercent: 30, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } } } })
    const setCookie = String(res.headers['set-cookie'])
    expect(setCookie).toMatch(/^sid=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/)
    expect(await t.db.select().from(inventory)).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: 'poke-ball', quantity: 5 }), expect.objectContaining({ itemId: 'potion', quantity: 3 })]))
    const [s] = await t.db.select().from(sessions)
    expect(s!.tokenHash).toBe(hashToken(cookieOf(res).slice('sid='.length)))
    expect((await t.db.select().from(users))[0]!.passwordHash).toMatch(/^\$argon2id\$/)
  })
  it('valida corpo e recusa campos desconhecidos', async () => {
    expect((await api(t.app).post('/auth/register', { ...good, password: 'curta' })).statusCode).toBe(400)
    expect((await api(t.app).post('/auth/register', { ...good, name: 'a' })).statusCode).toBe(400)
    const extra = await api(t.app).post('/auth/register', { ...good, xp: 999 })
    expect(extra.statusCode).toBe(400)
    expect(extra.json()).toMatchObject({ error: { code: 'validation' } })
  })
  it('e-mail e nome duplicados; nada fica pela metade', async () => {
    await api(t.app).post('/auth/register', good)
    expect((await api(t.app).post('/auth/register', { ...good, name: 'Outro' })).json()).toMatchObject({ error: { code: 'email-taken' } })
    const r = await api(t.app).post('/auth/register', { ...good, email: 'b@test.dev' })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ error: { code: 'name-taken' } })
    expect(await t.db.select().from(users)).toHaveLength(1)
    expect(await t.db.select().from(trainers)).toHaveLength(1)
  })
})

describe('login e logout', () => {
  beforeEach(async () => { await api(t.app).post('/auth/register', good) })
  it('login ok cria sessão nova; credenciais erradas respondem igual', async () => {
    const ok = await api(t.app).post('/auth/login', { email: 'ash@test.dev', password: good.password })
    expect(ok.statusCode).toBe(200)
    expect(await t.db.select().from(sessions)).toHaveLength(2)
    const wrongPw = await api(t.app).post('/auth/login', { email: 'ash@test.dev', password: 'errada-errada' })
    const noUser = await api(t.app).post('/auth/login', { email: 'ninguem@test.dev', password: 'errada-errada' })
    expect(wrongPw.statusCode).toBe(401)
    expect(noUser.statusCode).toBe(401)
    expect(wrongPw.json()).toEqual(noUser.json())
    expect(wrongPw.json()).toEqual({ error: { code: 'invalid-credentials', message: expect.any(String) } })
  })
  it('logout apaga a sessão e limpa o cookie; sem cookie também é 204', async () => {
    const login = await api(t.app).post('/auth/login', { email: 'ash@test.dev', password: good.password })
    const cookie = cookieOf(login)
    const out = await api(t.app, cookie).post('/auth/logout')
    expect(out.statusCode).toBe(204)
    expect(String(out.headers['set-cookie'])).toMatch(/^sid=; /)
    expect(await t.db.select().from(sessions)).toHaveLength(1)
    expect((await api(t.app, cookie).get('/me')).statusCode).toBe(401)
    expect((await api(t.app).post('/auth/logout')).statusCode).toBe(204)
  })
})

describe('sessão e /me', () => {
  it('sem cookie → 401; com cookie → dados; vencida → 401 e cookie limpo; touch após 1 h', async () => {
    expect((await api(t.app).get('/me')).json()).toMatchObject({ error: { code: 'unauthorized' } })
    const { cookie } = await registerAndLogin(t.app)
    const me = await api(t.app, cookie).get('/me')
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ user: { email: 'user1@test.dev' }, trainer: { name: 'Trainer1', hasStarter: false } })
    t.clock.now = new Date(T0.getTime() + TOUCH_INTERVAL_MS + 1)
    await api(t.app, cookie).get('/me')
    expect((await t.db.select().from(sessions))[0]!.lastSeenAt).toEqual(t.clock.now)
    t.clock.now = new Date(t.clock.now.getTime() + SESSION_TTL_MS)
    const expired = await api(t.app, cookie).get('/me')
    expect(expired.statusCode).toBe(401)
    expect(String(expired.headers['set-cookie'])).toMatch(/^sid=; /)
  })
})

describe('segurança HTTP', () => {
  it('Origin ausente ou estranho em POST → 403; GET não exige', async () => {
    const noOrigin = await t.app.inject({ method: 'POST', url: '/auth/login', payload: {} })
    expect(noOrigin.statusCode).toBe(403)
    const evil = await api(t.app).post('/auth/login', {}, { origin: 'http://evil.test' })
    expect(evil.json()).toMatchObject({ error: { code: 'forbidden' } })
    expect((await t.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401)
  })
  it('rate limit: 11ª tentativa de login → 429', async () => {
    for (let i = 0; i < 10; i++) await api(t.app).post('/auth/login', { email: 'x@test.dev', password: 'errada-errada' })
    const r = await api(t.app).post('/auth/login', { email: 'x@test.dev', password: 'errada-errada' })
    expect(r.statusCode).toBe(429)
    expect(r.json()).toMatchObject({ error: { code: 'rate-limited' } })
  })
  it('corpo > 16 KB → 413; JSON inválido → 400; content-type errado → 400', async () => {
    // App isolado: o teste anterior esgota o limite de 10/min de /auth/login para o mesmo IP simulado.
    const config = loadConfig({ DATABASE_URL: 'postgres://x:x@localhost:1/x', APP_ORIGIN: ORIGIN, ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1' })
    const fresh = await buildApp({ db: t.db, config, now: () => t.clock.now, logger: false })
    const big = await api(fresh).post('/auth/login', { email: 'x@test.dev', password: 'a'.repeat(17 * 1024) })
    expect(big.statusCode).toBe(413)
    const bad = await fresh.inject({ method: 'POST', url: '/auth/login', payload: '{"email":', headers: { origin: ORIGIN, 'content-type': 'application/json' } })
    expect(bad.statusCode).toBe(400)
    const form = await fresh.inject({ method: 'POST', url: '/auth/login', payload: 'a=b', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' } })
    expect(form.statusCode).toBe(400)
    await fresh.close()
  })
  it('cabeçalhos do helmet e 404 em JSON', async () => {
    const r = await api(t.app).get('/nao-existe')
    expect(r.statusCode).toBe(404)
    expect(r.json()).toMatchObject({ error: { code: 'not-found' } })
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['x-frame-options']).toBe('DENY')
    expect(r.headers['referrer-policy']).toBe('same-origin')
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'self'")
    expect(r.headers['strict-transport-security']).toBeUndefined()
  })
  it('erro inesperado vira 500 genérico', async () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://x:x@localhost:1/x', APP_ORIGIN: ORIGIN, ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1' })
    const boom = await buildApp({
      db: t.db,
      config,
      now: () => t.clock.now,
      logger: false,
      extraRoutes: (a) => a.get('/boom', async () => { throw new Error('segredo do banco: tabela users') }),
    })
    const r = await api(boom).get('/boom')
    expect(r.statusCode).toBe(500)
    expect(r.json()).toEqual({ error: { code: 'internal', message: 'erro interno' } })
    await boom.close()
  })
})
