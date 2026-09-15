import { loadRegistry } from '@pokeidle/shared'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../../../src/api/dto.js'
import { createContext, type AppContext } from '../../../src/app-context.js'
import { applySnapshot, emptyHuntView } from '../../../src/state/hunt-view.js'
import { initialSession, withMe } from '../../../src/state/session.js'
import { createStore } from '../../../src/state/store.js'
import { openBag } from '../../../src/ui/modals/bag.js'
import { openPokedex } from '../../../src/ui/modals/pokedex.js'
import { openSettings } from '../../../src/ui/modals/settings.js'
import { openShop } from '../../../src/ui/modals/shop.js'
import { openTeam } from '../../../src/ui/modals/team.js'
import fixture from '../../fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const snapshot = (fixture as unknown as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }> }).snapshot
const inHuntView = applySnapshot(emptyHuntView(), snapshot)
const me = (patch: Partial<Me['trainer']> = {}): Me => ({
  user: { id: 'u', email: 'a@a.com', role: 'player' },
  trainer: { id: 't', name: 'Ash', xp: 0, gold: 500, settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } }, hasStarter: true, activeHuntId: null, level: 1, xpToNext: 8, teamSlots: 3, nextUnlock: null, ...patch },
})
const ctxWith = (over: Partial<AppContext> = {}): AppContext => createContext({
  registry,
  session: createStore(withMe(initialSession(), me())),
  hunt: createStore(emptyHuntView()),
  ...over,
})
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const modal = () => document.querySelector('.modal-body')!
afterEach(() => { document.querySelector('.modal-backdrop')?.remove() })

describe('mochila', () => {
  it('com hunt ativa usa o espelho e permite usar poção; fora da hunt busca no servidor', async () => {
    const sendIntent = vi.fn()
    const hurt = { ...inHuntView, state: { ...inHuntView.state!, player: { ...inHuntView.state!.player, team: [{ ...inHuntView.state!.player.team[0]!, hp: 5 }] } } }
    openBag(ctxWith({ hunt: createStore(hurt), sendIntent }))
    expect(modal().querySelector('[data-item=potion]')?.textContent).toContain('Poção')
    modal().querySelector<HTMLButtonElement>('[data-item=potion] button')!.click()
    expect(sendIntent).toHaveBeenCalledWith({ t: 'item.use', itemId: 'potion' })
    document.querySelector('.modal-backdrop')!.remove()
    const get = vi.fn(async () => ({ items: [{ itemId: 'potion', quantity: 2 }] }))
    openBag(ctxWith({ http: { get } as never }))
    await flush()
    expect(get).toHaveBeenCalledWith('/trainer/inventory', expect.anything())
    expect(modal().querySelector('[data-item=potion] button')).toBeNull()
  })
})

describe('time', () => {
  it('lista time e mochila, e reordenar manda PUT /trainer/team', async () => {
    const team = [
      { id: 'a', speciesName: 'charmander', level: 10, xp: 0, hp: 5, hpMax: 10, teamSlot: 0 },
      { id: 'b', speciesName: 'zubat', level: 4, xp: 0, hp: 8, hpMax: 8, teamSlot: 1 },
    ]
    const box = [{ id: 'c', speciesName: 'gastly', level: 9, xp: 0, hp: 3, hpMax: 12, teamSlot: null }]
    const get = vi.fn(async () => ({ team, box }))
    const put = vi.fn(async () => ({ team, box }))
    openTeam(ctxWith({ http: { get, put } as never }))
    await flush()
    expect(modal().textContent).toContain('vagas: 2/3')
    expect(modal().querySelectorAll('.team-row')).toHaveLength(3)
    modal().querySelector<HTMLButtonElement>('[data-pokemon=b] [aria-label=subir]')!.click()
    await flush()
    expect(put).toHaveBeenCalledWith('/trainer/team', { slots: ['b', 'a'] }, expect.anything())
    modal().querySelector<HTMLButtonElement>('[data-pokemon=c] button')!.click()
    await flush()
    expect(put).toHaveBeenLastCalledWith('/trainer/team', { slots: ['a', 'b', 'c'] }, expect.anything())
  })
  it('com hunt ativa os controles ficam bloqueados', async () => {
    const get = vi.fn(async () => ({ team: [{ id: 'a', speciesName: 'charmander', level: 10, xp: 0, hp: 5, hpMax: 10, teamSlot: 0 }], box: [] }))
    openTeam(ctxWith({ http: { get } as never, hunt: createStore(inHuntView) }))
    await flush()
    expect(modal().textContent).toContain('pare a hunt para mexer no time')
    expect([...modal().querySelectorAll('button')].every((b) => b.hasAttribute('disabled'))).toBe(true)
  })
})

describe('configurações', () => {
  it('preenche do /me e salva com PATCH', async () => {
    const patch = vi.fn(async () => ({ settings: {} }))
    const go = vi.fn(async () => {})
    openSettings(ctxWith({ http: { patch } as never, go }))
    const potion = modal().querySelector<HTMLInputElement>('#set-potion')!
    expect(potion.value).toBe('50')
    potion.value = '65'
    modal().querySelector<HTMLButtonElement>('button.primary')!.click()
    await flush()
    expect(patch).toHaveBeenCalledWith('/trainer/settings', expect.objectContaining({ potionHpPercent: 65, returnHpPercent: 50 }), expect.anything())
    expect(go).toHaveBeenCalled()
  })
})

describe('pokédex', () => {
  it('mostra capturados, vistos e desconhecidos', async () => {
    const get = vi.fn(async () => ({ entries: [{ speciesName: 'charmander', seenAt: 'x', caughtAt: 'y' }, { speciesName: 'zubat', seenAt: 'x', caughtAt: null }] }))
    openPokedex(ctxWith({ http: { get } as never }))
    await flush()
    expect(modal().querySelector('[data-species=charmander]')?.className).toContain('caught')
    expect(modal().querySelector('[data-species=zubat]')?.className).toContain('seen')
    expect(modal().querySelector('[data-species=mewtwo]')?.textContent).toBe('???')
    expect(modal().textContent).toContain('Capturados: 1')
  })
})

describe('loja', () => {
  it('compra e mostra o erro do servidor; com hunt ativa fica bloqueada', async () => {
    const shop = { level: 1, gold: 500, items: [
      { itemId: 'potion', name: 'Poção', kind: 'potion' as const, buyPrice: 100, sellPrice: 50, unlockLevel: 0, unlocked: true, owned: 2 },
      { itemId: 'super-potion', name: 'Super Poção', kind: 'potion' as const, buyPrice: 400, sellPrice: 200, unlockLevel: 20, unlocked: false, owned: 0 },
    ] }
    const get = vi.fn(async () => shop)
    const post = vi.fn(async () => ({ gold: 400, item: { itemId: 'potion', quantity: 3 } }))
    openShop(ctxWith({ http: { get, post } as never }))
    await flush()
    expect(modal().querySelector('[data-item=potion] [data-owned]')?.textContent).toBe('2')
    expect(modal().querySelector('[data-item=super-potion]')?.className).toContain('locked')
    expect(modal().querySelector('[data-item=super-potion]')?.textContent).toContain('nível 20')
    modal().querySelector<HTMLButtonElement>('[data-item=potion] button')!.click()
    await flush()
    expect(post).toHaveBeenCalledWith('/shop/buy', { itemId: 'potion', quantity: 1 }, expect.anything())

    document.querySelector('.modal-backdrop')!.remove()
    const failing = vi.fn(async () => { throw new Error('faltam 100 de ouro') })
    openShop(ctxWith({ http: { get, post: failing } as never }))
    await flush()
    modal().querySelector<HTMLButtonElement>('[data-item=potion] button')!.click()
    await flush()
    expect(modal().querySelector('.form-error')?.textContent).toBe('faltam 100 de ouro')

    document.querySelector('.modal-backdrop')!.remove()
    openShop(ctxWith({ http: { get } as never, hunt: createStore(inHuntView) }))
    await flush()
    expect(modal().textContent).toContain('pare a hunt para usar a loja')
    expect([...modal().querySelectorAll('button')].every((b) => b.hasAttribute('disabled'))).toBe(true)
  })
})
