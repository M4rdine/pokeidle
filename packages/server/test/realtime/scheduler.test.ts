import { createRng, hpAt, loadRegistry, TICK_MS, xpForLevel } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseStarter } from '../../src/account/starter.js'
import type { Db } from '../../src/db/client.js'
import { huntLog, huntSessions, inventory, pokemon, trainers, users } from '../../src/db/schema.js'
import { simulate } from '../../src/engine/simulate.js'
import { loadActive, startHunt } from '../../src/hunt-store/index.js'
import { PERSIST_MAX_FAILURES, SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from '../../src/realtime/constants.js'
import { finishRunner, flushRunner } from '../../src/realtime/persist.js'
import { createScheduler, type Scheduler } from '../../src/realtime/scheduler.js'
import { createSocketRegistry, OPEN, type SocketLike } from '../../src/realtime/sockets.js'
import { silentLogger } from '../helpers/app.js'
import { openTestDb, truncateAll } from '../helpers/db.js'

const registry = loadRegistry()
/** Mesmo registro, mas sem nenhuma hunt — usado para forçar `engineDeps` a falhar com `not-found`. */
const brokenRegistry = { ...registry, hunts: new Map() }
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
  if (scheduler) await scheduler.idle() // drena qualquer cadeia em voo do teste anterior antes do truncate
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
    expect(msgs(s).filter((m) => m.t === 'hunt.catchup').map((m) => (m as unknown as { ticksRemaining: number }).ticksRemaining)).toEqual([3000, 1000, 0])
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
    await scheduler.whenIdle(trainerId)
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
    const kinds: string[] = []
    const s2 = createScheduler({
      db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve(),
      hooks: { onPersistStart: (kind) => kinds.push(kind) },
    })
    await startHunt(db, registry, trainerId, 'route-1', clock.now, { seed: 2 })
    await s2.attach(trainerId)
    for (let i = 0; i < SNAPSHOT_EVERY_TICKS; i++) s2.tick() // enfileira um save
    for (let i = 0; i < 20; i++) s2.tick()
    const trainer = await s2.finish(trainerId, 'intent')
    expect(trainer).not.toBeNull()
    expect(await db.select().from(huntSessions)).toEqual([]) // o save (UPDATE) não ressuscita a linha porque veio antes do DELETE
    expect(kinds).toEqual(['save', 'finish'])
  })
})

describe('contenção de erros e seams de teste', () => {
  it('attach: erro no catch-up (motor) remove o runner, preserva a sessão e propaga o erro', async () => {
    const s2 = createScheduler({ db, registry: brokenRegistry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })
    await startHunt(db, registry, trainerId, 'route-1', T0)
    clock.now = new Date(T0.getTime() + 10 * 60 * 1000) // 3000 ticks > MIN_CATCHUP_TICKS, entra no catch-up
    await expect(s2.attach(trainerId)).rejects.toMatchObject({ code: 'not-found' })
    expect(s2.size()).toBe(0)
    expect((await db.select().from(huntSessions)).length).toBe(1)
  })
  it('attach: catch-up abortado por stop() persiste o tempo simulado (não o relógio) e remove o runner', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await startHunt(db, registry, trainerId, 'route-1', T0, { seed: 4 })
    clock.now = new Date(T0.getTime() + 20 * 60 * 1000) // 6000 ticks
    const abortingScheduler: Scheduler = createScheduler({
      db, registry, now: () => clock.now, sockets, logger: silentLogger,
      yieldNow: async () => { abortingScheduler.stop() },
    })
    await abortingScheduler.attach(trainerId)
    expect(abortingScheduler.size()).toBe(0)
    const types = msgs(s).map((m) => m.t)
    expect(types).not.toContain('hunt.summary')
    expect(types).not.toContain('hunt.snapshot')
    await abortingScheduler.idle()
    const active = (await loadActive(db, trainerId))!
    expect(active.state.tick).toBe(2000)
    expect(active.lastSimulatedAt).toEqual(new Date(T0.getTime() + 2000 * TICK_MS))
  })
  it('tick: erro no motor remove o runner, preserva a sessão e notifica o socket', async () => {
    const s2 = createScheduler({ db, registry: brokenRegistry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await startHunt(db, registry, trainerId, 'route-1', clock.now) // lastSimulatedAt === now: sem catch-up
    await s2.attach(trainerId) // sucesso: o caminho sem catch-up não chama engineDeps
    expect(s2.size()).toBe(1)
    s2.tick()
    expect(s2.size()).toBe(0)
    expect((await db.select().from(huntSessions)).length).toBe(1)
    expect(msgs(s).at(-1)).toEqual({ t: 'error', code: 'internal', message: 'erro interno' })
  })
  it('finish: falha ao persistir propaga erro, mantém a sessão e não manda hunt.stopped', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    const failingFinish: typeof finishRunner = async () => { throw new Error('boom') }
    const s2 = createScheduler({
      db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve(),
      persistence: { flush: flushRunner, finish: failingFinish },
    })
    await startHunt(db, registry, trainerId, 'route-1', clock.now)
    await s2.attach(trainerId)
    await expect(s2.finish(trainerId, 'intent')).rejects.toMatchObject({ code: 'internal' })
    expect(msgs(s).at(-1)).toEqual({ t: 'error', code: 'internal', message: 'erro interno' })
    expect(msgs(s).map((m) => m.t)).not.toContain('hunt.stopped')
    expect((await db.select().from(huntSessions)).length).toBe(1)
    expect(s2.size()).toBe(0)
  })
  it('falhas de persistência consecutivas finalizam a hunt com persist-failed (sem sync)', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    const failingFlush: typeof flushRunner = async () => { throw new Error('db down') }
    const s2 = createScheduler({
      db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve(),
      persistence: { flush: failingFlush, finish: finishRunner },
    })
    await startHunt(db, registry, trainerId, 'route-1', clock.now, { seed: 6 })
    await s2.attach(trainerId)
    for (let i = 0; i < PERSIST_MAX_FAILURES * SNAPSHOT_EVERY_TICKS; i++) { clock.now = new Date(clock.now.getTime() + TICK_MS); s2.tick() }
    await s2.idle() // drena os 3 saves que falham (o terceiro dispara o finish por persist-failed)
    await s2.idle() // drena o finish() encadeado a partir do terceiro
    expect(s2.size()).toBe(0)
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'persist-failed', healed: false })
    expect(await db.select().from(huntSessions)).toEqual([])
    const [tr] = await db.select().from(trainers).where(eq(trainers.id, trainerId))
    expect(tr!.xp).toBe(0) // sem sync: xp nunca foi escrito na tabela trainers
  })
  it('detach remove o runner sem persistir', async () => {
    await start()
    expect(scheduler.size()).toBe(1)
    scheduler.detach(trainerId)
    expect(scheduler.size()).toBe(0)
    expect((await db.select().from(huntSessions)).length).toBe(1) // sessão intacta, nada foi persistido
  })
  it('start/stop/isStopping: start duas vezes cria um único interval; stop limpa', () => {
    vi.useFakeTimers()
    try {
      scheduler.start()
      scheduler.start()
      expect(vi.getTimerCount()).toBe(1)
      expect(scheduler.isStopping()).toBe(false)
      scheduler.stop()
      expect(vi.getTimerCount()).toBe(0)
      expect(scheduler.isStopping()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
