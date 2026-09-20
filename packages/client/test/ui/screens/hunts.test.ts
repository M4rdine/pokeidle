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
// O bloqueio vem pronto do servidor: a tela só desenha `locked` e `minTrainerLevel`.
const campoInicial = { id: 'campo-inicial', name: 'Campo Inicial', width: 24, height: 36, minLevel: 2, maxLevel: 6, minTrainerLevel: 1, locked: false }
const picoRochoso = { id: 'pico-rochoso', name: 'Pico Rochoso', width: 24, height: 36, minLevel: 25, maxLevel: 35, minTrainerLevel: 23, locked: true }
const ctxWith = (over: Record<string, unknown> = {}, hunts = [campoInicial]) =>
  createContext({ session: createStore({ ...withMe(initialSession(), me()), hunts }), ...over })

describe('tela de hunts', () => {
  it('lista a área disponível com a faixa de nível e o botão de iniciar', () => {
    const root = document.createElement('div')
    mountHunts(root, ctxWith())
    expect(root.querySelector('h1')?.textContent).toBe('Hunts')
    const card = root.querySelector('.hunt-card')!
    expect(card.textContent).toContain('Campo Inicial')
    expect(card.textContent).toContain('níveis 2–6')
    expect(card.querySelector('button')?.textContent).toBe('Iniciar')
  })

  it('mostra a área bloqueada com o nível que a abre, e sem botão de iniciar', () => {
    const root = document.createElement('div')
    mountHunts(root, ctxWith({}, [campoInicial, picoRochoso]))
    const locked = root.querySelector('.hunt-locked')!
    expect(locked.textContent).toContain('Pico Rochoso')
    expect(locked.textContent).toContain('abre no nível 23')
    expect(locked.querySelector('button')).toBeNull()
  })

  it('as liberadas vêm antes das bloqueadas, em ordem de nível', () => {
    const root = document.createElement('div')
    const media = { ...picoRochoso, id: 'caverna-funda', name: 'Caverna Funda', minTrainerLevel: 18 }
    mountHunts(root, ctxWith({}, [picoRochoso, media, campoInicial]))
    expect([...root.querySelectorAll('.hunt-card')].map((c) => c.getAttribute('data-hunt')))
      .toEqual(['campo-inicial', 'caverna-funda', 'pico-rochoso'])
  })
  it('iniciar manda POST /hunts/:id/start e chama go(); atalhos abrem os modais', async () => {
    const post = vi.fn(async () => ({ session: { huntId: 'campo-inicial', sessionId: 's', startedAt: 'x' } }))
    const go = vi.fn(async () => {})
    const openModal = vi.fn()
    const root = document.createElement('div')
    mountHunts(root, ctxWith({ http: { post } as never, go, openModal }))
    root.querySelector<HTMLButtonElement>('.hunt-card button')!.click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(post).toHaveBeenCalledWith('/hunts/campo-inicial/start', {}, expect.anything())
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
