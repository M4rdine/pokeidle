import { INTENT_MIN_INTERVAL_MS } from '../../config.js'
import { el } from '../dom.js'

/** Botão que manda intenção pelo socket: fica desabilitado 200 ms (o servidor só aceita uma por tick). */
export function intentButton(label: string, send: () => void): HTMLElement {
  const button = el('button', { type: 'button', class: 'intent' }, label)
  button.addEventListener('click', () => {
    if (button.hasAttribute('disabled')) return
    send()
    button.setAttribute('disabled', '')
    setTimeout(() => button.removeAttribute('disabled'), INTENT_MIN_INTERVAL_MS)
  })
  return button
}
