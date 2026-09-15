import { cooldownTicks, hpAt, STRUGGLE, xpForLevel, type Registry } from '@pokeidle/shared'
import type { Event, HuntState, PokemonState, ServerMessage, SessionInfo, StopReason, Summary, WildState } from '@pokeidle/shared/protocol'

export type Phase = 'idle' | 'catching-up' | 'active' | 'stopped'
export interface Derived { readonly cooldownUntil: Readonly<Record<string, number>>; readonly targetWildId: number | null }
export interface HuntView {
  readonly session: SessionInfo | null; readonly state: HuntState | null; readonly serverTime: number; readonly tick: number
  readonly phase: Phase; readonly catchup: { readonly remaining: number } | null; readonly lastSummary: Summary | null
  readonly stoppedInfo: { readonly reason: StopReason; readonly healed: boolean } | null; readonly derived: Derived
}
type Snapshot = Extract<ServerMessage, { t: 'hunt.snapshot' }>
type Player = HuntState['player']

export const emptyHuntView = (): HuntView => ({ session: null, state: null, serverTime: 0, tick: 0, phase: 'idle', catchup: null, lastSummary: null, stoppedInfo: null, derived: { cooldownUntil: {}, targetWildId: null } })

export const activePokemon = (view: HuntView): PokemonState | null => view.state?.player.team[view.state.player.activeIndex] ?? null

const withState = (view: HuntView, state: HuntState): HuntView => ({ ...view, state })
const withPlayer = (view: HuntView, patch: Partial<Player>): HuntView => withState(view, { ...view.state!, player: { ...view.state!.player, ...patch } })
const withDerived = (view: HuntView, patch: Partial<Derived>): HuntView => ({ ...view, derived: { ...view.derived, ...patch } })
const mapTeam = (view: HuntView, id: string, fn: (p: PokemonState) => PokemonState): HuntView => withPlayer(view, { team: view.state!.player.team.map((p) => (p.id === id ? fn(p) : p)) })
const mapWild = (view: HuntView, id: number, fn: (w: WildState) => WildState): HuntView => withState(view, { ...view.state!, wilds: view.state!.wilds.map((w) => (w.id === id ? fn(w) : w)) })
const removeWild = (view: HuntView, id: number): HuntView => withState(view, { ...view.state!, wilds: view.state!.wilds.filter((w) => w.id !== id) })
const addItem = (view: HuntView, itemId: string, delta: number): HuntView => withState(view, { ...view.state!, inventory: { ...view.state!.inventory, [itemId]: (view.state!.inventory[itemId] ?? 0) + delta } })
const clearTarget = (view: HuntView): HuntView => withDerived(withPlayer(view, { targetWildId: null }), { targetWildId: null })
const baseHp = (registry: Registry, speciesName: string): number => registry.species.get(speciesName)?.baseStats.hp ?? 1
const growthOf = (registry: Registry, speciesName: string) => registry.species.get(speciesName)?.growthRate ?? 'medium-fast'

export function applySnapshot(view: HuntView, msg: Snapshot): HuntView {
  const s = msg.state
  return { ...view, session: msg.session, state: s, serverTime: msg.serverTime, tick: s.tick, phase: s.player.mode === 'stopped' ? 'stopped' : 'active', catchup: null, derived: { cooldownUntil: { ...s.player.cooldowns }, targetWildId: s.player.targetWildId } }
}

function rescale(p: PokemonState, hpMax: number): PokemonState { return { ...p, hpMax, hp: Math.max(0, Math.min(hpMax, p.hp + (hpMax - p.hpMax))) } }

function capture(view: HuntView, e: Extract<Event, { type: 'captured' }>, registry: Registry): HuntView {
  const s = view.state!
  const wild = s.wilds.find((w) => w.id === e.wildId)
  const hpMax = wild?.hpMax ?? hpAt(baseHp(registry, e.speciesName), e.level)
  const caught: PokemonState = { id: `${s.sessionId}-w${e.wildId}`, speciesName: e.speciesName, level: e.level, xp: xpForLevel(growthOf(registry, e.speciesName), e.level), hp: wild?.hp ?? hpMax, hpMax }
  const seen = s.settings.seen.includes(e.speciesName) ? s.settings.seen : [...s.settings.seen, e.speciesName]
  const next = removeWild(addItem(view, e.ball, -1), e.wildId)
  const st = next.state!
  const placed = e.toBox ? { ...st, box: [...st.box, caught] } : { ...st, player: { ...st.player, team: [...st.player.team, caught] } }
  return clearTarget(withState(next, { ...placed, settings: { ...placed.settings, seen } }))
}

/** Uma linha por tipo de evento (spec §4). Puro: devolve um view novo. */
export function applyEvent(view: HuntView, e: Event, registry: Registry): HuntView {
  if (!view.state) return view
  const s = view.state
  switch (e.type) {
    case 'spawned': {
      // spawnIndex: -1 — o cliente não conhece o índice do ponto de spawn no mapa, só o motor.
      const hpMax = hpAt(baseHp(registry, e.speciesName), e.level)
      return withState(view, { ...s, wilds: [...s.wilds, { id: e.wildId, spawnIndex: -1, speciesName: e.speciesName, level: e.level, hp: hpMax, hpMax, position: e.position, cooldowns: {}, captureTried: false }] })
    }
    case 'moved': return withPlayer(view, { position: e.to, mode: 'walking' })
    case 'attack': {
      if (e.attacker === 'wild') return mapTeam(view, e.targetId, (p) => ({ ...p, hp: e.targetHp }))
      const wildId = Number(e.targetId)
      const move = registry.moves.get(e.move) ?? STRUGGLE
      const readyAt = e.tick + cooldownTicks(move)
      const hit = withPlayer(mapWild(view, wildId, (w) => ({ ...w, hp: e.targetHp })), { mode: 'fighting', targetWildId: wildId, cooldowns: { ...s.player.cooldowns, [e.move]: readyAt } })
      return withDerived(hit, { targetWildId: wildId, cooldownUntil: { ...view.derived.cooldownUntil, [e.move]: readyAt } })
    }
    case 'wildDefeated': {
      const active = activePokemon(view)
      const rewarded = withState(view, { ...s, trainer: { xp: s.trainer.xp + e.xpTrainer, gold: s.trainer.gold + e.gold } })
      const dropped = e.drops.reduce((v, d) => addItem(v, d.item, d.quantity), rewarded)
      const xped = active ? mapTeam(dropped, active.id, (p) => ({ ...p, xp: p.xp + e.xpPokemon })) : dropped
      return clearTarget(removeWild(xped, e.wildId))
    }
    case 'captured': return capture(view, e, registry)
    case 'captureFailed': return addItem(view, e.ball, -1)
    case 'pokemonFainted': return mapTeam(view, e.pokemonId, (p) => ({ ...p, hp: 0 }))
    case 'switched': {
      const index = s.player.team.findIndex((p) => p.id === e.pokemonId)
      // Id desconhecido (espelho fora de sincronia): mantém o ativo até o próximo snapshot corrigir.
      if (index < 0) return view
      return withDerived(withPlayer(view, { activeIndex: index, cooldowns: {} }), { cooldownUntil: {} })
    }
    case 'levelUp': return mapTeam(view, e.pokemonId, (p) => rescale({ ...p, level: e.level }, hpAt(baseHp(registry, p.speciesName), e.level)))
    case 'evolved': return mapTeam(view, e.pokemonId, (p) => rescale({ ...p, speciesName: e.to }, hpAt(baseHp(registry, e.to), p.level)))
    case 'itemUsed': return addItem(mapTeam(view, e.pokemonId, (p) => ({ ...p, hp: e.hp })), e.itemId, -1)
    case 'returning': return clearTarget(withPlayer(view, { mode: 'returning' }))
    case 'healed': return withDerived(withPlayer(view, { mode: 'searching', team: s.player.team.map((p) => ({ ...p, hp: p.hpMax })), cooldowns: {} }), { cooldownUntil: {} })
    // healed: false é placeholder — o valor real chega depois no `hunt.stopped` (evento `stopped` não carrega essa info).
    case 'stopped': return { ...clearTarget(withPlayer(view, { mode: 'stopped' })), phase: 'stopped', stoppedInfo: { reason: e.reason, healed: false } }
    case 'skipped': return clearTarget(view)
  }
}

export function applyServerMessage(view: HuntView, msg: ServerMessage, registry: Registry): HuntView {
  switch (msg.t) {
    case 'hunt.snapshot': return applySnapshot(view, msg)
    case 'hunt.tick': {
      // state.tick precisa avançar junto com view.tick — Task 9 lê os dois.
      const ticked = { ...view, state: view.state && { ...view.state, tick: msg.tick }, tick: msg.tick, serverTime: msg.serverTime }
      return msg.events.reduce((v, e) => applyEvent(v, e, registry), ticked)
    }
    case 'hunt.catchup': return { ...view, phase: 'catching-up', catchup: { remaining: msg.ticksRemaining } }
    case 'hunt.summary': return { ...view, lastSummary: msg.summary }
    case 'hunt.stopped': return { ...view, phase: 'stopped', catchup: null, stoppedInfo: { reason: msg.reason, healed: msg.healed } }
    case 'hunt.idle': return { ...emptyHuntView(), lastSummary: view.lastSummary, stoppedInfo: view.stoppedInfo }
    case 'error': case 'pong': return view
  }
}
