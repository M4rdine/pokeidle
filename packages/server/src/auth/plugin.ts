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
    if (!session) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      return
    }
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
