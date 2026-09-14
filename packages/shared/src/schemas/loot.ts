import { z } from 'zod'
import { kebab } from './species.js'

export const LootTableSchema = z.object({
  species: kebab,
  gold: z.tuple([z.number().int().min(0), z.number().int().min(0)]).refine(([min, max]) => min <= max, 'gold: min deve ser <= max'),
  drops: z.array(z.object({ item: kebab, chance: z.number().min(0).max(1) })),
})
export type LootTable = z.infer<typeof LootTableSchema>
export const LootListSchema = z.array(LootTableSchema)
