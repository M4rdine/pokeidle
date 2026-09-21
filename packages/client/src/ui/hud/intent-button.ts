import { INTENT_MIN_INTERVAL_MS } from '../../config.js'
import { el } from '../dom.js'

/**
 * Botão que manda intenção pelo socket: fica desabilitado 200 ms (o servidor só aceita uma por
 * tick). Aceita um ícone opcional, que entra ANTES do rótulo e não o substitui — ícone sozinho
 * vira adivinhação, e "Parar" é uma ação que encerra a caçada e grava progresso.
 */
export function intentButton(label: string, send: () => void, icone?: string): HTMLElement {
  const button = el('button', { type: 'button', class: 'intent' },
    icone === undefined ? null : el('span', { class: 'icone', 'data-icone': icone }),
    label)
  button.addEventListener('click', () => {
    if (button.hasAttribute('disabled')) return
    send()
    button.setAttribute('disabled', '')
    setTimeout(() => button.removeAttribute('disabled'), INTENT_MIN_INTERVAL_MS)
  })
  return button
}
