import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../../src/app-context.js'
import { mountStarter } from '../../../src/ui/screens/starter.js'

describe('tela do inicial', () => {
  it('mostra os três iniciais com tipos e nível 10', () => {
    const root = document.createElement('div')
    mountStarter(root, createContext())
    expect(root.textContent).toContain('Escolha seu inicial')
    const cards = root.querySelectorAll('.starter-card')
    expect([...cards].map((c) => c.getAttribute('data-species'))).toEqual(['charmander', 'bulbasaur', 'squirtle'])
    const bulba = root.querySelector('.starter-card[data-species=bulbasaur]')!
    expect([...bulba.querySelectorAll('.type')].map((t) => t.textContent)).toEqual(['grass', 'poison'])
    expect(bulba.textContent).toContain('Nível 10')
    expect(bulba.querySelector('button')?.textContent).toBe('Escolher')
  })
  it('escolher manda POST /trainer/starter e chama go()', async () => {
    const post = vi.fn(async () => ({ pokemon: {} }))
    const go = vi.fn(async () => {})
    const ctx = createContext({ http: { post } as never, go })
    const root = document.createElement('div')
    mountStarter(root, ctx)
    root.querySelector<HTMLButtonElement>('.starter-card[data-species=charmander] button')!.click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(post).toHaveBeenCalledWith('/trainer/starter', { species: 'charmander' }, expect.anything())
    expect(go).toHaveBeenCalled()
  })
})
