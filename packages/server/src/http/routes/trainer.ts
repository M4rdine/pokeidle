import type { FastifyPluginAsync } from 'fastify'
import { getMe } from '../../account/me.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import type { RouteDeps } from './auth.js'

export const trainerRoutes: FastifyPluginAsync<RouteDeps> = async (app, { db }) => {
  app.get('/me', { preHandler: requireAuth }, async (request) => getMe(db, authOf(request)))
}
