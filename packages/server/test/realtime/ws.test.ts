import { hpAt, xpForLevel } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { pokemon, sessions } from '../../src/db/schema.js'
import { hashToken } from '../../src/auth/session.js'
import { WS_MAX_MESSAGE_BYTES } from '../../src/realtime/constants.js'
import { truncateAll } from '../helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from '../helpers/app.js'
import { connectWs, listen } from '../helpers/ws.js'

let t: TestApp
let base: string
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp({ ws: { pingMs: 100, pongTimeoutMs: 150, sessionRecheckMs: 100 } }); base = await listen(t.app) })
afterAll(async () => { await t.close() })
beforeEach(async () => {
  await truncateAll(t.db); t.clock.now = T0
  ;({ cookie, trainerId } = await registerAndLogin(t.app))
  await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
  const charmander = t.registry.species.get('charmander')!
  const hpMax = hpAt(charmander.baseStats.hp, 12)
  await t.db.update(pokemon).set({ level: 12, xp: xpForLevel(charmander.growthRate, 12), hp: hpMax, hpMax })
})
const open = async (c = cookie) => { const r = await connectWs(base, c); if (!('client' in r)) throw new Error(`rejeitado ${r.rejected}`); return r.client }
const waitUntil = async (fn: () => boolean, timeoutMs = 1000): Promise<void> => {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout esperando condição')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('handshake', () => {
  it('sem cookie → 401; Origin errado → 403; ok → hunt.idle', async () => {
    expect(await connectWs(base)).toEqual({ rejected: 401 })
    expect(await connectWs(base, cookie, { origin: 'http://evil.test' })).toEqual({ rejected: 403 })
    expect(await connectWs(base, cookie, {})).toEqual({ rejected: 403 })
    const c = await open()
    expect(await c.next()).toEqual({ t: 'hunt.idle' })
    expect(t.sockets.countFor(trainerId)).toBe(1)
    c.close(); await c.closed()
    // O fechamento é um handshake de dois lados: o evento 'close' do cliente não garante que o
    // servidor já rodou sua própria limpeza (a ordem entre os dois lados não é determinística).
    await waitUntil(() => t.sockets.countFor(trainerId) === 0)
  })
})

describe('hunt pelo socket', () => {
  it('start por REST manda snapshot; ticks chegam; intents funcionam; stop manda hunt.stopped', async () => {
    const c = await open()
    await c.next() // idle
    await api(t.app, cookie).post('/hunts/route-1/start')
    const snap = await c.nextOf('hunt.snapshot')
    expect(JSON.stringify(snap)).not.toMatch(/seed|rngState/)
    expect(snap['session']).toMatchObject({ huntId: 'route-1', startedAt: T0.toISOString() })
    t.scheduler.tick(); t.scheduler.tick() // tick 0 só escolhe alvo (sem eventos); o 1 já anda ou luta
    const tick = await c.nextOf('hunt.tick')
    expect(tick['tick']).toBe(1)
    expect(Array.isArray(tick['events'])).toBe(true)
    c.send({ t: 'ping' }); expect(await c.nextOf('pong')).toEqual({ t: 'pong' })
    c.send({ t: 'item.use', itemId: 'potion' })
    expect(await c.nextOf('error')).toMatchObject({ t: 'error', code: 'full-hp' })
    t.clock.now = new Date(t.clock.now.getTime() + 250)
    c.send({ t: 'team.setActive', pokemonId: 'alheio' })
    expect(await c.nextOf('error')).toMatchObject({ code: 'unknown-pokemon' })
    t.clock.now = new Date(t.clock.now.getTime() + 250)
    c.send({ t: 'settings.update', patch: { returnHpPercent: 70 } })
    await new Promise((r) => setTimeout(r, 50))
    expect(t.scheduler.get(trainerId)!.state.settings.returnHpPercent).toBe(70)
    t.clock.now = new Date(t.clock.now.getTime() + 250)
    c.send({ t: 'hunt.stop' })
    expect(await c.nextOf('hunt.stopped')).toEqual({ t: 'hunt.stopped', reason: 'intent', healed: false })
    expect(t.scheduler.get(trainerId)).toBeUndefined()
    c.close()
  })
  it('dois sockets do mesmo treinador recebem o mesmo tick', async () => {
    const a = await open(); const b = await open()
    await a.next(); await b.next()
    await api(t.app, cookie).post('/hunts/route-1/start')
    await a.nextOf('hunt.snapshot'); await b.nextOf('hunt.snapshot')
    t.scheduler.tick(); t.scheduler.tick() // idem: só o 2º tick produz eventos
    expect(await a.nextOf('hunt.tick')).toEqual(await b.nextOf('hunt.tick'))
    a.close(); b.close()
  })
})

describe('abuso', () => {
  it('rate limit: 2ª intenção em 200 ms → rate-limited; ping não conta', async () => {
    const c = await open(); await c.next()
    c.send({ t: 'item.use', itemId: 'potion' }); await c.nextOf('error') // no-hunt
    c.send({ t: 'ping' }); await c.nextOf('pong')
    c.send({ t: 'item.use', itemId: 'potion' })
    expect(await c.nextOf('error')).toMatchObject({ code: 'rate-limited' })
    c.close()
  })
  it('mensagem inválida → validation; três seguidas → fechado 1008; mensagem grande → validation', async () => {
    const c = await open(); await c.next()
    c.send('{"t":"item.use","itemId":"' + 'a'.repeat(WS_MAX_MESSAGE_BYTES) + '"}')
    expect(await c.nextOf('error')).toMatchObject({ t: 'error', code: 'validation', message: expect.stringMatching(/bytes/) })
    c.send('{'); await c.nextOf('error')
    c.send({ t: 'hack' }); await c.nextOf('error')
    expect(await c.closed()).toMatchObject({ code: 1008 })
  })
  it('logout fecha o socket com 1008; sessão apagada fecha na revalidação', async () => {
    const c = await open(); await c.next()
    await api(t.app, cookie).post('/auth/logout')
    expect(await c.closed()).toMatchObject({ code: 1008, reason: 'logout' })
    const { cookie: c2 } = await registerAndLogin(t.app, 2)
    const d = await open(c2); await d.next()
    await t.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(c2.slice('sid='.length))))
    expect(await d.closed()).toMatchObject({ code: 1008 })
  })
  it('sem pong o servidor fecha com 1001', async () => {
    const c = await open(); await c.next()
    c.raw.pong = () => {} // cliente mudo
    expect(await c.closed()).toMatchObject({ code: 1001 })
  })
})
