import { el } from './dom.js'

/** Sobreposição que cobre a área do jogo (catch-up, hunt parada). Devolve a função que a remove. */
export function showOverlay(root: Element, content: HTMLElement): () => void {
  const overlay = el('div', { class: 'overlay' }, content)
  root.append(overlay)
  return () => overlay.remove()
}
