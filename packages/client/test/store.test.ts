import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../src/state/store.js'

describe('createStore', () => {
  it('set troca o objeto inteiro e update deriva do atual', () => {
    const s = createStore({ a: 1, b: 'x' })
    s.set({ a: 2, b: 'x' })
    s.update((v) => ({ ...v, b: 'y' }))
    expect(s.get()).toEqual({ a: 2, b: 'y' })
  })
  it('subscribe dispara imediatamente e depois só quando a fatia muda', () => {
    const s = createStore({ a: 1, b: 'x' })
    const fn = vi.fn()
    const off = s.subscribe((v) => v.a, fn)
    expect(fn).toHaveBeenCalledWith(1, undefined)
    s.update((v) => ({ ...v, b: 'y' })) // a não mudou
    expect(fn).toHaveBeenCalledTimes(1)
    s.update((v) => ({ ...v, a: 2 }))
    expect(fn).toHaveBeenLastCalledWith(2, 1)
    off()
    s.update((v) => ({ ...v, a: 3 }))
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('immediate: false não dispara na assinatura; equals customizado compara fatias compostas', () => {
    const s = createStore({ list: [1, 2] })
    const fn = vi.fn()
    s.subscribe((v) => v.list, fn, { immediate: false, equals: (a, b) => a.length === b.length })
    s.update(() => ({ list: [3, 4] }))
    expect(fn).not.toHaveBeenCalled()
    s.update(() => ({ list: [3] }))
    expect(fn).toHaveBeenCalledWith([3], [1, 2])
  })
})
