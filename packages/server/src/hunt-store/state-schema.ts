import { z } from 'zod'
import type { HuntState } from '../engine/types.js'

const Point = z.object({ x: z.number().int(), y: z.number().int() }).strict()
const Cooldowns = z.record(z.string(), z.number().int())
const PokemonStateSchema = z.object({ id: z.string(), speciesName: z.string(), level: z.number().int().min(1), xp: z.number().int().min(0), hp: z.number().int().min(0), hpMax: z.number().int().min(1) }).strict()
const WildStateSchema = z.object({ id: z.number().int(), spawnIndex: z.number().int(), speciesName: z.string(), level: z.number().int(), hp: z.number().int(), hpMax: z.number().int(), position: Point, cooldowns: Cooldowns, captureTried: z.boolean() }).strict()
const PlayerStateSchema = z.object({
  team: z.array(PokemonStateSchema).min(1), activeIndex: z.number().int().min(0), position: Point, path: z.array(Point),
  mode: z.enum(['searching', 'walking', 'fighting', 'returning', 'healing', 'stopped']), targetWildId: z.number().int().nullable(),
  healingUntilTick: z.number().int().nullable(), cooldowns: Cooldowns, skippedWildIds: z.array(z.number().int()),
}).strict()
const SettingsSchema = z.object({
  returnHpPercent: z.number(), capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']), maxWildHpPercent: z.number(), allowDuplicates: z.boolean() }).strict(), seen: z.array(z.string()),
}).strict()

export const HuntStateSchema = z.object({
  huntId: z.string(), sessionId: z.string(), tick: z.number().int().min(0), player: PlayerStateSchema,
  wilds: z.array(WildStateSchema), respawns: z.array(z.object({ spawnIndex: z.number().int(), atTick: z.number().int() }).strict()),
  nextWildId: z.number().int(), trainer: z.object({ xp: z.number().int(), gold: z.number().int() }).strict(),
  inventory: z.record(z.string(), z.number().int()), settings: SettingsSchema,
}).strict()

export function parseHuntState(json: unknown): HuntState {
  return HuntStateSchema.parse(json) as HuntState
}
