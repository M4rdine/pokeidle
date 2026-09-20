import { createRequire } from 'node:module'
import type { FastifyInstance } from 'fastify'

// A versão vem do package.json para não duplicar o número em dois lugares e sair de sincronia.
// `src/http/health.ts` → dois níveis acima é `packages/server`.
const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const startedAt = Date.now()

/** Sonda pública de saúde: não toca no banco e não exige sessão, para o orquestrador poder chamar. */
export function registerHealth(app: FastifyInstance): void {
  app.get('/health', async () => ({
    status: 'ok' as const,
    version,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  }))
}
