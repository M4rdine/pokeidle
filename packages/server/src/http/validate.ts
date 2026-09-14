import type { ZodTypeAny, z } from 'zod'
import { AppError } from './errors.js'

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {})
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  throw new AppError('validation', `${where}${issue?.message ?? 'entrada inválida'}`)
}
