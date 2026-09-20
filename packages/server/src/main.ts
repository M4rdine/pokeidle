import 'dotenv/config'
import { loadRegistry } from '@pokeidle/shared'
import pino from 'pino'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { buildApp } from './http/app.js'
import { createMetrics } from './metrics/registry.js'
import { REDACT_PATHS } from './http/security.js'
import { createShutdown, recoverSessions } from './realtime/boot.js'
import { createScheduler } from './realtime/scheduler.js'
import { createSocketRegistry } from './realtime/sockets.js'

const config = loadConfig()
// O pino é criado antes do app: o scheduler precisa de um logger antes de o Fastify existir
// (ele já pode receber `attach`/ticks assim que `recoverSessions` roda), e a mesma instância
// é entregue ao Fastify via `loggerInstance` em vez de deixá-lo criar a dele.
const loggerInstance = pino({ level: config.LOG_LEVEL, redact: [...REDACT_PATHS] })
const { db, close } = createDb(config.DATABASE_URL)
await runMigrations(db)

const now = (): Date => new Date()
const sockets = createSocketRegistry()
// Um registro só, compartilhado: o scheduler alimenta os ganchos e o app expõe o mesmo estado
// em /metrics. Dois registros mostrariam metade dos números cada.
const metrics = createMetrics()
const scheduler = createScheduler({ db, registry: loadRegistry(), now, sockets, logger: loggerInstance, hooks: metrics.hooks, ...(config.TICK_MS === undefined ? {} : { tickMs: config.TICK_MS }) })
const app = await buildApp({ db, config, now, realtime: { scheduler, sockets }, loggerInstance, metrics })

// Os medidores de "agora" (sockets abertos, caçadas em catch-up) são lidos no ritmo do próprio
// scrape, não a cada evento: contar na borda exigiria instrumentar todo caminho de saída de
// socket, e o valor que interessa é o instantâneo.
const amostrarMedidores = (): void => {
  metrics.setConnections(sockets.size())
  metrics.setCatchingUp(scheduler.catchingUpCount())
}
const amostragem = setInterval(amostrarMedidores, 1000)
amostragem.unref()

const shutdown = createShutdown({ app, scheduler, sockets, close, logger: loggerInstance })
// Se `shutdown()` rejeitar (ex.: `app.close()` ou o `close()` do pool lançando), a rejeição
// precisa de um `onRejected` explícito: sem ele o processo morre como unhandled rejection,
// sem log nenhum e sem o código de saída 1.
const onShutdown = (): void => process.exit(0)
const onShutdownError = (err: unknown): void => {
  loggerInstance.error({ err }, 'falha no encerramento')
  process.exit(1)
}
process.on('SIGINT', () => void shutdown().then(onShutdown, onShutdownError))
process.on('SIGTERM', () => void shutdown().then(onShutdown, onShutdownError))

await app.listen({ port: config.PORT, host: '0.0.0.0' })
scheduler.start()
await recoverSessions(scheduler, db, now, loggerInstance)
