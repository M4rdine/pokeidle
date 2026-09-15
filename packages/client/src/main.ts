import './styles/tokens.css'
import './styles/layout.css'
import './styles/hud.css'
import './styles/modals.css'
import { loadRegistry } from '@pokeidle/shared'
import { HuntsSchema, MeSchema } from './api/dto.js'
import { ApiError, createHttp } from './api/http.js'
import { createContext, type AppContext, type ModalName } from './app-context.js'
import { createGameLoop, type GameLoop } from './game-loop.js'
import { loadAtlas } from './scene/atlas.js'
import { emptyHuntView } from './state/hunt-view.js'
import { initialSession, withMe } from './state/session.js'
import { createStore } from './state/store.js'
import { el, mount } from './ui/dom.js'
import { mountAuth } from './ui/screens/auth.js'
import { mountGame } from './ui/screens/game.js'
import { mountHunts } from './ui/screens/hunts.js'
import { mountStarter } from './ui/screens/starter.js'
import { createToasts } from './ui/toast.js'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('#app não existe no index.html')
const toasts = createToasts(document.body)
let unmount: (() => void) | null = null
let ctx: AppContext

/** Refaz `GET /me` e, com inicial escolhido, a lista de hunts: é o que decide a tela. */
async function refreshMe(): Promise<void> {
  try {
    const me = await ctx.http.get('/me', MeSchema)
    const hunts = me.trainer.hasStarter ? (await ctx.http.get('/hunts', HuntsSchema)).hunts : []
    ctx.session.set({ ...withMe(ctx.session.get(), me), hunts, error: null })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { ctx.session.set(withMe(ctx.session.get(), null)); return }
    ctx.session.update((s) => ({ ...s, error: error instanceof Error ? error.message : 'erro' }))
    toasts.show(error instanceof Error ? error.message : 'erro ao falar com o servidor', 'error')
  }
}

function render(): void {
  unmount?.()
  unmount = null
  const screen = ctx.session.get().screen
  if (screen === 'auth') unmount = mountAuth(root!, ctx)
  else if (screen === 'starter') unmount = mountStarter(root!, ctx)
  else if (screen === 'hunts') unmount = mountHunts(root!, ctx)
  else if (screen === 'game') unmount = mountGame(root!, ctx)
  else mount(root!, el('p', { class: 'loading' }, 'Carregando…'))
}

async function boot(): Promise<void> {
  const http = createHttp({ fetch: (input, init) => fetch(input, init), onUnauthorized: () => {} })
  const atlas = await loadAtlas().catch(() => {
    toasts.show('Atlas não encontrado: rode pnpm assets build', 'error')
    return null
  })
  ctx = createContext({
    http,
    registry: loadRegistry(),
    session: createStore(initialSession()),
    hunt: createStore(emptyHuntView()),
    toasts,
    storage: localStorage,
    now: () => Date.now(),
    go: refreshMe,
    ...(atlas && { atlas }),
  })
  const loop: GameLoop = createGameLoop(ctx, {
    makeSocket: (url) => new WebSocket(url) as unknown as import('./api/ws.js').WebSocketLike,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: Math.random,
  })
  ctx = { ...ctx, loop, sendIntent: loop.send, openModal: (_name: ModalName) => {} }
  ctx.session.subscribe((s) => s.me !== null, (logged) => { if (logged) loop.start(); else loop.stop() })
  ctx.session.subscribe((s) => s.screen, () => render())
  await refreshMe()
}

void boot()
