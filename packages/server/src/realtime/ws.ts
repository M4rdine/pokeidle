import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { SESSION_COOKIE } from '../auth/cookie.js'
import { authOf, requireAuth } from '../auth/plugin.js'
import { hashToken, resolveSession } from '../auth/session.js'
import { AppError, errorBody } from '../http/errors.js'
import type { RouteDeps } from '../http/routes/auth.js'
import { sameOrigin } from '../http/security.js'
import { applySettings, setActive, stopViaScheduler, useItem, type RealtimeDeps } from './actions.js'
import {
  INTENT_MIN_INTERVAL_MS,
  WS_MAX_INVALID_IN_A_ROW,
  WS_MAX_SOCKETS_PER_TRAINER,
  WS_PING_MS,
  WS_PONG_TIMEOUT_MS,
  WS_SESSION_RECHECK_MS,
} from './constants.js'
import { parseClientMessage, type ClientMessage, type ServerMessage } from './protocol.js'
import { snapshotMessage } from './scheduler.js'

export interface WsOptions {
  readonly pingMs: number
  readonly pongTimeoutMs: number
  readonly sessionRecheckMs: number
  readonly maxInvalidInARow: number
  readonly intentMinIntervalMs: number
  readonly maxSocketsPerTrainer: number
  /** @internal seam de teste: substitui `resolveSession` pra simular falhas transitórias do banco na revalidação periódica. */
  readonly resolveSession?: typeof resolveSession
}

const DEFAULT_WS: WsOptions = {
  pingMs: WS_PING_MS,
  pongTimeoutMs: WS_PONG_TIMEOUT_MS,
  sessionRecheckMs: WS_SESSION_RECHECK_MS,
  maxInvalidInARow: WS_MAX_INVALID_IN_A_ROW,
  intentMinIntervalMs: INTENT_MIN_INTERVAL_MS,
  maxSocketsPerTrainer: WS_MAX_SOCKETS_PER_TRAINER,
}

const errorMessage = (code: string, message: string): ServerMessage => ({ t: 'error', code, message })
const errorOf = (error: unknown): ServerMessage =>
  error instanceof AppError ? errorMessage(error.code, error.message) : errorMessage('internal', 'erro interno')

interface ConnLogger { error(obj: object, msg?: string): void }
interface Conn {
  readonly socket: WebSocket
  readonly trainerId: string
  readonly token: string
  readonly rt: RealtimeDeps
  readonly opts: WsOptions
  readonly log: ConnLogger
}

/** Estado mutável compartilhado entre os handlers de uma conexão; só o necessário pra evitar processar mensagem após um close 1008 já disparado. */
interface ConnState { closing: boolean }

async function dispatch(conn: Conn, msg: ClientMessage): Promise<void> {
  const { rt, trainerId, socket } = conn
  const send = (m: ServerMessage): void => rt.sockets.send(socket, m)
  try {
    switch (msg.t) {
      case 'ping':
        send({ t: 'pong' })
        return
      case 'hunt.stop':
        await stopViaScheduler(rt, trainerId)
        return
      case 'item.use': {
        const r = useItem(rt, trainerId, msg.itemId)
        if ('error' in r) send(errorMessage(r.error.code, r.error.message))
        return
      }
      case 'team.setActive': {
        const r = setActive(rt, trainerId, msg.pokemonId)
        if ('error' in r) send(errorMessage(r.error.code, r.error.message))
        return
      }
      case 'settings.update':
        await applySettings(rt, trainerId, msg.patch)
        return
    }
  } catch (error) {
    // AppError já é um erro de negócio esperado (ex.: no-hunt); qualquer outra coisa é inesperada e vai pro log.
    if (!(error instanceof AppError)) conn.log.error({ err: error, trainerId }, 'erro ao tratar mensagem do socket')
    send(errorOf(error))
  }
}

/**
 * Ping periódico com verificação de pong: o ping é reenviado a cada `pingMs`, respondido ou
 * não. O prazo (`pongTimeoutMs`) é que não é renovado a cada envio — é medido a partir do
 * primeiro ping sem resposta, não da cadência do ping em si; só reseta quando o pong daquele
 * ping chega.
 */
function attachHeartbeat(conn: Conn): () => void {
  const { socket, opts } = conn
  let pongPending = false
  let pongDeadline = 0
  socket.on('pong', () => { pongPending = false })
  const pingTimer = setInterval(() => {
    if (pongPending && Date.now() > pongDeadline) { socket.close(1001, 'sem pong'); return }
    if (!pongPending) { pongPending = true; pongDeadline = Date.now() + opts.pongTimeoutMs }
    socket.ping()
  }, opts.pingMs)
  return () => clearInterval(pingTimer)
}

/** Revalida a sessão periodicamente; fecha com 1008 se ela sumiu (logout tratado à parte via closeForToken). Uma falha transitória do banco não fecha o socket — só loga. */
function attachSessionRecheck(conn: Conn, state: ConnState): () => void {
  const { socket, rt, opts, token, log, trainerId } = conn
  const resolve = opts.resolveSession ?? resolveSession
  const timer = setInterval(() => {
    void resolve(rt.db, token, rt.now())
      .then((session) => {
        if (!session) { state.closing = true; socket.close(1008, 'sessão encerrada') }
      })
      .catch((err: unknown) => log.error({ err, trainerId }, 'falha ao revalidar a sessão'))
  }, opts.sessionRecheckMs)
  return () => clearInterval(timer)
}

const toBuffer = (data: Buffer | ArrayBuffer | Buffer[]): Buffer =>
  Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)

/** Trata mensagens do cliente: valida, aplica rate limit (exceto `ping`) e despacha. */
function attachMessageHandler(conn: Conn, state: ConnState): void {
  const { socket, rt, opts } = conn
  let lastIntentAt = Number.NEGATIVE_INFINITY
  let invalidInARow = 0
  socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (state.closing) return
    const parsed = parseClientMessage(toBuffer(data))
    if (!parsed.ok) {
      invalidInARow++
      rt.sockets.send(socket, errorMessage('validation', parsed.reason))
      if (invalidInARow >= opts.maxInvalidInARow) { state.closing = true; socket.close(1008, 'mensagens inválidas') }
      return
    }
    invalidInARow = 0
    if (parsed.message.t !== 'ping') {
      const now = rt.now().getTime()
      if (now - lastIntentAt < opts.intentMinIntervalMs) {
        rt.sockets.send(socket, errorMessage('rate-limited', 'uma intenção a cada 200 ms'))
        return
      }
      lastIntentAt = now
    }
    void dispatch(conn, parsed.message)
  })
}

function handleConnection(conn: Conn): void {
  const { socket, rt, opts, trainerId } = conn
  if (rt.sockets.countFor(trainerId) >= opts.maxSocketsPerTrainer) {
    socket.close(1013, 'muitas conexões')
    return
  }

  const state: ConnState = { closing: false }
  // Registrados antes de `sockets.add`/do envio inicial: a limpeza no `close` é incondicional,
  // independente de qualquer coisa que aconteça depois (S: minor 6 da revisão).
  let stopHeartbeat = (): void => {}
  let stopRecheck = (): void => {}
  socket.on('close', () => { stopHeartbeat(); stopRecheck(); rt.sockets.remove(socket) })
  socket.on('error', (err) => { conn.log.error({ err, trainerId }, 'erro no socket'); state.closing = true; socket.close() })

  rt.sockets.add({ socket, trainerId, tokenHash: hashToken(conn.token) })
  const runner = rt.scheduler.get(trainerId)
  const initial: ServerMessage = runner
    ? runner.catchingUp
      ? { t: 'hunt.catchup', ticksRemaining: runner.catchupRemaining ?? 0 }
      : snapshotMessage(runner, rt.now())
    : { t: 'hunt.idle' }
  rt.sockets.send(socket, initial)

  stopHeartbeat = attachHeartbeat(conn)
  stopRecheck = attachSessionRecheck(conn, state)
  attachMessageHandler(conn, state)
}

export const wsRoutes: FastifyPluginAsync<RouteDeps & { readonly ws?: Partial<WsOptions> }> = async (app, deps) => {
  const opts: WsOptions = { ...DEFAULT_WS, ...deps.ws }
  const rt: RealtimeDeps = { db: deps.db, registry: deps.registry, now: deps.now, scheduler: deps.realtime.scheduler, sockets: deps.realtime.sockets }

  // `@fastify/websocket` é registrado uma única vez na raiz (`http/app.ts`); aqui só a rota.
  const originGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!sameOrigin(request, deps.config.APP_ORIGIN)) await reply.status(403).send(errorBody('forbidden', 'origem não permitida'))
  }

  app.get('/ws', { websocket: true, onRequest: originGuard, preHandler: requireAuth }, (socket, request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) { socket.close(1008, 'sem sessão'); return }
    handleConnection({ socket, trainerId: authOf(request).trainer.id, token, rt, opts, log: request.log })
  })
}
