import { cooldownTicks, loadRegistry } from '@pokeidle/shared'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it, vi } from 'vitest'
import type { Me } from '../../../src/api/dto.js'
import { createContext, type AppContext } from '../../../src/app-context.js'
import { applySnapshot, emptyHuntView, type HuntView } from '../../../src/state/hunt-view.js'
import { initialSession, withMe } from '../../../src/state/session.js'
import { createStore } from '../../../src/state/store.js'
import { mountActivePokemon } from '../../../src/ui/hud/active-pokemon.js'
import { mountLog } from '../../../src/ui/hud/log.js'
import { mountMoves } from '../../../src/ui/hud/moves.js'
import { mountOverlays } from '../../../src/ui/hud/overlays.js'
import { mountTeamStrip } from '../../../src/ui/hud/team-strip.js'
import { mountTopBar } from '../../../src/ui/hud/top-bar.js'
import fixture from '../../fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const snapshot = (fixture as unknown as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }> }).snapshot
const view = applySnapshot(emptyHuntView(), snapshot)
const me = (patch: Partial<Me['trainer']> = {}): Me => ({
  user: { id: 'u', email: 'a@a.com', role: 'player' },
  trainer: { id: 't', name: 'Ash', xp: 0, gold: 40, settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } }, hasStarter: true, activeHuntId: 'route-1', level: 1, xpToNext: 8, teamSlots: 3, nextUnlock: { level: 10, what: '4 vagas no time' }, ...patch },
})
const ctxWith = (over: Partial<AppContext> = {}): AppContext => createContext({
  registry,
  hunt: createStore(view),
  session: createStore({ ...withMe(initialSession(), me()), socket: 'open' as const }),
  ...over,
})
const root = (): HTMLElement => document.createElement('div')

describe('barra superior', () => {
  it('mostra treinador, nível, próximo destrave, ouro e conexão', () => {
    const r = root()
    mountTopBar(r, ctxWith())
    expect(r.querySelector('strong')?.textContent).toBe('Ash')
    expect(r.querySelector('[data-level]')?.textContent).toBe('nível 1')
    expect(r.querySelector('[data-next]')?.textContent).toContain('4 vagas no time')
    expect(r.querySelector('[data-gold]')?.textContent).toBe('0') // o ouro vem do estado da hunt
    expect(r.querySelector('[data-conn]')?.getAttribute('data-conn')).toBe('open')
  })
  it('em catch-up a conexão avisa; Parar manda a intenção uma vez a cada 200 ms', () => {
    vi.useFakeTimers()
    const sendIntent = vi.fn()
    const hunt = createStore({ ...view, phase: 'catching-up' as const, catchup: { remaining: 10 } })
    const r = root()
    mountTopBar(r, ctxWith({ hunt, sendIntent }))
    expect(r.querySelector('[data-conn]')?.getAttribute('data-conn')).toBe('catching-up')
    const stop = [...r.querySelectorAll('button')].find((b) => b.textContent === 'Parar')!
    stop.click(); stop.click()
    expect(sendIntent).toHaveBeenCalledTimes(1)
    expect(sendIntent).toHaveBeenCalledWith({ t: 'hunt.stop' })
    vi.advanceTimersByTime(200)
    stop.click()
    expect(sendIntent).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('cartão do ativo e golpes', () => {
  it('mostra nome, nível e HP do ativo', () => {
    const r = root()
    mountActivePokemon(r, ctxWith())
    expect(r.querySelector('[data-name]')?.textContent).toBe('Charmander L10')
    const hp = r.querySelector('[data-hp]')!
    expect(hp.getAttribute('value')).toBe(String(view.state!.player.team[0]!.hp))
    expect(r.querySelector('[data-hp-text]')?.textContent).toContain('/')
  })
  it('lista os golpes e mostra o cooldown restante em fração', () => {
    const ember = registry.moves.get('ember')!
    const hunt = createStore({ ...view, tick: 10, derived: { targetWildId: null, cooldownUntil: { ember: 10 + cooldownTicks(ember) } } })
    const r = root()
    mountMoves(r, ctxWith({ hunt }))
    const move = r.querySelector('[data-move=ember]')!
    expect(move.textContent).toContain('Ember')
    expect(move.querySelector('.move-cd')?.getAttribute('data-cd')).toBe('1')
    hunt.set({ ...hunt.get(), tick: 10 + cooldownTicks(ember) })
    expect(r.querySelector('[data-move=ember] .move-cd')?.getAttribute('data-cd')).toBe('0')
  })
})

describe('time e log', () => {
  it('seis lugares: ocupado, liberados e bloqueados pelo nível (as vagas vêm do estado da hunt)', () => {
    const r = root()
    const sendIntent = vi.fn()
    const hunt = createStore({ ...view, state: { ...view.state!, settings: { ...view.state!.settings, teamSlots: 3 } } })
    mountTeamStrip(r, ctxWith({ sendIntent, hunt }))
    expect(r.querySelectorAll('.slot')).toHaveLength(6)
    expect(r.querySelectorAll('.slot-active')).toHaveLength(1)
    expect(r.querySelectorAll('.slot-empty')).toHaveLength(2)
    expect(r.querySelectorAll('.slot-locked')).toHaveLength(3)
    r.querySelector<HTMLButtonElement>('.slot-active')!.click()
    expect(sendIntent).toHaveBeenCalledWith({ t: 'team.setActive', pokemonId: view.state!.player.team[0]!.id })
  })
  it('o filtro "só combate" esconde as outras linhas', () => {
    const log = createStore([
      { tick: 1, kind: 'combat' as const, text: 'bateu' },
      { tick: 2, kind: 'reward' as const, text: 'derrotado' },
    ])
    const r = root()
    mountLog(r, ctxWith({ log }))
    expect(r.querySelectorAll('.log-line')).toHaveLength(2)
    const filter = r.querySelector<HTMLInputElement>('input[name=combat-only]')!
    filter.checked = true
    filter.dispatchEvent(new Event('change'))
    expect(r.querySelectorAll('.log-line')).toHaveLength(1)
    expect(r.textContent).toContain('bateu')
  })
})

describe('sobreposições', () => {
  it('catch-up mostra os ticks restantes e hunt parada mostra o motivo', () => {
    const hunt = createStore<HuntView>({ ...view, phase: 'catching-up', catchup: { remaining: 500 } })
    const r = root()
    mountOverlays(r, ctxWith({ hunt }))
    expect(r.querySelector('[data-remaining]')?.textContent).toBe('500 ticks restantes')
    hunt.set({ ...view, phase: 'stopped', catchup: null, stoppedInfo: { reason: 'team-fainted', healed: true } })
    expect(r.querySelector('.stopped')?.textContent).toContain('Time caído. Time curado no Centro')
    expect([...r.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Iniciar de novo', 'Voltar'])
  })
  it('um resumo novo vira toast grande', () => {
    const show = vi.fn()
    const hunt = createStore(view)
    mountOverlays(root(), ctxWith({ hunt, toasts: { show } }))
    hunt.set({ ...view, lastSummary: { ticks: 10, defeats: 2, captures: 1, captureFailures: 0, faints: 0, xpTrainer: 40, gold: 9, drops: {}, levelUps: 0, evolutions: 0, returns: 0 } })
    expect(show).toHaveBeenCalledWith(expect.stringContaining('2 derrotas'), 'big')
  })
})
