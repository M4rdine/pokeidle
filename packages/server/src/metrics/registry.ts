/**
 * O registro de métricas do servidor, no formato que o Prometheus raspa.
 *
 * Nada aqui sabe de jogo: o módulo expõe ganchos que o scheduler, o registro de sockets e o
 * plugin HTTP chamam com números já calculados. O motor continua testável sem métrica nenhuma, e
 * a métrica continua testável sem servidor.
 *
 * `createMetrics()` devolve um registro novo a cada chamada, nunca o global do `prom-client`:
 * um registro compartilhado faria um teste contaminar o outro, e em produção existe um só.
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client'
import type { StopReason } from '../realtime/runner.js'

export type PersistKind = 'save' | 'sync' | 'finish'
/** Onde o erro tratado aconteceu. Poucos valores, fixos: rótulo de cardinalidade baixa. */
export type ErrorScope = 'tick' | 'persist' | 'ws' | 'http'

/**
 * Os ganchos que o scheduler chama. Todos síncronos e baratos: rodam dentro do laço de 200 ms.
 */
export interface MetricsHooks {
  onTick(durationMs: number, lagMs: number, runners: number): void
  onPersistStart(kind: PersistKind, trainerId: string): void
  onPersistEnd(kind: PersistKind, trainerId: string, ms: number, ok: boolean): void
  onHuntStarted(): void
  onHuntFinished(reason: StopReason): void
  onError(scope: ErrorScope | string): void
}

export interface Metrics {
  readonly hooks: MetricsHooks
  /** Quantas caçadas estão recuperando tempo perdido agora. */
  setCatchingUp(n: number): void
  /** Quantos sockets estão abertos agora. */
  setConnections(n: number): void
  observeHttp(method: string, route: string, status: number, ms: number): void
  countWsMessage(direction: 'in' | 'out'): void
  render(): Promise<string>
  readonly contentType: string
}

/** Milissegundos são a unidade do código; segundos são a do Prometheus. */
const emSegundos = (ms: number): number => ms / 1000

/** Faixas escolhidas em volta do tick de 200 ms: abaixo dele é saudável, acima é o problema. */
const BUCKETS_TICK = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1]
/** Persistência e HTTP falam com o banco; a régua é mais larga. */
const BUCKETS_IO = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]

export function createMetrics(): Metrics {
  const registry = new Registry()
  collectDefaultMetrics({ register: registry })

  const tickDuration = new Histogram({
    name: 'pokeidle_tick_duration_seconds',
    help: 'Tempo gasto em cada tick do agendador.',
    buckets: BUCKETS_TICK,
    registers: [registry],
  })
  const tickLag = new Histogram({
    name: 'pokeidle_tick_lag_seconds',
    help: 'Atraso do tick em relação ao intervalo nominal de 200 ms.',
    buckets: BUCKETS_TICK,
    registers: [registry],
  })
  const ticks = new Counter({
    name: 'pokeidle_ticks_total',
    help: 'Ticks executados desde o boot.',
    registers: [registry],
  })
  const huntsActive = new Gauge({
    name: 'pokeidle_hunts_active',
    help: 'Caçadas simuladas no tick mais recente.',
    registers: [registry],
  })
  const huntsCatchingUp = new Gauge({
    name: 'pokeidle_hunts_catching_up',
    help: 'Caçadas recuperando tempo perdido agora.',
    registers: [registry],
  })
  const huntsStarted = new Counter({
    name: 'pokeidle_hunts_started_total',
    help: 'Caçadas iniciadas desde o boot.',
    registers: [registry],
  })
  const huntsFinished = new Counter({
    name: 'pokeidle_hunts_finished_total',
    help: 'Caçadas terminadas desde o boot, por motivo.',
    labelNames: ['reason'] as const,
    registers: [registry],
  })
  const persistDuration = new Histogram({
    name: 'pokeidle_persist_duration_seconds',
    help: 'Tempo de cada gravação no banco, por tipo.',
    labelNames: ['kind'] as const,
    buckets: BUCKETS_IO,
    registers: [registry],
  })
  const persistFailures = new Counter({
    name: 'pokeidle_persist_failures_total',
    help: 'Gravações que falharam, por tipo.',
    labelNames: ['kind'] as const,
    registers: [registry],
  })
  const httpRequests = new Counter({
    name: 'pokeidle_http_requests_total',
    help: 'Requisições HTTP atendidas, por método, rota e status.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  })
  const httpDuration = new Histogram({
    name: 'pokeidle_http_duration_seconds',
    help: 'Tempo de resposta HTTP, por método e rota.',
    labelNames: ['method', 'route'] as const,
    buckets: BUCKETS_IO,
    registers: [registry],
  })
  const wsConnections = new Gauge({
    name: 'pokeidle_ws_connections',
    help: 'Sockets de jogo abertos agora.',
    registers: [registry],
  })
  const wsMessages = new Counter({
    name: 'pokeidle_ws_messages_total',
    help: 'Mensagens de WebSocket, por direção.',
    labelNames: ['direction'] as const,
    registers: [registry],
  })
  const errors = new Counter({
    name: 'pokeidle_errors_total',
    help: 'Erros tratados, por escopo.',
    labelNames: ['scope'] as const,
    registers: [registry],
  })

  const hooks: MetricsHooks = {
    onTick(durationMs, lagMs, runners) {
      ticks.inc()
      tickDuration.observe(emSegundos(durationMs))
      tickLag.observe(emSegundos(lagMs))
      huntsActive.set(runners)
    },
    // O início não tem métrica própria: o que interessa é a duração, e ela vem no fim.
    onPersistStart() {},
    onPersistEnd(kind, _trainerId, ms, ok) {
      persistDuration.labels(kind).observe(emSegundos(ms))
      if (!ok) persistFailures.labels(kind).inc()
    },
    onHuntStarted() { huntsStarted.inc() },
    onHuntFinished(reason) { huntsFinished.labels(reason).inc() },
    onError(scope) { errors.labels(scope).inc() },
  }

  return {
    hooks,
    setCatchingUp: (n) => huntsCatchingUp.set(n),
    setConnections: (n) => wsConnections.set(n),
    observeHttp(method, route, status, ms) {
      httpRequests.labels(method, route, String(status)).inc()
      httpDuration.labels(method, route).observe(emSegundos(ms))
    },
    countWsMessage: (direction) => { wsMessages.labels(direction).inc() },
    render: () => registry.metrics(),
    contentType: registry.contentType,
  }
}
