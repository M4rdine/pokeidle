import { asc } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { huntSessions } from '../db/schema.js'
import type { Scheduler, SchedulerLogger } from './scheduler.js'
import type { SocketRegistry } from './sockets.js'

/**
 * Reconecta todas as sessões de hunt ativas ao scheduler no boot, das mais antigas
 * (`lastSimulatedAt`) para as mais recentes, em série — `attach` já faz o catch-up
 * necessário por sessão. Uma sessão com snapshot corrompido não lança: `attach` a
 * finaliza sem sync e não deixa runner, então ela conta como `failed` aqui; qualquer
 * outro erro no `attach` é logado e também conta como `failed`, sem interromper o laço.
 */
export async function recoverSessions(scheduler: Scheduler, db: Db, now: () => Date, logger: SchedulerLogger): Promise<{ recovered: number; failed: number }> {
  const rows = await db.select({ trainerId: huntSessions.trainerId }).from(huntSessions).orderBy(asc(huntSessions.lastSimulatedAt))
  let recovered = 0
  let failed = 0
  for (const { trainerId } of rows) {
    try {
      await scheduler.attach(trainerId)
      if (scheduler.get(trainerId)) recovered++
      else failed++
    } catch (error) {
      failed++
      logger.error({ err: error, trainerId }, 'falha ao recuperar a sessão no boot')
    }
  }
  logger.info({ recovered, failed, at: now().toISOString() }, 'sessões recuperadas')
  return { recovered, failed }
}

export interface ShutdownDeps {
  readonly app: { close(): Promise<void> }
  readonly scheduler: Scheduler
  readonly sockets: SocketRegistry
  readonly close: () => Promise<void>
  readonly logger: SchedulerLogger
}

/**
 * Encerramento gracioso: para o timer de tick, faz flush com sync de tudo em memória,
 * fecha os sockets abertos, fecha o Fastify e por fim o pool do banco. Idempotente: uma
 * segunda chamada devolve a mesma promessa em vez de repetir o trabalho.
 */
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let running: Promise<void> | null = null
  return () => {
    if (running) return running
    running = (async () => {
      deps.scheduler.stop()
      await deps.scheduler.flushAll()
      deps.sockets.closeAll(1001, 'servidor encerrando')
      await deps.app.close()
      await deps.close()
      deps.logger.info({}, 'servidor encerrado')
    })()
    return running
  }
}
