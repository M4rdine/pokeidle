import type { FastifyPluginAsync } from 'fastify'
import { buy, catalog, sell, ShopTradeSchema } from '../../account/shop.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

export const shopRoutes: FastifyPluginAsync<RouteDeps> = async (app, deps) => {
  const { db, now, registry } = deps
  const guard = { preHandler: requireAuth }
  app.get('/shop', guard, async (request) => catalog(db, registry, authOf(request).trainer))
  app.post('/shop/buy', guard, async (request) => {
    const { itemId, quantity } = parseBody(ShopTradeSchema, request.body)
    return buy(db, registry, authOf(request).trainer.id, itemId, quantity, now())
  })
  app.post('/shop/sell', guard, async (request) => {
    const { itemId, quantity } = parseBody(ShopTradeSchema, request.body)
    return sell(db, registry, authOf(request).trainer.id, itemId, quantity, now())
  })
}
