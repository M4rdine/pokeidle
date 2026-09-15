import { HuntStateSchema } from '@pokeidle/shared/protocol'
import { z } from 'zod'

export const SettingsSchema = z.object({ returnHpPercent: z.number(), potionHpPercent: z.number(), capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']), maxWildHpPercent: z.number(), allowDuplicates: z.boolean() }) })
export const TrainerSchema = z.object({
  id: z.string(), name: z.string(), xp: z.number(), gold: z.number(), settings: SettingsSchema, hasStarter: z.boolean(), activeHuntId: z.string().nullable(),
  level: z.number(), xpToNext: z.number(), teamSlots: z.number(), nextUnlock: z.object({ level: z.number(), what: z.string() }).nullable(),
})
export const MeSchema = z.object({ user: z.object({ id: z.string(), email: z.string(), role: z.string() }), trainer: TrainerSchema })
export const PokemonDtoSchema = z.object({ id: z.string(), speciesName: z.string(), level: z.number(), xp: z.number(), hp: z.number(), hpMax: z.number(), teamSlot: z.number().nullable() })
export const TeamSchema = z.object({ team: z.array(PokemonDtoSchema), box: z.array(PokemonDtoSchema) })
export const InventorySchema = z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.number() })) })
export const PokedexSchema = z.object({ entries: z.array(z.object({ speciesName: z.string(), seenAt: z.string(), caughtAt: z.string().nullable() })) })
export const HuntSummarySchema = z.object({ id: z.string(), name: z.string(), width: z.number(), height: z.number(), minLevel: z.number(), maxLevel: z.number() })
export const HuntsSchema = z.object({ hunts: z.array(HuntSummarySchema) })
export const ShopItemSchema = z.object({ itemId: z.string(), name: z.string(), kind: z.enum(['potion', 'ball']), buyPrice: z.number(), sellPrice: z.number(), unlockLevel: z.number(), unlocked: z.boolean(), owned: z.number() })
export const ShopSchema = z.object({ level: z.number(), gold: z.number(), items: z.array(ShopItemSchema) })
export const TradeSchema = z.object({ gold: z.number(), item: z.object({ itemId: z.string(), quantity: z.number() }) })
export const SessionDtoSchema = z.object({ huntId: z.string(), sessionId: z.string(), startedAt: z.string(), state: HuntStateSchema })
export const StartHuntSchema = z.object({ session: SessionDtoSchema })
export const ActiveHuntSchema = z.object({ session: SessionDtoSchema.nullable() })
export const StarterResponseSchema = z.object({ pokemon: PokemonDtoSchema })
export const SettingsResponseSchema = z.object({ settings: SettingsSchema })
export const StopResponseSchema = z.object({ trainer: TrainerSchema })

export type Me = z.infer<typeof MeSchema>
export type Trainer = z.infer<typeof TrainerSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type PokemonDto = z.infer<typeof PokemonDtoSchema>
export type HuntSummary = z.infer<typeof HuntSummarySchema>
export type ShopItem = z.infer<typeof ShopItemSchema>
export type PokedexEntry = z.infer<typeof PokedexSchema>['entries'][number]
