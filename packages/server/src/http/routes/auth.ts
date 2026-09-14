import type { FastifyPluginAsync } from 'fastify'
import { trainerDto, userDto } from '../../account/dto.js'
import { login, LoginSchema } from '../../account/login.js'
import { logout } from '../../account/logout.js'
import { trainerExtra } from '../../account/me.js'
import { register, RegisterSchema } from '../../account/register.js'
import { SESSION_COOKIE, sessionCookieOptions } from '../../auth/cookie.js'
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
    const { user, trainer, token } = await login(db, input, { now: now(), hash })
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.COOKIE_SECURE))
    return reply.send({ user: userDto(user), trainer: trainerDto(trainer, await trainerExtra(db, trainer.id)) })
  })

  app.post('/auth/logout', async (request, reply) => {
    await logout(db, request.cookies[SESSION_COOKIE])
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })
}
