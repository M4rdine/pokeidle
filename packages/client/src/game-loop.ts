import type { ClientMessage, Event, ServerMessage } from '@pokeidle/shared/protocol'
import type { AppContext } from './app-context.js'
import { createHuntSocket, type WebSocketLike } from './api/ws.js'
import { WS_PATH } from './config.js'
import { applyEvent, applyServerMessage, type HuntView } from './state/hunt-view.js'
import { appendLog, formatEvent } from './state/log.js'
import { trainerProgress, unlockedBetween } from './state/progress.js'

export type EventListener = (event: Event, view: HuntView) => void
export interface GameLoopDeps {
  readonly makeSocket: (url: string) => WebSocketLike
  readonly setTimeout: (fn: () => void, ms: number) => unknown
  readonly clearTimeout: (handle: unknown) => void
  readonly random: () => number
}
export interface GameLoop {
  start(): void
  stop(): void
  send(message: ClientMessage): void
  onEvent(listener: EventListener): () => void
}

const socketUrl = (): string =>
  typeof location === 'undefined' ? WS_PATH : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`

const trainerLevelOf = (ctx: AppContext, view: HuntView): number =>
  view.state ? trainerProgress(ctx.registry, view.state.trainer.xp).level : 0

/** Liga o socket às stores: espelha o estado, escreve o log e avisa a cena evento a evento. */
export function createGameLoop(ctx: AppContext, deps: GameLoopDeps): GameLoop {
  const listeners = new Set<EventListener>()
  const alert = (text: string): void => ctx.log.update((lines) => appendLog(lines, { tick: ctx.hunt.get().tick, kind: 'alert', text }))

  const applyTick = (message: Extract<ServerMessage, { t: 'hunt.tick' }>): void => {
    let view: HuntView = { ...ctx.hunt.get(), state: ctx.hunt.get().state, tick: message.tick, serverTime: message.serverTime }
    if (view.state) view = { ...view, state: { ...view.state, tick: message.tick } }
    for (const event of message.events) {
      // O log usa o estado ANTES do evento (nomes de quem evoluiu, de quem desmaiou).
      const line = formatEvent(event, { registry: ctx.registry, state: view.state })
      const levelBefore = trainerLevelOf(ctx, view)
      view = applyEvent(view, event, ctx.registry)
      if (line) ctx.log.update((lines) => appendLog(lines, line))
      for (const what of unlockedBetween(ctx.registry, levelBefore, trainerLevelOf(ctx, view))) ctx.toasts.show(`Destravou: ${what}`, 'big')
      for (const listener of [...listeners]) listener(event, view)
    }
    ctx.hunt.set(view)
  }

  const onMessage = (message: ServerMessage): void => {
    if (message.t === 'hunt.tick') return applyTick(message)
    if (message.t === 'error') { ctx.toasts.show(message.message, 'error'); return }
    ctx.hunt.set(applyServerMessage(ctx.hunt.get(), message, ctx.registry))
    if (message.t === 'hunt.stopped' || message.t === 'hunt.idle') void ctx.go()
  }

  const socket = createHuntSocket({
    url: socketUrl(),
    makeSocket: deps.makeSocket,
    now: ctx.now,
    random: deps.random,
    setTimeout: deps.setTimeout,
    clearTimeout: deps.clearTimeout,
    onMessage,
    onStatus: (status) => ctx.session.update((s) => ({ ...s, socket: status })),
    onInvalid: (reason) => alert(`Mensagem ignorada: ${reason}`),
  })

  return {
    start: () => socket.connect(),
    stop: () => socket.close(),
    send: (message) => socket.send(message),
    onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}
