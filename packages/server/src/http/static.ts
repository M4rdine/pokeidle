import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Config } from '../config.js'
import { ATLAS_FILES } from './atlas-files.js'
import { errorBody } from './errors.js'
import { parseBody } from './validate.js'

const AtlasParams = z.object({ file: z.string().min(1).max(64) }).strict()
const IMMUTABLE = 'public, max-age=31536000, immutable'

async function fileOr404(filePath: string): Promise<Buffer | null> {
  try { return await readFile(filePath) } catch { return null }
}

/** Atlas público (sempre) e o build do cliente (só se `CLIENT_DIST` existir: sem build, `/` continua 404). */
export async function registerStatic(app: FastifyInstance, config: Config): Promise<void> {
  app.get('/assets/atlas/:file', async (request, reply) => {
    const { file } = parseBody(AtlasParams, request.params)
    const type = ATLAS_FILES[file]
    if (!type) return reply.status(404).send(errorBody('not-found', 'arquivo não permitido'))
    const body = await fileOr404(path.join(config.ASSETS_DIR, file))
    if (!body) return reply.status(404).send(errorBody('not-found', 'atlas não encontrado; gere com pnpm assets build'))
    return reply.header('cache-control', 'public, max-age=3600').type(type).send(body)
  })
  if (!existsSync(config.CLIENT_DIST)) return
  await app.register(fastifyStatic, {
    root: config.CLIENT_DIST,
    prefix: '/',
    index: ['index.html'],
    wildcard: false,
    serveDotFiles: false,
    cacheControl: false,
    // O tipo do plugin (`@fastify/static` 10) passa a `FastifyReply`, não o `http.ServerResponse`
    // cru — por isso `.header()`, não `res.setHeader()`.
    setHeaders: (reply, filePath) => {
      reply.header('cache-control', filePath.includes(`${path.sep}app${path.sep}`) ? IMMUTABLE : 'no-cache')
    },
  })
}
