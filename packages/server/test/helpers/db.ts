import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../../src/db/client.js'
import { runMigrations } from '../../src/db/migrate.js'

export const TEST_DATABASE_URL = process.env['DATABASE_URL_TEST'] ?? 'postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test'

export async function openTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const { db, close } = createDb(TEST_DATABASE_URL)
  try {
    await db.execute(sql`select 1`)
  } catch (error) {
    await close()
    throw new Error('Postgres de teste indisponível: suba o Docker Compose (docker compose up -d) e confira DATABASE_URL_TEST', { cause: error })
  }
  await runMigrations(db)
  return { db, close }
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`truncate table hunt_log, hunt_sessions, pokedex_entries, inventory, pokemon, trainers, sessions, users restart identity cascade`)
}
