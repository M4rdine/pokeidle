import { loadRegistry } from '@pokeidle/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chooseStarter } from '../../src/account/starter.js'
import type { Db } from '../../src/db/client.js'
import { inventory, trainers, users } from '../../src/db/schema.js'
import { startHunt } from '../../src/hunt-store/index.js'
import { createScheduler, type Scheduler } from '../../src/realtime/scheduler.js'
import { createSocketRegistry } from '../../src/realtime/sockets.js'
import type { SchedulerHooks } from '../../src/realtime/scheduler.js'
import { silentLogger } from '../helpers/app.js'
import { openTestDb, truncateAll } from '../helpers/db.js'

const registry = loadRegistry()
const T0 = new Date('2026-09-20T12:00:00Z')

interface Registrado {
  readonly ticks: { durationMs: number; lagMs: number; runners: number }[]
  readonly persistEnds: { kind: string; ms: number; ok: boolean }[]
  readonly iniciadas: number
  readonly terminadas: string[]
  readonly erros: string[]
}

/** Um espião no formato dos ganchos: o scheduler não sabe que é teste. */
function espiao(): { hooks: SchedulerHooks; visto: Registrado } {
  const visto = { ticks: [], persistEnds: [], iniciadas: 0, terminadas: [], erros: [] } as unknown as Registrado
  const mutavel = visto as unknown as { iniciadas: number }
  return {
    visto,
    hooks: {
      onTick: (durationMs, lagMs, runners) => { visto.ticks.push({ durationMs, lagMs, runners }) },
      onPersistEnd: (kind, _t, ms, ok) => { visto.persistEnds.push({ kind, ms, ok }) },
      onHuntStarted: () => { mutavel.iniciadas += 1 },
      onHuntFinished: (reason) => { visto.terminadas.push(reason) },
      onError: (scope) => { visto.erros.push(scope) },
    },
  }
}

let db: Db
let close: () => Promise<void>
let trainerId: string
const clock = { now: T0 }
let scheduler: Scheduler
let espia: ReturnType<typeof espiao>

beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => {
  if (scheduler) await scheduler.idle()
  await truncateAll(db)
  clock.now = T0
  espia = espiao()
  scheduler = createScheduler({
    db, registry, now: () => clock.now, sockets: createSocketRegistry(),
    logger: silentLogger, yieldNow: () => Promise.resolve(), hooks: espia.hooks,
  })
  const [u] = await db.insert(users).values({ email: 'm@m.com', passwordHash: 'x' }).returning()
  const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Metrica' }).returning()
  trainerId = t!.id
  await db.insert(inventory).values([{ trainerId, itemId: 'poke-ball', quantity: 5 }])
  await chooseStarter(db, registry, trainerId, 'charmander', T0)
})

describe('ganchos de métrica no agendador', () => {
  it('cada tick informa duração, atraso e quantas caçadas rodaram', async () => {
    await startHunt(db, registry, trainerId, 'campo-inicial', T0)
    await scheduler.attach(trainerId)
    espia.visto.ticks.length = 0

    scheduler.tick()
    scheduler.tick()
    await scheduler.idle()

    expect(espia.visto.ticks).toHaveLength(2)
    for (const t of espia.visto.ticks) {
      expect(t.runners).toBe(1)
      expect(t.durationMs).toBeGreaterThanOrEqual(0)
      expect(t.lagMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('o tick conta as caçadas que rodaram, não as que existem', async () => {
    await startHunt(db, registry, trainerId, 'campo-inicial', T0)
    await scheduler.attach(trainerId)
    espia.visto.ticks.length = 0
    scheduler.tick()
    await scheduler.idle()
    expect(espia.visto.ticks.at(-1)?.runners).toBe(1)

    scheduler.detach(trainerId)
    espia.visto.ticks.length = 0
    scheduler.tick()
    await scheduler.idle()
    expect(espia.visto.ticks.at(-1)?.runners).toBe(0)
  })

  it('o fim da caçada informa o motivo real da parada', async () => {
    await startHunt(db, registry, trainerId, 'campo-inicial', T0)
    await scheduler.attach(trainerId)
    await scheduler.finish(trainerId, 'intent')
    await scheduler.idle()
    expect(espia.visto.terminadas).toEqual(['intent'])
  })

  it('a persistência informa tipo, duração e se deu certo', async () => {
    await startHunt(db, registry, trainerId, 'campo-inicial', T0)
    await scheduler.attach(trainerId)
    await scheduler.finish(trainerId, 'intent')
    await scheduler.idle()

    const fim = espia.visto.persistEnds.find((p) => p.kind === 'finish')
    expect(fim, 'o finish precisa aparecer na persistência').toBeDefined()
    expect(fim!.ok).toBe(true)
    expect(fim!.ms).toBeGreaterThanOrEqual(0)
  })

  it('um scheduler sem ganchos funciona igual: a métrica é opcional', async () => {
    const semGanchos = createScheduler({
      db, registry, now: () => clock.now, sockets: createSocketRegistry(),
      logger: silentLogger, yieldNow: () => Promise.resolve(),
    })
    await startHunt(db, registry, trainerId, 'campo-inicial', T0)
    await semGanchos.attach(trainerId)
    expect(() => semGanchos.tick()).not.toThrow()
    await semGanchos.idle()
    await semGanchos.finish(trainerId, 'intent')
    await semGanchos.idle()
  })
})
