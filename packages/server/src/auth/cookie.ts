import type { CookieSerializeOptions } from '@fastify/cookie'
import { SESSION_TTL_MS } from './session.js'

export const SESSION_COOKIE = 'sid'

export const sessionCookieOptions = (secure: boolean): CookieSerializeOptions => ({
  httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS / 1000,
})
