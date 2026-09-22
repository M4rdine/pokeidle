import { wildAttack } from './combat.js'
import { isAdjacent } from './grid.js'
import { applyPotion, choosePotion } from './items.js'
import { stepPlayer } from './player.js'
import { applyDefeat } from './progression.js'
import { processRespawns } from './spawn.js'
import { resolveTroca } from './troca.js'
import type { EngineDeps, Event, HuntState, StepResult } from './types.js'

const chain = (a: StepResult, f: (s: HuntState) => StepResult): StepResult => { const b = f(a.state); return { state: b.state, events: [...a.events, ...b.events] } }

/**
 * Só o selvagem já engajado no tick anterior revida: quem chega ataca primeiro (GDD §3.1).
 * Exportada só para teste direto (`step.test.ts`, troca de alvo no meio da luta): construir esse
 * cenário via `step`/geometria da fixture exigiria um selvagem defendido de forma artificial, já
 * que o motor não troca de alvo com o antigo ainda vivo em nenhum caminho de produção.
 */
export function engagedWildAttack(state: HuntState, deps: EngineDeps, engagedBefore: number | null): StepResult {
  if (state.player.mode !== 'fighting' || engagedBefore === null || state.player.targetWildId !== engagedBefore) return { state, events: [] }
  const wild = state.wilds.find((w) => w.id === state.player.targetWildId)
  if (!wild || wild.hp <= 0 || !isAdjacent(state.player.position, wild.position)) return { state, events: [] }
  return wildAttack(state, deps, wild)
}

function resolveDefeats(state: HuntState, deps: EngineDeps): StepResult {
  return state.wilds.filter((w) => w.hp <= 0).reduce<StepResult>((acc, w) => chain(acc, (s) => applyDefeat(s, deps, w)), { state, events: [] })
}

function resolveFaint(state: HuntState): StepResult {
  const active = state.player.team[state.player.activeIndex]
  if (!active || active.hp > 0) return { state, events: [] }
  const fainted: Event = { type: 'pokemonFainted', tick: state.tick, pokemonId: active.id }
  const next = state.player.team.findIndex((p) => p.hp > 0)
  if (next === -1) {
    return { state: { ...state, player: { ...state.player, mode: 'stopped', targetWildId: null, path: [] } }, events: [fainted, { type: 'stopped', tick: state.tick, reason: 'team-fainted' }] }
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
  const trocado = chain(chain(defeats, resolveFaint), (s) => resolveTroca(s, deps))
  return chain(trocado, (s) => resolveLowHp(s, deps))
}

export function step(state: HuntState, deps: EngineDeps): StepResult {
  const respawned = processRespawns(state, deps)
  if (state.player.mode === 'stopped') {
    return { state: { ...respawned.state, tick: respawned.state.tick + 1 }, events: respawned.events }
  }
  const engagedBefore = state.player.mode === 'fighting' ? state.player.targetWildId : null
  const r = chain(chain(chain(respawned, (s) => stepPlayer(s, deps)), (s) => engagedWildAttack(s, deps, engagedBefore)), (s) => resolveConsequences(s, deps))
  return { state: { ...r.state, tick: r.state.tick + 1 }, events: r.events }
}
