import { loadContentRegistry, type ContentRegistry } from '@pokeidle/shared'
import type { ClientMessage } from '@pokeidle/shared/protocol'
import type { Http } from './api/http.js'
import type { GameLoop } from './game-loop.js'
import type { AtlasData } from './scene/atlas.js'
import { emptyHuntView, type HuntView } from './state/hunt-view.js'
import type { LogLine } from './state/log.js'
import { initialSession, type SessionState } from './state/session.js'
import { createStore, type Store } from './state/store.js'
import type { ToastKind } from './ui/toast.js'

export type ModalName = 'bag' | 'team' | 'settings' | 'pokedex' | 'shop'

export interface AppContext {
  readonly http: Http
  readonly registry: ContentRegistry
  readonly session: Store<SessionState>
  readonly hunt: Store<HuntView>
  readonly log: Store<readonly LogLine[]>
  readonly toasts: { show(text: string, kind?: ToastKind): void }
  readonly atlas: AtlasData
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>
  readonly now: () => number
  readonly go: () => Promise<void>
  readonly openModal?: (name: ModalName) => void
  readonly sendIntent?: (message: ClientMessage) => void
  readonly loop?: GameLoop
}

const emptySheet = { frames: {}, animations: {}, meta: { image: 'pokemon.png', size: { w: 0, h: 0 }, scale: '1' } }
const emptyAtlas: AtlasData = { pokemon: emptySheet, tiles: emptySheet }
const noHttp = async (): Promise<never> => { throw new Error('http não configurado') }
const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const map = new Map<string, string>()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) } }
}

/** Contexto com padrões inertes; cada teste sobrescreve só o que usa. */
export function createContext(over: Partial<AppContext> = {}): AppContext {
  return {
    http: { get: noHttp, post: noHttp, put: noHttp, patch: noHttp },
    registry: loadContentRegistry(),
    session: createStore(initialSession()),
    hunt: createStore(emptyHuntView()),
    log: createStore<readonly LogLine[]>([]),
    toasts: { show: () => {} },
    atlas: emptyAtlas,
    storage: memoryStorage(),
    now: () => Date.now(),
    go: async () => {},
    ...over,
  }
}
