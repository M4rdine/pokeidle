import './styles/tokens.css'
import './styles/layout.css'
import './styles/quadro.css'
import './styles/hud.css'
import './styles/areas.css'
import './styles/modals.css'
import './styles/species.css'
import { loadContentRegistry } from '@pokeidle/shared'
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
import { mountAreas } from './ui/screens/areas/index.js'
import { mountStarter } from './ui/screens/starter.js'
import { openBag } from './ui/modals/bag.js'
import { openPokedex } from './ui/modals/pokedex.js'
import { openSettings } from './ui/modals/settings.js'
import { openShop } from './ui/modals/shop.js'
import { openTeam } from './ui/modals/team.js'
import { createTipShower } from './ui/tips.js'
import { createToasts } from './ui/toast.js'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('#app não existe no index.html')
const toasts = createToasts(document.body)
let unmount: (() => void) | null = null
let ctx: AppContext | undefined

/** Refaz `GET /me` e, com inicial escolhido, a lista de hunts: é o que decide a tela. */
async function refreshMe(): Promise<void> {
  if (!ctx) return
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
  if (!ctx) return
  unmount?.()
  unmount = null
  const screen = ctx.session.get().screen
  if (screen === 'auth') unmount = mountAuth(root!, ctx)
  else if (screen === 'starter') unmount = mountStarter(root!, ctx)
  else if (screen === 'hunts') unmount = mountAreas(root!, ctx)
  else if (screen === 'game') unmount = mountGame(root!, ctx)
  else mount(root!, el('p', { class: 'loading' }, 'Carregando…'))
}

async function boot(): Promise<void> {
  // 401 em qualquer chamada (sessão expirada no meio do jogo) devolve o jogador à tela de entrar.
  const onUnauthorized = (): void => { ctx?.session.set(withMe(ctx.session.get(), null)) }
  const http = createHttp({ fetch: (input, init) => fetch(input, init), onUnauthorized })
  const atlas = await loadAtlas().catch(() => {
    toasts.show('Atlas não encontrado: rode pnpm assets build', 'error')
    return null
  })
  ctx = createContext({
    http,
    registry: loadContentRegistry(),
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
    onAuthLost: onUnauthorized, // sessão expirada com o jogador parado: o socket avisa, o HTTP não
  })
  const modals: Record<ModalName, (context: AppContext) => unknown> = { bag: openBag, team: openTeam, settings: openSettings, pokedex: openPokedex, shop: openShop }
  ctx = { ...ctx, loop, sendIntent: loop.send, openModal: (name: ModalName) => { if (ctx) modals[name](ctx) } }
  loop.onEvent(createTipShower(ctx))
  const app = ctx
  app.session.subscribe((s) => s.me !== null, (logged) => {
    if (logged) { loop.start(); return }
    loop.stop()
    app.hunt.set(emptyHuntView()) // sair não pode deixar o espelho da conta anterior na tela
    app.log.set([])
  })
  app.session.subscribe((s) => s.screen, () => render())
  await refreshMe()
}

void boot()
