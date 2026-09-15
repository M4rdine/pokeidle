import { describe, expect, it, vi } from 'vitest'
import { el, pct, typeBadge } from '../../src/ui/dom.js'

describe('el', () => {
  it('cria elementos com atributos, listeners e filhos', () => {
    const onclick = vi.fn()
    const node = el('button', { class: 'x', type: 'button', disabled: false, onclick }, 'Ok', null, el('b', {}, '!'))
    expect(node.outerHTML).toBe('<button class="x" type="button">Ok<b>!</b></button>')
    node.click()
    expect(onclick).toHaveBeenCalledTimes(1)
    expect(el('input', { disabled: true }).hasAttribute('disabled')).toBe(true)
  })
  it('typeBadge usa a classe do tipo e pct arredonda', () => {
    expect(typeBadge('fire').outerHTML).toBe('<span class="type type-fire">fire</span>')
    expect(pct(1, 3)).toBe(33)
    expect(pct(1, 0)).toBe(0)
  })
})
