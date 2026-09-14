import { loadRegistry, type Registry } from '@pokeidle/shared'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { loadConfig } from '../../src/config.js'
import type { Db } from '../../src/db/client.js'
import { buildApp } from '../../src/http/app.js'
import { createScheduler, type Scheduler } from '../../src/realtime/scheduler.js'
import { createSocketRegistry, type SocketRegistry } from '../../src/realtime/sockets.js'
import { openTestDb, truncateAll } from './db.js'

export const ORIGIN = 'http://localhost:3000'
export const T0 = new Date('2026-09-14T12:00:00Z')

export const silentLogger = { info: () => {}, warn: () => {}, error: () => {} }

export interface TestApp {
  app: FastifyInstance; db: Db; clock: { now: Date }
  registry: Registry; scheduler: Scheduler; sockets: SocketRegistry
  close: () => Promise<void>
}

const testConfig = (overrides: Readonly<Record<string, string>> = {}) =>
  loadConfig({ DATABASE_URL: 'postgres://x:x@localhost:1/x', APP_ORIGIN: ORIGIN, ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1', ...overrides })

export async function testApp(): Promise<TestApp> {
  const { db, close } = await openTestDb()
  await truncateAll(db)
  const clock = { now: T0 }
  const registry = loadRegistry()
  const sockets = createSocketRegistry()
  const scheduler = createScheduler({ db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })
  const app = await buildApp({ db, config: testConfig(), now: () => clock.now, logger: false, realtime: { scheduler, sockets } })
  return {
    app, db, clock, registry, scheduler, sockets,
    close: async () => { await scheduler.stop(); await app.close(); await close() },
  }
}

/** Constrói uma instância de app isolada (banco e relógio compartilhados com `t`), útil para testes que não podem herdar estado do app principal (ex.: contador do rate limit, rotas extras de teste, config diferente como TRUST_PROXY). */
export async function freshApp(
  t: Pick<TestApp, 'db' | 'clock'>,
  extraRoutes?: (app: FastifyInstance) => void,
  configOverrides?: Readonly<Record<string, string>>,
): Promise<FastifyInstance> {
  const registry = loadRegistry()
  const sockets = createSocketRegistry()
  const scheduler = createScheduler({ db: t.db, registry, now: () => t.clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })
  return buildApp({ db: t.db, config: testConfig(configOverrides), now: () => t.clock.now, logger: false, realtime: { scheduler, sockets }, ...(extraRoutes && { extraRoutes }) })
}

type Method = NonNullable<InjectOptions['method']>
type Body = Record<string, unknown> | undefined
export function api(app: FastifyInstance, cookie?: string, opts: { ip?: string } = {}) {
  const call = (method: Method, url: string, payload?: Body, headers: Record<string, string> = {}) =>
    app.inject({
      method,
      url,
      ...(payload !== undefined && { payload }),
      ...(opts.ip && { remoteAddress: opts.ip }),
      headers: { origin: ORIGIN, ...(cookie && { cookie }), ...headers },
    })
  return {
    get: (url: string, headers?: Record<string, string>) => call('GET', url, undefined, headers),
    post: (url: string, payload?: Body, headers?: Record<string, string>) => call('POST', url, payload ?? {}, headers),
    put: (url: string, payload: Body, headers?: Record<string, string>) => call('PUT', url, payload, headers),
    patch: (url: string, payload: Body, headers?: Record<string, string>) => call('PATCH', url, payload, headers),
  }
}

export function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie']
  const first = Array.isArray(raw) ? raw[0] : raw
  if (!first) throw new Error('resposta sem set-cookie')
  return first.split(';')[0]!
}

// Contador de módulo: cada chamada de registerAndLogin usa um IP novo, nunca reaproveitado, pra
// nunca esbarrar no rate limit de /auth/register (10/min por IP) só por causa de quantos testes
// existem no arquivo. `n` continua sendo só o e-mail/nome, não o IP.
let ipCallCount = 0
const nextTestIp = (): string => {
  const c = ipCallCount++
  return `10.1.${Math.floor(c / 250)}.${(c % 250) + 1}`
}

export async function registerAndLogin(app: FastifyInstance, n = 1): Promise<{ cookie: string; trainerId: string; email: string }> {
  const email = `user${n}@test.dev`
  const res = await api(app, undefined, { ip: nextTestIp() }).post('/auth/register', { email, password: 'senha-forte-123', name: `Trainer${n}` })
  if (res.statusCode !== 201) throw new Error(`registro falhou: ${res.body}`)
  return { cookie: cookieOf(res), trainerId: (res.json() as { trainer: { id: string } }).trainer.id, email }
}
