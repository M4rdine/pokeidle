/**
 * `/metrics` no formato que o Prometheus raspa, e `/metrics/ui`, a página que lê esse mesmo
 * endpoint. As duas passam pela mesma guarda: nunca existe configuração em que fiquem abertas.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { checkMetricsAccess } from '../../metrics/http.js'
import type { Metrics } from '../../metrics/registry.js'
import { errorBody } from '../errors.js'
import type { RouteDeps } from './auth.js'

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/metrics')
const PAGE_FILES: Readonly<Record<string, string>> = {
  'index.html': 'text/html; charset=utf-8',
  'painel.js': 'application/javascript; charset=utf-8',
  'painel.css': 'text/css; charset=utf-8',
}

export interface MetricsRouteDeps extends RouteDeps {
  readonly metrics: Metrics
}

async function fileOr404(filePath: string): Promise<Buffer | null> {
  try { return await readFile(filePath) } catch { return null }
}

export const metricsRoutes: FastifyPluginAsync<MetricsRouteDeps> = async (app, { config, metrics }) => {
  const token = config.METRICS_TOKEN

  /** Devolve `null` quando pode seguir; caso contrário, a resposta que o cliente recebe. */
  const guarda = (request: FastifyRequest, reply: FastifyReply): FastifyReply | null => {
    const acesso = checkMetricsAccess(request, token)
    if (acesso === 'ok') return null
    // 'hidden' responde como rota inexistente: um 401 confirmaria que o endpoint está aqui.
    if (acesso === 'hidden') return reply.status(404).send(errorBody('not-found', 'rota não encontrada'))
    return reply.status(401).send(errorBody('unauthorized', 'credencial de métrica inválida'))
  }

  app.get('/metrics', async (request, reply) => {
    const barrado = guarda(request, reply)
    if (barrado) return barrado
    return reply.type(metrics.contentType).send(await metrics.render())
  })

  const servePage = (name: string) => async (request: FastifyRequest, reply: FastifyReply) => {
    const barrado = guarda(request, reply)
    if (barrado) return barrado
    const body = await fileOr404(path.join(PUBLIC_DIR, name))
    if (!body) return reply.status(404).send(errorBody('not-found', 'arquivo não encontrado'))
    return reply.type(PAGE_FILES[name]!).send(body)
  }

  app.get('/metrics/ui', async (_request, reply) => reply.redirect('/metrics/ui/', 302))
  app.get('/metrics/ui/', servePage('index.html'))
  app.get('/metrics/ui/painel.js', servePage('painel.js'))
  app.get('/metrics/ui/painel.css', servePage('painel.css'))
}
