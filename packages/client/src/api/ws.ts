import { ServerMessageSchema, type ClientMessage, type ServerMessage } from '@pokeidle/shared/protocol'
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, INTENT_MIN_INTERVAL_MS } from '../config.js'

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface WebSocketLike {
  send(data: string): void; close(): void
  onopen: (() => void) | null; onmessage: ((ev: { data: string }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null
}
export interface HuntSocketDeps {
  readonly url: string; readonly makeSocket: (url: string) => WebSocketLike; readonly now: () => number; readonly random: () => number
  readonly setTimeout: (fn: () => void, ms: number) => unknown; readonly clearTimeout: (handle: unknown) => void
  readonly onMessage: (m: ServerMessage) => void; readonly onStatus: (s: SocketStatus) => void; readonly onInvalid: (reason: string) => void
}
export interface HuntSocket { connect(): void; send(m: ClientMessage): void; close(): void }

/** Uma conexão por aba: fila de intenções (1 a cada 200 ms, ping fora da fila), backoff 1 s → 30 s com jitter ±20 %. */
export function createHuntSocket(d: HuntSocketDeps): HuntSocket {
  let socket: WebSocketLike | null = null
  let open = false
  let closedByUs = false
  let attempts = 0
  let lastSentAt = -Infinity
  let queue: ClientMessage[] = []
  let flushTimer: unknown = null
  let reconnectTimer: unknown = null

  const flush = (): void => {
    flushTimer = null
    if (!open || !socket) return
    const next = queue[0]
    if (!next) return
    const wait = lastSentAt + INTENT_MIN_INTERVAL_MS - d.now()
    if (wait > 0) { flushTimer = d.setTimeout(flush, wait); return }
    queue = queue.slice(1)
    lastSentAt = d.now()
    socket.send(JSON.stringify(next))
    if (queue.length > 0) flushTimer = d.setTimeout(flush, INTENT_MIN_INTERVAL_MS)
  }
  const scheduleReconnect = (): void => {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempts)
    attempts++
    const delay = Math.round(base * (0.8 + 0.4 * d.random()))
    d.onStatus('reconnecting')
    reconnectTimer = d.setTimeout(connect, delay)
  }
  const handleMessage = (raw: unknown): void => {
    let json: unknown
    try { json = JSON.parse(String(raw)) } catch { d.onInvalid('mensagem não é JSON'); return }
    const parsed = ServerMessageSchema.safeParse(json)
    if (!parsed.success) { d.onInvalid(`mensagem fora do protocolo: ${parsed.error.issues[0]?.message ?? '?'}`); return }
    d.onMessage(parsed.data as ServerMessage) // o schema aplica os defaults do HuntState; a forma é a de ServerMessage
  }
  function connect(): void {
    reconnectTimer = null
    closedByUs = false
    d.onStatus('connecting')
    const s = d.makeSocket(d.url)
    socket = s
    s.onopen = () => { open = true; attempts = 0; d.onStatus('open'); flush() }
    s.onmessage = (ev) => handleMessage(ev.data)
    s.onerror = () => {}
    s.onclose = () => {
      open = false
      if (socket !== s) return
      socket = null
      if (closedByUs) { d.onStatus('closed'); return }
      scheduleReconnect()
    }
  }
  return {
    connect,
    send: (m) => {
      if (m.t === 'ping') { if (open && socket) socket.send(JSON.stringify(m)); return }
      queue = [...queue, m]
      if (flushTimer === null) flush()
    },
    close: () => {
      closedByUs = true
      if (reconnectTimer !== null) { d.clearTimeout(reconnectTimer); reconnectTimer = null }
      if (flushTimer !== null) { d.clearTimeout(flushTimer); flushTimer = null }
      socket?.close()
    },
  }
}
