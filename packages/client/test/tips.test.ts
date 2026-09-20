import { loadContentRegistry } from '@pokeidle/shared'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../src/app-context.js'
import { applySnapshot, emptyHuntView } from '../src/state/hunt-view.js'
import { ballWarning, huntPokedexCount, tipFor } from '../src/state/tips.js'
import { createTipShower } from '../src/ui/tips.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const registry = loadContentRegistry()
const snapshot = (fixture as unknown as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }> }).snapshot
const view = applySnapshot(emptyHuntView(), snapshot)
const wildId = snapshot.state.wilds[0]!.id

describe('dicas de primeira vez', () => {
  it('uma chave por evento marcante e null para o resto', () => {
    expect(tipFor({ type: 'wildDefeated', tick: 1, wildId, speciesName: 'zubat', level: 3, xpTrainer: 1, xpPokemon: 1, gold: 1, drops: [] }, view)).toEqual({ key: 'first-defeat', text: 'Seu Pokémon caça sozinho. Você pode fechar a aba.' })
    expect(tipFor({ type: 'captured', tick: 1, wildId, speciesName: 'zubat', level: 3, ball: 'poke-ball', toBox: false }, view)?.text).toContain(`${view.state!.settings.teamSlots} vagas`)
    expect(tipFor({ type: 'itemUsed', tick: 1, itemId: 'potion', pokemonId: 'p1', hp: 9 }, view)?.key).toBe('first-potion')
    expect(tipFor({ type: 'healed', tick: 1 }, view)?.key).toBe('first-return')
    expect(tipFor({ type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, view)).toBeNull()
  })
  it('cada dica aparece uma vez só e o aviso de bolas uma vez por sessão', () => {
    const show = vi.fn()
    const store = new Map<string, string>()
    const ctx = createContext({ registry, toasts: { show }, storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v) } } })
    const shower = createTipShower(ctx)
    const defeat = { type: 'wildDefeated', tick: 1, wildId, speciesName: 'zubat', level: 3, xpTrainer: 1, xpPokemon: 1, gold: 1, drops: [] } as const
    shower(defeat, view)
    shower(defeat, view)
    expect(show).toHaveBeenCalledTimes(1)
    const lowOnBalls = { ...view, state: { ...view.state!, inventory: { 'poke-ball': 1 } } }
    const failed = { type: 'captureFailed', tick: 2, wildId, ball: 'poke-ball' } as const
    shower(failed, lowOnBalls)
    shower(failed, lowOnBalls)
    expect(show).toHaveBeenCalledWith('Compre bolas no Centro', 'info')
    expect(show).toHaveBeenCalledTimes(2)
  })
  it('ballWarning e huntPokedexCount', () => {
    expect(ballWarning(view, registry)).toBe(false)
    expect(ballWarning({ ...view, state: { ...view.state!, inventory: { 'poke-ball': 1 } } }, registry)).toBe(true)
    const area = registry.regions.get('kanto')!.areas.find((a) => a.id === 'campo-inicial')!
    const esperado = { n: area.species.includes('zubat') ? 1 : 0, m: area.species.length }
    expect(huntPokedexCount(view, [{ speciesName: 'zubat', seenAt: 'x', caughtAt: 'y' }], area.species)).toEqual(esperado)
  })
})
