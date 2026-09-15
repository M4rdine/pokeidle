import type { ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it, vi } from 'vitest'
import type { WebSocketLike } from '../src/api/ws.js'
import { createContext } from '../src/app-context.js'
import { createGameLoop } from '../src/game-loop.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const rec = fixture as unknown as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }>; ticks: Extract<ServerMessage, { t: 'hunt.tick' }>[] }

class FakeSocket implements WebSocketLike {
  static last: FakeSocket
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { FakeSocket.last = this }
  send(data: string): void { this.sent.push(data) }
  close(): void { this.onclose?.() }
  push(message: unknown): void { this.onmessage?.({ data: JSON.stringify(message) }) }
}

function harness() {
  const show = vi.fn()
  const go = vi.fn(async () => {})
  const ctx = createContext({ toasts: { show }, go })
  const loop = createGameLoop(ctx, {
    makeSocket: () => new FakeSocket(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: () => 0.5,
  })
  loop.start()
  FakeSocket.last.onopen?.()
  return { ctx, loop, show, go, socket: FakeSocket.last }
}

describe('game loop', () => {
  it('snapshot e ticks alimentam hunt e log; cada evento chega aos listeners', () => {
    const h = harness()
    const seen = vi.fn()
    h.loop.onEvent(seen)
    h.socket.push(rec.snapshot)
    expect(h.ctx.hunt.get().phase).toBe('active')
    expect(h.ctx.session.get().socket).toBe('open')
    const withAttack = rec.ticks.find((t) => t.events.some((e) => e.type === 'attack'))!
    h.socket.push(withAttack)
    expect(h.ctx.hunt.get().tick).toBe(withAttack.tick)
    expect(h.ctx.log.get().some((l) => l.kind === 'combat')).toBe(true)
    expect(seen).toHaveBeenCalledTimes(withAttack.events.length)
  })
  it('mensagem inválida vira alerta no log; error do servidor vira toast; stopped e idle chamam go()', () => {
    const h = harness()
    h.socket.onmessage?.({ data: 'nada' })
    expect(h.ctx.log.get().at(-1)?.kind).toBe('alert')
    h.socket.push({ t: 'error', code: 'no-hunt', message: 'não há hunt ativa' })
    expect(h.show).toHaveBeenCalledWith('não há hunt ativa', 'error')
    h.socket.push({ t: 'hunt.stopped', reason: 'intent', healed: false })
    h.socket.push({ t: 'hunt.idle' })
    expect(h.go).toHaveBeenCalledTimes(2)
  })
  it('subir de nível do treinador mostra o destrave', () => {
    const h = harness()
    const wildId = rec.snapshot.state.wilds[0]!.id
    h.socket.push({ ...rec.snapshot, state: { ...rec.snapshot.state, trainer: { xp: 990, gold: 0 } } })
    h.socket.push({ t: 'hunt.tick', tick: 1, serverTime: 0, events: [{ type: 'wildDefeated', tick: 0, wildId, speciesName: 'zubat', level: 3, xpTrainer: 20, xpPokemon: 20, gold: 1, drops: [] }] })
    expect(h.show).toHaveBeenCalledWith('Destravou: 4 vagas no time', 'big')
  })
  it('o listener vê o estado ANTERIOR ao evento no log e o posterior no view', () => {
    const h = harness()
    h.socket.push(rec.snapshot)
    const views: number[] = []
    h.loop.onEvent((_e, view) => views.push(view.state!.trainer.gold))
    const wildId = rec.snapshot.state.wilds[0]!.id
    h.socket.push({ t: 'hunt.tick', tick: 2, serverTime: 0, events: [{ type: 'wildDefeated', tick: 1, wildId, speciesName: 'zubat', level: 3, xpTrainer: 1, xpPokemon: 1, gold: 7, drops: [] }] })
    expect(views).toEqual([7])
    expect(h.ctx.hunt.get().state!.trainer.gold).toBe(7)
  })
  it('send enfileira no socket e stop fecha', () => {
    const h = harness()
    h.loop.send({ t: 'hunt.stop' })
    expect(h.socket.sent).toContain(JSON.stringify({ t: 'hunt.stop' }))
    h.loop.stop()
    expect(h.ctx.session.get().socket).toBe('closed')
  })
})
