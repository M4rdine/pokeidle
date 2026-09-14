import { z } from 'zod'
import { kebab } from './species.js'
import { TypeNameSchema } from './type-chart.js'

export const MoveSchema = z.object({
  name: kebab,
  type: TypeNameSchema,
  power: z.number().int().min(1),
  accuracy: z.number().int().min(1).max(100).nullable(),
  damageClass: z.enum(['physical', 'special']),
})
export type Move = z.infer<typeof MoveSchema>
export const MoveListSchema = z.array(MoveSchema)
