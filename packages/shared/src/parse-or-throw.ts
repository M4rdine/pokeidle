import type { ZodType, ZodTypeDef } from 'zod'

export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, json: unknown, label: string, hint?: string): T {
  const result = schema.safeParse(json)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  const tail = hint === undefined ? '' : `\ndica: ${hint}`
  throw new Error(`${label} inválido:\n${lines.join('\n')}${tail}`)
}
