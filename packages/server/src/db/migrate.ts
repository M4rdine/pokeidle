import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client.js'

export const MIGRATIONS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

export const runMigrations = (db: Db): Promise<void> => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
