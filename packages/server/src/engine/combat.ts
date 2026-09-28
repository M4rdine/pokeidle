import { availableMoves, bestMove, bonusDaBola, computeDamage, cooldownTicks, expectedDamage, rollCapture, statsAt, xpForLevel, type Combatant, type ContextoDeCaptura, type Item, type Move, type Registry } from '@pokeidle/shared'
import { BALL_ITEM_BY_TIER } from './constants.js'
import { removeWild } from './progression.js'
import type { EngineDeps, Event, HuntState, PokemonState, StepResult, WildState } from './types.js'

export type AttackOutcome = 'hit' | 'none' | 'immune'
export interface AttackResult extends StepResult { readonly outcome: AttackOutcome }

function species(registry: Registry, name: string) {
  const s = registry.species.get(name)
  if (!s) throw new Error(`espécie ${name} não existe no registro`)
  return s
}

export function combatantOf(registry: Registry, speciesName: string, level: number): Combatant {
  const s = species(registry, speciesName)
  return { level, types: s.types, stats: statsAt(s.baseStats, level) }
}

export function readyMoves(registry: Registry, speciesName: string, level: number, cooldowns: Readonly<Record<string, number>>, tick: number): Move[] {
  return availableMoves(species(registry, speciesName), level, registry.moves).filter((m) => (cooldowns[m.name] ?? 0) <= tick)
}

interface Strike { readonly move: Move; readonly damage: number }

function strike(deps: EngineDeps, tick: number, attacker: { speciesName: string; level: number; cooldowns: Readonly<Record<string, number>> }, defender: { speciesName: string; level: number }): { outcome: AttackOutcome; strike?: Strike } {
  const ready = readyMoves(deps.registry, attacker.speciesName, attacker.level, attacker.cooldowns, tick)
  if (ready.length === 0) return { outcome: 'none' }
  const atk = combatantOf(deps.registry, attacker.speciesName, attacker.level)
  const def = combatantOf(deps.registry, defender.speciesName, defender.level)
  const move = bestMove(ready, atk, def, deps.registry.typeChart)
  if (!move || expectedDamage(atk, def, move, deps.registry.typeChart) === 0) return { outcome: 'immune' }
  return { outcome: 'hit', strike: { move, damage: computeDamage({ attacker: atk, defender: def, move, chart: deps.registry.typeChart, rng: deps.rng }) } }
}

const activeOf = (state: HuntState): PokemonState => {
  const p = state.player.team[state.player.activeIndex]
  if (!p) throw new Error('sem Pokémon ativo')
  return p
}

export function playerAttack(state: HuntState, deps: EngineDeps, wild: WildState): AttackResult {
  const active = activeOf(state)
  const result = strike(deps, state.tick, { ...active, cooldowns: state.player.cooldowns }, wild)
  if (result.outcome !== 'hit' || !result.strike) return { state, events: [], outcome: result.outcome }
  const { move, damage } = result.strike
  const hp = Math.max(0, wild.hp - damage)
  const event: Event = { type: 'attack', tick: state.tick, attacker: 'player', attackerId: active.id, targetId: String(wild.id), move: move.name, damage, targetHp: hp }
  return {
    state: {
      ...state,
      wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, hp } : w)),
      player: { ...state.player, cooldowns: { ...state.player.cooldowns, [move.name]: state.tick + cooldownTicks(move) } },
    },
    events: [event], outcome: 'hit',
  }
}

export function wildAttack(state: HuntState, deps: EngineDeps, wild: WildState): AttackResult {
  const active = activeOf(state)
  const result = strike(deps, state.tick, wild, active)
  if (result.outcome !== 'hit' || !result.strike) return { state, events: [], outcome: result.outcome }
  const { move, damage } = result.strike
  const hp = Math.max(0, active.hp - damage)
  const team = state.player.team.map((p, i) => (i === state.player.activeIndex ? { ...p, hp } : p))
  const event: Event = { type: 'attack', tick: state.tick, attacker: 'wild', attackerId: String(wild.id), targetId: active.id, move: move.name, damage, targetHp: hp }
  return {
    state: {
      ...state,
      player: { ...state.player, team },
      wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, cooldowns: { ...w.cooldowns, [move.name]: state.tick + cooldownTicks(move) } } : w)),
    },
    events: [event], outcome: 'hit',
  }
}

/** O que a bola precisa saber do encontro. Tudo sai do estado que já existe. */
export function contextoDeCaptura(state: HuntState, registry: Registry, wild: WildState): ContextoDeCaptura {
  return {
    // "Intacto" é o primeiro turno sem precisar contar turnos: o selvagem ainda não levou golpe.
    intacto: wild.hp >= wild.hpMax,
    tipos: registry.species.get(wild.speciesName)?.types ?? [],
    nivel: wild.level,
    jaNaPokedex: state.settings.seen.includes(wild.speciesName),
  }
}

/**
 * A bola da vez. Com `ballTier: 'best'`, "melhor" passou a significar melhor NESTE ENCONTRO — e
 * é aí que a bola situacional rende num idle: o motor escolhe a Rede contra um Tentacool e a
 * Rápida contra um selvagem que acabou de aparecer, sozinho, a cada captura, sem o jogador estar
 * na tela. Antes ele comparava um número fixo, e depois da Ultra Bola nenhuma outra era usada.
 */
export function selectBall(state: HuntState, registry: Registry, wild?: WildState): Item | null {
  const tier = state.settings.capture.ballTier
  const has = (id: string) => (state.inventory[id] ?? 0) > 0
  if (tier !== 'best') { const item = registry.items.get(BALL_ITEM_BY_TIER[tier]); return item && item.kind === 'ball' && has(item.id) ? item : null }
  const balls = [...registry.items.values()].filter((i): i is Item & { kind: 'ball' } => i.kind === 'ball' && has(i.id))
  // Sem selvagem em mãos (a loja pergunta pela melhor bola fora de combate), o contexto neutro
  // devolve o chão de cada uma — que é a comparação antiga, e continua correta ali.
  const ctx: ContextoDeCaptura = wild
    ? contextoDeCaptura(state, registry, wild)
    : { intacto: false, tipos: [], nivel: Number.MAX_SAFE_INTEGER, jaNaPokedex: false }
  return balls.reduce<{ item: Item; bonus: number } | null>((melhor, i) => {
    const bonus = bonusDaBola(i, ctx)
    return melhor === null || bonus > melhor.bonus ? { item: i, bonus } : melhor
  }, null)?.item ?? null
}

export function captureApplies(state: HuntState, registry: Registry, wild: WildState): Item | null {
  if (wild.captureTried) return null
  if ((wild.hp / wild.hpMax) * 100 > state.settings.capture.maxWildHpPercent) return null
  if (!state.settings.capture.allowDuplicates && state.settings.seen.includes(wild.speciesName)) return null
  return selectBall(state, registry, wild)
}

export function attemptCapture(state: HuntState, deps: EngineDeps, wild: WildState, ball: Item): StepResult {
  if (ball.kind !== 'ball') throw new Error(`${ball.id} não é uma bola`)
  const s = species(deps.registry, wild.speciesName)
  const inventory = { ...state.inventory, [ball.id]: (state.inventory[ball.id] ?? 0) - 1 }
  // O bônus da ROLAGEM é o efetivo, não o de chão: escolher a Bola Rede pelo contexto e depois
  // rolar com o bônus fixo dela tornaria a escolha decorativa.
  const bonus = bonusDaBola(ball, contextoDeCaptura(state, deps.registry, wild))
  const caught = rollCapture({ captureRate: s.captureRate, hpMax: wild.hpMax, hpCurrent: wild.hp, ballBonus: bonus }, deps.rng)
  if (!caught) {
    return {
      state: { ...state, inventory, wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, captureTried: true } : w)) },
      events: [{ type: 'captureFailed', tick: state.tick, wildId: wild.id, ball: ball.id }],
    }
  }
  const toBox = state.player.team.length >= state.settings.teamSlots
  const pokemon: PokemonState = { id: `${state.sessionId}-w${wild.id}`, speciesName: wild.speciesName, level: wild.level, xp: xpForLevel(s.growthRate, wild.level), hp: wild.hp, hpMax: wild.hpMax }
  const seen = state.settings.seen.includes(wild.speciesName) ? state.settings.seen : [...state.settings.seen, wild.speciesName]
  const removed = removeWild({ ...state, inventory }, deps, wild)
  return {
    state: {
      ...removed,
      settings: { ...removed.settings, seen },
      box: toBox ? [...removed.box, pokemon] : removed.box,
      player: { ...removed.player, team: toBox ? removed.player.team : [...removed.player.team, pokemon] },
    },
    events: [{ type: 'captured', tick: state.tick, wildId: wild.id, speciesName: wild.speciesName, level: wild.level, ball: ball.id, toBox }],
  }
}
