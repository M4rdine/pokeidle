/**
 * Instrumentação da borda HTTP e a guarda de acesso do `/metrics`.
 *
 * O rótulo de rota é sempre o padrão registrado no Fastify (`/hunts/:id/start`), nunca a URL
 * concreta: com a URL, cada id de área viraria uma série nova e o processo acumularia memória
 * até cair. É o modo clássico de falha de instrumentação, e o que o teste de cardinalidade cobre.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Metrics } from './registry.js'

/** Requisição sem rota casada (404) entra numa série só, em vez de uma por caminho inventado. */
const ROTA_DESCONHECIDA = '<desconhecida>'

const rotaDe = (request: FastifyRequest): string => request.routeOptions.url ?? ROTA_DESCONHECIDA

/** Registra cada resposta. O Fastify já mede o tempo em `reply.elapsedTime`. */
export function instrumentHttp(app: FastifyInstance, metrics: Metrics): void {
  app.addHook('onResponse', async (request, reply) => {
    metrics.observeHttp(request.method, rotaDe(request), reply.statusCode, reply.elapsedTime)
  })
}

/**
 * Quem pode ler as métricas.
 *
 * Com `METRICS_TOKEN` configurado, exige `Authorization: Bearer <token>` de qualquer origem,
 * inclusive local — uma exceção para o loopback seria uma porta destrancada num contêiner.
 * Sem token, só responde ao loopback, que é o caso do desenvolvimento.
 *
 * Nunca existe configuração em que o endpoint fique aberto por esquecimento.
 */
export type MetricsAccess = 'ok' | 'unauthorized' | 'hidden'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function checkMetricsAccess(request: FastifyRequest, token: string | undefined): MetricsAccess {
  if (token === undefined) {
    return LOOPBACK.has(request.ip) ? 'ok' : 'hidden'
  }
  const header = request.headers.authorization
  return header === `Bearer ${token}` ? 'ok' : 'unauthorized'
}
