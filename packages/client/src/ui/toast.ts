import { el } from './dom.js'

export type ToastKind = 'info' | 'error' | 'big'
export interface Toasts { show(text: string, kind?: ToastKind): void }

const MAX_ON_SCREEN = 4
const DURATION_MS: Readonly<Record<ToastKind, number>> = { info: 4000, error: 4000, big: 8000 }

/** Avisos efêmeros; o container é `aria-live` para leitores de tela anunciarem cada um. */
export function createToasts(root: Element): Toasts {
  const list = el('div', { class: 'toasts', 'aria-live': 'polite' })
  root.append(list)
  return {
    show: (text, kind = 'info') => {
      while (list.children.length >= MAX_ON_SCREEN) list.firstElementChild?.remove()
      const node = el('div', { class: `toast toast-${kind}` }, text)
      list.append(node)
      setTimeout(() => node.remove(), DURATION_MS[kind])
    },
  }
}
