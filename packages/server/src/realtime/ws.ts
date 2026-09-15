import websocket from '@fastify/websocket'
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
}

const DEFAULT_WS: WsOptions = {
  pingMs: WS_PING_MS,
  pongTimeoutMs: WS_PONG_TIMEOUT_MS,
  sessionRecheckMs: WS_SESSION_RECHECK_MS,
  maxInvalidInARow: WS_MAX_INVALID_IN_A_ROW,
  intentMinIntervalMs: INTENT_MIN_INTERVAL_MS,
}

// O `ws` fecha a conexão com 1009 acima disto; o limite de verdade (4 KB, `error validation`
// sem fechar a conexão) é aplicado dentro de `parseClientMessage`. Este é só uma rede de segurança.
const HARD_MAX_PAYLOAD = 64 * 1024

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

/** Ping periódico com verificação de pong; devolve a função que limpa os timers. */
function attachHeartbeat(conn: Conn): () => void {
  const { socket, opts } = conn
  let awaitingPong = false
  let deadline: ReturnType<typeof setTimeout> | null = null
  const clearDeadline = (): void => { if (deadline) { clearTimeout(deadline); deadline = null } }
  socket.on('pong', () => { awaitingPong = false; clearDeadline() })
  const pingTimer = setInterval(() => {
    if (awaitingPong) { socket.close(1001, 'sem pong'); return }
    awaitingPong = true
    socket.ping()
    deadline = setTimeout(() => { if (awaitingPong) socket.close(1001, 'sem pong') }, opts.pongTimeoutMs)
  }, opts.pingMs)
  return () => { clearInterval(pingTimer); clearDeadline() }
}

/** Revalida a sessão periodicamente; fecha com 1008 se ela sumiu (logout tratado à parte via closeForToken). */
function attachSessionRecheck(conn: Conn): () => void {
  const { socket, rt, opts, token } = conn
  const timer = setInterval(() => {
    void resolveSession(rt.db, token, rt.now()).then((session) => {
      if (!session) socket.close(1008, 'sessão encerrada')
    })
  }, opts.sessionRecheckMs)
  return () => clearInterval(timer)
}

const toBuffer = (data: Buffer | ArrayBuffer | Buffer[]): Buffer =>
  Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)

/** Trata mensagens do cliente: valida, aplica rate limit (exceto `ping`) e despacha. */
function attachMessageHandler(conn: Conn): void {
  const { socket, rt, opts } = conn
  let lastIntentAt = Number.NEGATIVE_INFINITY
  let invalidInARow = 0
  socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    const parsed = parseClientMessage(toBuffer(data))
    if (!parsed.ok) {
      invalidInARow++
      rt.sockets.send(socket, errorMessage('validation', parsed.reason))
      if (invalidInARow >= opts.maxInvalidInARow) socket.close(1008, 'mensagens inválidas')
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
  const { socket, rt, trainerId } = conn
  rt.sockets.add({ socket, trainerId, tokenHash: hashToken(conn.token) })
  const runner = rt.scheduler.get(trainerId)
  const initial: ServerMessage = runner
    ? runner.catchingUp
      ? { t: 'hunt.catchup', ticksRemaining: -1 }
      : snapshotMessage(runner)
    : { t: 'hunt.idle' }
  rt.sockets.send(socket, initial)

  const stopHeartbeat = attachHeartbeat(conn)
  const stopRecheck = attachSessionRecheck(conn)
  attachMessageHandler(conn)

  socket.on('close', () => { stopHeartbeat(); stopRecheck(); rt.sockets.remove(socket) })
  socket.on('error', () => socket.close())
}

export const wsRoutes: FastifyPluginAsync<RouteDeps & { readonly ws?: Partial<WsOptions> }> = async (app, deps) => {
  const opts: WsOptions = { ...DEFAULT_WS, ...deps.ws }
  const rt: RealtimeDeps = { db: deps.db, registry: deps.registry, now: deps.now, scheduler: deps.realtime.scheduler, sockets: deps.realtime.sockets }
  await app.register(websocket, { options: { maxPayload: HARD_MAX_PAYLOAD } })

  const originGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!sameOrigin(request, deps.config.APP_ORIGIN)) await reply.status(403).send(errorBody('forbidden', 'origem não permitida'))
  }

  app.get('/ws', { websocket: true, onRequest: originGuard, preHandler: requireAuth }, (socket, request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) { socket.close(1008, 'sem sessão'); return }
    handleConnection({ socket, trainerId: authOf(request).trainer.id, token, rt, opts, log: request.log })
  })
}
