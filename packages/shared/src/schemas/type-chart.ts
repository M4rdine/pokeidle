import { z } from 'zod'

export const TYPE_NAMES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const
export type TypeName = (typeof TYPE_NAMES)[number]
export const TypeNameSchema = z.enum(TYPE_NAMES)

const MultiplierSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])
const RowSchema = z.object(Object.fromEntries(TYPE_NAMES.map((t) => [t, MultiplierSchema])) as Record<TypeName, typeof MultiplierSchema>)
export const TypeChartSchema = z.object(Object.fromEntries(TYPE_NAMES.map((t) => [t, RowSchema])) as Record<TypeName, typeof RowSchema>)
export type TypeChart = z.infer<typeof TypeChartSchema>
