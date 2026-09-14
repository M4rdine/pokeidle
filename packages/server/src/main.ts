import 'dotenv/config'
import { loadRegistry } from '@pokeidle/shared'
import pino from 'pino'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { buildApp } from './http/app.js'
import { createScheduler } from './realtime/scheduler.js'
import { createSocketRegistry } from './realtime/sockets.js'

const config = loadConfig()
const { db, close } = createDb(config.DATABASE_URL)
await runMigrations(db)

const registry = loadRegistry()
const sockets = createSocketRegistry()
const logger = pino({ level: config.LOG_LEVEL })
const scheduler = createScheduler({ db, registry, now: () => new Date(), sockets, logger })
scheduler.start()

const app = await buildApp({ db, config, realtime: { scheduler, sockets } })

const shutdown = async (): Promise<void> => {
  scheduler.stop()
  await scheduler.flushAll()
  await app.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

await app.listen({ port: config.PORT, host: '0.0.0.0' })
