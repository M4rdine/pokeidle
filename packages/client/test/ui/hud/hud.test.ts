import { cooldownTicks, loadRegistry } from '@pokeidle/shared'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it, vi } from 'vitest'
import type { Me } from '../../../src/api/dto.js'
import { appendLog, type LogLine } from '../../../src/state/log.js'
import { createContext, type AppContext } from '../../../src/app-context.js'
import { applySnapshot, emptyHuntView, type HuntView } from '../../../src/state/hunt-view.js'
import { initialSession, withMe } from '../../../src/state/session.js'
import { createStore } from '../../../src/state/store.js'
import { mountActivePokemon } from '../../../src/ui/hud/active-pokemon.js'
import { mountLog } from '../../../src/ui/hud/log.js'
import { mountMoves } from '../../../src/ui/hud/moves.js'
import { mountOverlays } from '../../../src/ui/hud/overlays.js'
import { mountTeamStrip } from '../../../src/ui/hud/team-strip.js'
import { mountMenu } from '../../../src/ui/hud/menu.js'
import { mountSituacao } from '../../../src/ui/hud/situacao.js'
import { mountPerfil } from '../../../src/ui/hud/perfil.js'
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
    mountPerfil(r, ctxWith())
    expect(r.querySelector('strong')?.textContent).toBe('Ash')
    expect(r.querySelector('[data-level]')?.textContent).toBe('nível 1')
    expect(r.querySelector('[data-next]')?.textContent).toContain('4 vagas no time')
    expect(r.querySelector('[data-gold]')?.textContent).toBe('0') // o ouro vem do estado da hunt
    expect(r.querySelector('[data-conn]')?.getAttribute('data-conn')).toBe('open')
  })
  it('em catch-up a conexão avisa no perfil', () => {
    // O estado da conexão mora no PERFIL: são painéis diferentes desde que a tela virou três
    // colunas, e o teste segue a separação.
    const hunt = createStore({ ...view, phase: 'catching-up' as const, catchup: { remaining: 10 } })
    const r = root()
    mountPerfil(r, ctxWith({ hunt }))
    expect(r.querySelector('[data-conn]')?.getAttribute('data-conn')).toBe('catching-up')
  })
  it('o menu só tem função que abre painel: nada de parar nem de sair', () => {
    // A fileira inteira precisa ser uma coisa só. Enquanto "Parar" e "Sair" estavam ali, a ação
    // mais cara da tela tinha o mesmo alvo e o mesmo peso de abrir a Pokédex.
    const r = root()
    mountMenu(r, ctxWith())
    const rotulos = [...r.querySelectorAll('button')].map((b) => b.textContent)
    expect(rotulos).not.toContain('Parar')
    expect(rotulos).not.toContain('Sair')
    expect(r.querySelectorAll('button[data-open]').length).toBe(rotulos.length)
  })
})

describe('parar a caçada', () => {
  it('fica no painel de situação e manda a intenção uma vez a cada 200 ms', () => {
    vi.useFakeTimers()
    const sendIntent = vi.fn()
    const hunt = createStore({ ...view, phase: 'catching-up' as const, catchup: { remaining: 10 } })
    const r = root()
    mountSituacao(r, ctxWith({ hunt, sendIntent }))
    const stop = [...r.querySelectorAll('button')].find((b) => b.textContent === 'Parar')!
    stop.click(); stop.click()
    expect(sendIntent).toHaveBeenCalledTimes(1)
    expect(sendIntent).toHaveBeenCalledWith({ t: 'hunt.stop' })
    vi.advanceTimersByTime(200)
    stop.click()
    expect(sendIntent).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
  it('sem caçada o botão some, em vez de ficar desabilitado', () => {
    // Desabilitado promete uma ação esperando alguma condição. Aqui não há ação nenhuma: não
    // existe caçada para encerrar, e o controle morto era o que ele era no menu antigo.
    const r = root()
    mountSituacao(r, ctxWith({ hunt: createStore(emptyHuntView()) }))
    const stop = [...r.querySelectorAll('button')].find((b) => b.textContent === 'Parar')!
    expect(stop.hidden).toBe(true)
  })
})

describe('cartão do ativo e golpes', () => {
  it('mostra nome, nível e HP do ativo', () => {
    const r = root()
    mountActivePokemon(r, ctxWith())
    // Nome e nível são nós separados: o nível é valor e não vai na face de HUD, que confunde
    // 5 com 8 — "L65" saía na tela como "L68".
    expect(r.querySelector('[data-name]')?.textContent).toBe('Charmander')
    expect(r.querySelector('[data-level]')?.textContent).toBe('nv 10')
    const hp = r.querySelector('[data-hp]')!
    expect(hp.getAttribute('value')).toBe(String(view.state!.player.team[0]!.hp))
    expect(r.querySelector('[data-hp-text]')?.textContent).toContain('/')
  })
  it('atualiza o HP no mesmo nó, sem remontar o cartão a cada tique', () => {
    const hunt = createStore(view)
    const r = root()
    mountActivePokemon(r, ctxWith({ hunt }))
    const bar = r.querySelector('[data-hp]')!
    const title = r.querySelector('[data-name]')!
    const team = view.state!.player.team
    hunt.set({ ...view, state: { ...view.state!, player: { ...view.state!.player, team: [{ ...team[0]!, hp: 3 }] } } })
    expect(r.querySelector('[data-hp]')).toBe(bar) // mesmo nó
    expect(r.querySelector('[data-name]')).toBe(title)
    expect(bar.getAttribute('value')).toBe('3')
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
  it('continua recebendo linhas depois que o store atinge o teto de 200', () => {
    const start = Array.from({ length: 200 }, (_unused, i) => ({ tick: i, kind: 'combat' as const, text: `l${i}` }))
    const log = createStore<readonly LogLine[]>(start)
    const r = root()
    mountLog(r, ctxWith({ log }))
    expect(r.querySelectorAll('.log-line')).toHaveLength(200)
    for (let i = 200; i < 205; i++) log.set(appendLog(log.get(), { tick: i, kind: 'combat', text: `l${i}` }))
    const lines = [...r.querySelectorAll('.log-line')].map((node) => node.textContent)
    expect(lines).toHaveLength(200)
    expect(lines.at(-1)).toBe('l204') // o store rotaciona: a tela precisa acompanhar
    expect(lines[0]).toBe('l5')
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
