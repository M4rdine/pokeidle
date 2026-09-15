import { describe, expect, it, vi } from 'vitest'
import { createHuntSocket, type WebSocketLike } from '../../src/api/ws.js'
import { BACKOFF_MIN_MS, INTENT_MIN_INTERVAL_MS } from '../../src/config.js'

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = []
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: ((ev?: { code?: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) { FakeSocket.all.push(this) }
  send(data: string): void { this.sent.push(data) }
  close(): void { this.onclose?.() }
  open(): void { this.onopen?.() }
  receive(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

function harness() {
  FakeSocket.all = []
  let now = 0
  const timers: { at: number; fn: () => void; id: number }[] = []
  let nextId = 1
  const onMessage = vi.fn(); const onStatus = vi.fn(); const onInvalid = vi.fn()
  const ws = createHuntSocket({
    url: '/ws', makeSocket: (url) => new FakeSocket(url), now: () => now, random: () => 0.5,
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1) },
    onMessage, onStatus, onInvalid,
  })
  const advance = (ms: number) => { now += ms; for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn() } }
  return { ws, advance, onMessage, onStatus, onInvalid, sockets: FakeSocket.all }
}

describe('createHuntSocket', () => {
  it('conecta, valida mensagens com o schema e ignora as inválidas com aviso', () => {
    const h = harness()
    h.ws.connect()
    const s = h.sockets[0]!
    expect(h.onStatus).toHaveBeenLastCalledWith('connecting')
    s.open()
    expect(h.onStatus).toHaveBeenLastCalledWith('open')
    s.receive({ t: 'hunt.idle' })
    expect(h.onMessage).toHaveBeenCalledWith({ t: 'hunt.idle' })
    s.receive({ t: 'nope' })
    s.onmessage?.({ data: '{not json' })
    expect(h.onInvalid).toHaveBeenCalledTimes(2)
    expect(h.onMessage).toHaveBeenCalledTimes(1)
  })
  it('fila: no máximo uma intenção a cada 200 ms; ping passa direto; nada é enviado antes de abrir', () => {
    const h = harness()
    h.ws.connect()
    h.ws.send({ t: 'item.use', itemId: 'potion' })
    const s = h.sockets[0]!
    expect(s.sent).toEqual([])
    s.open()
    expect(s.sent).toEqual([JSON.stringify({ t: 'item.use', itemId: 'potion' })])
    h.ws.send({ t: 'hunt.stop' })
    h.ws.send({ t: 'ping' })
    expect(s.sent).toHaveLength(2) // o ping saiu; hunt.stop espera
    expect(JSON.parse(s.sent[1]!)).toEqual({ t: 'ping' })
    h.advance(INTENT_MIN_INTERVAL_MS)
    expect(JSON.parse(s.sent[2]!)).toEqual({ t: 'hunt.stop' })
  })
  it('reconecta com backoff exponencial 1 s → 30 s com jitter e reseta ao abrir; close() não reconecta', () => {
    const h = harness()
    h.ws.connect()
    h.sockets[0]!.open()
    h.sockets[0]!.close()
    expect(h.onStatus).toHaveBeenLastCalledWith('reconnecting')
    h.advance(BACKOFF_MIN_MS - 1)
    expect(h.sockets).toHaveLength(1)
    h.advance(1)
    expect(h.sockets).toHaveLength(2)
    h.sockets[1]!.close()
    h.advance(2 * BACKOFF_MIN_MS)
    expect(h.sockets).toHaveLength(3)
    for (let i = 3; i < 10; i++) { h.sockets[i - 1]!.close(); h.advance(30_000) }
    expect(h.sockets).toHaveLength(10) // teto de 30 s: cada avanço de 30 s reconecta exatamente uma vez
    h.sockets[9]!.open()
    h.sockets[9]!.close()
    h.advance(BACKOFF_MIN_MS)
    expect(h.sockets).toHaveLength(11) // reset após abrir
    h.ws.close()
    h.sockets[10]!.close()
    h.advance(60_000)
    expect(h.sockets).toHaveLength(11)
    expect(h.onStatus).toHaveBeenLastCalledWith('closed')
  })
})

describe('sessão perdida', () => {
  it('fechamento 1008 não reconecta, vira closed e avisa quem chamou', () => {
    FakeSocket.all = []
    const onAuthLost = vi.fn()
    const onStatus = vi.fn()
    const timers: { at: number; fn: () => void; id: number }[] = []
    let now = 0
    let nextId = 1
    const ws = createHuntSocket({
      url: '/ws', makeSocket: (url) => new FakeSocket(url), now: () => now, random: () => 0.5,
      setTimeout: (fn, ms) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id },
      clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1) },
      onMessage: () => {}, onStatus, onInvalid: () => {}, onAuthLost,
    })
    ws.connect()
    const socket = FakeSocket.all[0]!
    socket.open()
    socket.onclose?.({ code: 1008 })
    expect(onAuthLost).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenLastCalledWith('closed')
    now += 60_000
    for (const timer of [...timers]) timer.fn()
    expect(FakeSocket.all).toHaveLength(1) // nenhuma reconexão
  })
})
