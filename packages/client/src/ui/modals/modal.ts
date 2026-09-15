import { el } from '../dom.js'

export interface Modal { close(): void }

/** Um modal por vez: abrir fecha o anterior. Fecha no botão, no Esc e no clique fora. */
export function openModal(root: Element, title: string, content: HTMLElement, onClose?: () => void): Modal {
  root.querySelector('.modal-backdrop')?.remove()
  const closeButton = el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Fechar' }, '×')
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header', { class: 'modal-header' }, el('h2', {}, title), closeButton),
    el('div', { class: 'modal-body' }, content))
  const backdrop = el('div', { class: 'modal-backdrop' }, dialog)
  let open = true
  const close = (): void => {
    if (!open) return
    open = false
    document.removeEventListener('keydown', onKeydown)
    backdrop.remove()
    onClose?.()
  }
  function onKeydown(ev: KeyboardEvent): void { if (ev.key === 'Escape') close() }
  closeButton.addEventListener('click', close)
  backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) close() })
  document.addEventListener('keydown', onKeydown)
  root.append(backdrop)
  closeButton.focus()
  return { close }
}
