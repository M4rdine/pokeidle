import type { HuntMap } from '@pokeidle/shared'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { trainerDto } from '../../account/dto.js'
import { trainerExtra } from '../../account/me.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import { activeView, startAndAttach, stopViaScheduler, toRealtimeDeps, type SessionView } from '../../realtime/actions.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

export const huntSummary = (hunt: HuntMap) => ({
  id: hunt.id, name: hunt.name, width: hunt.width, height: hunt.height,
  minLevel: Math.min(...hunt.spawns.map((s) => s.minLevel)), maxLevel: Math.max(...hunt.spawns.map((s) => s.maxLevel)),
})

/** S3: o cliente nunca vê seed nem estado do PRNG. */
const sessionDto = (a: SessionView) => ({ huntId: a.huntId, sessionId: a.sessionId, startedAt: a.startedAt, state: a.state })

const HuntParams = z.object({ id: z.string().min(1).max(64) }).strict()

export const huntRoutes: FastifyPluginAsync<RouteDeps> = async (app, deps) => {
  const { db, registry } = deps
  const guard = { preHandler: requireAuth }

  app.get('/hunts', guard, async () => ({ hunts: [...registry.hunts.values()].map(huntSummary) }))

  app.post('/hunts/:id/start', guard, async (request, reply) => {
    const { id } = parseBody(HuntParams, request.params)
    const session = await startAndAttach(toRealtimeDeps(deps), authOf(request).trainer.id, id)
    return reply.status(201).send({ session })
  })

  app.post('/hunts/stop', guard, async (request) => {
    const trainer = await stopViaScheduler(toRealtimeDeps(deps), authOf(request).trainer.id)
    return { trainer: trainerDto(trainer, await trainerExtra(db, trainer.id)) }
  })

  app.get('/hunts/active', guard, async (request) => {
    const view = await activeView(toRealtimeDeps(deps), authOf(request).trainer.id)
    return { session: view ? sessionDto(view) : null }
  })
}
