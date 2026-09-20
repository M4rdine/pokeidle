import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const bool = z.enum(['true', 'false']).transform((v) => v === 'true')

// `src/config.ts` → `packages/server/src` → um nível acima é `packages/server`. O atlas servido
// ao navegador é versionado em `public/atlas` (só os quatro arquivos da allowlist), para a imagem
// de produção não depender do dump de sprites, que é gigante e fica fora do git.
const DEFAULT_ASSETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/atlas')
// `src/config.ts` → `packages/server/src` → dois níveis acima é `packages/`.
const DEFAULT_CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')

export type TrustProxy = boolean | number | string

/** Um IPv4/IPv6 (opcionalmente com prefixo CIDR), usado só dentro de uma lista TRUST_PROXY separada por vírgula. */
const IP_OR_CIDR = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/

/**
 * `'false'` (padrão) → não confia em `X-Forwarded-For`, usa o IP da conexão TCP. `'true'` →
 * confia em toda a cadeia (só atrás de um proxy que sobrescreve o cabeçalho, nunca exposto
 * direto à internet). Um inteiro ≥ 1 → confia nos N hops mais próximos. Uma lista separada por
 * vírgula de IPs/CIDRs → confia só quando a conexão vem de um desses endereços.
 */
const trustProxy = z.string().transform((v, ctx): TrustProxy => {
  if (v === 'false') return false
  if (v === 'true') return true
  if (/^\d+$/.test(v) && Number(v) >= 1) return Number(v)
  const parts = v.split(',').map((p) => p.trim())
  if (parts.length > 0 && parts.every((p) => IP_OR_CIDR.test(p))) return v
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'deve ser "false", "true", um inteiro ≥ 1 (hops) ou uma lista de IPs/CIDRs separada por vírgula' })
  return z.NEVER
})

export const ConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  COOKIE_SECURE: bool.default('false'),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: trustProxy.default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(3),
  /** Liga o visualizador de depuração em `/debug` (ferramenta descartável, nunca em produção). */
  DEBUG_VIEWER: bool.default('false'),
  /** Diretório com o atlas de assets (`tiles.png`/`.json`, `pokemon.png`/`.json`) gerado por `pnpm assets build`. */
  ASSETS_DIR: z.string().min(1).default(DEFAULT_ASSETS_DIR),
  /** Só para teste de ponta a ponta: acelera o relógio do agendador sem mudar a simulação. */
  TICK_MS: z.coerce.number().int().min(10).max(5000).optional(),
  /** Build do cliente (Vite) servido em `/`. Sem a pasta, `/` continua 404 JSON como hoje. */
  CLIENT_DIST: z.string().min(1).default(DEFAULT_CLIENT_DIST),
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
