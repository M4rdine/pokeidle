import { areaUnlockLevel, trainerLevel, type HuntMap, type Registry } from '@pokeidle/shared'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { trainerView } from '../../account/me.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import { activeView, startAndAttach, stopViaScheduler, toRealtimeDeps, type SessionView } from '../../realtime/actions.js'
import { errorBody } from '../errors.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

/**
 * Resumo de uma área para a lista. `locked` é derivado do nível do treinador que pediu: a lista
 * mostra a área bloqueada em vez de escondê-la, porque saber o que vem depois é parte do jogo.
 */
export const huntSummary = (registry: Registry, hunt: HuntMap, level: number) => {
  const minTrainerLevel = areaUnlockLevel(registry, hunt.id)
  return {
    id: hunt.id, name: hunt.name, width: hunt.width, height: hunt.height,
    minLevel: Math.min(...hunt.spawns.map((s) => s.minLevel)), maxLevel: Math.max(...hunt.spawns.map((s) => s.maxLevel)),
    minTrainerLevel, locked: level < minTrainerLevel,
  }
}

/** S3: o cliente nunca vê seed nem estado do PRNG. */
const sessionDto = (a: SessionView) => ({ huntId: a.huntId, sessionId: a.sessionId, startedAt: a.startedAt, state: a.state })

const HuntParams = z.object({ id: z.string().min(1).max(64) }).strict()

export const huntRoutes: FastifyPluginAsync<RouteDeps> = async (app, deps) => {
  const { db, registry } = deps
  const guard = { preHandler: requireAuth }

  app.get('/hunts', guard, async (request) => {
    const level = trainerLevel(registry.unlocks, authOf(request).trainer.xp)
    return { hunts: [...registry.hunts.values()].map((hunt) => huntSummary(registry, hunt, level)) }
  })

  app.get('/hunts/:id/map', guard, async (request, reply) => {
    const { id } = parseBody(HuntParams, request.params)
    const hunt = registry.hunts.get(id)
    if (!hunt) return reply.status(404).send(errorBody('not-found', `hunt ${id} não existe`))
    return hunt
  })

  app.post('/hunts/:id/start', guard, async (request, reply) => {
    const { id } = parseBody(HuntParams, request.params)
    const { trainer } = authOf(request)
    // O portão é checado aqui, antes de qualquer escrita: recusar depois de criar a sessão
    // deixaria lixo no banco e o treinador preso numa caçada que ele não podia começar.
    const exigido = areaUnlockLevel(registry, id)
    if (registry.hunts.has(id) && trainerLevel(registry.unlocks, trainer.xp) < exigido) {
      return reply.status(403).send(errorBody('area-locked', `${id} abre no nível ${exigido}`))
    }
    const session = await startAndAttach(toRealtimeDeps(deps), trainer.id, id)
    return reply.status(201).send({ session })
  })

  app.post('/hunts/stop', guard, async (request) => {
    const trainer = await stopViaScheduler(toRealtimeDeps(deps), authOf(request).trainer.id)
    return { trainer: await trainerView(db, registry, trainer) }
  })

  app.get('/hunts/active', guard, async (request) => {
    const view = await activeView(toRealtimeDeps(deps), authOf(request).trainer.id)
    return { session: view ? sessionDto(view) : null }
  })
}
