import { randomBytes } from 'node:crypto'
import net from 'node:net'
import { hpAt, xpForLevel } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { pokemon, sessions } from '../../src/db/schema.js'
import { hashToken, resolveSession, TOUCH_INTERVAL_MS } from '../../src/auth/session.js'
import { WS_MAX_MESSAGE_BYTES } from '../../src/realtime/constants.js'
import { truncateAll } from '../helpers/db.js'
import { api, ORIGIN, registerAndLogin, T0, testApp, type TestApp } from '../helpers/app.js'
import { connectWs, listen } from '../helpers/ws.js'

const WS_OPEN = 1 // WebSocket.OPEN

/** Handshake HTTP cru de upgrade (Connection/Upgrade/Sec-WebSocket-*), sem completar o protocolo
 * WS — usado pra provar que uma tentativa de upgrade numa rota que não é `/ws` recebe a resposta
 * HTTP normal (404/401) e tem o socket bruto fechado pelo servidor, em vez de ficar pendurado. */
function rawUpgradeAttempt(port: number, path: string): Promise<{ status: number; closed: boolean }> {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64')
    const socket = net.connect({ port, host: '127.0.0.1' })
    let status = 0
    let settled = false
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('timeout esperando o servidor fechar o socket')) } }, 1000)
    socket.on('connect', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Origin: ${ORIGIN}\r\n` +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n\r\n`,
      )
    })
    socket.on('data', (chunk) => {
      const match = /^HTTP\/1\.1 (\d+)/.exec(chunk.toString())
      if (match?.[1]) status = Number(match[1])
    })
    socket.on('close', () => { if (!settled) { settled = true; clearTimeout(timer); resolve({ status, closed: true }) } })
    socket.on('error', (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err) } })
  })
}

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

  it('upgrade de origem errada é rejeitado antes de tocar no banco (sessão não é revalidada/tocada)', async () => {
    const tokenHash = hashToken(cookie.slice('sid='.length))
    const [before] = await t.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash))
    expect(before).toBeDefined()
    // Avança o relógio além do intervalo de touch: se o hook de origem não interceptasse a
    // requisição de upgrade ANTES do authPlugin, `resolveSession` tocaria `last_seen_at`.
    t.clock.now = new Date(t.clock.now.getTime() + TOUCH_INTERVAL_MS + 1000)
    expect(await connectWs(base, cookie, { origin: 'http://evil.test' })).toEqual({ rejected: 403 })
    const [after] = await t.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash))
    expect(after?.lastSeenAt).toEqual(before?.lastSeenAt)
  })
})

describe('upgrade fora de /ws', () => {
  it('GET /naoexiste com cabeçalhos de upgrade → 404 HTTP e o servidor fecha o socket', async () => {
    const port = Number(new URL(base).port)
    const r = await rawUpgradeAttempt(port, '/naoexiste')
    expect(r.status).toBe(404)
    expect(r.closed).toBe(true)
  })
  it('GET /me com cabeçalhos de upgrade (sem cookie) → 401 HTTP e o servidor fecha o socket', async () => {
    const port = Number(new URL(base).port)
    const r = await rawUpgradeAttempt(port, '/me')
    expect(r.status).toBe(401)
    expect(r.closed).toBe(true)
  })
})

describe('teto de sockets por treinador', () => {
  it('maxSocketsPerTrainer: a conexão além do teto é fechada com 1013; countFor não passa do teto', async () => {
    const t2 = await testApp({ ws: { maxSocketsPerTrainer: 2 } })
    try {
      const base2 = await listen(t2.app)
      const { cookie: c2, trainerId: tid2 } = await registerAndLogin(t2.app, 61)
      const open2 = async () => { const r = await connectWs(base2, c2); if (!('client' in r)) throw new Error(`rejeitado ${r.rejected}`); return r.client }
      const a = await open2(); await a.next()
      const b = await open2(); await b.next()
      expect(t2.sockets.countFor(tid2)).toBe(2)
      const c = await open2()
      expect(await c.closed()).toMatchObject({ code: 1013 })
      expect(t2.sockets.countFor(tid2)).toBe(2)
      a.close(); b.close()
    } finally {
      await t2.close()
    }
  })
})

describe('revalidação de sessão', () => {
  it('falha transitória do banco na revalidação periódica não fecha o socket nem gera rejeição não tratada', async () => {
    let attempts = 0
    const failingResolveSession: typeof resolveSession = () => {
      attempts++
      return Promise.reject(new Error('banco indisponível'))
    }
    const t2 = await testApp({ ws: { pingMs: 1000, pongTimeoutMs: 1000, sessionRecheckMs: 40, resolveSession: failingResolveSession } })
    const unhandled: unknown[] = []
    const onUnhandledRejection = (err: unknown): void => { unhandled.push(err) }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      const base2 = await listen(t2.app)
      const { cookie: c2 } = await registerAndLogin(t2.app, 62)
      const r = await connectWs(base2, c2)
      if (!('client' in r)) throw new Error(`rejeitado ${r.rejected}`)
      await r.client.next() // hunt.idle
      await new Promise((res) => setTimeout(res, 120)) // > 2 * sessionRecheckMs
      expect(attempts).toBeGreaterThanOrEqual(2)
      expect(r.client.raw.readyState).toBe(WS_OPEN)
      expect(unhandled).toEqual([])
      r.client.close()
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
      await t2.close()
    }
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
    await waitUntil(() => t.scheduler.get(trainerId)?.state.settings.returnHpPercent === 70)
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
