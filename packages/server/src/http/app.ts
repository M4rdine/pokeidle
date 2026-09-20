import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { loadRegistry } from '@pokeidle/shared'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { authPlugin } from '../auth/plugin.js'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { CorruptSnapshotError } from '../hunt-store/state-schema.js'
import type { Scheduler } from '../realtime/scheduler.js'
import type { SocketRegistry } from '../realtime/sockets.js'
import type { WsOptions } from '../realtime/ws.js'
import { wsRoutes } from '../realtime/ws.js'
import { AppError, errorBody } from './errors.js'
import { authRoutes } from './routes/auth.js'
import { debugRoutes } from './routes/debug.js'
import { huntRoutes } from './routes/hunts.js'
import { shopRoutes } from './routes/shop.js'
import { trainerRoutes } from './routes/trainer.js'
import { checkOrigin, REDACT_PATHS, sameOrigin } from './security.js'
import { registerHealth } from './health.js'
import { registerStatic } from './static.js'

// O `ws` fecha a conexão com 1009 acima disto; o limite de negócio de verdade (4 KB, `error
// validation` sem fechar a conexão) é aplicado dentro de `parseClientMessage`. Este é só uma
// rede de segurança contra payloads absurdos.
const WS_HARD_MAX_PAYLOAD = 64 * 1024

export interface AppDeps {
  readonly db: Db
  readonly config: Config
  readonly now?: () => Date
  readonly logger?: boolean
  /** Logger já criado fora do Fastify (ex.: o pino do `main.ts`, compartilhado com o scheduler antes do app existir). Quando presente, substitui `logger: { level, redact }`. */
  readonly loggerInstance?: FastifyBaseLogger
  readonly realtime: { readonly scheduler: Scheduler; readonly sockets: SocketRegistry }
  readonly wsOptions?: Partial<WsOptions>
  /** @internal só para testes — a camada HTTP nunca deve passar isto. */
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
    // `loggerInstance` (Fastify 5.12) tem prioridade: o `main.ts` cria o pino antes do app
    // existir (o scheduler precisa de um logger primeiro) e reaproveita a mesma instância
    // aqui, em vez de deixar o Fastify criar a dele a partir de `logger: { level, redact }`.
    ...(deps.loggerInstance ? { loggerInstance: deps.loggerInstance } : { logger: deps.logger === false ? false : { level: config.LOG_LEVEL, redact: [...REDACT_PATHS] } }),
  })

  await app.register(helmet, {
    // `styleSrc`/`styleSrcAttr` explícitos: os padrões do helmet liberam 'unsafe-inline', e o
    // cliente depende de a política proibir atributo `style` (ele aplica estilo pela API do DOM).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'same-origin' },
    hsts: config.COOKIE_SECURE ? { maxAge: 15552000 } : false,
  })
  await app.register(cookie)
  // Registrado uma única vez na raiz: o listener de upgrade HTTP do `ws` é do servidor inteiro
  // (não por rota), então se o plugin só existisse dentro de `wsRoutes` uma requisição de upgrade
  // pra uma rota fora de `/ws` (ex.: `/naoexiste`, `/me`) nunca seria limpa pelo hook de resposta
  // do plugin e deixaria o socket bruto pendurado, sem autenticação, pra sempre.
  await app.register(websocket, { options: { maxPayload: WS_HARD_MAX_PAYLOAD } })

  // S11 ANTES da sessão: rejeita origem errada sem tocar o banco (nem SELECT nem o touch de
  // `last_seen_at`). Hooks de instância (addHook aqui, e o de authPlugin via fastify-plugin)
  // rodam na ordem de registro, então este precisa vir antes de `authPlugin`. Upgrades de
  // WebSocket são sempre GET (método "seguro" pro `checkOrigin` de cima), então exigimos
  // `sameOrigin` à parte pra qualquer tentativa de upgrade — inclusive pra rotas que não são
  // `/ws` — antes que o authPlugin chegue a tocar o banco.
  app.addHook('onRequest', async (request) => {
    if (!checkOrigin(request, config.APP_ORIGIN)) throw new AppError('forbidden', 'origem não permitida')
    const isWsUpgrade = request.headers.upgrade?.toLowerCase() === 'websocket'
    if (isWsUpgrade && !sameOrigin(request, config.APP_ORIGIN)) throw new AppError('forbidden', 'origem não permitida')
  })

  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })
  await app.register(authPlugin, { db, now })

  // S10: rotas inexistentes também contam pro limite global (senão 404 vira um jeito de
  // martelar o servidor sem esbarrar em rate limit nenhum).
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (_request, reply) => reply.status(404).send(errorBody('not-found', 'rota não encontrada')))
  app.setErrorHandler((error, request, reply) => {
    // Snapshot corrompido é um 500 genérico igual a qualquer outro erro inesperado (S13: sem
    // detalhe pro cliente). `issues` não precisa ser logado à parte: o serializer padrão do
    // pino (`pino-std-serializers`) copia as próprias propriedades enumeráveis do erro — então
    // `err.issues` já aparece na linha de log a partir só de `{ err: error }`.
    if (error instanceof CorruptSnapshotError) {
      request.log.error({ err: error }, 'snapshot da hunt corrompido')
      return reply.status(500).send(errorBody('internal', 'erro interno'))
    }
    if (error instanceof AppError) return reply.status(error.status).send(errorBody(error.code, error.message))
    if (error instanceof ZodError) return reply.status(400).send(errorBody('validation', error.issues[0]?.message ?? 'entrada inválida'))
    const status = (error as { statusCode?: number }).statusCode
    if (status === 429) return reply.status(429).send(errorBody('rate-limited', 'muitas tentativas, tente mais tarde'))
    if (status === 413) return reply.status(413).send(errorBody('payload-too-large', 'corpo grande demais'))
    if (status === 400 || status === 415) return reply.status(400).send(errorBody('validation', 'requisição inválida'))
    request.log.error({ err: error }, 'erro inesperado')
    return reply.status(500).send(errorBody('internal', 'erro interno'))
  })

  const registry = loadRegistry()
  const routeDeps = { db, config, now, realtime: deps.realtime, registry }
  await app.register(authRoutes, routeDeps)
  await app.register(trainerRoutes, routeDeps)
  await app.register(shopRoutes, routeDeps)
  await app.register(huntRoutes, routeDeps)
  if (config.DEBUG_VIEWER) await app.register(debugRoutes, routeDeps)
  registerHealth(app)
  await registerStatic(app, config)
  await app.register(wsRoutes, { ...routeDeps, ...(deps.wsOptions && { ws: deps.wsOptions }) })
  deps.extraRoutes?.(app)
  return app
}
