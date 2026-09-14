import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { authPlugin } from '../auth/plugin.js'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { AppError, errorBody } from './errors.js'
import { authRoutes } from './routes/auth.js'
import { huntRoutes } from './routes/hunts.js'
import { trainerRoutes } from './routes/trainer.js'
import { checkOrigin, REDACT_PATHS } from './security.js'

export interface AppDeps {
  readonly db: Db
  readonly config: Config
  readonly now?: () => Date
  readonly logger?: boolean
  readonly extraRoutes?: (app: FastifyInstance) => void
}

export const BODY_LIMIT = 16 * 1024

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { db, config } = deps
  const now = deps.now ?? (() => new Date())
  const app = Fastify({
    bodyLimit: BODY_LIMIT,
    // O tipo de trustProxy do Fastify 5 instalado não inclui `number`: hop-count puro foi
    // descontinuado lá (não valida o peer imediato, cai em "não confia" = `false`). O valor
    // já foi validado e convertido em loadConfig; o cast é só para o TS aceitar o repasse.
    trustProxy: config.TRUST_PROXY as boolean | string,
    logger: deps.logger === false ? false : { level: config.LOG_LEVEL, redact: [...REDACT_PATHS] },
  })

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'same-origin' },
    hsts: config.COOKIE_SECURE ? { maxAge: 15552000 } : false,
  })
  await app.register(cookie)
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })
  await app.register(authPlugin, { db, now })

  app.addHook('onRequest', async (request) => {
    if (!checkOrigin(request, config.APP_ORIGIN)) throw new AppError('forbidden', 'origem não permitida')
  })

  app.setNotFoundHandler((_request, reply) => reply.status(404).send(errorBody('not-found', 'rota não encontrada')))
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.status(error.status).send(errorBody(error.code, error.message))
    if (error instanceof ZodError) return reply.status(400).send(errorBody('validation', error.issues[0]?.message ?? 'entrada inválida'))
    const status = (error as { statusCode?: number }).statusCode
    if (status === 429) return reply.status(429).send(errorBody('rate-limited', 'muitas tentativas, tente mais tarde'))
    if (status === 413) return reply.status(413).send(errorBody('payload-too-large', 'corpo grande demais'))
    if (status === 400 || status === 415) return reply.status(400).send(errorBody('validation', 'requisição inválida'))
    request.log.error({ err: error }, 'erro inesperado')
    return reply.status(500).send(errorBody('internal', 'erro interno'))
  })

  await app.register(authRoutes, { db, config, now })
  await app.register(trainerRoutes, { db, config, now })
  await app.register(huntRoutes, { db, config, now })
  deps.extraRoutes?.(app)
  return app
}
