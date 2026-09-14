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
