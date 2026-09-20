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
// Área real de Kanto: a tela decide o que está bloqueado cruzando as hunts recebidas com as
// regiões do registro, então uma hunt inventada faria Kanto inteira parecer bloqueada.
const campoInicial = { id: 'campo-inicial', name: 'Campo Inicial', width: 24, height: 36, minLevel: 2, maxLevel: 6 }
const ctxWith = (over: Record<string, unknown> = {}) => createContext({ session: createStore({ ...withMe(initialSession(), me()), hunts: [campoInicial] }), ...over })

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

  it('mostra a região ainda bloqueada com o nível que a abre, e sem botão', () => {
    const ctx = ctxWith()
    // O registro real só tem Kanto, que já está aberta. Para provar o cartão bloqueado, a
    // fixture acrescenta uma região futura com portão de nível.
    const registry = {
      ...ctx.registry,
      regions: new Map([...ctx.registry.regions, ['johto', {
        ...ctx.registry.regions.get('kanto')!,
        id: 'johto',
        name: 'Johto',
        // Área própria: copiar a de Kanto faria a rota-1 parecer pertencer às duas regiões.
        areas: [{ ...ctx.registry.regions.get('kanto')!.areas[0]!, id: 'rota-10', name: 'Rota 10' }],
      }]]),
      unlocks: { ...ctx.registry.unlocks, regions: { ...ctx.registry.unlocks.regions, johto: 50 } },
    }
    const root = document.createElement('div')
    mountHunts(root, { ...ctx, registry })
    const locked = root.querySelector('.hunt-locked')!
    expect(locked.textContent).toContain('Johto')
    expect(locked.textContent).toContain('nível 50')
    expect(locked.querySelector('button')).toBeNull()
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
