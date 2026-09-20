import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buy } from '../src/account/shop.js'
import { inventory, trainers } from '../src/db/schema.js'
import { loadActive, startHunt, stopHunt } from '../src/hunt-store/index.js'
import { truncateAll } from './helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => {
  await truncateAll(t.db)
  t.clock.now = T0
  ;({ cookie, trainerId } = await registerAndLogin(t.app))
  // `register()` grava um inventário inicial (poção/poké bola) fora do escopo desta
  // task — os testes de loja abaixo assumem uma mochila vazia para números exatos.
  await t.db.delete(inventory).where(eq(inventory.trainerId, trainerId))
})

const setTrainer = (patch: { gold?: number; xp?: number }) => t.db.update(trainers).set(patch).where(eq(trainers.id, trainerId))
const goldOf = async () => (await t.db.select({ gold: trainers.gold }).from(trainers).where(eq(trainers.id, trainerId)))[0]!.gold
const owned = async (itemId: string) => (await t.db.select({ q: inventory.quantity }).from(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, itemId))))[0]?.q ?? 0
type Body = { gold: number; item: { itemId: string; quantity: number } }

describe('GET /shop', () => {
  it('catálogo ordenado por nível e preço, com unlocked por nível e owned', async () => {
    await setTrainer({ gold: 250, xp: 1000 })
    await t.db.insert(inventory).values({ trainerId, itemId: 'potion', quantity: 2 })
    const body = (await api(t.app, cookie).get('/shop')).json() as { level: number; gold: number; items: Record<string, unknown>[] }
    expect(body).toMatchObject({ level: 10, gold: 250 })
    expect(body.items.map((i) => i.itemId)).toEqual(['potion', 'poke-ball', 'super-potion', 'great-ball', 'hyper-potion', 'ultra-ball'])
    expect(body.items[0]).toEqual({ itemId: 'potion', name: 'Poção', kind: 'potion', buyPrice: 100, sellPrice: 50, unlockLevel: 0, unlocked: true, owned: 2 })
    expect(body.items[2]).toMatchObject({ itemId: 'super-potion', unlockLevel: 20, unlocked: false, owned: 0 })
  })
})

describe('POST /shop/buy', () => {
  it('compra debitando o ouro e somando ao inventário', async () => {
    await setTrainer({ gold: 350 })
    const r = await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 3 })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ gold: 50, item: { itemId: 'potion', quantity: 3 } })
    expect(await owned('potion')).toBe(3)
    const again = (await api(t.app, cookie).post('/shop/buy', { itemId: 'poke-ball', quantity: 1 })).json() as { error: { code: string } }
    expect(again.error.code).toBe('insufficient-gold')
    expect(await goldOf()).toBe(50)
  })
  it('locked abaixo do nível; not-found para item inexistente; validation para quantidade 100', async () => {
    await setTrainer({ gold: 100000 })
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'super-potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'locked' } })
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'master-ball', quantity: 1 })).statusCode).toBe(404)
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 100 })).statusCode).toBe(400)
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 1, hack: true })).statusCode).toBe(400)
    await setTrainer({ xp: 8000 })
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'super-potion', quantity: 1 })).statusCode).toBe(200)
  })
  it('recusa com hunt ativa', async () => {
    await setTrainer({ gold: 1000 })
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).post('/hunts/campo-inicial/start')).statusCode).toBe(201)
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'hunt-active' } })
    expect((await api(t.app, cookie).post('/shop/sell', { itemId: 'potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'hunt-active' } })
    await api(t.app, cookie).post('/hunts/stop')
  })
  it('corrida entre início de hunt e compra: nunca há item sem débito', async () => {
    await setTrainer({ gold: 1000 })
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    const [startResult, buyResult] = await Promise.allSettled([
      startHunt(t.db, t.registry, trainerId, 'campo-inicial', T0),
      buy(t.db, t.registry, trainerId, 'potion', 1, T0),
    ])
    expect(startResult.status).toBe('fulfilled') // só a compra pode perder a corrida aqui
    const gold = await goldOf()
    if (buyResult.status === 'fulfilled') {
      // Compra aceita: o ouro foi debitado e a snapshot da hunt (lida ou criada depois, com o
      // trainer já atualizado dentro da mesma transação) reflete a compra — nunca item sem débito.
      expect(gold).toBe(900)
      const active = await loadActive(t.db, trainerId)
      expect(active?.state.inventory['potion']).toBe(1)
      expect(active?.state.trainer.gold).toBe(gold)
    } else {
      expect((buyResult.reason as { code: string }).code).toBe('hunt-active')
      expect(gold).toBe(1000)
    }
    await stopHunt(t.db, trainerId, T0)
  })
  it('compras concorrentes nunca deixam o ouro negativo', async () => {
    await setTrainer({ gold: 250 })
    const results = await Promise.all(Array.from({ length: 4 }, () => api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 1 })))
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2)
    expect(await goldOf()).toBe(50)
    expect(await owned('potion')).toBe(2)
  })
  it('a conta B não compra com o ouro de A', async () => {
    await setTrainer({ gold: 1000 })
    const b = await registerAndLogin(t.app, 2)
    expect((await api(t.app, b.cookie).post('/shop/buy', { itemId: 'potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'insufficient-gold' } })
    expect(await goldOf()).toBe(1000)
  })
})

describe('POST /shop/sell', () => {
  it('vende pela metade, decrementa e apaga em zero; além do que tem → validation', async () => {
    await t.db.insert(inventory).values({ trainerId, itemId: 'potion', quantity: 2 })
    const r = await api(t.app, cookie).post('/shop/sell', { itemId: 'potion', quantity: 2 })
    expect(r.json()).toEqual({ gold: 100, item: { itemId: 'potion', quantity: 0 } })
    expect(await t.db.select().from(inventory).where(eq(inventory.trainerId, trainerId))).toEqual([])
    expect((await api(t.app, cookie).post('/shop/sell', { itemId: 'potion', quantity: 1 })).statusCode).toBe(400)
  })
})
