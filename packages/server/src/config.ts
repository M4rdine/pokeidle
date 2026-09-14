import { z } from 'zod'

const bool = z.enum(['true', 'false']).transform((v) => v === 'true')

export const ConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  COOKIE_SECURE: bool.default('false'),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: bool.default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(3),
})

export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): Config {
  const withDefaults = { APP_ORIGIN: 'http://localhost:3000', ...env }
  const result = ConfigSchema.safeParse(withDefaults)
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`configuração inválida: ${detail}`)
  }
  return result.data
}
