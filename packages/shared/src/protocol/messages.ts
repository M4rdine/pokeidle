import { z } from 'zod'

const percent = z.number().int().min(0).max(100)
export const SettingsPatchSchema = z.object({
  returnHpPercent: percent.optional(),
  capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']).optional(), maxWildHpPercent: percent.optional(), allowDuplicates: z.boolean().optional() }).strict().optional(),
}).strict()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hunt.stop') }).strict(),
  z.object({ t: z.literal('item.use'), itemId: z.string().min(1).max(64) }).strict(),
  z.object({ t: z.literal('team.setActive'), pokemonId: z.string().min(1).max(128) }).strict(),
  z.object({ t: z.literal('settings.update'), patch: SettingsPatchSchema }).strict(),
  z.object({ t: z.literal('ping') }).strict(),
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>
