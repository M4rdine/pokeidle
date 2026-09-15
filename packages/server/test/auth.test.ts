import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, TOUCH_INTERVAL_MS, hashToken } from '../src/auth/session.js'
import { inventory, sessions, trainers, users } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, cookieOf, freshApp, ORIGIN, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0 })

const good = { email: 'Ash@Test.dev', password: 'senha-forte-123', name: 'Ash' }

describe('registro', () => {
  it('cria usuário, treinador, inventário inicial e sessão; e-mail normalizado', async () => {
    const res = await api(t.app).post('/auth/register', good)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ user: { email: 'ash@test.dev', role: 'player' }, trainer: { name: 'Ash', xp: 0, gold: 0, hasStarter: false, activeHuntId: null, settings: { returnHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } } } })
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
  it('rate limit: 11ª tentativa de login e de registro → 429 (por IP, isolado dos outros testes)', async () => {
    const loginIp = { ip: '10.2.0.1' }
    for (let i = 0; i < 10; i++) {
      const r = await api(t.app, undefined, loginIp).post('/auth/login', { email: 'x@test.dev', password: 'errada-errada' })
      expect(r.statusCode).toBe(401)
    }
    const login11 = await api(t.app, undefined, loginIp).post('/auth/login', { email: 'x@test.dev', password: 'errada-errada' })
    expect(login11.statusCode).toBe(429)
    expect(login11.json()).toMatchObject({ error: { code: 'rate-limited' } })

    const registerIp = { ip: '10.2.0.2' }
    const regBody = { email: 'rate-limit@test.dev', password: 'senha-forte-123', name: 'RateLimit' }
    for (let i = 0; i < 10; i++) {
      const r = await api(t.app, undefined, registerIp).post('/auth/register', regBody)
      expect([201, 409]).toContain(r.statusCode)
    }
    const register11 = await api(t.app, undefined, registerIp).post('/auth/register', regBody)
    expect(register11.statusCode).toBe(429)
    expect(register11.json()).toMatchObject({ error: { code: 'rate-limited' } })
  })
  it('rota inexistente também entra no rate limit global: 301ª tentativa → 429', async () => {
    const ip = { ip: '10.5.0.1' }
    for (let i = 0; i < 300; i++) {
      const r = await api(t.app, undefined, ip).post('/nao-existe')
      expect(r.statusCode).toBe(404)
    }
    const r301 = await api(t.app, undefined, ip).post('/nao-existe')
    expect(r301.statusCode).toBe(429)
  })
  it('Origin errado corre antes da resolução de sessão: 403 sem tocar a sessão no banco', async () => {
    const { cookie } = await registerAndLogin(t.app, 6)
    const before = (await t.db.select().from(sessions))[0]!
    t.clock.now = new Date(T0.getTime() + TOUCH_INTERVAL_MS + 1)
    const evil = await api(t.app, cookie).post('/hunts/stop', {}, { origin: 'http://evil.test' })
    expect(evil.statusCode).toBe(403)
    const after = (await t.db.select().from(sessions))[0]!
    expect(after.lastSeenAt).toEqual(before.lastSeenAt)
  })
  it('TRUST_PROXY como hops confia no XFF fixo; TRUST_PROXY=false ignora XFF mesmo rotacionado (S10)', async () => {
    const proxyApp = await freshApp(t, undefined, { TRUST_PROXY: '1' })
    const xff = { 'x-forwarded-for': '203.0.113.9' }
    for (let i = 0; i < 10; i++) {
      const r = await api(proxyApp, undefined, { ip: '127.0.0.1' }).post('/auth/login', { email: 'proxy@test.dev', password: 'errada-errada' }, xff)
      expect(r.statusCode).toBe(401)
    }
    const eleventh = await api(proxyApp, undefined, { ip: '127.0.0.1' }).post('/auth/login', { email: 'proxy@test.dev', password: 'errada-errada' }, xff)
    expect(eleventh.statusCode).toBe(429)
    await proxyApp.close()

    const directApp = await freshApp(t, undefined, { TRUST_PROXY: 'false' })
    for (let i = 0; i < 10; i++) {
      const r = await api(directApp, undefined, { ip: '198.51.100.7' }).post('/auth/login', { email: 'direct@test.dev', password: 'errada-errada' }, { 'x-forwarded-for': `1.2.3.${i}` })
      expect(r.statusCode).toBe(401)
    }
    const eleventh2 = await api(directApp, undefined, { ip: '198.51.100.7' }).post('/auth/login', { email: 'direct@test.dev', password: 'errada-errada' }, { 'x-forwarded-for': '1.2.3.99' })
    expect(eleventh2.statusCode).toBe(429)
    await directApp.close()
  })
  it('corpo > 16 KB → 413; JSON inválido → 400; content-type errado → 400', async () => {
    const big = await api(t.app).post('/auth/login', { email: 'x@test.dev', password: 'a'.repeat(17 * 1024) })
    expect(big.statusCode).toBe(413)
    expect(big.json()).toMatchObject({ error: { code: 'payload-too-large' } })
    const bad = await t.app.inject({ method: 'POST', url: '/auth/login', payload: '{"email":', headers: { origin: ORIGIN, 'content-type': 'application/json' } })
    expect(bad.statusCode).toBe(400)
    const form = await t.app.inject({ method: 'POST', url: '/auth/login', payload: 'a=b', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' } })
    expect(form.statusCode).toBe(400)
    expect(form.json()).toMatchObject({ error: { code: 'validation' } })
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
    const boom = await freshApp(t, (a) => a.get('/boom', async () => { throw new Error('segredo do banco: tabela users') }))
    const r = await api(boom).get('/boom')
    expect(r.statusCode).toBe(500)
    expect(r.json()).toEqual({ error: { code: 'internal', message: 'erro interno' } })
    await boom.close()
  })
})
