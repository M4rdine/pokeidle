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
  returnHpPercent: integer('return_hp_percent').notNull().default(50),
  potionHpPercent: integer('potion_hp_percent').notNull().default(50),
  ballTier: text('ball_tier', { enum: ['poke', 'great', 'ultra', 'best'] }).notNull().default('best'),
  maxWildHpPercent: integer('max_wild_hp_percent').notNull().default(30),
  allowDuplicates: boolean('allow_duplicates').notNull().default(false),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [check('trainers_gold_check', sql`${t.gold} >= 0`)])

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
