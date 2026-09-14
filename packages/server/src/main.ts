import 'dotenv/config'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { buildApp } from './http/app.js'

const config = loadConfig()
const { db, close } = createDb(config.DATABASE_URL)
await runMigrations(db)
const app = await buildApp({ db, config })

const shutdown = async (): Promise<void> => {
  await app.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

await app.listen({ port: config.PORT, host: '0.0.0.0' })
