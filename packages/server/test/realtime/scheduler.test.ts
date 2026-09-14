import { createRng, hpAt, loadRegistry, TICK_MS, xpForLevel } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chooseStarter } from '../../src/account/starter.js'
import type { Db } from '../../src/db/client.js'
import { huntLog, huntSessions, inventory, pokemon, trainers, users } from '../../src/db/schema.js'
import { simulate } from '../../src/engine/simulate.js'
import { loadActive, startHunt } from '../../src/hunt-store/index.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from '../../src/realtime/constants.js'
import { createScheduler, type Scheduler } from '../../src/realtime/scheduler.js'
import { createSocketRegistry, OPEN, type SocketLike } from '../../src/realtime/sockets.js'
import { silentLogger } from '../helpers/app.js'
import { openTestDb, truncateAll } from '../helpers/db.js'

const registry = loadRegistry()
const T0 = new Date('2026-09-14T12:00:00Z')
let db: Db
let close: () => Promise<void>
let trainerId: string
const clock = { now: T0 }
let sockets = createSocketRegistry()
let scheduler: Scheduler

const fakeSocket = () => { const s = { sent: [] as string[], readyState: OPEN, send(d: string) { s.sent.push(d) }, close() { s.readyState = 3 } }; return s as SocketLike & { sent: string[] } }
const msgs = (s: { sent: string[] }) => s.sent.map((x) => JSON.parse(x) as { t: string })
const start = async (seed = 1) => { await startHunt(db, registry, trainerId, 'route-1', clock.now, { seed }); await scheduler.attach(trainerId) }

beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => {
  await truncateAll(db)
  clock.now = T0
  sockets = createSocketRegistry()
  scheduler = createScheduler({ db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })
  const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
  const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash' }).returning()
  trainerId = t!.id
  await db.insert(inventory).values([{ trainerId, itemId: 'poke-ball', quantity: 5 }, { trainerId, itemId: 'potion', quantity: 3 }])
  await chooseStarter(db, registry, trainerId, 'charmander', T0)
  // xp/hp/hpMax precisam bater com a fórmula canônica do nível: gainXp recalcula hpMax a
  // cada xp ganho (mesmo sem level up) a partir do xp armazenado, não do campo `level`; um
  // trio inconsistente corrompe o hp na primeira vitória (delta hpMax vira dano fantasma).
  const charmander = registry.species.get('charmander')!
  const hpMax = hpAt(charmander.baseStats.hp, 12)
  await db.update(pokemon).set({ level: 12, xp: xpForLevel(charmander.growthRate, 12), hp: hpMax, hpMax })
})

describe('attach / tick / persist', () => {
  it('attach sem atraso cria o runner e manda snapshot; ticks avançam e persistem no ritmo certo', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await start(42)
    expect(scheduler.size()).toBe(1)
    expect(msgs(s).map((m) => m.t)).toEqual(['hunt.snapshot'])
    expect(s.sent[0]).not.toMatch(/seed|rngState/)
    for (let i = 0; i < SNAPSHOT_EVERY_TICKS; i++) { clock.now = new Date(clock.now.getTime() + TICK_MS); scheduler.tick() }
    await scheduler.whenIdle(trainerId)
    const runner = scheduler.get(trainerId)!
    expect(runner.state.tick).toBe(SNAPSHOT_EVERY_TICKS)
    const active = (await loadActive(db, trainerId))!
    expect(active.state.tick).toBe(SNAPSHOT_EVERY_TICKS)
    expect(active.lastSimulatedAt).toEqual(clock.now)
    expect(await db.select().from(huntLog)).toEqual([]) // ainda sem sync
    expect(msgs(s).filter((m) => m.t === 'hunt.tick').length).toBeGreaterThan(0)
    for (let i = SNAPSHOT_EVERY_TICKS; i < SYNC_EVERY_TICKS; i++) { clock.now = new Date(clock.now.getTime() + TICK_MS); scheduler.tick() }
    await scheduler.whenIdle(trainerId)
    const logRows = await db.select().from(huntLog).where(eq(huntLog.trainerId, trainerId))
    expect(logRows.length).toBeGreaterThan(0)
    const [tr] = await db.select().from(trainers).where(eq(trainers.id, trainerId))
    expect(tr!.xp).toBe(scheduler.get(trainerId)!.state.trainer.xp)
    expect(scheduler.get(trainerId)!.pendingLog).toEqual([])
  })
  it('a simulação é igual a simulate() com a mesma seed e rngState', async () => {
    await start(7)
    const before = (await loadActive(db, trainerId))!
    for (let i = 0; i < 400; i++) scheduler.tick()
    const ref = simulate(before.state, 400, { registry, hunt: registry.hunts.get('route-1')!, rng: createRng(before.seed, before.rngState) })
    expect(scheduler.get(trainerId)!.state).toEqual(ref.state)
    await scheduler.whenIdle(trainerId) // drena os saves/syncs enfileirados antes do truncate do próximo teste
  })
  it('attach com atraso faz catch-up em fatias, manda catchup/summary/snapshot e persiste com sync', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await startHunt(db, registry, trainerId, 'route-1', T0, { seed: 4 })
    const before = (await loadActive(db, trainerId))!
    clock.now = new Date(T0.getTime() + 10 * 60 * 1000) // 3000 ticks
    await scheduler.attach(trainerId)
    const ref = simulate(before.state, 3000, { registry, hunt: registry.hunts.get('route-1')!, rng: createRng(before.seed, before.rngState) })
    expect(scheduler.get(trainerId)!.state).toEqual(ref.state)
    expect(scheduler.get(trainerId)!.catchingUp).toBe(false)
    const types = msgs(s).map((m) => m.t)
    expect(types.filter((t) => t === 'hunt.catchup').length).toBe(2)
    expect(types.slice(-2)).toEqual(['hunt.summary', 'hunt.snapshot'])
    await scheduler.whenIdle(trainerId)
    expect((await loadActive(db, trainerId))!.state.tick).toBe(3000)
    expect((await db.select().from(huntLog)).length).toBeGreaterThan(0)
  })
  it('attach com sessão inexistente falha com no-hunt; attach de snapshot corrompido finaliza sem sync', async () => {
    await expect(scheduler.attach(trainerId)).rejects.toMatchObject({ code: 'no-hunt' })
    await startHunt(db, registry, trainerId, 'route-1', T0)
    await db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await scheduler.attach(trainerId)
    expect(scheduler.size()).toBe(0)
    expect(await db.select().from(huntSessions)).toEqual([])
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'corrupt', healed: false })
  })
})

describe('intents e finish', () => {
  it('applyIntent troca o estado e manda hunt.tick; sem runner devolve erro', async () => {
    expect(scheduler.applyIntent(trainerId, { type: 'stop' })).toMatchObject({ error: { code: 'no-hunt' } })
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await start()
    const before = scheduler.get(trainerId)!
    const r = scheduler.applyIntent(trainerId, { type: 'updateSettings', patch: { returnHpPercent: 55 } })
    expect('error' in r).toBe(false)
    expect(scheduler.get(trainerId)!.state.settings.returnHpPercent).toBe(55)
    expect(scheduler.get(trainerId)!.rng).toBe(before.rng)
    expect(scheduler.applyIntent(trainerId, { type: 'setActive', pokemonId: 'alheio' })).toMatchObject({ error: { code: 'unknown-pokemon' } })
  })
  it('intent stop finaliza: sync, apaga a sessão, manda hunt.stopped sem cura', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await start(5)
    for (let i = 0; i < 100; i++) scheduler.tick()
    const xp = scheduler.get(trainerId)!.state.trainer.xp
    const trainer = await scheduler.finish(trainerId, 'intent')
    expect(trainer?.xp).toBe(xp)
    expect(scheduler.size()).toBe(0)
    expect(await db.select().from(huntSessions)).toEqual([])
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'intent', healed: false })
    expect(await scheduler.finish(trainerId, 'intent')).toBeNull()
  })
  it('team-fainted no tick finaliza com cura do time', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await db.update(pokemon).set({ level: 1, hp: 1, hpMax: 12 })
    await start(11)
    let guard = 0
    while (scheduler.size() > 0 && guard++ < 3000) scheduler.tick()
    await new Promise((r) => setTimeout(r, 20))
    expect(scheduler.size()).toBe(0)
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'team-fainted', healed: true })
    const [p] = await db.select().from(pokemon).where(eq(pokemon.trainerId, trainerId))
    expect(p!.hp).toBe(p!.hpMax)
    expect(await db.select().from(huntSessions)).toEqual([])
  })
  it('flushAll grava todos os runners com sync', async () => {
    await start()
    for (let i = 0; i < 10; i++) scheduler.tick()
    await scheduler.flushAll()
    expect((await loadActive(db, trainerId))!.state.tick).toBe(10)
  })
  it('escritas ficam em ordem: um save enfileirado antes do finish chega antes', async () => {
    await start(2)
    for (let i = 0; i < SNAPSHOT_EVERY_TICKS; i++) scheduler.tick() // enfileira um save
    for (let i = 0; i < 20; i++) scheduler.tick()
    const trainer = await scheduler.finish(trainerId, 'intent')
    expect(trainer).not.toBeNull()
    expect(await db.select().from(huntSessions)).toEqual([]) // o save (UPDATE) não ressuscita a linha porque veio antes do DELETE
  })
})
