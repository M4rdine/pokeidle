
import { applyPotion, choosePotion, chooseRevive } from './items.js'
import { stepPlayer } from './player.js'
import { applyDefeat } from './progression.js'
import { processRespawns } from './spawn.js'
import { resolveTroca } from './troca.js'
import { stepWilds } from './wild-ai.js'
import type { EngineDeps, Event, HuntState, StepResult } from './types.js'

const chain = (a: StepResult, f: (s: HuntState) => StepResult): StepResult => { const b = f(a.state); return { state: b.state, events: [...a.events, ...b.events] } }

function resolveDefeats(state: HuntState, deps: EngineDeps): StepResult {
  return state.wilds.filter((w) => w.hp <= 0).reduce<StepResult>((acc, w) => chain(acc, (s) => applyDefeat(s, deps, w)), { state, events: [] })
}

/**
 * O REVIVER é de último recurso, e isso é o desenho.
 *
 * Ele só entra quando não sobrou ninguém de pé. Enquanto houver um Pokémon inteiro no banco,
 * trocar é de graça e reviver é caro — gastar o item ali seria queimar ouro para evitar o que o
 * motor já faz sozinho.
 *
 * Quem volta é o PRIMEIRO do time, e ele entra em campo na hora: a caçada precisa continuar no
 * mesmo tique, senão o jogador que estava fora perde as horas seguintes do mesmo jeito.
 */
function resolveReviver(state: HuntState, deps: EngineDeps, caido: Event): StepResult | null {
  const item = chooseRevive(state, deps.registry)
  if (!item || item.kind !== 'revive') return null
  const alvo = state.player.team[0]
  if (!alvo) return null
  const hp = Math.min(alvo.hpMax, Math.max(1, Math.ceil((alvo.hpMax * item.healPercent) / 100)))
  const team = state.player.team.map((p, i) => (i === 0 ? { ...p, hp } : p))
  const revived: Event = { type: 'revived', tick: state.tick, pokemonId: alvo.id, itemId: item.id, hp }
  return {
    state: {
      ...state,
      inventory: { ...state.inventory, [item.id]: (state.inventory[item.id] ?? 0) - 1 },
      player: { ...state.player, team, activeIndex: 0, cooldowns: {}, skippedWildIds: [] },
    },
    events: [caido, revived],
  }
}

function resolveFaint(state: HuntState, deps: EngineDeps): StepResult {
  const active = state.player.team[state.player.activeIndex]
  if (!active || active.hp > 0) return { state, events: [] }
  const fainted: Event = { type: 'pokemonFainted', tick: state.tick, pokemonId: active.id }
  const next = state.player.team.findIndex((p) => p.hp > 0)
  if (next === -1) {
    // Time inteiro no chão: antes de encerrar, tenta o Reviver. Era aqui que a caçada morria, e
    // a medição de balanceamento mostrou que é o defeito mais caro do jogo.
    return resolveReviver(state, deps, fainted)
      ?? { state: { ...state, player: { ...state.player, mode: 'stopped', targetWildId: null, path: [] } }, events: [fainted, { type: 'stopped', tick: state.tick, reason: 'team-fainted' }] }
  }
  const switched: Event = { type: 'switched', tick: state.tick, pokemonId: state.player.team[next]!.id }
  return { state: { ...state, player: { ...state.player, activeIndex: next, cooldowns: {}, skippedWildIds: [] } }, events: [fainted, switched] }
}

function resolveLowHp(state: HuntState, deps: EngineDeps): StepResult {
  const active = state.player.team[state.player.activeIndex]
  const mode = state.player.mode
  if (!active || active.hp <= 0 || !(mode === 'searching' || mode === 'walking' || mode === 'fighting')) return { state, events: [] }
  const hpPercent = (active.hp / active.hpMax) * 100
  if (hpPercent < state.settings.potionHpPercent) {
    const potion = choosePotion(state, deps.registry, active)
    if (potion) {
      const r = applyPotion(state, deps.registry, potion.id)
      // Erro de applyPotion (estoque zerado entre a escolha e a aplicação etc.) é engolido de
      // propósito aqui: o tick segue como se não houvesse poção, sem lançar nem entrar em returning.
      return 'error' in r ? { state, events: [] } : r
    }
  }
  if (hpPercent >= state.settings.returnHpPercent) return { state, events: [] }
  return { state: { ...state, player: { ...state.player, mode: 'returning', targetWildId: null, path: [] } }, events: [{ type: 'returning', tick: state.tick }] }
}

const clearSkippedOnGrowth = (result: StepResult): StepResult => {
  const grew = result.events.some((e) => e.type === 'levelUp' || e.type === 'evolved')
  if (!grew) return result
  return { ...result, state: { ...result.state, player: { ...result.state.player, skippedWildIds: [] } } }
}

/*
 * A escada de decisão, e a ORDEM importa em cada degrau.
 *
 * A troca entra DEPOIS do desmaio — quem já caiu não escolhe, o substituto é o primeiro vivo — e
 * ANTES da poção, que é o ponto do desenho: no confronto perdido, curar é jogar poção fora. Era o
 * que o motor fazia na `usina-velha`, onde 20% de cura respondia a 83% de dano por golpe.
 */
export function resolveConsequences(state: HuntState, deps: EngineDeps): StepResult {
  const defeats = clearSkippedOnGrowth(resolveDefeats(state, deps))
  const trocado = chain(chain(defeats, (s) => resolveFaint(s, deps)), (s) => resolveTroca(s, deps))
  return chain(trocado, (s) => resolveLowHp(s, deps))
}

export function step(state: HuntState, deps: EngineDeps): StepResult {
  const respawned = processRespawns(state, deps)
  if (state.player.mode === 'stopped') {
    return { state: { ...respawned.state, tick: respawned.state.tick + 1 }, events: respawned.events }
  }
  /*
   * ONDE O JOGADOR ESTAVA NO INÍCIO DO TIQUE. É o que os selvagens usam para decidir se atacam:
   * aproximar-se nunca leva porrada no mesmo tique da chegada. Ver `wild-ai.ts`.
   */
  const alvoAntes = state.player.position
  const r = chain(chain(chain(respawned, (s) => stepPlayer(s, deps)), (s) => stepWilds(s, deps, alvoAntes)), (s) => resolveConsequences(s, deps))
  return { state: { ...r.state, tick: r.state.tick + 1 }, events: r.events }
}
