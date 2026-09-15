import { itemUnlockLevel, kebab, type Item, type Registry } from '@pokeidle/shared'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbLike } from '../db/client.js'
import { inventory, trainers, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'
import { trainerProgress } from './progress.js'
import { hasActiveHunt } from './team.js'

export const ShopTradeSchema = z.object({ itemId: kebab, quantity: z.number().int().min(1).max(99) }).strict()
export interface TradeResult { readonly gold: number; readonly item: { readonly itemId: string; readonly quantity: number } }

const byLevelThenPrice = (u: Registry['unlocks']) => (a: Item, b: Item) =>
  itemUnlockLevel(u, a.id) - itemUnlockLevel(u, b.id) || a.buyPrice - b.buyPrice

export async function catalog(db: DbLike, registry: Registry, trainer: TrainerRow) {
  const { level } = trainerProgress(registry, trainer)
  const rows = await db.select({ itemId: inventory.itemId, quantity: inventory.quantity }).from(inventory).where(eq(inventory.trainerId, trainer.id))
  const owned = new Map(rows.map((r) => [r.itemId, r.quantity]))
  const items = [...registry.items.values()].sort(byLevelThenPrice(registry.unlocks)).map((i) => {
    const unlockLevel = itemUnlockLevel(registry.unlocks, i.id)
    return { itemId: i.id, name: i.name, kind: i.kind, buyPrice: i.buyPrice, sellPrice: i.sellPrice, unlockLevel, unlocked: level >= unlockLevel, owned: owned.get(i.id) ?? 0 }
  })
  return { level, gold: trainer.gold, items }
}

const itemOrThrow = (registry: Registry, itemId: string): Item => {
  const item = registry.items.get(itemId)
  if (!item) throw new AppError('not-found', 'item não existe')
  return item
}

/** S30: preço do registro, treinador travado com FOR UPDATE, ouro nunca negativo. S31: só sem hunt. */
export async function buy(db: Db, registry: Registry, trainerId: string, itemId: string, quantity: number, now: Date): Promise<TradeResult> {
  const item = itemOrThrow(registry, itemId)
  return db.transaction(async (tx) => {
    if (await hasActiveHunt(tx, trainerId)) throw new AppError('hunt-active', 'pare a hunt antes de usar a loja')
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId)).for('update')
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    const { level } = trainerProgress(registry, trainer)
    const unlockLevel = itemUnlockLevel(registry.unlocks, item.id)
    if (level < unlockLevel) throw new AppError('locked', `${item.name} destrava no nível ${unlockLevel}`)
    const cost = item.buyPrice * quantity
    if (trainer.gold < cost) throw new AppError('insufficient-gold', `faltam ${cost - trainer.gold} de ouro`)
    await tx.update(trainers).set({ gold: trainer.gold - cost, updatedAt: now }).where(eq(trainers.id, trainerId))
    const [row] = await tx.insert(inventory).values({ trainerId, itemId: item.id, quantity, updatedAt: now })
      .onConflictDoUpdate({ target: [inventory.trainerId, inventory.itemId], set: { quantity: sql`${inventory.quantity} + ${quantity}`, updatedAt: now } })
      .returning({ quantity: inventory.quantity })
    return { gold: trainer.gold - cost, item: { itemId: item.id, quantity: row?.quantity ?? quantity } }
  })
}

export async function sell(db: Db, registry: Registry, trainerId: string, itemId: string, quantity: number, now: Date): Promise<TradeResult> {
  const item = itemOrThrow(registry, itemId)
  return db.transaction(async (tx) => {
    if (await hasActiveHunt(tx, trainerId)) throw new AppError('hunt-active', 'pare a hunt antes de usar a loja')
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId)).for('update')
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    const [owned] = await tx.select({ quantity: inventory.quantity }).from(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, item.id)))
    const have = owned?.quantity ?? 0
    if (have < quantity) throw new AppError('validation', `você tem ${have} de ${item.name}`)
    const gold = trainer.gold + item.sellPrice * quantity
    await tx.update(trainers).set({ gold, updatedAt: now }).where(eq(trainers.id, trainerId))
    const left = have - quantity
    if (left === 0) await tx.delete(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, item.id)))
    else await tx.update(inventory).set({ quantity: left, updatedAt: now }).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, item.id)))
    return { gold, item: { itemId: item.id, quantity: left } }
  })
}
