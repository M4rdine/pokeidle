# Fase 2b: Conta, persistência e REST — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contas com e-mail e senha, sessão em cookie, treinador com time/inventário/Pokédex, escolha do inicial, e a ponte banco ↔ `HuntState` (iniciar, snapshot, sincronizar, parar), tudo por REST em `packages/server`.

**Architecture:** Fastify 5 com módulos por domínio (`auth`, `account`, `hunt-store`, `http`) sobre Drizzle + Postgres 16 (Docker Compose, porta 5433). Serviços são funções que recebem `db` por parâmetro e lançam `AppError`; rotas validam com Zod `.strict()` e delegam. O motor da fase 2a não muda de contrato além de `CreateInput.trainer`.

**Tech Stack:** TypeScript 5 strict ESM, Fastify 5.12, @fastify/cookie 11, @fastify/rate-limit 11, @fastify/helmet 13, drizzle-orm 0.45 + drizzle-kit 0.31 + pg 8, argon2 0.45, zod 3.23 (mesma major do `shared`), Vitest 2, Postgres 16 em Docker.

**Spec:** `docs/superpowers/specs/2026-09-14-fase-2b-account-persistence-design.md`

## Global Constraints

- Serviços recebem `db` (ou `tx`) por parâmetro; nenhum módulo importa singleton de banco. `engine` não importa nada do servidor; `db` não importa `engine`.
- Dono do recurso vem de `request.auth.trainer.id`, nunca do corpo/URL (S2). `seed`/`rng_state` nunca saem do servidor (S3). `now` sempre do servidor (S4), injetado como `() => Date` para os testes.
- Cookie `sid`: `httpOnly`, `sameSite: 'lax'`, `secure = COOKIE_SECURE`, `path: '/'`, `maxAge` 30 dias. Banco guarda só SHA-256 do token de 32 bytes (S5). `SESSION_TTL_MS` = 30 dias, `TOUCH_INTERVAL_MS` = 1 h.
- argon2id; e-mail inexistente e senha errada → mesmo corpo/status (`invalid-credentials` 401) com `verifyPassword(DUMMY_HASH, …)` no primeiro caso (S7).
- Zod `.strict()` em todo corpo; `bodyLimit` 16 KB; só JSON (S9). Rate limit por IP: login/registro 10/min, demais 300/min (S10). Rotas que mudam estado exigem `Origin` (ou `Referer`) igual a `APP_ORIGIN`, senão `forbidden` 403 (S11).
- Helmet: nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, CSP `default-src 'self'`, HSTS só com `COOKIE_SECURE=true` (S12). 500 genérico sem stack (S13). Log `pino` com `redact` de cookie/authorization/password/token (S14). Sem `console.log`.
- Erros: `{ error: { code, message } }`; códigos/HTTP: `validation` 400, `invalid-credentials` 401, `unauthorized` 401, `forbidden` 403, `not-found` 404, `email-taken` 409, `name-taken` 409, `starter-already-chosen` 409, `no-starter` 409, `hunt-active` 409, `no-hunt` 409, `payload-too-large` 413, `rate-limited` 429, `internal` 500.
- Toda escrita de ouro, item, captura, registro e inicial em transação (S15). Constraints: `quantity >= 0`, únicos em `email`, `name`, `(trainer_id, team_slot)` parcial.
- Iniciais: `charmander | bulbasaur | squirtle`, nível 10, id `st-<uuid>`, `team_slot 0`, inventário inicial `poke-ball` 5, `potion` 3. Capturados usam o id do motor `${sessionId}-w${n}`.
- Testes de integração contra `DATABASE_URL_TEST` (padrão `postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test`): migrations uma vez por execução, `truncateAll` antes de cada teste, `fileParallelism: false`; sem banco → erro "Postgres de teste indisponível: suba o Docker Compose". Cobertura ≥ 80 % de linhas em `packages/server/src` (exceto `main.ts`).
- TypeScript strict ESM, imports locais com `.js`. Commits convencionais de uma linha, sem trailers.

## Estrutura de arquivos

```
docker-compose.yml                       docker/postgres-init/01-test-db.sql      .env.example
packages/shared/src/rng.ts               (+ state)         packages/server/src/engine/create.ts (+ trainer)
packages/server/
  package.json  drizzle.config.ts  vitest.config.ts  drizzle/<migration>.sql
  src/config.ts  src/main.ts
  src/db/{schema,client,migrate}.ts
  src/auth/{password,session,plugin,cookie}.ts
  src/http/{app,errors,security,validate}.ts  src/http/routes/{auth,trainer,hunts}.ts
  src/account/{dto,register,login,logout,me,starter,team,settings,inventory,pokedex}.ts
  src/hunt-store/{mappers,state-schema,start,snapshot,sync,stop,index}.ts
  test/helpers/{db,app}.ts
  test/{config,password,session,errors,security}.test.ts
  test/db.test.ts  test/auth.test.ts  test/trainer.test.ts  test/hunt-store.test.ts  test/hunts.test.ts
```

Pré-requisito de execução: `docker compose up -d` na raiz (o usuário liga o Docker).

---

### Task 1: Infra: Compose, config, schema Drizzle, migrations e helper de banco de teste

**Files:**
- Create: `docker-compose.yml`, `docker/postgres-init/01-test-db.sql`, `.env.example`, `packages/server/drizzle.config.ts`, `packages/server/src/config.ts`, `packages/server/src/db/schema.ts`, `packages/server/src/db/client.ts`, `packages/server/src/db/migrate.ts`, `packages/server/drizzle/0000_*.sql` (gerada), `packages/server/test/helpers/db.ts`
- Modify: `packages/server/package.json`, `packages/server/vitest.config.ts`
- Test: `packages/server/test/config.test.ts`, `packages/server/test/db.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?): Config` com `DATABASE_URL`, `PORT`, `COOKIE_SECURE`, `APP_ORIGIN`, `TRUST_PROXY`, `LOG_LEVEL`, `ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`; `createDb(url): { db: Db; close(): Promise<void> }`, tipos `Db`, `Tx`, `DbLike = Db | Tx`; `runMigrations(db)`; tabelas `users, sessions, trainers, pokemon, inventory, pokedexEntries, huntSessions, huntLog` e tipos `UserRow = typeof users.$inferSelect` etc.; helpers de teste `openTestDb(): Promise<{ db; close }>` e `truncateAll(db)`.

- [ ] **Step 1: Compose, init SQL e `.env.example`**

`docker-compose.yml` (raiz):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pokeidle
      POSTGRES_PASSWORD: pokeidle
      POSTGRES_DB: pokeidle
    ports:
      - "5433:5432"
    volumes:
      - pokeidle-pg:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pokeidle -d pokeidle"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pokeidle-pg: {}
```

`docker/postgres-init/01-test-db.sql`:
```sql
CREATE DATABASE pokeidle_test OWNER pokeidle;
```

`.env.example`:
```
DATABASE_URL=postgres://pokeidle:pokeidle@localhost:5433/pokeidle
DATABASE_URL_TEST=postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test
PORT=3000
APP_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
TRUST_PROXY=false
LOG_LEVEL=info
```

Rode `docker compose up -d` e `docker compose ps` (serviço `healthy`). Se `5433` estiver ocupada, reporte.

- [ ] **Step 2: Dependências e scripts**

`packages/server/package.json`:
```json
{
  "name": "@pokeidle/server",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate-cli.ts",
    "check": "pnpm typecheck && pnpm test && pnpm audit --prod"
  },
  "dependencies": {
    "@fastify/cookie": "^11.1.2",
    "@fastify/helmet": "^13.1.1",
    "@fastify/rate-limit": "^11.2.0",
    "@pokeidle/shared": "workspace:*",
    "argon2": "^0.45.1",
    "dotenv": "^17.4.2",
    "drizzle-orm": "^0.45.2",
    "fastify": "^5.12.4",
    "fastify-plugin": "^6.0.0",
    "pg": "^8.23.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@types/pg": "^8.23.1",
    "@vitest/coverage-v8": "^2.1.0",
    "drizzle-kit": "^0.31.10",
    "typescript": "^5.5.4",
    "vitest": "^2.1.0"
  }
}
```
Rode `pnpm install` na raiz (argon2 compila/baixa binário nativo; se falhar, reporte a saída).

`packages/server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/main.ts', 'src/db/migrate-cli.ts'], thresholds: { lines: 80 } },
  },
})
```

`packages/server/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? 'postgres://pokeidle:pokeidle@localhost:5433/pokeidle' },
})
```

- [ ] **Step 3: Teste de `config`**

`packages/server/test/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const base = { DATABASE_URL: 'postgres://u:p@localhost:5433/db' }

describe('loadConfig', () => {
  it('aplica os padrões', () => {
    expect(loadConfig(base)).toEqual({
      DATABASE_URL: base.DATABASE_URL, PORT: 3000, COOKIE_SECURE: false, APP_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY: false, LOG_LEVEL: 'info', ARGON2_MEMORY_KIB: 65536, ARGON2_TIME_COST: 3,
    })
  })
  it('converte booleanos e números', () => {
    const c = loadConfig({ ...base, PORT: '8080', COOKIE_SECURE: 'true', TRUST_PROXY: 'true', ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1' })
    expect(c).toMatchObject({ PORT: 8080, COOKIE_SECURE: true, TRUST_PROXY: true, ARGON2_MEMORY_KIB: 4096, ARGON2_TIME_COST: 1 })
  })
  it('falha com mensagem clara sem DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })
  it('rejeita porta e origem inválidas', () => {
    expect(() => loadConfig({ ...base, PORT: '99999' })).toThrow(/PORT/)
    expect(() => loadConfig({ ...base, APP_ORIGIN: 'localhost' })).toThrow(/APP_ORIGIN/)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- config`
Expected: FAIL (módulo `../src/config.js` não existe).

- [ ] **Step 5: `config.ts`**

```ts
import { z } from 'zod'

const bool = z.enum(['true', 'false']).transform((v) => v === 'true')

export const ConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  COOKIE_SECURE: bool.default('false'),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: bool.default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(3),
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
```
(`APP_ORIGIN` entra pelo `withDefaults` e não pelo `.default()` para que um `APP_ORIGIN=''` vindo do ambiente falhe em vez de virar padrão.)

- [ ] **Step 6: Schema Drizzle**

`packages/server/src/db/schema.ts`:
```ts
import { sql } from 'drizzle-orm'
import { bigint, bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

const tsNow = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull()

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['player', 'admin'] }).notNull().default('player'),
  createdAt: tsNow('created_at'),
})

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at'),
  lastSeenAt: ts('last_seen_at'),
  createdAt: tsNow('created_at'),
}, (t) => [index('sessions_user_id_idx').on(t.userId)])

export const trainers = pgTable('trainers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().unique(),
  xp: integer('xp').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  returnHpPercent: integer('return_hp_percent').notNull().default(30),
  ballTier: text('ball_tier', { enum: ['poke', 'great', 'ultra', 'best'] }).notNull().default('best'),
  maxWildHpPercent: integer('max_wild_hp_percent').notNull().default(30),
  allowDuplicates: boolean('allow_duplicates').notNull().default(false),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
})

export const pokemon = pgTable('pokemon', {
  id: text('id').primaryKey(),
  trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  speciesName: text('species_name').notNull(),
  level: integer('level').notNull(),
  xp: integer('xp').notNull(),
  hp: integer('hp').notNull(),
  hpMax: integer('hp_max').notNull(),
  teamSlot: integer('team_slot'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [
  index('pokemon_trainer_idx').on(t.trainerId),
  uniqueIndex('pokemon_trainer_slot_idx').on(t.trainerId, t.teamSlot).where(sql`${t.teamSlot} is not null`),
])

export const inventory = pgTable('inventory', {
  trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull(),
  quantity: integer('quantity').notNull(),
  updatedAt: tsNow('updated_at'),
}, (t) => [primaryKey({ columns: [t.trainerId, t.itemId] }), check('inventory_quantity_check', sql`${t.quantity} >= 0`)])

export const pokedexEntries = pgTable('pokedex_entries', {
  trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  speciesName: text('species_name').notNull(),
  seenAt: ts('seen_at'),
  caughtAt: timestamp('caught_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.trainerId, t.speciesName] })])

export const huntSessions = pgTable('hunt_sessions', {
  trainerId: uuid('trainer_id').primaryKey().references(() => trainers.id, { onDelete: 'cascade' }),
  huntId: text('hunt_id').notNull(),
  sessionId: text('session_id').notNull(),
  state: jsonb('state').$type<unknown>().notNull(),
  seed: integer('seed').notNull(),
  rngState: bigint('rng_state', { mode: 'number' }).notNull(),
  startedAt: ts('started_at'),
  lastSimulatedAt: ts('last_simulated_at'),
  updatedAt: tsNow('updated_at'),
})

export const huntLog = pgTable('hunt_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
  huntId: text('hunt_id').notNull(),
  speciesName: text('species_name').notNull(),
  level: integer('level').notNull(),
  xpTrainer: integer('xp_trainer').notNull(),
  gold: integer('gold').notNull(),
  drops: jsonb('drops').$type<unknown>().notNull(),
  captured: boolean('captured').notNull(),
  createdAt: tsNow('created_at'),
}, (t) => [index('hunt_log_trainer_created_idx').on(t.trainerId, t.createdAt)])

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type TrainerRow = typeof trainers.$inferSelect
export type PokemonRow = typeof pokemon.$inferSelect
export type InventoryRow = typeof inventory.$inferSelect
export type PokedexRow = typeof pokedexEntries.$inferSelect
export type HuntSessionRow = typeof huntSessions.$inferSelect
```

`packages/server/src/db/client.ts`:
```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbLike = Db | Tx

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url, max: 10 })
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() }
}
```

`packages/server/src/db/migrate.ts`:
```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client.js'

export const MIGRATIONS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

export const runMigrations = (db: Db): Promise<void> => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
```

`packages/server/src/db/migrate-cli.ts`:
```ts
import 'dotenv/config'
import { loadConfig } from '../config.js'
import { createDb } from './client.js'
import { runMigrations } from './migrate.js'

const config = loadConfig()
const { db, close } = createDb(config.DATABASE_URL)
await runMigrations(db)
await close()
```

Gere a migration: `cd packages/server && pnpm db:generate` → cria `drizzle/0000_<nome>.sql` + `drizzle/meta/`. Abra o SQL e confira: 8 tabelas, `CHECK ("quantity" >= 0)`, índice único parcial `WHERE "team_slot" is not null`, FKs `ON DELETE cascade`. Commite a pasta `drizzle/` inteira.

- [ ] **Step 7: Helper de banco de teste e teste de integração**

`packages/server/test/helpers/db.ts`:
```ts
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
```

`packages/server/test/db.test.ts`:
```ts
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/client.js'
import { inventory, trainers, users } from '../src/db/schema.js'
import { openTestDb, truncateAll } from './helpers/db.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => { await truncateAll(db) })

describe('schema', () => {
  it('cria usuário e treinador e apaga em cascata', async () => {
    const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
    const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash' }).returning()
    expect(t).toMatchObject({ xp: 0, gold: 0, returnHpPercent: 30, ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false })
    await db.delete(users).where(eq(users.id, u!.id))
    expect(await db.select().from(trainers)).toEqual([])
  })
  it('rejeita e-mail duplicado e quantidade negativa', async () => {
    const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
    await expect(db.insert(users).values({ email: 'a@a.com', passwordHash: 'y' })).rejects.toThrow(/unique|duplicate/i)
    const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash' }).returning()
    await expect(db.insert(inventory).values({ trainerId: t!.id, itemId: 'potion', quantity: -1 })).rejects.toThrow(/check/i)
  })
})
```

- [ ] **Step 8: Rodar tudo**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`
Expected: config (4) + db (2) + motor (62) verdes; typecheck limpo.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml docker .env.example packages/server pnpm-lock.yaml
git commit -m "feat(server): compose, config, schema drizzle, migrations e banco de teste"
```

---

### Task 2: Senha, sessão, cookie e `AppError`

**Files:**
- Create: `packages/server/src/auth/password.ts`, `src/auth/session.ts`, `src/auth/cookie.ts`, `src/http/errors.ts`
- Test: `packages/server/test/password.test.ts`, `test/session.test.ts`, `test/errors.test.ts`

**Interfaces:**
- Consumes: `Db`, `DbLike`, `sessions` (Task 1).
- Produces: `hashPassword(plain, opts?: HashOptions): Promise<string>`, `verifyPassword(hash, plain): Promise<boolean>`, `DUMMY_HASH: string`, `HashOptions { memoryCost?: number; timeCost?: number }`; `SESSION_TTL_MS`, `TOUCH_INTERVAL_MS`, `newSessionToken(): string`, `hashToken(token): string`, `isExpired(row, now)`, `needsTouch(row, now)`, `createSession(db, userId, now): Promise<string>` (devolve o token em claro), `resolveSession(db, token, now): Promise<{ userId: string } | null>`, `deleteSession(db, token)`; `SESSION_COOKIE = 'sid'`, `sessionCookieOptions(secure): CookieSerializeOptions`; `ErrorCode`, `STATUS_BY_CODE`, `class AppError`, `errorBody(code, message)`.

- [ ] **Step 1: Testes**

`packages/server/test/password.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { DUMMY_HASH, hashPassword, verifyPassword } from '../src/auth/password.js'

const fast = { memoryCost: 4096, timeCost: 1 }

describe('password', () => {
  it('hash argon2id verifica a senha certa e recusa a errada', async () => {
    const h = await hashPassword('segredo123', fast)
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(h, 'segredo123')).toBe(true)
    expect(await verifyPassword(h, 'segredo124')).toBe(false)
  })
  it('hash inválido devolve false em vez de lançar', async () => {
    expect(await verifyPassword('lixo', 'x')).toBe(false)
  })
  it('DUMMY_HASH nunca verifica', async () => {
    expect(DUMMY_HASH.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(DUMMY_HASH, '')).toBe(false)
  })
})
```

`packages/server/test/session.test.ts`:
```ts
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createSession, deleteSession, hashToken, isExpired, needsTouch, newSessionToken, resolveSession, SESSION_TTL_MS, TOUCH_INTERVAL_MS } from '../src/auth/session.js'
import { SESSION_COOKIE, sessionCookieOptions } from '../src/auth/cookie.js'
import type { Db } from '../src/db/client.js'
import { sessions, users } from '../src/db/schema.js'
import { openTestDb, truncateAll } from './helpers/db.js'

const T0 = new Date('2026-09-14T12:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

describe('token puro', () => {
  it('token tem 43 chars base64url e hash sha256 hex estável', () => {
    const t = newSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(t)).toBe(hashToken(t))
    expect(newSessionToken()).not.toBe(t)
  })
  it('isExpired e needsTouch', () => {
    const row = { expiresAt: at(SESSION_TTL_MS), lastSeenAt: T0 }
    expect(isExpired(row, at(SESSION_TTL_MS - 1))).toBe(false)
    expect(isExpired(row, at(SESSION_TTL_MS))).toBe(true)
    expect(needsTouch(row, at(TOUCH_INTERVAL_MS))).toBe(false)
    expect(needsTouch(row, at(TOUCH_INTERVAL_MS + 1))).toBe(true)
  })
  it('cookie: nome e flags', () => {
    expect(SESSION_COOKIE).toBe('sid')
    expect(sessionCookieOptions(true)).toEqual({ httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: SESSION_TTL_MS / 1000 })
    expect(sessionCookieOptions(false).secure).toBe(false)
  })
})

describe('sessão no banco', () => {
  let db: Db
  let close: () => Promise<void>
  let userId: string
  beforeAll(async () => { ({ db, close } = await openTestDb()) })
  afterAll(async () => { await close() })
  beforeEach(async () => {
    await truncateAll(db)
    const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
    userId = u!.id
  })

  it('cria, resolve, guarda só o hash e apaga', async () => {
    const token = await createSession(db, userId, T0)
    const rows = await db.select().from(sessions)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).toBe(hashToken(token))
    expect(rows[0]!.expiresAt).toEqual(at(SESSION_TTL_MS))
    expect(await resolveSession(db, token, at(1000))).toEqual({ userId })
    expect(await resolveSession(db, 'inexistente', at(1000))).toBeNull()
    await deleteSession(db, token)
    expect(await resolveSession(db, token, at(2000))).toBeNull()
  })
  it('sessão vencida é apagada ao ser encontrada', async () => {
    const token = await createSession(db, userId, T0)
    expect(await resolveSession(db, token, at(SESSION_TTL_MS))).toBeNull()
    expect(await db.select().from(sessions)).toEqual([])
  })
  it('touch só depois de 1 h e renova expires_at', async () => {
    const token = await createSession(db, userId, T0)
    await resolveSession(db, token, at(TOUCH_INTERVAL_MS))
    expect((await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token))))[0]!.lastSeenAt).toEqual(T0)
    await resolveSession(db, token, at(TOUCH_INTERVAL_MS + 1))
    const row = (await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token))))[0]!
    expect(row.lastSeenAt).toEqual(at(TOUCH_INTERVAL_MS + 1))
    expect(row.expiresAt).toEqual(at(TOUCH_INTERVAL_MS + 1 + SESSION_TTL_MS))
  })
})
```

`packages/server/test/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { AppError, errorBody, STATUS_BY_CODE } from '../src/http/errors.js'

describe('AppError', () => {
  it('carrega código, status e corpo', () => {
    const e = new AppError('hunt-active', 'já existe hunt')
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(409)
    expect(errorBody(e.code, e.message)).toEqual({ error: { code: 'hunt-active', message: 'já existe hunt' } })
  })
  it('tabela de status cobre todos os códigos', () => {
    expect(STATUS_BY_CODE).toEqual({
      validation: 400, 'invalid-credentials': 401, unauthorized: 401, forbidden: 403, 'not-found': 404,
      'email-taken': 409, 'name-taken': 409, 'starter-already-chosen': 409, 'no-starter': 409, 'hunt-active': 409, 'no-hunt': 409,
      'payload-too-large': 413, 'rate-limited': 429, internal: 500,
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- password session errors`
Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: Implementar**

`src/auth/password.ts`:
```ts
import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'

export interface HashOptions { readonly memoryCost?: number; readonly timeCost?: number }

export function hashPassword(plain: string, options: HashOptions = {}): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id, ...options })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain).catch(() => false)
}

/** Hash de um segredo aleatório, usado para igualar o tempo de resposta quando o e-mail não existe (S7). */
export const DUMMY_HASH: string = await hashPassword(randomBytes(32).toString('hex'), { memoryCost: 4096, timeCost: 1 })
```

`src/auth/session.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { sessions } from '../db/schema.js'

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const TOUCH_INTERVAL_MS = 60 * 60 * 1000

export const newSessionToken = (): string => randomBytes(32).toString('base64url')
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

interface Timestamps { readonly expiresAt: Date; readonly lastSeenAt: Date }
export const isExpired = (row: Timestamps, now: Date): boolean => row.expiresAt.getTime() <= now.getTime()
export const needsTouch = (row: Timestamps, now: Date): boolean => now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS
const expiryFrom = (now: Date): Date => new Date(now.getTime() + SESSION_TTL_MS)

export async function createSession(db: DbLike, userId: string, now: Date): Promise<string> {
  const token = newSessionToken()
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, lastSeenAt: now, expiresAt: expiryFrom(now) })
  return token
}

export async function resolveSession(db: DbLike, token: string, now: Date): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token)
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash))
  if (!row) return null
  if (isExpired(row, now)) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    return null
  }
  if (needsTouch(row, now)) await db.update(sessions).set({ lastSeenAt: now, expiresAt: expiryFrom(now) }).where(eq(sessions.tokenHash, tokenHash))
  return { userId: row.userId }
}

export async function deleteSession(db: DbLike, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
}
```

`src/auth/cookie.ts`:
```ts
import type { CookieSerializeOptions } from '@fastify/cookie'
import { SESSION_TTL_MS } from './session.js'

export const SESSION_COOKIE = 'sid'

export const sessionCookieOptions = (secure: boolean): CookieSerializeOptions => ({
  httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS / 1000,
})
```

`src/http/errors.ts`:
```ts
export type ErrorCode =
  | 'validation' | 'invalid-credentials' | 'unauthorized' | 'forbidden' | 'not-found'
  | 'email-taken' | 'name-taken' | 'starter-already-chosen' | 'no-starter' | 'hunt-active' | 'no-hunt'
  | 'payload-too-large' | 'rate-limited' | 'internal'

export const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  validation: 400, 'invalid-credentials': 401, unauthorized: 401, forbidden: 403, 'not-found': 404,
  'email-taken': 409, 'name-taken': 409, 'starter-already-chosen': 409, 'no-starter': 409, 'hunt-active': 409, 'no-hunt': 409,
  'payload-too-large': 413, 'rate-limited': 429, internal: 500,
}

export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
  }
  get status(): number { return STATUS_BY_CODE[this.code] }
}

export const errorBody = (code: ErrorCode, message: string) => ({ error: { code, message } })
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- password session errors && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): senha argon2id, sessão com hash de token, cookie e AppError"
```

---

### Task 3: App Fastify, segurança, plugin de auth e rotas de conta (registro, login, logout, me)

**Files:**
- Create: `src/http/app.ts`, `src/http/security.ts`, `src/http/validate.ts`, `src/http/routes/auth.ts`, `src/http/routes/trainer.ts`, `src/auth/plugin.ts`, `src/account/dto.ts`, `src/account/register.ts`, `src/account/login.ts`, `src/account/logout.ts`, `src/account/me.ts`, `test/helpers/app.ts`
- Test: `test/security.test.ts` (unitário), `test/auth.test.ts` (integração)

**Interfaces:**
- Consumes: Task 1 (`Db`, tabelas, `Config`), Task 2 (senha, sessão, cookie, `AppError`).
- Produces: `buildApp(deps: AppDeps): Promise<FastifyInstance>` com `AppDeps { db: Db; config: Config; now?: () => Date; logger?: boolean }`; `AuthContext { user: UserRow; trainer: TrainerRow }`, `request.auth: AuthContext | null`, `requireAuth` (preHandler), `authOf(request): AuthContext`; `parseBody(schema, body)`; `checkOrigin(request, appOrigin): boolean`, `REDACT_PATHS`; DTOs `userDto(row)`, `trainerDto(row, extra: { hasStarter: boolean; activeHuntId: string | null })`, `pokemonDto(row)`; serviços `register(db, input, opts)`, `login(db, input, opts)`, `logout(db, token)`, `getMe(db, auth)`; helpers de teste `testApp()`, `api(app, cookie?)`, `cookieOf(response)`, `registerAndLogin(app, n?)`, `ORIGIN`.

- [ ] **Step 1: Teste unitário de segurança**

`test/security.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { checkOrigin, REDACT_PATHS } from '../src/http/security.js'

const req = (method: string, headers: Record<string, string>) => ({ method, headers }) as unknown as import('fastify').FastifyRequest
const APP = 'http://localhost:3000'

describe('checkOrigin', () => {
  it('GET/HEAD/OPTIONS passam sem Origin', () => {
    expect(checkOrigin(req('GET', {}), APP)).toBe(true)
    expect(checkOrigin(req('HEAD', {}), APP)).toBe(true)
  })
  it('POST exige Origin igual à origem do app', () => {
    expect(checkOrigin(req('POST', { origin: APP }), APP)).toBe(true)
    expect(checkOrigin(req('POST', { origin: 'http://evil.test' }), APP)).toBe(false)
    expect(checkOrigin(req('POST', {}), APP)).toBe(false)
  })
  it('aceita Referer da mesma origem quando não há Origin', () => {
    expect(checkOrigin(req('PUT', { referer: `${APP}/app` }), APP)).toBe(true)
    expect(checkOrigin(req('PUT', { referer: 'http://evil.test/x' }), APP)).toBe(false)
    expect(checkOrigin(req('PUT', { referer: 'lixo' }), APP)).toBe(false)
  })
})

describe('REDACT_PATHS', () => {
  it('cobre cookie, authorization, set-cookie, password e token', () => {
    expect(REDACT_PATHS).toEqual(['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.token'])
  })
})
```

- [ ] **Step 2: Teste de integração de auth**

`test/helpers/app.ts`:
```ts
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { loadConfig } from '../../src/config.js'
import type { Db } from '../../src/db/client.js'
import { buildApp } from '../../src/http/app.js'
import { openTestDb, truncateAll } from './db.js'

export const ORIGIN = 'http://localhost:3000'
export const T0 = new Date('2026-09-14T12:00:00Z')

export interface TestApp { app: FastifyInstance; db: Db; clock: { now: Date }; close: () => Promise<void> }

export async function testApp(): Promise<TestApp> {
  const { db, close } = await openTestDb()
  await truncateAll(db)
  const config = loadConfig({ DATABASE_URL: 'postgres://x:x@localhost:1/x', APP_ORIGIN: ORIGIN, ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1' })
  const clock = { now: T0 }
  const app = await buildApp({ db, config, now: () => clock.now, logger: false })
  return { app, db, clock, close: async () => { await app.close(); await close() } }
}

type Body = Record<string, unknown> | undefined
export function api(app: FastifyInstance, cookie?: string) {
  const call = (method: InjectOptions['method'], url: string, payload?: Body, headers: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload !== undefined && { payload }), headers: { origin: ORIGIN, ...(cookie && { cookie }), ...headers } })
  return {
    get: (url: string, headers?: Record<string, string>) => call('GET', url, undefined, headers),
    post: (url: string, payload?: Body, headers?: Record<string, string>) => call('POST', url, payload ?? {}, headers),
    put: (url: string, payload: Body, headers?: Record<string, string>) => call('PUT', url, payload, headers),
    patch: (url: string, payload: Body, headers?: Record<string, string>) => call('PATCH', url, payload, headers),
  }
}

export function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie']
  const first = Array.isArray(raw) ? raw[0] : raw
  if (!first) throw new Error('resposta sem set-cookie')
  return first.split(';')[0]!
}

export async function registerAndLogin(app: FastifyInstance, n = 1): Promise<{ cookie: string; trainerId: string; email: string }> {
  const email = `user${n}@test.dev`
  const res = await api(app).post('/auth/register', { email, password: 'senha-forte-123', name: `Trainer${n}` })
  if (res.statusCode !== 201) throw new Error(`registro falhou: ${res.body}`)
  return { cookie: cookieOf(res), trainerId: (res.json() as { trainer: { id: string } }).trainer.id, email }
}
```

`test/auth.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, TOUCH_INTERVAL_MS, hashToken } from '../src/auth/session.js'
import { inventory, sessions, trainers, users } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, cookieOf, ORIGIN, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0 })

const good = { email: 'Ash@Test.dev', password: 'senha-forte-123', name: 'Ash' }

describe('registro', () => {
  it('cria usuário, treinador, inventário inicial e sessão; e-mail normalizado', async () => {
    const res = await api(t.app).post('/auth/register', good)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ user: { email: 'ash@test.dev', role: 'player' }, trainer: { name: 'Ash', xp: 0, gold: 0, hasStarter: false, activeHuntId: null, settings: { returnHpPercent: 30, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } } } })
    const setCookie = String(res.headers['set-cookie'])
    expect(setCookie).toMatch(/^sid=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/)
    expect(await t.db.select().from(inventory)).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: 'poke-ball', quantity: 5 }), expect.objectContaining({ itemId: 'potion', quantity: 3 })]))
    const [s] = await t.db.select().from(sessions)
    expect(s!.tokenHash).toBe(hashToken(cookieOf(res).slice('sid='.length)))
    expect((await t.db.select().from(users))[0]!.passwordHash).toMatch(/^\$argon2id\$/)
  })
  it('valida corpo e recusa campos desconhecidos', async () => {
    expect((await api(t.app).post('/auth/register', { ...good, password: 'curta' })).statusCode).toBe(400)
    expect((await api(t.app).post('/auth/register', { ...good, name: 'a' })).statusCode).toBe(400)
    const extra = await api(t.app).post('/auth/register', { ...good, xp: 999 })
    expect(extra.statusCode).toBe(400)
    expect(extra.json()).toMatchObject({ error: { code: 'validation' } })
  })
  it('e-mail e nome duplicados; nada fica pela metade', async () => {
    await api(t.app).post('/auth/register', good)
    expect((await api(t.app).post('/auth/register', { ...good, name: 'Outro' })).json()).toMatchObject({ error: { code: 'email-taken' } })
    const r = await api(t.app).post('/auth/register', { ...good, email: 'b@test.dev' })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ error: { code: 'name-taken' } })
    expect(await t.db.select().from(users)).toHaveLength(1)
    expect(await t.db.select().from(trainers)).toHaveLength(1)
  })
})

describe('login e logout', () => {
  beforeEach(async () => { await api(t.app).post('/auth/register', good) })
  it('login ok cria sessão nova; credenciais erradas respondem igual', async () => {
    const ok = await api(t.app).post('/auth/login', { email: 'ash@test.dev', password: good.password })
    expect(ok.statusCode).toBe(200)
    expect(await t.db.select().from(sessions)).toHaveLength(2)
    const wrongPw = await api(t.app).post('/auth/login', { email: 'ash@test.dev', password: 'errada-errada' })
    const noUser = await api(t.app).post('/auth/login', { email: 'ninguem@test.dev', password: 'errada-errada' })
    expect(wrongPw.statusCode).toBe(401)
    expect(noUser.statusCode).toBe(401)
    expect(wrongPw.json()).toEqual(noUser.json())
    expect(wrongPw.json()).toEqual({ error: { code: 'invalid-credentials', message: expect.any(String) } })
  })
  it('logout apaga a sessão e limpa o cookie; sem cookie também é 204', async () => {
    const login = await api(t.app).post('/auth/login', { email: 'ash@test.dev', password: good.password })
    const cookie = cookieOf(login)
    const out = await api(t.app, cookie).post('/auth/logout')
    expect(out.statusCode).toBe(204)
    expect(String(out.headers['set-cookie'])).toMatch(/^sid=; /)
    expect(await t.db.select().from(sessions)).toHaveLength(1)
    expect((await api(t.app, cookie).get('/me')).statusCode).toBe(401)
    expect((await api(t.app).post('/auth/logout')).statusCode).toBe(204)
  })
})

describe('sessão e /me', () => {
  it('sem cookie → 401; com cookie → dados; vencida → 401 e cookie limpo; touch após 1 h', async () => {
    expect((await api(t.app).get('/me')).json()).toMatchObject({ error: { code: 'unauthorized' } })
    const { cookie } = await registerAndLogin(t.app)
    const me = await api(t.app, cookie).get('/me')
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ user: { email: 'user1@test.dev' }, trainer: { name: 'Trainer1', hasStarter: false } })
    t.clock.now = new Date(T0.getTime() + TOUCH_INTERVAL_MS + 1)
    await api(t.app, cookie).get('/me')
    expect((await t.db.select().from(sessions))[0]!.lastSeenAt).toEqual(t.clock.now)
    t.clock.now = new Date(t.clock.now.getTime() + SESSION_TTL_MS)
    const expired = await api(t.app, cookie).get('/me')
    expect(expired.statusCode).toBe(401)
    expect(String(expired.headers['set-cookie'])).toMatch(/^sid=; /)
  })
})

describe('segurança HTTP', () => {
  it('Origin ausente ou estranho em POST → 403; GET não exige', async () => {
    const noOrigin = await t.app.inject({ method: 'POST', url: '/auth/login', payload: {} })
    expect(noOrigin.statusCode).toBe(403)
    const evil = await api(t.app).post('/auth/login', {}, { origin: 'http://evil.test' })
    expect(evil.json()).toMatchObject({ error: { code: 'forbidden' } })
    expect((await t.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401)
  })
  it('rate limit: 11ª tentativa de login → 429', async () => {
    for (let i = 0; i < 10; i++) await api(t.app).post('/auth/login', { email: 'x@test.dev', password: 'errada-errada' })
    const r = await api(t.app).post('/auth/login', { email: 'x@test.dev', password: 'errada-errada' })
    expect(r.statusCode).toBe(429)
    expect(r.json()).toMatchObject({ error: { code: 'rate-limited' } })
  })
  it('corpo > 16 KB → 413; JSON inválido → 400; content-type errado → 400', async () => {
    const big = await api(t.app).post('/auth/login', { email: 'x@test.dev', password: 'a'.repeat(17 * 1024) })
    expect(big.statusCode).toBe(413)
    const bad = await t.app.inject({ method: 'POST', url: '/auth/login', payload: '{"email":', headers: { origin: ORIGIN, 'content-type': 'application/json' } })
    expect(bad.statusCode).toBe(400)
    const form = await t.app.inject({ method: 'POST', url: '/auth/login', payload: 'a=b', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' } })
    expect(form.statusCode).toBe(400)
  })
  it('cabeçalhos do helmet e 404 em JSON', async () => {
    const r = await api(t.app).get('/nao-existe')
    expect(r.statusCode).toBe(404)
    expect(r.json()).toMatchObject({ error: { code: 'not-found' } })
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['x-frame-options']).toBe('DENY')
    expect(r.headers['referrer-policy']).toBe('same-origin')
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'self'")
    expect(r.headers['strict-transport-security']).toBeUndefined()
  })
  it('erro inesperado vira 500 genérico', async () => {
    t.app.get('/boom', async () => { throw new Error('segredo do banco: tabela users') })
    const r = await api(t.app).get('/boom')
    expect(r.statusCode).toBe(500)
    expect(r.json()).toEqual({ error: { code: 'internal', message: 'erro interno' } })
  })
})
```
Nota: `t.app.get('/boom', …)` só funciona se o app ainda não estiver pronto; `buildApp` NÃO deve chamar `app.ready()`; o `inject` faz isso na primeira chamada. Por isso o teste de 500 fica por último no arquivo e registra a rota antes de qualquer `inject`? Não: os testes anteriores já injetaram. Solução: `buildApp` aceita `extraRoutes?: (app) => void` em `AppDeps`; o teste de 500 cria um app próprio: `const boom = await buildApp({ ...deps, extraRoutes: (a) => a.get('/boom', async () => { throw new Error('x') }) })`. Escreva o teste assim (com `t.db`, `loadConfig` igual ao helper e `await boom.close()` no fim).

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- security auth`

- [ ] **Step 4: Implementar `http/security.ts`, `http/validate.ts`, `auth/plugin.ts`**

`src/http/security.ts`:
```ts
import type { FastifyRequest } from 'fastify'

export const REDACT_PATHS: readonly string[] = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.token']

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try { return new URL(value).origin } catch { return null }
}

/** S11: rotas que mudam estado só aceitam requisições da própria origem. */
export function checkOrigin(request: FastifyRequest, appOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return true
  const origin = originOf(request.headers.origin) ?? originOf(request.headers.referer)
  return origin !== null && origin === new URL(appOrigin).origin
}
```

`src/http/validate.ts`:
```ts
import type { ZodTypeAny, z } from 'zod'
import { AppError } from './errors.js'

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {})
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  throw new AppError('validation', `${where}${issue?.message ?? 'entrada inválida'}`)
}
```

`src/auth/plugin.ts`:
```ts
import { eq } from 'drizzle-orm'
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import fp from 'fastify-plugin'
import type { Db } from '../db/client.js'
import { trainers, users, type TrainerRow, type UserRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'
import { SESSION_COOKIE } from './cookie.js'
import { resolveSession } from './session.js'

export interface AuthContext { readonly user: UserRow; readonly trainer: TrainerRow }

declare module 'fastify' {
  interface FastifyRequest { auth: AuthContext | null }
}

export async function loadAuthContext(db: Db, userId: string): Promise<AuthContext | null> {
  const [row] = await db.select({ user: users, trainer: trainers }).from(users).innerJoin(trainers, eq(trainers.userId, users.id)).where(eq(users.id, userId))
  return row ?? null
}

export const authPlugin = fp<{ db: Db; now: () => Date }>(async (app, { db, now }) => {
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return
    const session = await resolveSession(db, token, now())
    if (!session) { reply.clearCookie(SESSION_COOKIE, { path: '/' }); return }
    request.auth = await loadAuthContext(db, session.userId)
  })
})

export const requireAuth: preHandlerAsyncHookHandler = async (request) => {
  if (!request.auth) throw new AppError('unauthorized', 'faça login')
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError('unauthorized', 'faça login')
  return request.auth
}
```

- [ ] **Step 5: Implementar `account/*`**

`src/account/dto.ts`:
```ts
import type { PokemonRow, TrainerRow, UserRow } from '../db/schema.js'

export const userDto = (u: UserRow) => ({ id: u.id, email: u.email, role: u.role })

export const settingsDto = (t: TrainerRow) => ({
  returnHpPercent: t.returnHpPercent,
  capture: { ballTier: t.ballTier, maxWildHpPercent: t.maxWildHpPercent, allowDuplicates: t.allowDuplicates },
})

export const trainerDto = (t: TrainerRow, extra: { hasStarter: boolean; activeHuntId: string | null }) => ({
  id: t.id, name: t.name, xp: t.xp, gold: t.gold, settings: settingsDto(t), hasStarter: extra.hasStarter, activeHuntId: extra.activeHuntId,
})

export const pokemonDto = (p: PokemonRow) => ({ id: p.id, speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: p.teamSlot })
```

`src/account/me.ts`:
```ts
import { count, eq } from 'drizzle-orm'
import type { AuthContext } from '../auth/plugin.js'
import type { DbLike } from '../db/client.js'
import { huntSessions, pokemon } from '../db/schema.js'
import { trainerDto, userDto } from './dto.js'

export async function trainerExtra(db: DbLike, trainerId: string): Promise<{ hasStarter: boolean; activeHuntId: string | null }> {
  const [c] = await db.select({ n: count() }).from(pokemon).where(eq(pokemon.trainerId, trainerId))
  const [h] = await db.select({ huntId: huntSessions.huntId }).from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  return { hasStarter: (c?.n ?? 0) > 0, activeHuntId: h?.huntId ?? null }
}

export async function getMe(db: DbLike, auth: AuthContext) {
  return { user: userDto(auth.user), trainer: trainerDto(auth.trainer, await trainerExtra(db, auth.trainer.id)) }
}
```

`src/account/register.ts`:
```ts
import { z } from 'zod'
import { hashPassword, type HashOptions } from '../auth/password.js'
import { createSession } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { inventory, trainers, users, type TrainerRow, type UserRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const STARTER_INVENTORY: ReadonlyArray<{ itemId: string; quantity: number }> = [{ itemId: 'poke-ball', quantity: 5 }, { itemId: 'potion', quantity: 3 }]

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(3).max(16).regex(/^[A-Za-z0-9 ]+$/, 'só letras, números e espaço'),
}).strict()
export type RegisterInput = z.infer<typeof RegisterSchema>

export interface RegisterResult { readonly user: UserRow; readonly trainer: TrainerRow; readonly token: string }

export async function register(db: Db, input: RegisterInput, opts: { hash: HashOptions; now: Date }): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password, opts.hash)
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: input.email, passwordHash }).onConflictDoNothing().returning()
    if (!user) throw new AppError('email-taken', 'e-mail já cadastrado')
    const [trainer] = await tx.insert(trainers).values({ userId: user.id, name: input.name }).onConflictDoNothing().returning()
    if (!trainer) throw new AppError('name-taken', 'nome já em uso')
    await tx.insert(inventory).values(STARTER_INVENTORY.map((i) => ({ ...i, trainerId: trainer.id })))
    const token = await createSession(tx, user.id, opts.now)
    return { user, trainer, token }
  })
}
```

`src/account/login.ts`:
```ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { DUMMY_HASH, verifyPassword } from '../auth/password.js'
import { createSession } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { trainers, users, type TrainerRow, type UserRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) }).strict()
export type LoginInput = z.infer<typeof LoginSchema>

const invalid = () => new AppError('invalid-credentials', 'e-mail ou senha inválidos')

export async function login(db: Db, input: LoginInput, opts: { now: Date }): Promise<{ user: UserRow; trainer: TrainerRow; token: string }> {
  const [row] = await db.select({ user: users, trainer: trainers }).from(users).innerJoin(trainers, eq(trainers.userId, users.id)).where(eq(users.email, input.email))
  if (!row) { await verifyPassword(DUMMY_HASH, input.password); throw invalid() }
  if (!(await verifyPassword(row.user.passwordHash, input.password))) throw invalid()
  const token = await createSession(db, row.user.id, opts.now)
  return { user: row.user, trainer: row.trainer, token }
}
```

`src/account/logout.ts`:
```ts
import { deleteSession } from '../auth/session.js'
import type { Db } from '../db/client.js'

export async function logout(db: Db, token: string | undefined): Promise<void> {
  if (token) await deleteSession(db, token)
}
```

- [ ] **Step 6: Implementar `http/app.ts` e rotas**

`src/http/app.ts`:
```ts
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
    trustProxy: config.TRUST_PROXY,
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
  deps.extraRoutes?.(app)
  return app
}
```
Se o `onRequest` da origem rodar antes do plugin de cookie/auth ou depois, tanto faz: ele não depende deles. Se o helmet definir `X-Frame-Options: SAMEORIGIN` apesar do `frameguard`, confira a versão 13 (`frameguard: { action: 'deny' }` é o nome certo).

`src/http/routes/auth.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify'
import { SESSION_COOKIE, sessionCookieOptions } from '../../auth/cookie.js'
import { login, LoginSchema } from '../../account/login.js'
import { logout } from '../../account/logout.js'
import { trainerExtra } from '../../account/me.js'
import { register, RegisterSchema } from '../../account/register.js'
import { trainerDto, userDto } from '../../account/dto.js'
import type { Config } from '../../config.js'
import type { Db } from '../../db/client.js'
import { parseBody } from '../validate.js'

export interface RouteDeps { readonly db: Db; readonly config: Config; readonly now: () => Date }

const AUTH_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

export const authRoutes: FastifyPluginAsync<RouteDeps> = async (app, { db, config, now }) => {
  const hash = { memoryCost: config.ARGON2_MEMORY_KIB, timeCost: config.ARGON2_TIME_COST }

  app.post('/auth/register', AUTH_LIMIT, async (request, reply) => {
    const input = parseBody(RegisterSchema, request.body)
    const { user, trainer, token } = await register(db, input, { hash, now: now() })
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.COOKIE_SECURE))
    return reply.status(201).send({ user: userDto(user), trainer: trainerDto(trainer, await trainerExtra(db, trainer.id)) })
  })

  app.post('/auth/login', AUTH_LIMIT, async (request, reply) => {
    const input = parseBody(LoginSchema, request.body)
    const { user, trainer, token } = await login(db, input, { now: now() })
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.COOKIE_SECURE))
    return reply.send({ user: userDto(user), trainer: trainerDto(trainer, await trainerExtra(db, trainer.id)) })
  })

  app.post('/auth/logout', async (request, reply) => {
    await logout(db, request.cookies[SESSION_COOKIE])
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })
}
```

`src/http/routes/trainer.ts` (nesta task só `/me`; a Task 4 acrescenta as demais):
```ts
import type { FastifyPluginAsync } from 'fastify'
import { getMe } from '../../account/me.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import type { RouteDeps } from './auth.js'

export const trainerRoutes: FastifyPluginAsync<RouteDeps> = async (app, { db }) => {
  app.get('/me', { preHandler: requireAuth }, async (request) => getMe(db, authOf(request)))
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- security auth && pnpm --filter @pokeidle/server typecheck`
Se o teste de `set-cookie` falhar só pela ordem dos atributos, ajuste a regex à ordem real do `@fastify/cookie` (os atributos exigidos não mudam: `Max-Age=2592000`, `Path=/`, `HttpOnly`, `SameSite=Lax`, sem `Secure`). Se o `bodyLimit` responder 413 antes do `Origin` (403) ou vice-versa, os testes usam `Origin` válido no caso do 413, então a ordem não importa.

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): app fastify com helmet, origin, rate limit; registro, login, logout e /me"
```

---

### Task 4: Treinador: inicial, time, settings, inventário e Pokédex

**Files:**
- Create: `src/account/starter.ts`, `src/account/team.ts`, `src/account/settings.ts`, `src/account/inventory.ts`, `src/account/pokedex.ts`
- Modify: `src/http/routes/trainer.ts`
- Test: `test/trainer.test.ts`

**Interfaces:**
- Consumes: Task 1 (tabelas), Task 3 (`authOf`, `requireAuth`, `parseBody`, DTOs, `trainerExtra`, helpers de teste). Do `shared`: `loadRegistry()`, `hpAt(base, level)`, `xpForLevel(growthRate, level)`, `Registry`.
- Produces: `STARTERS`, `STARTER_LEVEL = 10`, `StarterSchema`, `chooseStarter(db, registry, trainerId, species, now): Promise<PokemonRow>`; `listTeam(db, trainerId): Promise<{ team: PokemonRow[]; box: PokemonRow[] }>`, `TeamOrderSchema`, `setTeamOrder(db, trainerId, ids): Promise<PokemonRow[]>`; `SettingsPatchSchema`, `updateSettings(db, trainerId, patch): Promise<TrainerRow>`; `listInventory(db, trainerId)`, `listPokedex(db, trainerId)`; `hasActiveHunt(db, trainerId): Promise<boolean>` (em `team.ts`, reutilizado pela Task 6).

- [ ] **Step 1: Teste**

`test/trainer.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokedexEntries, pokemon } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0; ({ cookie, trainerId } = await registerAndLogin(t.app)) })

describe('inicial', () => {
  it('cria o inicial no nível 10 com HP cheio, slot 0 e Pokédex; só uma vez', async () => {
    const r = await api(t.app, cookie).post('/trainer/starter', { species: 'squirtle' })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({ pokemon: { speciesName: 'squirtle', level: 10, hp: 31, hpMax: 31, xp: 560, teamSlot: 0 } }) // hpAt(44,10)=31; medium-slow L10 = 560
    expect((r.json() as { pokemon: { id: string } }).pokemon.id).toMatch(/^st-[0-9a-f-]{36}$/)
    const [dex] = await t.db.select().from(pokedexEntries)
    expect(dex).toMatchObject({ trainerId, speciesName: 'squirtle', seenAt: T0, caughtAt: T0 })
    expect((await api(t.app, cookie).get('/me')).json()).toMatchObject({ trainer: { hasStarter: true } })
    const again = await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ error: { code: 'starter-already-chosen' } })
  })
  it('rejeita espécie fora da lista', async () => {
    expect((await api(t.app, cookie).post('/trainer/starter', { species: 'mewtwo' })).statusCode).toBe(400)
  })
})

describe('time', () => {
  beforeEach(async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.insert(pokemon).values([
      { id: 'x-w1', trainerId, speciesName: 'zubat', level: 4, xp: 100, hp: 10, hpMax: 18, teamSlot: 1 },
      { id: 'x-w2', trainerId, speciesName: 'diglett', level: 6, xp: 200, hp: 0, hpMax: 20, teamSlot: null },
    ])
  })
  it('lista time ordenado e mochila', async () => {
    const r = await api(t.app, cookie).get('/trainer/team')
    expect(r.json()).toMatchObject({ team: [{ speciesName: 'charmander', teamSlot: 0 }, { id: 'x-w1', teamSlot: 1 }], box: [{ id: 'x-w2', teamSlot: null }] })
  })
  it('reordena e manda o resto para a mochila', async () => {
    const r = await api(t.app, cookie).put('/trainer/team', { slots: ['x-w2', 'x-w1'] })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ team: [{ id: 'x-w2', teamSlot: 0 }, { id: 'x-w1', teamSlot: 1 }], box: [{ speciesName: 'charmander', teamSlot: null }] })
  })
  it('valida: vazio, repetido, mais de 6, id alheio, hunt ativa', async () => {
    expect((await api(t.app, cookie).put('/trainer/team', { slots: [] })).statusCode).toBe(400)
    expect((await api(t.app, cookie).put('/trainer/team', { slots: ['x-w1', 'x-w1'] })).statusCode).toBe(400)
    expect((await api(t.app, cookie).put('/trainer/team', { slots: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).statusCode).toBe(400)
    const other = await registerAndLogin(t.app, 2)
    await t.db.insert(pokemon).values({ id: 'y-w1', trainerId: other.trainerId, speciesName: 'zubat', level: 4, xp: 100, hp: 10, hpMax: 18, teamSlot: 0 })
    const alien = await api(t.app, cookie).put('/trainer/team', { slots: ['y-w1'] })
    expect(alien.statusCode).toBe(404)
    await t.db.insert(huntSessions).values({ trainerId, huntId: 'route-1', sessionId: 's', state: {}, seed: 1, rngState: 1, startedAt: T0, lastSimulatedAt: T0 })
    const busy = await api(t.app, cookie).put('/trainer/team', { slots: ['x-w1'] })
    expect(busy.statusCode).toBe(409)
    expect(busy.json()).toMatchObject({ error: { code: 'hunt-active' } })
  })
})

describe('settings, inventário e pokédex', () => {
  it('PATCH settings mescla e valida', async () => {
    const r = await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 50, capture: { ballTier: 'great' } })
    expect(r.json()).toEqual({ settings: { returnHpPercent: 50, capture: { ballTier: 'great', maxWildHpPercent: 30, allowDuplicates: false } } })
    expect((await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 101 })).statusCode).toBe(400)
    expect((await api(t.app, cookie).patch('/trainer/settings', { capture: { ballTier: 'master' } })).statusCode).toBe(400)
    expect((await api(t.app, cookie).patch('/trainer/settings', { xp: 1 })).statusCode).toBe(400)
  })
  it('inventário lista só quantidade > 0', async () => {
    const r = await api(t.app, cookie).get('/trainer/inventory')
    expect(r.json()).toEqual({ items: [{ itemId: 'poke-ball', quantity: 5 }, { itemId: 'potion', quantity: 3 }] })
  })
  it('pokédex lista entradas', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'bulbasaur' })
    const r = await api(t.app, cookie).get('/trainer/pokedex')
    expect(r.json()).toEqual({ entries: [{ speciesName: 'bulbasaur', seenAt: T0.toISOString(), caughtAt: T0.toISOString() }] })
  })
  it('todas exigem login', async () => {
    for (const [m, url] of [['get', '/trainer/team'], ['get', '/trainer/inventory'], ['get', '/trainer/pokedex']] as const) expect((await api(t.app)[m](url)).statusCode).toBe(401)
    expect((await api(t.app).post('/trainer/starter', { species: 'charmander' })).statusCode).toBe(401)
  })
})
```
Números: Squirtle tem base HP 44 e curva `medium-slow`: `hpAt(44, 10) = floor(119·10/100) + 10 + 10 = 31`; `xpForLevel('medium-slow', 10) = 1.2·1000 − 15·100 + 100·10 − 140 = 560`. Se `species.json` divergir, use o valor real de `hpAt`/`xpForLevel` e registre no relatório.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- trainer`

- [ ] **Step 3: Implementar serviços**

`src/account/starter.ts`:
```ts
import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { hpAt, xpForLevel, type Registry } from '@pokeidle/shared'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { pokedexEntries, pokemon, type PokemonRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const STARTERS = ['charmander', 'bulbasaur', 'squirtle'] as const
export const STARTER_LEVEL = 10
export const StarterSchema = z.object({ species: z.enum(STARTERS) }).strict()

export async function chooseStarter(db: Db, registry: Registry, trainerId: string, species: (typeof STARTERS)[number], now: Date): Promise<PokemonRow> {
  const sp = registry.species.get(species)
  if (!sp) throw new AppError('not-found', `espécie ${species} não existe`)
  const hpMax = hpAt(sp.baseStats.hp, STARTER_LEVEL)
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ n: count() }).from(pokemon).where(eq(pokemon.trainerId, trainerId))
    if ((c?.n ?? 0) > 0) throw new AppError('starter-already-chosen', 'o inicial já foi escolhido')
    const [row] = await tx.insert(pokemon).values({
      id: `st-${randomUUID()}`, trainerId, speciesName: species, level: STARTER_LEVEL,
      xp: xpForLevel(sp.growthRate, STARTER_LEVEL), hp: hpMax, hpMax, teamSlot: 0,
    }).returning()
    await tx.insert(pokedexEntries).values({ trainerId, speciesName: species, seenAt: now, caughtAt: now })
      .onConflictDoUpdate({ target: [pokedexEntries.trainerId, pokedexEntries.speciesName], set: { caughtAt: now } })
    return row!
  })
}
```
(Confira o nome real do campo de HP base em `packages/shared/src/schemas/species.ts` — `baseStats.hp` — e do campo de curva — `growthRate` — antes de escrever.)

`src/account/team.ts`:
```ts
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbLike } from '../db/client.js'
import { huntSessions, pokemon, type PokemonRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const TEAM_MAX = 6
export const TeamOrderSchema = z.object({ slots: z.array(z.string().min(1)).min(1).max(TEAM_MAX).refine((ids) => new Set(ids).size === ids.length, 'ids repetidos') }).strict()

export async function hasActiveHunt(db: DbLike, trainerId: string): Promise<boolean> {
  const [row] = await db.select({ id: huntSessions.trainerId }).from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  return row !== undefined
}

export async function listTeam(db: DbLike, trainerId: string): Promise<{ team: PokemonRow[]; box: PokemonRow[] }> {
  const rows = await db.select().from(pokemon).where(eq(pokemon.trainerId, trainerId)).orderBy(asc(pokemon.teamSlot), asc(pokemon.createdAt))
  return { team: rows.filter((p) => p.teamSlot !== null), box: rows.filter((p) => p.teamSlot === null) }
}

export async function setTeamOrder(db: Db, trainerId: string, ids: readonly string[], now: Date): Promise<{ team: PokemonRow[]; box: PokemonRow[] }> {
  if (await hasActiveHunt(db, trainerId)) throw new AppError('hunt-active', 'pare a hunt antes de mexer no time')
  const owned = await db.select({ id: pokemon.id }).from(pokemon).where(and(eq(pokemon.trainerId, trainerId), inArray(pokemon.id, [...ids])))
  if (owned.length !== ids.length) throw new AppError('not-found', 'Pokémon não encontrado')
  await db.transaction(async (tx) => {
    await tx.update(pokemon).set({ teamSlot: null, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot)))
    for (const [slot, id] of ids.entries()) await tx.update(pokemon).set({ teamSlot: slot, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), eq(pokemon.id, id)))
  })
  return listTeam(db, trainerId)
}
```
(`sql` fica importado só se você precisar; remova imports não usados para o typecheck não reclamar em `noUnusedLocals`, que não está ligado, mas o revisor conta.)

`src/account/settings.ts`:
```ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { trainers, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

const percent = z.number().int().min(0).max(100)
export const SettingsPatchSchema = z.object({
  returnHpPercent: percent.optional(),
  capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']).optional(), maxWildHpPercent: percent.optional(), allowDuplicates: z.boolean().optional() }).strict().optional(),
}).strict()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export async function updateSettings(db: Db, trainerId: string, patch: SettingsPatch, now: Date): Promise<TrainerRow> {
  const set = {
    updatedAt: now,
    ...(patch.returnHpPercent !== undefined && { returnHpPercent: patch.returnHpPercent }),
    ...(patch.capture?.ballTier !== undefined && { ballTier: patch.capture.ballTier }),
    ...(patch.capture?.maxWildHpPercent !== undefined && { maxWildHpPercent: patch.capture.maxWildHpPercent }),
    ...(patch.capture?.allowDuplicates !== undefined && { allowDuplicates: patch.capture.allowDuplicates }),
  }
  const [row] = await db.update(trainers).set(set).where(eq(trainers.id, trainerId)).returning()
  if (!row) throw new AppError('not-found', 'treinador não encontrado')
  return row
}
```

`src/account/inventory.ts`:
```ts
import { and, asc, eq, gt } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { inventory } from '../db/schema.js'

export async function listInventory(db: DbLike, trainerId: string): Promise<{ itemId: string; quantity: number }[]> {
  return db.select({ itemId: inventory.itemId, quantity: inventory.quantity }).from(inventory)
    .where(and(eq(inventory.trainerId, trainerId), gt(inventory.quantity, 0))).orderBy(asc(inventory.itemId))
}
```

`src/account/pokedex.ts`:
```ts
import { asc, eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { pokedexEntries } from '../db/schema.js'

export async function listPokedex(db: DbLike, trainerId: string): Promise<{ speciesName: string; seenAt: Date; caughtAt: Date | null }[]> {
  return db.select({ speciesName: pokedexEntries.speciesName, seenAt: pokedexEntries.seenAt, caughtAt: pokedexEntries.caughtAt })
    .from(pokedexEntries).where(eq(pokedexEntries.trainerId, trainerId)).orderBy(asc(pokedexEntries.speciesName))
}
```

- [ ] **Step 4: Rotas**

`src/http/routes/trainer.ts` (versão completa):
```ts
import { loadRegistry } from '@pokeidle/shared'
import type { FastifyPluginAsync } from 'fastify'
import { pokemonDto, settingsDto } from '../../account/dto.js'
import { listInventory } from '../../account/inventory.js'
import { getMe } from '../../account/me.js'
import { listPokedex } from '../../account/pokedex.js'
import { SettingsPatchSchema, updateSettings } from '../../account/settings.js'
import { chooseStarter, StarterSchema } from '../../account/starter.js'
import { listTeam, setTeamOrder, TeamOrderSchema } from '../../account/team.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

const teamDto = (t: { team: import('../../db/schema.js').PokemonRow[]; box: import('../../db/schema.js').PokemonRow[] }) => ({ team: t.team.map(pokemonDto), box: t.box.map(pokemonDto) })

export const trainerRoutes: FastifyPluginAsync<RouteDeps> = async (app, { db, now }) => {
  const registry = loadRegistry()
  const guard = { preHandler: requireAuth }

  app.get('/me', guard, async (request) => getMe(db, authOf(request)))

  app.post('/trainer/starter', guard, async (request, reply) => {
    const { species } = parseBody(StarterSchema, request.body)
    const row = await chooseStarter(db, registry, authOf(request).trainer.id, species, now())
    return reply.status(201).send({ pokemon: pokemonDto(row) })
  })

  app.get('/trainer/team', guard, async (request) => teamDto(await listTeam(db, authOf(request).trainer.id)))

  app.put('/trainer/team', guard, async (request) => {
    const { slots } = parseBody(TeamOrderSchema, request.body)
    return teamDto(await setTeamOrder(db, authOf(request).trainer.id, slots, now()))
  })

  app.patch('/trainer/settings', guard, async (request) => {
    const patch = parseBody(SettingsPatchSchema, request.body)
    return { settings: settingsDto(await updateSettings(db, authOf(request).trainer.id, patch, now())) }
  })

  app.get('/trainer/inventory', guard, async (request) => ({ items: await listInventory(db, authOf(request).trainer.id) }))
  app.get('/trainer/pokedex', guard, async (request) => ({ entries: await listPokedex(db, authOf(request).trainer.id) }))
}
```
Troque o `import(...)` inline por um `import type { PokemonRow }` no topo.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- trainer auth && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): inicial, time, settings, inventário e pokédex do treinador"
```

---

### Task 5: `hunt-store`: rng com estado, `CreateInput.trainer`, mapeadores, snapshot, sync, start/stop

**Files:**
- Modify: `packages/shared/src/rng.ts`, `packages/shared/test/rng.test.ts`, `packages/server/src/engine/create.ts`, `packages/server/test/engine/spawn.test.ts`
- Create: `src/hunt-store/mappers.ts`, `src/hunt-store/state-schema.ts`, `src/hunt-store/start.ts`, `src/hunt-store/snapshot.ts`, `src/hunt-store/sync.ts`, `src/hunt-store/stop.ts`, `src/hunt-store/index.ts`
- Test: `test/hunt-store.test.ts`, `test/state-schema.test.ts`

**Interfaces:**
- Consumes: motor (`createHuntState`, `simulate`, `HuntState`, `PokemonState`, `HuntSettings`, `defaultSettings`), `shared` (`createRng`, `loadRegistry`, `Registry`), Task 1 tabelas, Task 4 `hasActiveHunt`.
- Produces: `createRng(seed, state?)` com `rng.state(): number`; `CreateInput.trainer?: { xp; gold }`; `toPokemonState(row): PokemonState`, `toHuntSettings(trainer, seen): HuntSettings`; `HuntStateSchema` (Zod) e `parseHuntState(json): HuntState`; `startHunt(db, registry, trainerId, huntId, now, ids?): Promise<HuntSessionRow>` com `ids = { sessionId?: string; seed?: number }`; `saveSnapshot(db, trainerId, state, rngState, now)`; `loadActive(db, trainerId): Promise<ActiveHunt | null>` com `ActiveHunt { huntId; sessionId; state: HuntState; seed; rngState; startedAt; lastSimulatedAt }`; `syncToTables(db, trainerId, state, now)`; `stopHunt(db, trainerId, now): Promise<TrainerRow>`.

- [ ] **Step 1: `rng.state()` em `shared` (teste primeiro)**

Acrescente em `packages/shared/test/rng.test.ts`:
```ts
  it('state() permite retomar a sequência', () => {
    const a = createRng(1)
    a.next(); a.next(); a.next()
    const b = createRng(1, a.state())
    expect([b.next(), b.next()]).toEqual([a.next(), a.next()])
    expect(createRng(5).state()).toBe(5)
  })
```
`packages/shared/src/rng.ts`:
```ts
export interface Rng {
  readonly next: () => number
  readonly int: (min: number, max: number) => number
  /** Estado interno (u32) para persistir e retomar com createRng(seed, state). */
  readonly state: () => number
}

export function createRng(seed: number, initialState: number = seed): Rng {
  let state = initialState >>> 0
  const next = (): number => { /* inalterado */ }
  const int = (min: number, max: number): number => { /* inalterado */ }
  return { next, int, state: () => state }
}
```
Run: `pnpm --filter @pokeidle/shared test` → verde. Confira que nenhum outro pacote implementa `Rng` à mão (grep `int:` em `packages/server/test`); se a fixture do motor criar um `Rng` literal, acrescente `state`.

- [ ] **Step 2: `CreateInput.trainer` no motor (teste primeiro)**

Em `packages/server/test/engine/spawn.test.ts`, no `describe` de `createHuntState`, acrescente:
```ts
  it('carrega xp e ouro absolutos do treinador quando informados', () => {
    const deps = miniDeps()
    const s = createHuntState({ hunt: deps.hunt, sessionId: 'mini', team: [charmander5()], inventory: {}, trainer: { xp: 120, gold: 45 } }, deps)
    expect(s.trainer).toEqual({ xp: 120, gold: 45 })
    expect(createHuntState({ hunt: deps.hunt, sessionId: 'mini', team: [charmander5()], inventory: {} }, deps).trainer).toEqual({ xp: 0, gold: 0 })
  })
```
Em `create.ts`: `CreateInput` ganha `readonly trainer?: { readonly xp: number; readonly gold: number }` e `trainer: input.trainer ?? { xp: 0, gold: 0 }`. Run: `pnpm --filter @pokeidle/server test -- spawn`.

- [ ] **Step 3: Testes do `hunt-store`**

`test/state-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings, simulate } from '../src/engine/index.js'
import { parseHuntState } from '../src/hunt-store/state-schema.js'
import { baseState, miniDeps } from './engine/fixtures/mini.js'

describe('HuntStateSchema', () => {
  it('aceita um estado real do motor após ida e volta em JSON, antes e depois de simular', () => {
    const deps = miniDeps()
    const s0 = baseState({}, deps)
    expect(parseHuntState(JSON.parse(JSON.stringify(s0)))).toEqual(s0)
    const s1 = simulate(s0, 300, deps).state
    expect(parseHuntState(JSON.parse(JSON.stringify(s1)))).toEqual(s1)
  })
  it('rejeita lixo e campos desconhecidos', () => {
    expect(() => parseHuntState({})).toThrow()
    const deps = miniDeps()
    const s = createHuntState({ hunt: deps.hunt, sessionId: 'x', team: baseState({}, deps).player.team, inventory: {}, settings: defaultSettings() }, deps)
    expect(() => parseHuntState({ ...s, hack: true })).toThrow()
    expect(() => parseHuntState({ ...s, trainer: { xp: 'muito' } })).toThrow()
  })
})
```

`test/hunt-store.test.ts`:
```ts
import { createRng, loadRegistry } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chooseStarter } from '../src/account/starter.js'
import type { Db } from '../src/db/client.js'
import { huntSessions, inventory, pokedexEntries, pokemon, trainers, users } from '../src/db/schema.js'
import { simulate } from '../src/engine/index.js'
import { loadActive, saveSnapshot, startHunt, stopHunt, syncToTables } from '../src/hunt-store/index.js'
import { openTestDb, truncateAll } from './helpers/db.js'

const registry = loadRegistry()
const T0 = new Date('2026-09-14T12:00:00Z')
let db: Db
let close: () => Promise<void>
let trainerId: string

beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
  const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash', xp: 10, gold: 7 }).returning()
  trainerId = t!.id
  await db.insert(inventory).values([{ trainerId, itemId: 'poke-ball', quantity: 5 }, { trainerId, itemId: 'potion', quantity: 3 }])
  await chooseStarter(db, registry, trainerId, 'charmander', T0)
})

const snapshotRows = async () => ({
  pokemon: (await db.select().from(pokemon).orderBy(pokemon.id)).map(({ updatedAt: _u, ...p }) => p),
  inventory: (await db.select().from(inventory).orderBy(inventory.itemId)).map(({ updatedAt: _u, ...i }) => i),
  trainer: (await db.select({ xp: trainers.xp, gold: trainers.gold }).from(trainers))[0],
  dex: await db.select().from(pokedexEntries).orderBy(pokedexEntries.speciesName),
})

describe('startHunt', () => {
  it('monta o HuntState com time, inventário, settings, seen e trainer absolutos', async () => {
    const row = await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 'sess-1', seed: 42 })
    expect(row).toMatchObject({ trainerId, huntId: 'route-1', sessionId: 'sess-1', seed: 42, startedAt: T0, lastSimulatedAt: T0 })
    expect(row.rngState).not.toBe(42) // o spawn inicial já consumiu o PRNG
    const active = await loadActive(db, trainerId)
    expect(active?.state).toMatchObject({
      huntId: 'route-1', sessionId: 'sess-1', tick: 0, trainer: { xp: 10, gold: 7 }, inventory: { 'poke-ball': 5, potion: 3 },
      settings: { returnHpPercent: 30, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false }, seen: ['charmander'] },
    })
    expect(active?.state.player.team).toEqual([{ id: expect.stringMatching(/^st-/), speciesName: 'charmander', level: 10, xp: expect.any(Number), hp: expect.any(Number), hpMax: expect.any(Number) }])
    expect(active?.state.wilds.length).toBeGreaterThan(0)
  })
  it('erros: hunt inexistente, hunt ativa, sem inicial, time todo desmaiado', async () => {
    await expect(startHunt(db, registry, trainerId, 'nope', T0)).rejects.toMatchObject({ code: 'not-found' })
    await startHunt(db, registry, trainerId, 'route-1', T0)
    await expect(startHunt(db, registry, trainerId, 'route-1', T0)).rejects.toMatchObject({ code: 'hunt-active' })
    await db.delete(huntSessions)
    await db.update(pokemon).set({ hp: 0 })
    await expect(startHunt(db, registry, trainerId, 'route-1', T0)).rejects.toMatchObject({ code: 'validation' })
    await db.delete(pokemon)
    await expect(startHunt(db, registry, trainerId, 'route-1', T0)).rejects.toMatchObject({ code: 'no-starter' })
  })
  it('gera sessionId e seed quando não informados', async () => {
    const row = await startHunt(db, registry, trainerId, 'route-1', T0)
    expect(row.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.seed).toBeGreaterThanOrEqual(0)
  })
})

describe('snapshot e sync', () => {
  it('start → sync sem tick é no-op', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 1 })
    const before = await snapshotRows()
    const active = (await loadActive(db, trainerId))!
    await syncToTables(db, trainerId, active.state, new Date(T0.getTime() + 1000))
    expect(await snapshotRows()).toEqual(before)
  })
  it('após 3000 ticks o banco reflete xp, nível, hp, captura, inventário, ouro e pokédex', async () => {
    const row = await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 42 })
    const active = (await loadActive(db, trainerId))!
    const rng = createRng(row.seed, row.rngState)
    const hunt = registry.hunts.get('route-1')!
    const { state } = simulate(active.state, 3000, { registry, hunt, rng })
    const T1 = new Date(T0.getTime() + 3000 * 200)
    await saveSnapshot(db, trainerId, state, rng.state(), T1)
    const saved = (await loadActive(db, trainerId))!
    expect(saved.state).toEqual(state)
    expect(saved.rngState).toBe(rng.state())
    expect(saved.lastSimulatedAt).toEqual(T1)

    await syncToTables(db, trainerId, state, T1)
    const rows = await snapshotRows()
    expect(rows.trainer).toEqual({ xp: state.trainer.xp, gold: state.trainer.gold })
    expect(state.trainer.xp).toBeGreaterThan(10)
    const team = state.player.team
    expect(team.length).toBeGreaterThan(1) // houve captura
    for (const [slot, p] of team.entries()) {
      const dbRow = rows.pokemon.find((r) => r.id === p.id)
      expect(dbRow).toMatchObject({ speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: slot, trainerId })
    }
    for (const [itemId, quantity] of Object.entries(state.inventory)) {
      const dbRow = rows.inventory.find((r) => r.itemId === itemId)
      if (quantity > 0) expect(dbRow?.quantity).toBe(quantity)
      else expect(dbRow).toBeUndefined()
    }
    const caught = rows.dex.filter((d) => d.caughtAt !== null).map((d) => d.speciesName)
    for (const p of team) expect(caught).toContain(p.speciesName)
    // sync repetido é idempotente
    const again = await snapshotRows()
    await syncToTables(db, trainerId, state, T1)
    expect(await snapshotRows()).toEqual(again)
  })
  it('loadActive rejeita jsonb corrompido', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0)
    await db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))
    await expect(loadActive(db, trainerId)).rejects.toThrow()
  })
})

describe('stopHunt', () => {
  it('sincroniza, apaga a sessão e devolve o treinador; sem hunt → no-hunt', async () => {
    await expect(stopHunt(db, trainerId, T0)).rejects.toMatchObject({ code: 'no-hunt' })
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 9 })
    const active = (await loadActive(db, trainerId))!
    const hunt = registry.hunts.get('route-1')!
    const { state } = simulate(active.state, 1000, { registry, hunt, rng: createRng(9) })
    await saveSnapshot(db, trainerId, state, 1, T0)
    const trainer = await stopHunt(db, trainerId, T0)
    expect(trainer).toMatchObject({ id: trainerId, xp: state.trainer.xp, gold: state.trainer.gold })
    expect(await loadActive(db, trainerId)).toBeNull()
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- state-schema hunt-store`

- [ ] **Step 5: Implementar**

`src/hunt-store/mappers.ts`:
```ts
import type { PokemonRow, TrainerRow } from '../db/schema.js'
import type { HuntSettings, PokemonState } from '../engine/types.js'

export const toPokemonState = (row: PokemonRow): PokemonState => ({ id: row.id, speciesName: row.speciesName, level: row.level, xp: row.xp, hp: row.hp, hpMax: row.hpMax })

export const toHuntSettings = (trainer: TrainerRow, seen: readonly string[]): HuntSettings => ({
  returnHpPercent: trainer.returnHpPercent,
  capture: { ballTier: trainer.ballTier, maxWildHpPercent: trainer.maxWildHpPercent, allowDuplicates: trainer.allowDuplicates },
  seen,
})
```

`src/hunt-store/state-schema.ts` (espelha `engine/types.ts`; `.strict()` em todos os objetos):
```ts
import { z } from 'zod'
import type { HuntState } from '../engine/types.js'

const Point = z.object({ x: z.number().int(), y: z.number().int() }).strict()
const Cooldowns = z.record(z.string(), z.number().int())
const PokemonStateSchema = z.object({ id: z.string(), speciesName: z.string(), level: z.number().int().min(1), xp: z.number().int().min(0), hp: z.number().int().min(0), hpMax: z.number().int().min(1) }).strict()
const WildStateSchema = z.object({ id: z.number().int(), spawnIndex: z.number().int(), speciesName: z.string(), level: z.number().int(), hp: z.number().int(), hpMax: z.number().int(), position: Point, cooldowns: Cooldowns, captureTried: z.boolean() }).strict()
const PlayerStateSchema = z.object({
  team: z.array(PokemonStateSchema).min(1), activeIndex: z.number().int().min(0), position: Point, path: z.array(Point),
  mode: z.enum(['searching', 'walking', 'fighting', 'returning', 'healing', 'stopped']), targetWildId: z.number().int().nullable(),
  healingUntilTick: z.number().int().nullable(), cooldowns: Cooldowns, skippedWildIds: z.array(z.number().int()),
}).strict()
const SettingsSchema = z.object({
  returnHpPercent: z.number(), capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']), maxWildHpPercent: z.number(), allowDuplicates: z.boolean() }).strict(), seen: z.array(z.string()),
}).strict()

export const HuntStateSchema = z.object({
  huntId: z.string(), sessionId: z.string(), tick: z.number().int().min(0), player: PlayerStateSchema,
  wilds: z.array(WildStateSchema), respawns: z.array(z.object({ spawnIndex: z.number().int(), atTick: z.number().int() }).strict()),
  nextWildId: z.number().int(), trainer: z.object({ xp: z.number().int(), gold: z.number().int() }).strict(),
  inventory: z.record(z.string(), z.number().int()), settings: SettingsSchema,
}).strict()

export function parseHuntState(json: unknown): HuntState {
  return HuntStateSchema.parse(json) as HuntState
}
```
Compare campo a campo com `engine/types.ts` antes de fechar; o teste de ida e volta pega qualquer campo que falte.

`src/hunt-store/start.ts`:
```ts
import { randomInt, randomUUID } from 'node:crypto'
import { createRng, type Registry } from '@pokeidle/shared'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { hasActiveHunt } from '../account/team.js'
import type { Db } from '../db/client.js'
import { huntSessions, inventory, pokedexEntries, pokemon, trainers, type HuntSessionRow } from '../db/schema.js'
import { createHuntState } from '../engine/create.js'
import { AppError } from '../http/errors.js'
import { toHuntSettings, toPokemonState } from './mappers.js'

export interface StartIds { readonly sessionId?: string; readonly seed?: number }

export async function startHunt(db: Db, registry: Registry, trainerId: string, huntId: string, now: Date, ids: StartIds = {}): Promise<HuntSessionRow> {
  const hunt = registry.hunts.get(huntId)
  if (!hunt) throw new AppError('not-found', `hunt ${huntId} não existe`)
  if (await hasActiveHunt(db, trainerId)) throw new AppError('hunt-active', 'já existe uma hunt ativa')
  const [trainer] = await db.select().from(trainers).where(eq(trainers.id, trainerId))
  if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
  const teamRows = await db.select().from(pokemon).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot))).orderBy(asc(pokemon.teamSlot))
  if (teamRows.length === 0) throw new AppError('no-starter', 'escolha um Pokémon antes de caçar')
  if (!teamRows.some((p) => p.hp > 0)) throw new AppError('validation', 'todo o time está sem HP')
  const items = await db.select().from(inventory).where(eq(inventory.trainerId, trainerId))
  const dex = await db.select({ species: pokedexEntries.speciesName }).from(pokedexEntries).where(and(eq(pokedexEntries.trainerId, trainerId), isNotNull(pokedexEntries.caughtAt)))
  const sessionId = ids.sessionId ?? randomUUID()
  const seed = ids.seed ?? randomInt(0, 2 ** 31)
  const rng = createRng(seed)
  const state = createHuntState({
    hunt, sessionId, team: teamRows.map(toPokemonState),
    inventory: Object.fromEntries(items.filter((i) => i.quantity > 0).map((i) => [i.itemId, i.quantity])),
    settings: toHuntSettings(trainer, dex.map((d) => d.species)), trainer: { xp: trainer.xp, gold: trainer.gold },
  }, { registry, hunt, rng })
  const [row] = await db.insert(huntSessions).values({ trainerId, huntId, sessionId, state, seed, rngState: rng.state(), startedAt: now, lastSimulatedAt: now }).returning()
  return row!
}
```

`src/hunt-store/snapshot.ts`:
```ts
import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { huntSessions } from '../db/schema.js'
import type { HuntState } from '../engine/types.js'
import { parseHuntState } from './state-schema.js'

export interface ActiveHunt {
  readonly huntId: string; readonly sessionId: string; readonly state: HuntState
  readonly seed: number; readonly rngState: number; readonly startedAt: Date; readonly lastSimulatedAt: Date
}

export async function saveSnapshot(db: DbLike, trainerId: string, state: HuntState, rngState: number, now: Date): Promise<void> {
  await db.update(huntSessions).set({ state, rngState, lastSimulatedAt: now, updatedAt: now }).where(eq(huntSessions.trainerId, trainerId))
}

export async function loadActive(db: DbLike, trainerId: string): Promise<ActiveHunt | null> {
  const [row] = await db.select().from(huntSessions).where(eq(huntSessions.trainerId, trainerId))
  if (!row) return null
  return { huntId: row.huntId, sessionId: row.sessionId, state: parseHuntState(row.state), seed: row.seed, rngState: row.rngState, startedAt: row.startedAt, lastSimulatedAt: row.lastSimulatedAt }
}
```

`src/hunt-store/sync.ts`:
```ts
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db, Tx } from '../db/client.js'
import { inventory, pokedexEntries, pokemon, trainers } from '../db/schema.js'
import type { HuntState } from '../engine/types.js'

async function syncTeam(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  const team = state.player.team
  const existing = new Set((await tx.select({ id: pokemon.id }).from(pokemon).where(and(eq(pokemon.trainerId, trainerId), inArray(pokemon.id, team.map((p) => p.id))))).map((r) => r.id))
  await tx.update(pokemon).set({ teamSlot: null, updatedAt: now }).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot)))
  for (const [slot, p] of team.entries()) {
    const fields = { speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: slot, updatedAt: now }
    if (existing.has(p.id)) await tx.update(pokemon).set(fields).where(eq(pokemon.id, p.id))
    else await tx.insert(pokemon).values({ id: p.id, trainerId, ...fields })
  }
}

async function syncInventory(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  for (const [itemId, quantity] of Object.entries(state.inventory)) {
    await tx.insert(inventory).values({ trainerId, itemId, quantity, updatedAt: now })
      .onConflictDoUpdate({ target: [inventory.trainerId, inventory.itemId], set: { quantity, updatedAt: now } })
  }
  await tx.delete(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.quantity, 0)))
}

async function syncPokedex(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  const species = new Set([...state.player.team.map((p) => p.speciesName), ...state.settings.seen])
  for (const speciesName of species) {
    await tx.insert(pokedexEntries).values({ trainerId, speciesName, seenAt: now, caughtAt: now })
      .onConflictDoUpdate({ target: [pokedexEntries.trainerId, pokedexEntries.speciesName], set: { caughtAt: sql`coalesce(${pokedexEntries.caughtAt}, excluded.caught_at)` } })
  }
}

/** Mesma coisa que syncToTables, mas dentro de uma transação já aberta (usado por stopHunt). */
export async function syncWithin(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  await syncTeam(tx, trainerId, state, now)
  await syncInventory(tx, trainerId, state, now)
  await tx.update(trainers).set({ xp: state.trainer.xp, gold: state.trainer.gold, updatedAt: now }).where(eq(trainers.id, trainerId))
  await syncPokedex(tx, trainerId, state, now)
}

/** Escreve de volta ao banco o que o snapshot diz. Idempotente: rodar duas vezes com o mesmo estado não muda nada. */
export const syncToTables = (db: Db, trainerId: string, state: HuntState, now: Date): Promise<void> =>
  db.transaction((tx) => syncWithin(tx, trainerId, state, now))
```
Sobre o teste "sync sem tick é no-op": ele compara linhas sem `updatedAt`, e o `startHunt` não altera `pokemon`/`inventory`; o sync reescreve os mesmos valores, então as linhas comparadas ficam iguais.

`src/hunt-store/stop.ts`:
```ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { huntSessions, trainers, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'
import { loadActive } from './snapshot.js'
import { syncWithin } from './sync.js'

export async function stopHunt(db: Db, trainerId: string, now: Date): Promise<TrainerRow> {
  return db.transaction(async (tx) => {
    const active = await loadActive(tx, trainerId)
    if (!active) throw new AppError('no-hunt', 'não há hunt ativa')
    await syncWithin(tx, trainerId, active.state, now)
    await tx.delete(huntSessions).where(eq(huntSessions.trainerId, trainerId))
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId))
    return trainer!
  })
}
```

`src/hunt-store/index.ts`: `export * from './mappers.js'; export * from './state-schema.js'; export * from './start.js'; export * from './snapshot.js'; export * from './sync.js'; export * from './stop.js'`.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck && pnpm --filter @pokeidle/shared test`
Se o teste de 3000 ticks não capturar nada com a seed 42 (o motor da 2a com Charmander 12 capturou 5 na Rota 1; aqui o inicial é nível 10), troque a seed por uma que capture e registre no relatório; não afrouxe as asserções.

- [ ] **Step 7: Commit**

```bash
git add packages/shared packages/server
git commit -m "feat(server): hunt-store com snapshot jsonb, sync para as tabelas, start/stop; rng com estado"
```

---

### Task 6: Rotas de hunt, `main.ts`, testes de segurança entre contas, README e cobertura

**Files:**
- Create: `src/http/routes/hunts.ts`, `src/main.ts`
- Modify: `src/http/app.ts` (registrar `huntRoutes`), `packages/server/README.md` (seção "Servidor HTTP"), `package.json` raiz (scripts `server:dev`, `db:up`)
- Test: `test/hunts.test.ts`

**Interfaces:**
- Consumes: Task 3 (`buildApp`, `authOf`, `requireAuth`, helpers), Task 4 (`hasActiveHunt`), Task 5 (`startHunt`, `stopHunt`, `loadActive`), `shared` (`loadRegistry`).
- Produces: `GET /hunts`, `POST /hunts/:id/start`, `POST /hunts/stop`, `GET /hunts/active`; `huntSummary(hunt): { id, name, width, height, minLevel, maxLevel }`; processo `pnpm --filter @pokeidle/server dev`.

- [ ] **Step 1: Teste**

`test/hunts.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0; ({ cookie, trainerId } = await registerAndLogin(t.app)) })

describe('GET /hunts', () => {
  it('lista hunts do registro com faixa de nível', async () => {
    const r = await api(t.app, cookie).get('/hunts')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ hunts: [{ id: 'route-1', name: expect.any(String), width: 40, height: 30, minLevel: 2, maxLevel: 12 }] })
  })
})

describe('start / active / stop', () => {
  it('sem inicial → no-starter; hunt inexistente → 404', async () => {
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).json()).toMatchObject({ error: { code: 'no-starter' } })
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).post('/hunts/nope/start')).statusCode).toBe(404)
  })
  it('start cria a sessão; active devolve o snapshot sem seed/rng_state; start duplicado → hunt-active; stop sincroniza', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).get('/hunts/active')).json()).toEqual({ session: null })
    const start = await api(t.app, cookie).post('/hunts/route-1/start')
    expect(start.statusCode).toBe(201)
    expect(start.json()).toMatchObject({ session: { huntId: 'route-1', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), startedAt: T0.toISOString() } })
    expect(JSON.stringify(start.json())).not.toMatch(/seed|rngState|rng_state/)
    const active = await api(t.app, cookie).get('/hunts/active')
    expect(active.json()).toMatchObject({ session: { huntId: 'route-1', state: { tick: 0, huntId: 'route-1', player: { mode: 'searching' } } } })
    expect(JSON.stringify(active.json())).not.toMatch(/seed|rngState|rng_state/)
    expect((await api(t.app, cookie).get('/me')).json()).toMatchObject({ trainer: { activeHuntId: 'route-1' } })
    const dup = await api(t.app, cookie).post('/hunts/route-1/start')
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ error: { code: 'hunt-active' } })
    const stop = await api(t.app, cookie).post('/hunts/stop')
    expect(stop.statusCode).toBe(200)
    expect(stop.json()).toMatchObject({ trainer: { id: trainerId, activeHuntId: null } })
    expect(await t.db.select().from(huntSessions)).toEqual([])
    expect((await api(t.app, cookie).post('/hunts/stop')).json()).toMatchObject({ error: { code: 'no-hunt' } })
  })
  it('time todo sem HP → validation', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.update(pokemon).set({ hp: 0 })
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).statusCode).toBe(400)
  })
})

describe('S2: isolamento entre contas', () => {
  it('conta B não vê nem para a hunt de A; B não reordena o time de A', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await api(t.app, cookie).post('/hunts/route-1/start')
    const b = await registerAndLogin(t.app, 2)
    expect((await api(t.app, b.cookie).get('/hunts/active')).json()).toEqual({ session: null })
    expect((await api(t.app, b.cookie).post('/hunts/stop')).json()).toMatchObject({ error: { code: 'no-hunt' } })
    const [aPokemon] = await t.db.select().from(pokemon)
    expect((await api(t.app, b.cookie).put('/trainer/team', { slots: [aPokemon!.id] })).statusCode).toBe(404)
    expect((await api(t.app, b.cookie).get('/trainer/team')).json()).toEqual({ team: [], box: [] })
    expect(await t.db.select().from(huntSessions)).toHaveLength(1)
  })
  it('todas as rotas de hunt exigem login', async () => {
    expect((await api(t.app).get('/hunts')).statusCode).toBe(401)
    expect((await api(t.app).get('/hunts/active')).statusCode).toBe(401)
    expect((await api(t.app).post('/hunts/route-1/start')).statusCode).toBe(401)
    expect((await api(t.app).post('/hunts/stop')).statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- hunts`

- [ ] **Step 3: Implementar rotas e `main.ts`**

`src/http/routes/hunts.ts`:
```ts
import { loadRegistry, type HuntMap } from '@pokeidle/shared'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { trainerDto } from '../../account/dto.js'
import { trainerExtra } from '../../account/me.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import { loadActive, startHunt, stopHunt, type ActiveHunt } from '../../hunt-store/index.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

export const huntSummary = (hunt: HuntMap) => ({
  id: hunt.id, name: hunt.name, width: hunt.width, height: hunt.height,
  minLevel: Math.min(...hunt.spawns.map((s) => s.minLevel)), maxLevel: Math.max(...hunt.spawns.map((s) => s.maxLevel)),
})

/** S3: o cliente nunca vê seed nem estado do PRNG. */
const sessionDto = (a: ActiveHunt) => ({ huntId: a.huntId, sessionId: a.sessionId, startedAt: a.startedAt, state: a.state })

const HuntParams = z.object({ id: z.string().min(1).max(64) }).strict()

export const huntRoutes: FastifyPluginAsync<RouteDeps> = async (app, { db, now }) => {
  const registry = loadRegistry()
  const guard = { preHandler: requireAuth }

  app.get('/hunts', guard, async () => ({ hunts: [...registry.hunts.values()].map(huntSummary) }))

  app.post('/hunts/:id/start', guard, async (request, reply) => {
    const { id } = parseBody(HuntParams, request.params)
    const row = await startHunt(db, registry, authOf(request).trainer.id, id, now())
    return reply.status(201).send({ session: { huntId: row.huntId, sessionId: row.sessionId, startedAt: row.startedAt } })
  })

  app.post('/hunts/stop', guard, async (request) => {
    const trainer = await stopHunt(db, authOf(request).trainer.id, now())
    return { trainer: trainerDto(trainer, await trainerExtra(db, trainer.id)) }
  })

  app.get('/hunts/active', guard, async (request) => {
    const active = await loadActive(db, authOf(request).trainer.id)
    return { session: active ? sessionDto(active) : null }
  })
}
```
Confira o campo de nome em `HuntMapSchema` (`name`); se a Rota 1 não tiver `name`, use `hunt.id` como fallback e diga no relatório. Em `app.ts`, registre `huntRoutes` logo após `trainerRoutes`.

`src/main.ts`:
```ts
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
```

`package.json` raiz, scripts: `"server:dev": "pnpm --filter @pokeidle/server dev"`, `"db:up": "docker compose up -d"`.

- [ ] **Step 4: README**

Acrescente a `packages/server/README.md` uma seção "Servidor HTTP (fase 2b)" (~40 linhas): como subir (`pnpm db:up`, `.env` a partir de `.env.example`, `pnpm server:dev`), tabela de rotas com códigos de erro, o cookie `sid`, o que `hunt-store` faz e o contrato para a 2c (`saveSnapshot` a cada 10 s, `syncToTables` a cada 60 s e no stop, `hunt_log` por eventos), como rodar os testes (`docker compose up -d` obrigatório; `DATABASE_URL_TEST`), e os critérios de segurança S1–S20 com um ponteiro para a spec.

- [ ] **Step 5: Rodar tudo e cobertura**

Run: `pnpm test && pnpm --filter @pokeidle/server test -- --coverage && pnpm --filter @pokeidle/server typecheck`
Expected: todos os pacotes verdes; cobertura de linhas de `packages/server/src` ≥ 80 % (anotar o número); `pnpm --filter @pokeidle/server start` sobe e responde `GET /me` com 401 (teste manual com `curl -i http://localhost:3000/me`, encerrar com Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add packages/server package.json
git commit -m "feat(server): rotas de hunt, main.ts, isolamento entre contas e README"
```

---

## Autorrevisão do plano

**Cobertura da spec:** §2 módulos (T1 config/db, T2 auth+errors, T3 http/app/security/validate/plugin/account, T4 account restante, T5 hunt-store, T6 rotas de hunt + main); §3 banco (T1 schema/migrations/compose, T5 rng.state e CreateInput.trainer); §4 auth (T3: registro, login com DUMMY_HASH, logout, cookie, expiração, touch, rate limit); §5 treinador (T4); §6 hunts e hunt-store (T5, T6); §7 erros (T2 tabela, T3 handler); §8 testes (unitários T1/T2/T3/T5, integração T1–T6, segurança S2/S3 em T6, S5/S7/S9/S10/S11/S12/S13 em T3, S14 unitário em T3, cobertura em T6); §9 segurança: S1 (motor; nenhuma rota aceita números), S4 (`now` injetado), S6 (T2/T3), S8 (decisão documentada), S15 (T1 constraints, transações em T3/T4/T5), S16/S18/S19/S20 (config, compose, `.env.example`, script `check` em T1).

**Placeholders:** nenhum "TBD/TODO"; onde um número depende dos dados (`hpAt`, `xpForLevel`, seed de captura) o plano dá o valor calculado e manda registrar divergência, não afrouxar.

**Consistência de tipos:** `RouteDeps { db, config, now }` (T3) usado em T4/T6; `hasActiveHunt` definido em T4 `team.ts` e consumido em T5 `start.ts`; `loadActive` devolve `ActiveHunt` (T5) e T6 monta `sessionDto` sem `seed`/`rngState`; `syncWithin(tx, …)` (T5) usado por `stopHunt`; `trainerExtra` (T3 `me.ts`) usado em T3 rotas de auth e T6 stop; `parseBody` aceita `request.params` além de `body` (T6); `createRng(seed, state)` (T5 shared) usado em T5 testes; `CreateInput.trainer` (T5 motor) usado em `startHunt`.

**Decisões registradas:** limite diário de registro adiado junto com captcha; porta 5433 no host; `rngState` gravado após `createHuntState` consumir o PRNG; `Origin` ausente em POST é 403 (clientes sem navegador precisam enviar o cabeçalho); 415 de content-type vira `validation` 400; capturas com `toBox` não entram no sync (sem estado no motor).
