import { z } from 'zod'
import { kebab } from './species.js'

const PointSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).strict()

const BoundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()

/**
 * Área é um recorte da região: o mapa jogável dela vive em `hunts/<id>.json` e é gerado pelo
 * importador. Aqui ficam só os metadados que o navegador de áreas precisa para desenhar o
 * marcador e filtrar por tipo, nível e espécie.
 */
export const AreaSchema = z.object({
  id: kebab,
  name: z.string().min(1),
  bounds: BoundsSchema,
  anchor: PointSchema,
  species: z.array(kebab).min(1),
  minLevel: z.number().int().positive(),
  maxLevel: z.number().int().positive(),
  /** Quantos selvagens a área mantém vivos ao mesmo tempo, somando todos os spawns. */
  wildCount: z.number().int().positive(),
  /** Tempo de renascimento do spawn mais lento: é ele que limita o ritmo da caçada. */
  respawnSeconds: z.number().int().positive(),
  /**
   * Nível de treinador exigido para entrar. Sai da faixa de níveis da área: entrar dez níveis
   * abaixo do selvagem mais fraco é só perder tempo e Pokémon.
   */
  minTrainerLevel: z.number().int().min(1),
}).strict().refine((a) => a.minLevel <= a.maxLevel, { message: 'minLevel maior que maxLevel' })

export const RegionSchema = z.object({
  id: kebab,
  name: z.string().min(1),
  order: z.number().int().min(0),
  minTrainerLevel: z.number().int().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  areas: z.array(AreaSchema).min(1),
}).strict().superRefine((r, ctx) => {
  const vistos = new Set<string>()
  for (const [i, a] of r.areas.entries()) {
    if (vistos.has(a.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areas', i], message: `área duplicada: ${a.id}` })
    vistos.add(a.id)
    if (a.bounds.x + a.bounds.width > r.width || a.bounds.y + a.bounds.height > r.height) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areas', i], message: `área ${a.id} sai dos limites da região` })
    }
  }
})

export const RegionListSchema = z.array(RegionSchema).min(1)

export type Area = z.infer<typeof AreaSchema>
export type Region = z.infer<typeof RegionSchema>
