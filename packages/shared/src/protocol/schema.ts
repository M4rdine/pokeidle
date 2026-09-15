import { z } from 'zod'

const Point = z.object({ x: z.number().int(), y: z.number().int() }).strict()
const Cooldowns = z.record(z.string(), z.number().int())
export const PokemonStateSchema = z.object({ id: z.string(), speciesName: z.string(), level: z.number().int().min(1), xp: z.number().int().min(0), hp: z.number().int().min(0), hpMax: z.number().int().min(1) }).strict()
const WildStateSchema = z.object({ id: z.number().int(), spawnIndex: z.number().int(), speciesName: z.string(), level: z.number().int(), hp: z.number().int(), hpMax: z.number().int(), position: Point, cooldowns: Cooldowns, captureTried: z.boolean() }).strict()
const PlayerStateSchema = z.object({
  team: z.array(PokemonStateSchema).min(1), activeIndex: z.number().int().min(0), position: Point, path: z.array(Point),
  mode: z.enum(['searching', 'walking', 'fighting', 'returning', 'healing', 'stopped']), targetWildId: z.number().int().nullable(),
  healingUntilTick: z.number().int().nullable(), cooldowns: Cooldowns, skippedWildIds: z.array(z.number().int()),
}).strict()
const SettingsSchema = z.object({
  returnHpPercent: z.number(), potionHpPercent: z.number().default(50), teamSlots: z.number().int().min(1).max(6).default(6),
  capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']), maxWildHpPercent: z.number(), allowDuplicates: z.boolean() }).strict(), seen: z.array(z.string()),
}).strict()

export const HuntStateSchema = z.object({
  huntId: z.string(), sessionId: z.string(), tick: z.number().int().min(0), player: PlayerStateSchema,
  wilds: z.array(WildStateSchema), box: z.array(PokemonStateSchema).default([]),
  respawns: z.array(z.object({ spawnIndex: z.number().int(), atTick: z.number().int() }).strict()),
  nextWildId: z.number().int(), trainer: z.object({ xp: z.number().int(), gold: z.number().int() }).strict(),
  inventory: z.record(z.string(), z.number().int()), settings: SettingsSchema,
}).strict()

const int = z.number().int(); const str = z.string(); const tick = int.min(0)
export const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spawned'), tick, wildId: int, speciesName: str, level: int, position: Point }).strict(),
  z.object({ type: z.literal('moved'), tick, from: Point, to: Point }).strict(),
  z.object({ type: z.literal('attack'), tick, attacker: z.enum(['player', 'wild']), attackerId: str, targetId: str, move: str, damage: int, targetHp: int }).strict(),
  z.object({ type: z.literal('wildDefeated'), tick, wildId: int, speciesName: str, level: int, xpTrainer: int, xpPokemon: int, gold: int, drops: z.array(z.object({ item: str, quantity: int }).strict()) }).strict(),
  z.object({ type: z.literal('captured'), tick, wildId: int, speciesName: str, level: int, ball: str, toBox: z.boolean() }).strict(),
  z.object({ type: z.literal('captureFailed'), tick, wildId: int, ball: str }).strict(),
  z.object({ type: z.literal('pokemonFainted'), tick, pokemonId: str }).strict(),
  z.object({ type: z.literal('switched'), tick, pokemonId: str }).strict(),
  z.object({ type: z.literal('levelUp'), tick, pokemonId: str, level: int }).strict(),
  z.object({ type: z.literal('evolved'), tick, pokemonId: str, from: str, to: str }).strict(),
  z.object({ type: z.literal('itemUsed'), tick, itemId: str, pokemonId: str, hp: int }).strict(),
  z.object({ type: z.literal('returning'), tick }).strict(),
  z.object({ type: z.literal('healed'), tick }).strict(),
  z.object({ type: z.literal('stopped'), tick, reason: z.enum(['team-fainted', 'intent', 'no-route']) }).strict(),
  z.object({ type: z.literal('skipped'), tick, wildId: int }).strict(),
])
