import { z } from 'zod'
import { GROWTH_RATES, kebab } from './species.js'

export const UnlocksSchema = z.object({
  growthRate: z.enum(GROWTH_RATES),
  teamSlots: z.array(z.object({ level: z.number().int().min(1), slots: z.number().int().min(1).max(6) }).strict()).min(1),
  items: z.record(kebab, z.number().int().min(1)),
  /** Nível mínimo de treinador por região. Área herda o portão da região a que pertence. */
  regions: z.record(kebab, z.number().int().min(1)),
}).strict()

export type Unlocks = z.infer<typeof UnlocksSchema>
