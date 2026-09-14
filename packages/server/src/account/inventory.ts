import { and, asc, eq, gt } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { inventory } from '../db/schema.js'

export async function listInventory(db: DbLike, trainerId: string): Promise<{ itemId: string; quantity: number }[]> {
  return db.select({ itemId: inventory.itemId, quantity: inventory.quantity }).from(inventory)
    .where(and(eq(inventory.trainerId, trainerId), gt(inventory.quantity, 0))).orderBy(asc(inventory.itemId))
}
