import { loadRegistry } from '@pokeidle/shared'
import type { FastifyPluginAsync } from 'fastify'
import { pokemonDto, settingsDto } from '../../account/dto.js'
import { listInventory } from '../../account/inventory.js'
import { getMe } from '../../account/me.js'
import { listPokedex } from '../../account/pokedex.js'
import { SettingsPatchSchema, updateSettings } from '../../account/settings.js'
import { chooseStarter, StarterSchema } from '../../account/starter.js'
import { listTeam, setTeamOrder, TeamOrderSchema } from '../../account/team.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import type { PokemonRow } from '../../db/schema.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

const teamDto = (t: { team: PokemonRow[]; box: PokemonRow[] }) => ({ team: t.team.map(pokemonDto), box: t.box.map(pokemonDto) })

export const trainerRoutes: FastifyPluginAsync<RouteDeps> = async (app, { db, now }) => {
  const registry = loadRegistry()
  const guard = { preHandler: requireAuth }

  app.get('/me', guard, async (request) => getMe(db, authOf(request)))

  app.post('/trainer/starter', guard, async (request, reply) => {
    const { species } = parseBody(StarterSchema, request.body)
    const row = await chooseStarter(db, registry, authOf(request).trainer.id, species, now())
    return reply.status(201).send({ pokemon: pokemonDto(row) })
  })

  app.get('/trainer/team', guard, async (request) => teamDto(await listTeam(db, authOf(request).trainer.id)))

  app.put('/trainer/team', guard, async (request) => {
    const { slots } = parseBody(TeamOrderSchema, request.body)
    return teamDto(await setTeamOrder(db, authOf(request).trainer.id, slots, now()))
  })

  app.patch('/trainer/settings', guard, async (request) => {
    const patch = parseBody(SettingsPatchSchema, request.body)
    return { settings: settingsDto(await updateSettings(db, authOf(request).trainer.id, patch, now())) }
  })

  app.get('/trainer/inventory', guard, async (request) => ({ items: await listInventory(db, authOf(request).trainer.id) }))
  app.get('/trainer/pokedex', guard, async (request) => ({ entries: await listPokedex(db, authOf(request).trainer.id) }))
}
