import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../../src/app-context.js'
import type { Me } from '../../../src/api/dto.js'
import { initialSession, withMe } from '../../../src/state/session.js'
import { createStore } from '../../../src/state/store.js'
import { mountHunts } from '../../../src/ui/screens/hunts.js'

const me = (patch: Partial<Me['trainer']> = {}): Me => ({
  user: { id: 'u', email: 'a@a.com', role: 'player' },
  trainer: { id: 't', name: 'Ash', xp: 0, gold: 120, settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } }, hasStarter: true, activeHuntId: null, level: 1, xpToNext: 8, teamSlots: 3, nextUnlock: { level: 10, what: '4 vagas no time' }, ...patch },
})
const route1 = { id: 'route-1', name: 'Rota 1', width: 40, height: 30, minLevel: 2, maxLevel: 12 }
const ctxWith = (over: Record<string, unknown> = {}) => createContext({ session: createStore({ ...withMe(initialSession(), me()), hunts: [route1] }), ...over })

describe('tela de hunts', () => {
  it('lista a hunt disponível e a futura bloqueada pelo nível', () => {
    const root = document.createElement('div')
    mountHunts(root, ctxWith())
    expect(root.querySelector('h1')?.textContent).toBe('Hunts')
    const card = root.querySelector('.hunt-card')!
    expect(card.textContent).toContain('Rota 1')
    expect(card.textContent).toContain('níveis 2–12')
    expect(card.querySelector('button')?.textContent).toBe('Iniciar')
    const locked = root.querySelector('.hunt-locked')!
    expect(locked.textContent).toContain('Rota 2')
    expect(locked.textContent).toContain('nível 50')
    expect(locked.querySelector('button')).toBeNull()
  })
  it('iniciar manda POST /hunts/:id/start e chama go(); atalhos abrem os modais', async () => {
    const post = vi.fn(async () => ({ session: { huntId: 'route-1', sessionId: 's', startedAt: 'x' } }))
    const go = vi.fn(async () => {})
    const openModal = vi.fn()
    const root = document.createElement('div')
    mountHunts(root, ctxWith({ http: { post } as never, go, openModal }))
    root.querySelector<HTMLButtonElement>('.hunt-card button')!.click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(post).toHaveBeenCalledWith('/hunts/route-1/start', {}, expect.anything())
    expect(go).toHaveBeenCalled()
    expect([...root.querySelectorAll('[data-open]')].map((b) => b.textContent)).toEqual(['Time', 'Mochila', 'Configurações', 'Pokédex', 'Loja'])
    root.querySelector<HTMLButtonElement>('[data-open=shop]')!.click()
    expect(openModal).toHaveBeenCalledWith('shop')
  })
  it('mostra o treinador com nível, ouro e próximo destrave', () => {
    const root = document.createElement('div')
    mountHunts(root, ctxWith())
    expect(root.querySelector('.trainer-bar')?.textContent).toContain('Ash')
    expect(root.querySelector('.trainer-bar')?.textContent).toContain('120')
    expect(root.querySelector('.trainer-bar')?.textContent).toContain('4 vagas no time')
  })
})
