import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'

type Method = NonNullable<InjectOptions['method']>
import { loadConfig } from '../../src/config.js'
import type { Db } from '../../src/db/client.js'
import { buildApp } from '../../src/http/app.js'
import { openTestDb, truncateAll } from './db.js'

export const ORIGIN = 'http://localhost:3000'
export const T0 = new Date('2026-09-14T12:00:00Z')

export interface TestApp { app: FastifyInstance; db: Db; clock: { now: Date }; close: () => Promise<void> }

export async function testApp(): Promise<TestApp> {
  const { db, close } = await openTestDb()
  await truncateAll(db)
  const config = loadConfig({ DATABASE_URL: 'postgres://x:x@localhost:1/x', APP_ORIGIN: ORIGIN, ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1' })
  const clock = { now: T0 }
  const app = await buildApp({ db, config, now: () => clock.now, logger: false })
  return { app, db, clock, close: async () => { await app.close(); await close() } }
}

type Body = Record<string, unknown> | undefined
export function api(app: FastifyInstance, cookie?: string) {
  const call = (method: Method, url: string, payload?: Body, headers: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload !== undefined && { payload }), headers: { origin: ORIGIN, ...(cookie && { cookie }), ...headers } })
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

export async function registerAndLogin(app: FastifyInstance, n = 1): Promise<{ cookie: string; trainerId: string; email: string }> {
  const email = `user${n}@test.dev`
  const res = await api(app).post('/auth/register', { email, password: 'senha-forte-123', name: `Trainer${n}` })
  if (res.statusCode !== 201) throw new Error(`registro falhou: ${res.body}`)
  return { cookie: cookieOf(res), trainerId: (res.json() as { trainer: { id: string } }).trainer.id, email }
}
