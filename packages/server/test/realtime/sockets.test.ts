import { describe, expect, it } from 'vitest'
import { createSocketRegistry, OPEN, type SocketLike } from '../../src/realtime/sockets.js'

function fakeSocket(): SocketLike & { sent: string[]; closed: { code: number | undefined; reason: string | undefined } | null; readyState: number } {
  const s = { sent: [] as string[], closed: null as { code: number | undefined; reason: string | undefined } | null, readyState: OPEN, send(d: string) { s.sent.push(d) }, close(code?: number, reason?: string) { s.closed = { code, reason }; s.readyState = 3 } }
  return s
}

describe('SocketRegistry', () => {
  it('broadcast só para o treinador; send serializa; remove tira dos dois índices', () => {
    const reg = createSocketRegistry()
    const a1 = fakeSocket(), a2 = fakeSocket(), b = fakeSocket()
    reg.add({ socket: a1, trainerId: 'A', tokenHash: 'ta' })
    reg.add({ socket: a2, trainerId: 'A', tokenHash: 'ta2' })
    reg.add({ socket: b, trainerId: 'B', tokenHash: 'tb' })
    reg.broadcast('A', { t: 'pong' })
    expect(a1.sent).toEqual(['{"t":"pong"}']); expect(a2.sent).toEqual(['{"t":"pong"}']); expect(b.sent).toEqual([])
    expect(reg.countFor('A')).toBe(2); expect(reg.size()).toBe(3)
    reg.remove(a1)
    expect(reg.countFor('A')).toBe(1)
    reg.closeForToken('ta', 1008, 'x')
    expect(a1.closed).toBeNull()
  })
  it('closeForToken fecha só os sockets daquele token; closeAll fecha todos; sockets fechados não recebem', () => {
    const reg = createSocketRegistry()
    const a1 = fakeSocket(), a2 = fakeSocket()
    reg.add({ socket: a1, trainerId: 'A', tokenHash: 'ta' })
    reg.add({ socket: a2, trainerId: 'A', tokenHash: 'ta2' })
    reg.closeForToken('ta', 1008, 'logout')
    expect(a1.closed).toEqual({ code: 1008, reason: 'logout' }); expect(a2.closed).toBeNull()
    reg.broadcast('A', { t: 'hunt.idle' })
    expect(a1.sent).toEqual([]); expect(a2.sent).toEqual(['{"t":"hunt.idle"}'])
    reg.closeAll(1001, 'shutdown')
    expect(a2.closed).toEqual({ code: 1001, reason: 'shutdown' })
    expect(reg.size()).toBe(0)
  })
})
