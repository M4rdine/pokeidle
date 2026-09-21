import { describe, expect, it, vi } from 'vitest'
import { el } from '../../src/ui/dom.js'
import { openModal } from '../../src/ui/modals/modal.js'

describe('openModal', () => {
  it('abre com título e conteúdo, fecha no botão, no Esc e ao abrir outro', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const onClose = vi.fn()
    const m = openModal(root, 'Mochila', el('p', {}, 'itens'), onClose)
    const dialog = root.querySelector('.modal')!
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(root.textContent).toContain('Mochila')
    expect(root.textContent).toContain('itens')
    root.querySelector<HTMLButtonElement>('.modal-close')!.click()
    expect(root.querySelector('.modal')).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)

    openModal(root, 'Time', el('p', {}, 'time'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(root.querySelector('.modal')).toBeNull()

    const closedA = vi.fn()
    openModal(root, 'A', el('p', {}, 'a'), closedA)
    openModal(root, 'B', el('p', {}, 'b'))
    expect(closedA).toHaveBeenCalledTimes(1) // o anterior é fechado de verdade, não só removido do DOM
    expect(root.querySelectorAll('.modal')).toHaveLength(1)
    expect(root.textContent).toContain('B')
    m.close() // fechar duas vezes não quebra nem fecha o modal atual
    expect(root.querySelectorAll('.modal')).toHaveLength(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closedA).toHaveBeenCalledTimes(1) // o Esc não reabre o callback do modal já fechado
    expect(root.querySelectorAll('.modal')).toHaveLength(0)
    root.remove()
  })
})

describe('o foco não escapa do modal', () => {
  const focavel = (rotulo: string) => {
    const b = document.createElement('button')
    b.textContent = rotulo
    return b
  }

  it('Tab no último elemento volta para o primeiro, em vez de ir para o fundo da página', () => {
    const atras = focavel('atrás do modal')
    document.body.append(atras)
    const conteudo = document.createElement('div')
    const dentro = focavel('dentro')
    conteudo.append(dentro)
    openModal(document.body, 'Teste', conteudo)

    dentro.focus()
    // O conteúdo atrás do overlay continua no DOM e focável; sem laço, o Tab chegaria nele.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    const fechar = document.querySelector<HTMLElement>('.modal-close')!
    expect(document.activeElement).toBe(fechar)

    atras.remove()
    document.querySelector('.modal-backdrop')?.remove()
  })

  it('Shift+Tab no primeiro elemento vai para o último, e não sai por cima', () => {
    const conteudo = document.createElement('div')
    const dentro = focavel('dentro')
    conteudo.append(dentro)
    openModal(document.body, 'Teste', conteudo)

    const fechar = document.querySelector<HTMLElement>('.modal-close')!
    fechar.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(dentro)

    document.querySelector('.modal-backdrop')?.remove()
  })

  it('devolve o foco a quem abriu, ao fechar', () => {
    const abridor = focavel('abrir')
    document.body.append(abridor)
    abridor.focus()

    const modal = openModal(document.body, 'Teste', document.createElement('div'))
    expect(document.activeElement).not.toBe(abridor)
    modal.close()

    // Sem isto o foco cai no `body` e quem navega por teclado perde o lugar na página.
    expect(document.activeElement).toBe(abridor)
    abridor.remove()
  })
})
