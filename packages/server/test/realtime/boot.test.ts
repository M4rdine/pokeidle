import { createRng, hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon } from '../../src/db/schema.js'
import { simulate } from '../../src/engine/simulate.js'
import { loadActive, startHunt } from '../../src/hunt-store/index.js'
import { AppError } from '../../src/http/errors.js'
import { createShutdown, recoverSessions } from '../../src/realtime/boot.js'
import type { Scheduler } from '../../src/realtime/scheduler.js'
import { truncateAll } from '../helpers/db.js'
import { api, registerAndLogin, silentLogger, T0, testApp, type TestApp } from '../helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => {
  // Drena qualquer cadeia de persistência em voo do teste anterior antes do truncate — mesmo
  // padrão de scheduler.test.ts; sem isto, um `truncate` concorrente com um `UPDATE` em voo do
  // catch-up do teste de `recoverSessions` pode colidir em deadlock real do Postgres (40P01).
  await t.scheduler.idle()
  await truncateAll(t.db)
  t.clock.now = T0
})

async function trainerWithHunt(n: number, seed: number): Promise<string> {
  const { cookie, trainerId } = await registerAndLogin(t.app, n)
  await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
  const charmander = t.registry.species.get('charmander')!
  const hpMax = hpAt(charmander.baseStats.hp, 12)
  await t.db.update(pokemon).set({ level: 12, xp: xpForLevel(charmander.growthRate, 12), hp: hpMax, hpMax }).where(eq(pokemon.trainerId, trainerId))
  await startHunt(t.db, loadRegistry(), trainerId, 'route-1', T0, { seed })
  return trainerId
}

describe('recoverSessions', () => {
  it('recria os runners, faz catch-up determinístico e pula sessão corrompida', async () => {
    const a = await trainerWithHunt(1, 1)
    const b = await trainerWithHunt(2, 2)
    const c = await trainerWithHunt(3, 3)
    await t.db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, c))
    const beforeA = (await loadActive(t.db, a))!
    t.clock.now = new Date(T0.getTime() + 2 * 60 * 1000) // 600 ticks
    const res = await recoverSessions(t.scheduler, t.db, () => t.clock.now, silentLogger)
    expect(res).toEqual({ recovered: 2, failed: 1 })
    const ref = simulate(beforeA.state, 600, { registry: loadRegistry(), hunt: loadRegistry().hunts.get('route-1')!, rng: createRng(beforeA.seed, beforeA.rngState) })
    expect(t.scheduler.get(a)!.state).toEqual(ref.state)
    expect(t.scheduler.get(b)).toBeDefined()
    expect(t.scheduler.get(c)).toBeUndefined()
    expect(await loadActive(t.db, c)).toBeNull()
  })

  it('conta como failed quando attach lança (não só quando o snapshot está corrompido) e continua para o próximo trainer', async () => {
    const a = await trainerWithHunt(1, 5)
    const b = await trainerWithHunt(2, 6)
    // `t.scheduler` de verdade por baixo; só `attach` é substituído para simular uma falha
    // qualquer (ex.: erro transitório de banco) só para `a` — `b` continua indo pro `attach`
    // real, provando que o laço não para no primeiro erro.
    const throwingScheduler: Scheduler = {
      ...t.scheduler,
      attach: (trainerId: string) => (trainerId === a ? Promise.reject(new AppError('no-hunt', 'sessão sumiu')) : t.scheduler.attach(trainerId)),
    }
    const res = await recoverSessions(throwingScheduler, t.db, () => t.clock.now, silentLogger)
    expect(res).toEqual({ recovered: 1, failed: 1 })
    expect(t.scheduler.get(b)).toBeDefined()
  })
})

describe('shutdown', () => {
  it('para o timer, flush com sync, fecha sockets; é idempotente', async () => {
    const a = await trainerWithHunt(1, 4)
    await t.scheduler.attach(a)
    for (let i = 0; i < 30; i++) t.scheduler.tick()
    let closed = 0
    const shutdown = createShutdown({ app: { close: async () => {} }, scheduler: t.scheduler, sockets: t.sockets, close: async () => { closed++ }, logger: silentLogger })
    await shutdown(); await shutdown()
    expect(closed).toBe(1)
    expect(t.scheduler.isStopping()).toBe(true)
    expect((await loadActive(t.db, a))!.state.tick).toBe(30)
  })
})
