import { z } from 'zod'
import { kebab } from './species.js'

const base = { id: kebab, name: z.string().min(1), buyPrice: z.number().int().min(0), sellPrice: z.number().int().min(0) }
export const ItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('potion'), healPercent: z.number().int().min(1).max(100) }),
  z.object({ ...base, kind: z.literal('ball'), ballBonus: z.number().positive() }),
])
export type Item = z.infer<typeof ItemSchema>
export const ItemListSchema = z.array(ItemSchema)
