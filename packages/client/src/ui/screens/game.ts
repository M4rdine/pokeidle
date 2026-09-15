import { z } from 'zod'
import type { AppContext } from '../../app-context.js'
import { el, mount } from '../dom.js'

/** Stub: a tela de jogo completa (HUD, cena, log) chega na próxima etapa. */
export function mountGame(root: HTMLElement, ctx: AppContext): () => void {
  const stop = el('button', { class: 'primary', type: 'button' }, 'Parar')
  stop.addEventListener('click', () => {
    stop.setAttribute('disabled', '')
    void ctx.http.post('/hunts/stop', {}, z.unknown()).then(() => ctx.go()).finally(() => stop.removeAttribute('disabled'))
  })
  mount(root, el('section', { class: 'screen screen-game panel' }, el('h1', {}, 'Hunt em andamento'), stop))
  return () => { root.replaceChildren() }
}
