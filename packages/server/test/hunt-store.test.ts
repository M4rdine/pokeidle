import { createRng, loadRegistry } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chooseStarter } from '../src/account/starter.js'
import type { Db } from '../src/db/client.js'
import { huntSessions, inventory, pokedexEntries, pokemon, trainers, users } from '../src/db/schema.js'
import { simulate } from '../src/engine/index.js'
import { CorruptSnapshotError, loadActive, saveSnapshot, startHunt, stopHunt, syncToTables } from '../src/hunt-store/index.js'
import { openTestDb, truncateAll } from './helpers/db.js'

const registry = loadRegistry()
const T0 = new Date('2026-09-14T12:00:00Z')
let db: Db
let close: () => Promise<void>
let trainerId: string

beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
  const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash', xp: 10, gold: 7 }).returning()
  trainerId = t!.id
  await db.insert(inventory).values([{ trainerId, itemId: 'poke-ball', quantity: 5 }, { trainerId, itemId: 'potion', quantity: 3 }])
  await chooseStarter(db, registry, trainerId, 'charmander', T0)
})

const snapshotRows = async () => ({
  pokemon: (await db.select().from(pokemon).orderBy(pokemon.id)).map(({ updatedAt: _u, ...p }) => p),
  inventory: (await db.select().from(inventory).orderBy(inventory.itemId)).map(({ updatedAt: _u, ...i }) => i),
  trainer: (await db.select({ xp: trainers.xp, gold: trainers.gold }).from(trainers))[0],
  dex: await db.select().from(pokedexEntries).orderBy(pokedexEntries.speciesName),
})

describe('startHunt', () => {
  it('monta o HuntState com time, inventário, settings, seen e trainer absolutos', async () => {
    const row = await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 'sess-1', seed: 42 })
    expect(row).toMatchObject({ trainerId, huntId: 'route-1', sessionId: 'sess-1', seed: 42, startedAt: T0, lastSimulatedAt: T0 })
    expect(row.rngState).not.toBe(42) // o spawn inicial já consumiu o PRNG
    const active = await loadActive(db, trainerId)
    expect(active?.state).toMatchObject({
      huntId: 'route-1', sessionId: 'sess-1', tick: 0, trainer: { xp: 10, gold: 7 }, inventory: { 'poke-ball': 5, potion: 3 },
      settings: { returnHpPercent: 30, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false }, seen: ['charmander'] },
    })
    expect(active?.state.player.team).toEqual([{ id: expect.stringMatching(/^st-/), speciesName: 'charmander', level: 10, xp: expect.any(Number), hp: expect.any(Number), hpMax: expect.any(Number) }])
    expect(active?.state.wilds.length).toBeGreaterThan(0)
  })
  it('erros: hunt inexistente, hunt ativa, sem inicial, time todo desmaiado', async () => {
    await expect(startHunt(db, registry, trainerId, 'nope', T0)).rejects.toMatchObject({ code: 'not-found' })
    await startHunt(db, registry, trainerId, 'route-1', T0)
    await expect(startHunt(db, registry, trainerId, 'route-1', T0)).rejects.toMatchObject({ code: 'hunt-active' })
    await db.delete(huntSessions)
    await db.update(pokemon).set({ hp: 0 })
    await expect(startHunt(db, registry, trainerId, 'route-1', T0)).rejects.toMatchObject({ code: 'validation' })
    await db.delete(pokemon)
    await expect(startHunt(db, registry, trainerId, 'route-1', T0)).rejects.toMatchObject({ code: 'no-starter' })
  })
  it('gera sessionId e seed quando não informados', async () => {
    const row = await startHunt(db, registry, trainerId, 'route-1', T0)
    expect(row.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.seed).toBeGreaterThanOrEqual(0)
  })
  it('duas starts concorrentes: só uma conclui, a outra falha com hunt-active; só uma linha persiste', async () => {
    const [r1, r2] = await Promise.allSettled([
      startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's1', seed: 1 }),
      startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's2', seed: 2 }),
    ])
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled')
    const rejected = [r1, r2].filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'hunt-active' })
    const rows = await db.select().from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
    expect(rows).toHaveLength(1)
  })
})

describe('snapshot e sync', () => {
  it('start → sync sem tick é no-op', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 1 })
    const before = await snapshotRows()
    const active = (await loadActive(db, trainerId))!
    await syncToTables(db, trainerId, active.state, new Date(T0.getTime() + 1000))
    expect(await snapshotRows()).toEqual(before)
  })
  it('após 3000 ticks o banco reflete xp, nível, hp, captura, inventário, ouro e pokédex', async () => {
    // seed 1: a seed 42 sugerida pelo brief não captura nada com Charmander nível 10 (inicial);
    // seed 1 foi a primeira, na faixa 1..20, que captura (ver task-5-report.md).
    const row = await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 1 })
    const active = (await loadActive(db, trainerId))!
    const rng = createRng(row.seed, row.rngState)
    const hunt = registry.hunts.get('route-1')!
    const { state } = simulate(active.state, 3000, { registry, hunt, rng })
    const T1 = new Date(T0.getTime() + 3000 * 200)
    await saveSnapshot(db, trainerId, state, rng.state(), T1)
    const saved = (await loadActive(db, trainerId))!
    expect(saved.state).toEqual(state)
    expect(saved.rngState).toBe(rng.state())
    expect(saved.lastSimulatedAt).toEqual(T1)

    await syncToTables(db, trainerId, state, T1)
    const rows = await snapshotRows()
    expect(rows.trainer).toEqual({ xp: state.trainer.xp, gold: state.trainer.gold })
    expect(state.trainer.xp).toBeGreaterThan(10)
    expect(state.trainer.gold).toBeGreaterThan(7) // ouro foi ganho (não é só o valor inicial repassado)
    expect(state.inventory['poke-ball'] ?? 0).toBeLessThan(5) // bolas foram consumidas nas capturas
    const team = state.player.team
    expect(team.length).toBeGreaterThan(1) // houve captura
    for (const [slot, p] of team.entries()) {
      const dbRow = rows.pokemon.find((r) => r.id === p.id)
      expect(dbRow).toMatchObject({ speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: slot, trainerId })
    }
    for (const [itemId, quantity] of Object.entries(state.inventory)) {
      const dbRow = rows.inventory.find((r) => r.itemId === itemId)
      if (quantity > 0) expect(dbRow?.quantity).toBe(quantity)
      else expect(dbRow).toBeUndefined()
    }
    const caught = rows.dex.filter((d) => d.caughtAt !== null).map((d) => d.speciesName)
    for (const p of team) expect(caught).toContain(p.speciesName)
    // sync repetido é idempotente
    const again = await snapshotRows()
    await syncToTables(db, trainerId, state, T1)
    expect(await snapshotRows()).toEqual(again)
  })
  it('loadActive rejeita jsonb corrompido com CorruptSnapshotError e issues do Zod', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0)
    await db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))
    await expect(loadActive(db, trainerId)).rejects.toThrow(CorruptSnapshotError)
    let error: unknown
    try {
      await loadActive(db, trainerId)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(CorruptSnapshotError)
    const corrupt = error as CorruptSnapshotError
    expect(corrupt.code).toBe('internal')
    expect(corrupt.issues.length).toBeGreaterThan(0)
  })
})

describe('stopHunt', () => {
  it('sincroniza, apaga a sessão e devolve o treinador; sem hunt → no-hunt', async () => {
    await expect(stopHunt(db, trainerId, T0)).rejects.toMatchObject({ code: 'no-hunt' })
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 9 })
    const active = (await loadActive(db, trainerId))!
    const hunt = registry.hunts.get('route-1')!
    const { state } = simulate(active.state, 1000, { registry, hunt, rng: createRng(9) })
    await saveSnapshot(db, trainerId, state, 1, T0)
    const trainer = await stopHunt(db, trainerId, T0)
    expect(trainer).toMatchObject({ id: trainerId, xp: state.trainer.xp, gold: state.trainer.gold })
    expect(await loadActive(db, trainerId)).toBeNull()
  })
  it('duas paradas concorrentes: o lock de linha serializa; só uma conclui, a outra vê no-hunt', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 9 })
    const [r1, r2] = await Promise.allSettled([stopHunt(db, trainerId, T0), stopHunt(db, trainerId, T0)])
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled')
    const rejected = [r1, r2].filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'no-hunt' })
    expect(await loadActive(db, trainerId)).toBeNull()
  })
  it('snapshot corrompido: apaga a sessão sem sync e devolve o treinador (não relança)', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 9 })
    await db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))
    const before = await snapshotRows()
    const trainer = await stopHunt(db, trainerId, T0)
    expect(trainer.id).toBe(trainerId)
    expect(await loadActive(db, trainerId)).toBeNull()
    expect(await db.select().from(huntSessions)).toEqual([])
    expect(await snapshotRows()).toEqual(before) // sem sync: nada mudou além da sessão apagada
  })
})
