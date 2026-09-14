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
