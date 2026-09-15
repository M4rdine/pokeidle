import { z } from 'zod'
import { EventSchema, HuntStateSchema } from './schema.js'

const percent = z.number().int().min(0).max(100)
export const SettingsPatchSchema = z.object({
  returnHpPercent: percent.optional(),
  potionHpPercent: percent.optional(),
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

export const SessionInfoSchema = z.object({ huntId: z.string(), sessionId: z.string(), startedAt: z.string() }).strict()
export const StopReasonSchema = z.enum(['team-fainted', 'intent', 'no-route', 'corrupt', 'persist-failed'])
const count = z.number().int().min(0)
export const SummarySchema = z.object({ ticks: count, defeats: count, captures: count, captureFailures: count, faints: count, xpTrainer: count, gold: count, drops: z.record(z.string(), count), levelUps: count, evolutions: count, returns: count }).strict()
export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hunt.snapshot'), session: SessionInfoSchema, state: HuntStateSchema, serverTime: z.number() }).strict(),
  z.object({ t: z.literal('hunt.tick'), tick: z.number().int().min(0), events: z.array(EventSchema), serverTime: z.number() }).strict(),
  z.object({ t: z.literal('hunt.stopped'), reason: StopReasonSchema, healed: z.boolean() }).strict(),
  z.object({ t: z.literal('hunt.catchup'), ticksRemaining: z.number().int().min(0) }).strict(),
  z.object({ t: z.literal('hunt.summary'), summary: SummarySchema }).strict(),
  z.object({ t: z.literal('hunt.idle') }).strict(),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string() }).strict(),
  z.object({ t: z.literal('pong') }).strict(),
])
