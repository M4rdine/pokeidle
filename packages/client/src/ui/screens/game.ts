import { HuntMapSchema } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { createScene, type Scene } from '../../scene/app.js'
import { mountActivePokemon } from '../hud/active-pokemon.js'
import { mountLog } from '../hud/log.js'
import { mountSituacao } from '../hud/situacao.js'
import { mountMoves } from '../hud/moves.js'
import { mountOverlays } from '../hud/overlays.js'
import { mountTeamStrip } from '../hud/team-strip.js'
import { mountTopBar } from '../hud/top-bar.js'
import { el, mount } from '../dom.js'

/** Grade da tela: barra no topo, ativo e golpes à esquerda, cena no centro, time à direita, log embaixo. */
export function mountGame(root: HTMLElement, ctx: AppContext): () => void {
  const top = el('div', { class: 'grid-top' })
  const left = el('div', { class: 'grid-left' })
  const center = el('div', { class: 'grid-center', id: 'scene' })
  const right = el('div', { class: 'grid-right' })
  const bottom = el('div', { class: 'grid-bottom' })
  mount(root, el('section', { class: 'screen screen-game game-grid' }, top, left, center, right, bottom))

  const offs = [mountTopBar(top, ctx), mountActivePokemon(left, ctx), mountMoves(left, ctx),
    mountSituacao(left, ctx), mountTeamStrip(right, ctx), mountLog(bottom, ctx), mountOverlays(center, ctx)]
  let scene: Scene | null = null
  let offScene: (() => void) | null = null
  let offEvents: (() => void) | null = null
  let disposed = false

  const onKey = (ev: KeyboardEvent): void => {
    if (!scene) return
    if (ev.key === '+' || ev.key === '=') scene.setZoom(2)
    if (ev.key === '-') scene.setZoom(1)
  }
  const onResize = (): void => scene?.resize()
  /**
   * A cena mede o pai, não a janela. `resizeTo` do Pixi só reage a `window.resize`, então quando o
   * layout mudava sozinho — a barra de topo passando de uma linha para duas ao chegarem os dados
   * da sessão — o centro encolhia e o canvas ficava com uma banda preta embaixo. Observar o
   * elemento corrige na raiz, e cobre qualquer mudança de layout futura.
   */
  const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)

  const huntId = ctx.hunt.get().session?.huntId ?? ctx.session.get().me?.trainer.activeHuntId
  if (huntId) {
    void ctx.http.get(`/hunts/${huntId}/map`, HuntMapSchema)
      .then(async (map) => {
        if (disposed) return
        scene = await createScene(center, { atlas: ctx.atlas, map, registry: ctx.registry, now: ctx.now })
        if (disposed) { scene.destroy(); scene = null; return }
        offScene = ctx.hunt.subscribe((view) => view, (view) => scene?.applyView(view))
        offEvents = ctx.loop?.onEvent((event, view) => scene?.onEvent(event, view)) ?? null
        window.addEventListener('keydown', onKey)
        window.addEventListener('resize', onResize)
        observador?.observe(center)
      })
      .catch((error: unknown) => {
        if (disposed) return
        center.append(el('p', { class: 'scene-error' }, error instanceof Error ? error.message : 'não foi possível desenhar o mapa'))
      })
  }

  return () => {
    disposed = true
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
    observador?.disconnect()
    offScene?.()
    offEvents?.()
    scene?.destroy()
    for (const off of offs) off()
    root.replaceChildren()
  }
}
