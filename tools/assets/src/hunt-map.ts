import { z } from 'zod'
import { parseOrThrow } from './parse-or-throw.js'

export const TILE_SIZE = 32
const KEBAB = /^[a-z0-9-]+$/

const PointSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) })

const SpawnSchema = z.object({
  speciesName: z.string().regex(KEBAB),
  minLevel: z.number().int().positive(),
  maxLevel: z.number().int().positive(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  radius: z.number().int().min(0),
  count: z.number().int().positive(),
  respawnSeconds: z.number().int().positive(),
})

export const HuntMapSchema = z
  .object({
    id: z.string().regex(KEBAB),
    name: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileSize: z.literal(TILE_SIZE),
    layers: z.object({
      ground: z.array(z.string().nullable()),
      detail: z.array(z.string().nullable()),
      blocking: z.array(z.boolean()),
    }),
    spawnPoint: PointSchema,
    pokecenter: PointSchema,
    spawns: z.array(SpawnSchema),
  })
  .superRefine((m, ctx) => {
    const expected = m.width * m.height
    for (const [name, layer] of Object.entries(m.layers)) {
      if (layer.length !== expected) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['layers', name], message: `tem ${layer.length} tiles, esperado width*height = ${expected}` })
      }
    }
    const outside = (p: { x: number; y: number }): boolean => p.x < 0 || p.x >= m.width || p.y < 0 || p.y >= m.height
    const bounds = `fora do mapa (${m.width}x${m.height})`
    for (const key of ['spawnPoint', 'pokecenter'] as const) {
      if (outside(m[key])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: bounds })
    }
    for (const [i, s] of m.spawns.entries()) {
      if (s.minLevel > s.maxLevel) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spawns', i], message: 'minLevel maior que maxLevel' })
      }
      if (outside(s)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spawns', i], message: bounds })
    }
  })

export type HuntMap = z.infer<typeof HuntMapSchema>
export type HuntSpawn = HuntMap['spawns'][number]

export function parseHuntMap(json: unknown): HuntMap {
  return parseOrThrow(HuntMapSchema, json, 'HuntMap')
}
