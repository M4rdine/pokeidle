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
