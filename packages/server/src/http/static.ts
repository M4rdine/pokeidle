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

/** Tipos que o build do cliente emite dentro de `/app`. O que não estiver aqui não é servido. */
const TIPOS_DE_APP: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

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
  /**
   * Mapa-múndi de cada região. Só PNG e só desta pasta: o nome vem da URL, e resolver antes de
   * ler é o que impede um `..` de virar leitura de qualquer arquivo do servidor.
   */
  app.get<{ Params: { file: string } }>('/assets/maps/:file', async (request, reply) => {
    const { file } = parseBody(AtlasParams, request.params)
    if (!file.endsWith('.png')) return reply.status(404).send(errorBody('not-found', 'só PNG é servido aqui'))
    const pedido = path.resolve(config.MAPS_DIR, file)
    const relativo = path.relative(config.MAPS_DIR, pedido)
    if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
      return reply.status(404).send(errorBody('not-found', 'mapa não encontrado'))
    }
    const body = await fileOr404(pedido)
    if (!body) {
      return reply.status(404).send(errorBody('not-found', 'mapa da região não gerado; rode pnpm assets region-preview'))
    }
    return reply.header('cache-control', 'public, max-age=3600').type('image/png').send(body)
  })

  if (!existsSync(config.CLIENT_DIST)) return
  const pastaApp = path.join(config.CLIENT_DIST, 'app')
  /**
   * Reserva para os arquivos com hash. `wildcard: false` faz o `@fastify/static` varrer a pasta
   * no registro e criar uma rota por arquivo: um build feito com o servidor no ar gera nomes que
   * não existiam naquela varredura, e a página abre em branco porque o CSS volta 404 em JSON.
   *
   * O alcance é só `/app`, onde moram os arquivos com hash — nenhuma rota de API muda de
   * comportamento, e o 404 de rota desconhecida continua sendo JSON.
   */
  app.get<{ Params: { '*': string } }>('/app/*', async (request, reply) => {
    const pedido = path.resolve(pastaApp, request.params['*'])
    const relativo = path.relative(pastaApp, pedido)
    // Fora de `/app` não se serve nada, por mais que o caminho se contorça para chegar lá.
    if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
      return reply.status(404).send(errorBody('not-found', 'arquivo não encontrado'))
    }
    const tipo = TIPOS_DE_APP[path.extname(pedido).toLowerCase()]
    if (tipo === undefined) return reply.status(404).send(errorBody('not-found', 'arquivo não encontrado'))
    const corpo = await fileOr404(pedido)
    if (!corpo) return reply.status(404).send(errorBody('not-found', 'arquivo não encontrado'))
    return reply.header('cache-control', IMMUTABLE).type(tipo).send(corpo)
  })

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
