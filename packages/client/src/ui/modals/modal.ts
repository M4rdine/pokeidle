import { el } from '../dom.js'

export interface Modal { close(): void }

/** O modal aberto no momento: abrir outro fecha este de verdade, soltando o ouvinte do Esc. */
let current: Modal | null = null

/** Um modal por vez. Fecha no botão, no Esc e no clique fora. */
/** O que recebe foco por teclado, na ordem do documento. */
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

export function openModal(root: Element, title: string, content: HTMLElement, onClose?: () => void): Modal {
  // Quem abriu recebe o foco de volta ao fechar; sem isso ele cai no `body` e quem navega por
  // teclado perde o lugar. A captura vem ANTES de fechar o anterior: fechar mexe no foco, e
  // capturar depois herdaria o elemento errado.
  const abridor = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null
  current?.close()
  // Sem glifo: o X é DESENHADO em CSS, com duas barras retas. O sistema não tem biblioteca de
  // ícones, e um "×" de fonte aqui seria o primeiro ícone dela — herdado de uma família qualquer,
  // com peso e tamanho que não são os do resto do mundo.
  const closeButton = el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Fechar' })
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header', { class: 'modal-header' }, el('h2', {}, title), closeButton),
    el('div', { class: 'modal-body' }, content))
  const backdrop = el('div', { class: 'modal-backdrop' }, dialog)
  let open = true
  const close = (): void => {
    if (!open) return
    open = false
    if (current === modal) current = null
    document.removeEventListener('keydown', onKeydown)
    backdrop.remove()
    if (appRoot instanceof HTMLElement) appRoot.inert = false
    abridor?.focus()
    onClose?.()
  }
  /**
   * O conteúdo atrás do overlay continua no DOM e focável. Sem laço, o Tab sai do modal e vai
   * parar em botões escondidos atrás dele — o teclado enxerga o que o olho não vê.
   */
  function prenderFoco(ev: KeyboardEvent): void {
    const alvos = [...dialog.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((n) => n.offsetParent !== null || n === closeButton)
    if (alvos.length === 0) return
    const primeiro = alvos[0]!
    const ultimo = alvos.at(-1)!
    const atual = document.activeElement
    if (ev.shiftKey && (atual === primeiro || !dialog.contains(atual))) {
      ev.preventDefault()
      ultimo.focus()
      return
    }
    if (!ev.shiftKey && (atual === ultimo || !dialog.contains(atual))) {
      ev.preventDefault()
      primeiro.focus()
    }
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') { close(); return }
    if (ev.key === 'Tab') prenderFoco(ev)
  }
  closeButton.addEventListener('click', close)
  backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) close() })
  document.addEventListener('keydown', onKeydown)
  // O laço de Tab impede a navegação por teclado; o `inert` tira o fundo da árvore de
  // acessibilidade inteira, para que leitor de tela também não o alcance.
  const appRoot = document.getElementById('app') ?? document.body.firstElementChild
  if (appRoot instanceof HTMLElement && appRoot !== backdrop) appRoot.inert = true
  root.append(backdrop)
  closeButton.focus()
  const modal: Modal = { close }
  current = modal
  return modal
}
