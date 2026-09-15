import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { ORIGIN } from './app.js'

export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('sem porta')
  return `ws://127.0.0.1:${address.port}`
}

export interface WsClient {
  readonly raw: WebSocket
  send(obj: unknown): void
  next(timeoutMs?: number): Promise<Record<string, unknown>>
  nextOf(t: string, timeoutMs?: number): Promise<Record<string, unknown>>
  closed(): Promise<{ code: number; reason: string }>
  close(): void
}

export function connectWs(
  base: string,
  cookie?: string,
  headers: Record<string, string> = { origin: ORIGIN },
): Promise<{ client: WsClient } | { rejected: number }> {
  return new Promise((resolve) => {
    const raw = new WebSocket(`${base}/ws`, { headers: { ...headers, ...(cookie && { cookie }) } })
    const queue: Record<string, unknown>[] = []
    const waiters: ((m: Record<string, unknown>) => void)[] = []
    const closedP = new Promise<{ code: number; reason: string }>((r) =>
      raw.on('close', (code, reason) => r({ code, reason: reason.toString() })),
    )
    raw.on('message', (data) => {
      const m = JSON.parse(data.toString()) as Record<string, unknown>
      const w = waiters.shift()
      if (w) w(m)
      else queue.push(m)
    })
    raw.on('unexpected-response', (_req, res) => resolve({ rejected: res.statusCode ?? 0 }))
    raw.on('open', () =>
      resolve({
        client: {
          raw,
          send: (obj) => raw.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
          next: (timeoutMs = 2000) =>
            new Promise((res, rej) => {
              const q = queue.shift()
              if (q) return res(q)
              const timer = setTimeout(() => rej(new Error('timeout esperando mensagem')), timeoutMs)
              waiters.push((m) => { clearTimeout(timer); res(m) })
            }),
          nextOf: async function nextOf(t, timeoutMs = 2000) {
            for (;;) {
              const m = await this.next(timeoutMs)
              if (m['t'] === t) return m
            }
          },
          closed: () => closedP,
          close: () => raw.close(),
        },
      }),
    )
  })
}
