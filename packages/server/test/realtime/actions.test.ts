import { hpAt, xpForLevel } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon, trainers } from '../../src/db/schema.js'
import { activeView, applySettings, setActive, startAndAttach, stopViaScheduler, useItem } from '../../src/realtime/actions.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from '../helpers/app.js'
import { truncateAll } from '../helpers/db.js'

let t: TestApp
let cookie: string
let trainerId: string
const deps = () => ({ db: t.db, registry: t.registry, now: () => t.clock.now, scheduler: t.scheduler, sockets: t.sockets })
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => {
  await t.scheduler.idle() // drena qualquer cadeia de persistência em voo do teste anterior antes do truncate
  await truncateAll(t.db); t.clock.now = T0
  ;({ cookie, trainerId } = await registerAndLogin(t.app))
  await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
  const charmander = t.registry.species.get('charmander')!
  const hpMax = hpAt(charmander.baseStats.hp, 12)
  await t.db.update(pokemon).set({ level: 12, xp: xpForLevel(charmander.growthRate, 12), hp: hpMax, hpMax })
})

describe('actions', () => {
  it('startAndAttach cria sessão e runner; activeView lê do runner; stopViaScheduler finaliza', async () => {
    const s = await startAndAttach(deps(), trainerId, 'route-1')
    expect(s).toMatchObject({ huntId: 'route-1', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), startedAt: T0 })
    expect(t.scheduler.get(trainerId)).toBeDefined()
    t.scheduler.tick()
    const view = await activeView(deps(), trainerId)
    expect(view?.state.tick).toBe(1)
    expect(JSON.stringify(view)).not.toMatch(/seed|rngState/)
    const trainer = await stopViaScheduler(deps(), trainerId)
    expect(trainer.id).toBe(trainerId)
    expect(t.scheduler.get(trainerId)).toBeUndefined()
    expect(await t.db.select().from(huntSessions)).toEqual([])
    await expect(stopViaScheduler(deps(), trainerId)).rejects.toMatchObject({ code: 'no-hunt' })
  })
  it('stopViaScheduler cai no banco quando a sessão existe sem runner (órfã)', async () => {
    await startAndAttach(deps(), trainerId, 'route-1')
    t.scheduler.detach(trainerId)
    const trainer = await stopViaScheduler(deps(), trainerId)
    expect(trainer.id).toBe(trainerId)
    expect(await t.db.select().from(huntSessions)).toEqual([])
  })
  it('applySettings grava no banco e no runner quando há hunt', async () => {
    await applySettings(deps(), trainerId, { returnHpPercent: 45 })
    expect((await t.db.select().from(trainers).where(eq(trainers.id, trainerId)))[0]!.returnHpPercent).toBe(45)
    await startAndAttach(deps(), trainerId, 'route-1')
    await applySettings(deps(), trainerId, { capture: { ballTier: 'poke' } })
    expect(t.scheduler.get(trainerId)!.state.settings.capture.ballTier).toBe('poke')
    expect((await t.db.select().from(trainers).where(eq(trainers.id, trainerId)))[0]!.ballTier).toBe('poke')
  })
  it('useItem e setActive delegam ao motor com erros tipados', async () => {
    expect(useItem(deps(), trainerId, 'potion')).toMatchObject({ error: { code: 'no-hunt' } })
    await startAndAttach(deps(), trainerId, 'route-1')
    expect(useItem(deps(), trainerId, 'potion')).toMatchObject({ error: { code: 'full-hp' } })
    expect(setActive(deps(), trainerId, 'x')).toMatchObject({ error: { code: 'unknown-pokemon' } })
  })
})

describe('REST sobre o scheduler', () => {
  it('start → runner; active vem do runner; stop finaliza; logout fecha sockets do token', async () => {
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).statusCode).toBe(201)
    expect(t.scheduler.get(trainerId)).toBeDefined()
    t.scheduler.tick(); t.scheduler.tick()
    expect((await api(t.app, cookie).get('/hunts/active')).json()).toMatchObject({ session: { state: { tick: 2 } } })
    const patch = await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 60 })
    expect(patch.statusCode).toBe(200)
    expect(t.scheduler.get(trainerId)!.state.settings.returnHpPercent).toBe(60)
    expect((await api(t.app, cookie).post('/hunts/stop')).json()).toMatchObject({ trainer: { activeHuntId: null } })
    expect(t.scheduler.get(trainerId)).toBeUndefined()
  })
})
