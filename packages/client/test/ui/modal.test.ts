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
