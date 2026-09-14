import type { ServerMessage } from './protocol.js'

export const OPEN = 1

export interface SocketLike { send(data: string): void; close(code?: number, reason?: string): void; readonly readyState: number }
export interface SocketEntry { readonly socket: SocketLike; readonly trainerId: string; readonly tokenHash: string }

export interface SocketRegistry {
  add(entry: SocketEntry): void
  remove(socket: SocketLike): void
  broadcast(trainerId: string, msg: ServerMessage): void
  send(socket: SocketLike, msg: ServerMessage): void
  closeForToken(tokenHash: string, code: number, reason: string): void
  closeAll(code: number, reason: string): void
  countFor(trainerId: string): number
  size(): number
}

/** Registro de sockets abertos. Infraestrutura mutável (Map/Set) por natureza; nada de estado de jogo aqui. */
export function createSocketRegistry(): SocketRegistry {
  const entries = new Map<SocketLike, SocketEntry>()
  const byTrainer = new Map<string, Set<SocketLike>>()
  const byToken = new Map<string, Set<SocketLike>>()
  const index = (map: Map<string, Set<SocketLike>>, key: string, socket: SocketLike): void => { (map.get(key) ?? map.set(key, new Set()).get(key))!.add(socket) }
  const unindex = (map: Map<string, Set<SocketLike>>, key: string, socket: SocketLike): void => { const set = map.get(key); set?.delete(socket); if (set && set.size === 0) map.delete(key) }
  const send = (socket: SocketLike, msg: ServerMessage): void => { if (socket.readyState === OPEN) socket.send(JSON.stringify(msg)) }
  const remove = (socket: SocketLike): void => {
    const entry = entries.get(socket)
    if (!entry) return
    entries.delete(socket); unindex(byTrainer, entry.trainerId, socket); unindex(byToken, entry.tokenHash, socket)
  }
  const closeSet = (set: Iterable<SocketLike> | undefined, code: number, reason: string): void => { for (const socket of [...(set ?? [])]) { remove(socket); socket.close(code, reason) } }
  return {
    add: (entry) => { entries.set(entry.socket, entry); index(byTrainer, entry.trainerId, entry.socket); index(byToken, entry.tokenHash, entry.socket) },
    remove,
    broadcast: (trainerId, msg) => { for (const socket of byTrainer.get(trainerId) ?? []) send(socket, msg) },
    send,
    closeForToken: (tokenHash, code, reason) => closeSet(byToken.get(tokenHash), code, reason),
    closeAll: (code, reason) => closeSet(entries.keys(), code, reason),
    countFor: (trainerId) => byTrainer.get(trainerId)?.size ?? 0,
    size: () => entries.size,
  }
}
