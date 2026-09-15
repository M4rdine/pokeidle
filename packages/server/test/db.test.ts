import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/client.js'
import { inventory, trainers, users } from '../src/db/schema.js'
import { openTestDb, truncateAll } from './helpers/db.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => { await truncateAll(db) })

describe('schema', () => {
  it('cria usuário e treinador e apaga em cascata', async () => {
    const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
    const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash' }).returning()
    expect(t).toMatchObject({ xp: 0, gold: 0, returnHpPercent: 50, ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false })
    await db.delete(users).where(eq(users.id, u!.id))
    expect(await db.select().from(trainers)).toEqual([])
  })
  it('rejeita e-mail duplicado e quantidade negativa', async () => {
    const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
    await expect(db.insert(users).values({ email: 'a@a.com', passwordHash: 'y' })).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/unique|duplicate/i) },
    })
    const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash' }).returning()
    await expect(db.insert(inventory).values({ trainerId: t!.id, itemId: 'potion', quantity: -1 })).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/check/i) },
    })
  })
})
