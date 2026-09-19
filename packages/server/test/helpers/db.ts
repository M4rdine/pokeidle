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

/** Filhas antes das mães: apagar nesta ordem respeita as chaves estrangeiras sem cascade. */
const TEST_TABLES = ['hunt_log', 'hunt_sessions', 'pokedex_entries', 'inventory', 'pokemon', 'trainers', 'sessions', 'users'] as const

/**
 * Limpa o banco de teste com DELETE, não com TRUNCATE. As tabelas aqui têm dezenas de linhas, e
 * o TRUNCATE cria e sincroniza arquivos de relação novos a cada chamada: medido em disco
 * virtualizado (Colima), um único TRUNCATE chegou a 30 s preso em DataFileImmediateSync com a
 * máquina carregada, enfileirando os outros e estourando o tempo de testes que nada tinham a ver
 * com isso. O DELETE não toca em arquivo novo e é barato nesse tamanho.
 */
export async function truncateAll(db: Db): Promise<void> {
  for (const table of TEST_TABLES) await db.execute(sql.raw(`delete from ${table}`))
  await db.execute(sql.raw('alter sequence hunt_log_id_seq restart'))
}
