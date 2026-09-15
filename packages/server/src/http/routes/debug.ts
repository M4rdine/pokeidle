import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { ATLAS_FILES } from '../atlas-files.js'
import { errorBody } from '../errors.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/debug')
const PAGE_FILES: Readonly<Record<string, string>> = { 'index.html': 'text/html; charset=utf-8', 'viewer.js': 'application/javascript; charset=utf-8', 'viewer.css': 'text/css; charset=utf-8' }
const MapParams = z.object({ id: z.string().min(1).max(64) }).strict()
const AtlasParams = z.object({ file: z.string().min(1).max(64) }).strict()

async function fileOr404(filePath: string): Promise<Buffer | null> {
  try { return await readFile(filePath) } catch { return null }
}

/** Ferramenta de depuração (DEBUG_VIEWER=true): página estática + dados públicos do jogo. Nunca expõe estado de jogador. */
export const debugRoutes: FastifyPluginAsync<RouteDeps> = async (app, { registry, config }) => {
  const servePage = (name: string) => async (_request: unknown, reply: FastifyReply) => {
    const body = await fileOr404(path.join(PUBLIC_DIR, name))
    if (!body) return reply.status(404).send(errorBody('not-found', 'arquivo não encontrado'))
    return reply.type(PAGE_FILES[name]!).send(body)
  }
  app.get('/debug', async (_request, reply) => reply.redirect('/debug/', 302))
  app.get('/debug/', servePage('index.html'))
  app.get('/debug/viewer.js', servePage('viewer.js'))
  app.get('/debug/viewer.css', servePage('viewer.css'))

  app.get('/debug/map/:id', async (request, reply) => {
    const { id } = parseBody(MapParams, request.params)
    const hunt = registry.hunts.get(id)
    if (!hunt) return reply.status(404).send(errorBody('not-found', `hunt ${id} não existe`))
    return hunt
  })

  app.get('/debug/atlas/:file', async (request, reply) => {
    const { file } = parseBody(AtlasParams, request.params)
    const type = ATLAS_FILES[file]
    if (!type) return reply.status(404).send(errorBody('not-found', 'arquivo não permitido'))
    const body = await fileOr404(path.join(config.ASSETS_DIR, file))
    if (!body) return reply.status(404).send(errorBody('not-found', 'atlas não encontrado; gere com pnpm assets build'))
    return reply.type(type).send(body)
  })
}
