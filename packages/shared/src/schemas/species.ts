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
  /*
   * DOIS CAMINHOS DE EVOLUÇÃO, e eles são exclusivos.
   *
   * Por nível é o que o motor resolve sozinho. Por PEDRA é decisão do jogador, e existe porque
   * metade das linhas clássicas nunca dependeu de nível: Pikachu, Growlithe e Jigglypuff não
   * evoluíam em nível nenhum aqui — Raichu, Arcanine e Wigglytuff estavam no registro sem nada
   * ligando os pares.
   *
   * Exclusivos de propósito. Se o nível também servisse para quem tem pedra, a pedra viraria
   * atalho opcional e a decisão (gastar ouro agora ou esperar) deixaria de existir.
   */
  evolvesTo: z.union([
    z.object({ species: kebab, level: z.number().int().min(2) }).strict(),
    z.object({ species: kebab, item: kebab }).strict(),
  ]).optional(),
  /**
   * Como a espécie chega ao jogador quando não é caçando. Ausente significa selvagem, e o
   * registro então exige que ela tenha uma área — senão é conteúdo que ninguém alcança.
   */
  obtainable: z.enum(['starter', 'legendary']).optional(),
})
export type Species = z.infer<typeof SpeciesSchema>
export const SpeciesListSchema = z.array(SpeciesSchema)
