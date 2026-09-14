import { z } from 'zod'
import { TypeNameSchema } from './type-chart.js'

export const KEBAB = /^[a-z0-9-]+$/
export const kebab = z.string().regex(KEBAB, 'use kebab-case ascii')
export const GROWTH_RATES = ['fast', 'medium-fast', 'medium-slow', 'slow'] as const
export type GrowthRate = (typeof GROWTH_RATES)[number]

export const BaseStatsSchema = z.object({
  hp: z.number().int().min(1), attack: z.number().int().min(1), defense: z.number().int().min(1),
  spAttack: z.number().int().min(1), spDefense: z.number().int().min(1), speed: z.number().int().min(1),
})
export type BaseStats = z.infer<typeof BaseStatsSchema>

export const SpeciesSchema = z.object({
  id: z.number().int().positive(),
  name: kebab,
  types: z.array(TypeNameSchema).min(1).max(2),
  baseStats: BaseStatsSchema,
  baseExperience: z.number().int().min(0),
  growthRate: z.enum(GROWTH_RATES),
  captureRate: z.number().int().min(1).max(255),
  learnset: z.array(z.object({ move: kebab, level: z.number().int().min(1) })),
  evolvesTo: z.object({ species: kebab, level: z.number().int().min(2) }).optional(),
})
export type Species = z.infer<typeof SpeciesSchema>
export const SpeciesListSchema = z.array(SpeciesSchema)
