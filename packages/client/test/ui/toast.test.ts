import { describe, expect, it, vi } from 'vitest'
import { createToasts } from '../../src/ui/toast.js'

describe('toasts', () => {
  it('mostra, limita a 4 e some depois do tempo', () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    const t = createToasts(root)
    for (let i = 0; i < 5; i++) t.show(`m${i}`)
    expect(root.querySelectorAll('.toast')).toHaveLength(4)
    expect(root.textContent).not.toContain('m0')
    vi.advanceTimersByTime(4000)
    expect(root.querySelectorAll('.toast')).toHaveLength(0)
    t.show('erro', 'error')
    expect(root.querySelector('.toast-error')).not.toBeNull()
    t.show('grande', 'big')
    vi.advanceTimersByTime(4000)
    expect(root.querySelectorAll('.toast')).toHaveLength(1) // big dura 8 s
    vi.advanceTimersByTime(4000)
    expect(root.querySelectorAll('.toast')).toHaveLength(0)
    vi.useRealTimers()
  })
  it('o container anuncia mudanças para leitores de tela', () => {
    const root = document.createElement('div')
    createToasts(root)
    expect(root.querySelector('.toasts')?.getAttribute('aria-live')).toBe('polite')
  })
})
