import { HEAL_TICKS } from './constants.js'
import { alcanceDe, availableMoves, type Move } from '@pokeidle/shared'
import { attemptCapture, captureApplies, playerAttack } from './combat.js'
import { findPath, floodFrom, inBounds, isAdjacent, manhattan, neighbors, pathFromFlood, samePoint, temLinhaDeVisao } from './grid.js'
import { blockedAt, isWalkable } from './spawn.js'
import type { EngineDeps, Event, HuntState, PlayerState, Point, StepResult, WildState } from './types.js'

const withPlayer = (state: HuntState, patch: Partial<PlayerState>): HuntState => ({ ...state, player: { ...state.player, ...patch } })
const idle = (state: HuntState): StepResult => ({ state, events: [] })
const toSearching = (state: HuntState): HuntState => withPlayer(state, { mode: 'searching', targetWildId: null, path: [] })

function pathTo(state: HuntState, deps: EngineDeps, target: Point, isGoal: (p: Point) => boolean, ignoreWildId: number | null): Point[] | null {
  const isBlocked = (p: Point): boolean => blockedAt(deps.hunt, p) || state.wilds.some((w) => w.id !== ignoreWildId && samePoint(w.position, p)) || (ignoreWildId !== null && samePoint(target, p))
  return findPath({ from: state.player.position, target, isBlocked, isGoal, width: deps.hunt.width, height: deps.hunt.height })
}

/**
 * Alvo mais próximo por uma única busca em largura a partir da posição do jogador (em vez de um
 * A* por selvagem candidato): monta o mapa de bloqueio uma vez, inunda a partir do jogador e, para
 * cada selvagem vivo não ignorado, olha a menor distância entre os seus vizinhos em bounds.
 */
export function pickTarget(state: HuntState, deps: EngineDeps): { wildId: number; path: Point[] } | null {
  const { width, height } = deps.hunt
  const candidates = state.wilds.filter((w) => w.hp > 0 && !state.player.skippedWildIds.includes(w.id))
  if (candidates.length === 0) return null
  const isBlocked = (p: Point): boolean => blockedAt(deps.hunt, p) || state.wilds.some((w) => samePoint(w.position, p))
  const flood = floodFrom({ from: state.player.position, isBlocked, width, height })
  const floodKey = (p: Point): number => p.y * width + p.x

  let best: { wildId: number; distance: number; neighbor: Point } | null = null
  for (const w of [...candidates].sort((a, b) => a.id - b.id)) {
    let nearest: Point | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const n of neighbors(w.position)) {
      if (!inBounds(n, width, height)) continue
      const d = flood.dist.get(floodKey(n))
      if (d !== undefined && d < nearestDistance) { nearestDistance = d; nearest = n }
    }
    if (nearest && (best === null || nearestDistance < best.distance)) best = { wildId: w.id, distance: nearestDistance, neighbor: nearest }
  }
  if (!best) return null
  const path = pathFromFlood(flood, state.player.position, best.neighbor, width)
  return path && { wildId: best.wildId, path }
}

const targetOf = (state: HuntState): WildState | undefined => state.wilds.find((w) => w.id === state.player.targetWildId && w.hp > 0)

/**
 * Dá para acertar o selvagem DAQUI?
 *
 * O ALCANCE VALE PARA OS DOIS LADOS, e isso não é generosidade: quando só o selvagem atirava, o
 * jogador levava dano de graça durante toda a aproximação — a Brasa do Charmander dele ficava
 * inútil enquanto a do selvagem acertava. A medição mostrou o tamanho disso: com o alcance só de
 * um lado, três áreas do fim do jogo perdiam entre 20% e 43% do rendimento.
 *
 * A RECARGA NÃO ENTRA AQUI, e essa distinção custou um bug: esta pergunta é sobre POSIÇÃO, e a
 * posição não muda porque um golpe está esfriando. Quando a recarga entrava, o jogador com todos
 * os golpes quentes achava que não alcançava, saía de combate, dava um passo, voltava — e ficava
 * oscilando sem bater em ninguém. O que a recarga decide é QUAL golpe sai, e isso é `strike`.
 *
 * Linha de visão pelo mesmo motivo do selvagem: não se atira através da rocha.
 */
function acertaDaqui(state: HuntState, deps: EngineDeps, wild: WildState): boolean {
  const active = state.player.team[state.player.activeIndex]
  if (!active) return false
  if (!temLinhaDeVisao(state.player.position, wild.position, (p) => blockedAt(deps.hunt, p))) return false
  const especie = deps.registry.species.get(active.speciesName)
  if (!especie) return false
  const distancia = manhattan(state.player.position, wild.position)
  return availableMoves(especie, active.level, deps.registry.moves).some((m) => alcanceDe(m) >= distancia)
}

/** A peneira de alcance passada ao golpe: o que sai daqui, entre os que já esfriaram. */
const daqui = (state: HuntState, wild: WildState) => (m: Move): boolean =>
  alcanceDe(m) >= manhattan(state.player.position, wild.position)

function searching(state: HuntState, deps: EngineDeps): StepResult {
  const target = pickTarget(state, deps)
  if (!target) return idle(state)
  return idle(withPlayer(state, { targetWildId: target.wildId, path: target.path, mode: target.path.length === 0 ? 'fighting' : 'walking' }))
}

function advance(state: HuntState, next: Point, rest: readonly Point[]): StepResult {
  const from = state.player.position
  const event: Event = { type: 'moved', tick: state.tick, from, to: next }
  return { state: withPlayer(state, { position: next, path: rest }), events: [event] }
}

function walking(state: HuntState, deps: EngineDeps): StepResult {
  const wild = targetOf(state)
  if (!wild) return idle(toSearching(state))
  /*
   * A PRESA ANDA AGORA, e o caminho envelhece.
   *
   * Ele foi traçado até um vizinho de onde o selvagem ESTAVA. Quando o bicho se move, seguir o
   * caminho velho leva o jogador ao lugar errado, e só ao chegar ele descobre que não está
   * adjacente — volta a `searching`, re-escolhe alvo e perde os tiques da ida inteira. Medindo,
   * era isso que fazia a caçada render menos com selvagens móveis: não o dano a mais, o tempo
   * jogado fora indo aonde ninguém está.
   */
  const fim = state.player.path[state.player.path.length - 1]
  const velho = fim !== undefined && !isAdjacent(fim, wild.position)
  let caminho = state.player.path
  if (velho) {
    // Refazer E ANDAR no mesmo tique. Refazer e esperar custaria um tique por movimento da presa,
    // e é uma parada a cada quatro tiques — o suficiente para a caçada render medidamente menos.
    const refeito = pathTo(state, deps, wild.position, (p) => isAdjacent(p, wild.position), wild.id)
    if (refeito === null) return idle(toSearching(state))
    caminho = refeito
  }
  const [next, ...rest] = caminho
  if (!next) return isAdjacent(state.player.position, wild.position) ? idle(withPlayer(state, { mode: 'fighting', path: [] })) : idle(toSearching(state))
  if (!isWalkable(state, deps.hunt, next)) {
    const path = pathTo(state, deps, wild.position, (p) => isAdjacent(p, wild.position), wild.id)
    return path === null ? idle(toSearching(state)) : idle(withPlayer(state, { path }))
  }
  // Já dá para acertar daqui? Então ataca ANDANDO — parar para depois atacar no tique seguinte
  // devolveria ao selvagem o tique que a simetria de alcance veio corrigir.
  if (acertaDaqui(state, deps, wild)) return fighting(withPlayer(state, { mode: 'fighting', path: [] }), deps)
  const moved = advance(state, next, rest)
  const arrived = isAdjacent(next, wild.position)
  return { state: arrived ? withPlayer(moved.state, { mode: 'fighting', path: [] }) : moved.state, events: moved.events }
}

function fighting(state: HuntState, deps: EngineDeps): StepResult {
  const wild = targetOf(state)
  if (!wild) return idle(toSearching(state))
  if (!acertaDaqui(state, deps, wild)) return idle(withPlayer(state, { mode: 'walking', path: [] }))
  const ball = captureApplies(state, deps.registry, wild)
  if (ball) return attemptCapture(state, deps, wild, ball)
  const attack = playerAttack(state, deps, wild, daqui(state, wild))
  if (attack.outcome !== 'immune') return attack
  const skipped: Event = { type: 'skipped', tick: state.tick, wildId: wild.id }
  return { state: toSearching(withPlayer(state, { skippedWildIds: [...state.player.skippedWildIds, wild.id] })), events: [skipped] }
}

function stopNoRoute(state: HuntState): StepResult {
  const event: Event = { type: 'stopped', tick: state.tick, reason: 'no-route' }
  return { state: withPlayer(state, { mode: 'stopped', targetWildId: null, path: [] }), events: [event] }
}

function returning(state: HuntState, deps: EngineDeps): StepResult {
  const center = deps.hunt.pokecenter
  const atCenter = (p: Point) => samePoint(p, center) || isAdjacent(p, center)
  if (atCenter(state.player.position)) return idle(withPlayer(state, { mode: 'healing', healingUntilTick: state.tick + HEAL_TICKS, path: [] }))
  if (state.player.path.length > 0) {
    const [next, ...rest] = state.player.path
    if (next && isWalkable(state, deps.hunt, next)) return advance(state, next, rest)
    return idle(withPlayer(state, { path: [] }))
  }
  /*
   * SELVAGEM NÃO É PAREDE, e tratá-lo como parede encerrava a caçada.
   *
   * O caminho de volta é traçado desviando dos selvagens, o que é certo enquanto houver desvio.
   * Num corredor de caverna não há: um bicho na passagem zerava a rota, o motor dava
   * `no-route` e a hunt ACABAVA com o time inteiro de pé. Medido nos mapas novos: três cavernas
   * paravam assim, com uma derrota em dez minutos.
   *
   * A segunda tentativa ignora os selvagens. O caminho passa a existir, e quem resolve o encontro
   * é o passo a passo: `isWalkable` vê o bicho no próximo tile e o jogador espera ele sair — que é
   * o que um jogador faria. Parar de verdade fica para o isolamento GEOMÉTRICO, que é o caso que
   * `stopNoRoute` existe para cobrir.
   */
  const semSelvagens = (p: Point): boolean => blockedAt(deps.hunt, p)
  const path = pathTo(state, deps, center, atCenter, null)
    ?? findPath({ from: state.player.position, target: center, isBlocked: semSelvagens, isGoal: atCenter, width: deps.hunt.width, height: deps.hunt.height })
  if (path === null) return stopNoRoute(state)
  const [next, ...rest] = path
  if (!next || !isWalkable(state, deps.hunt, next)) return idle(withPlayer(state, { path: [] }))
  return advance(state, next, rest)
}

function healing(state: HuntState): StepResult {
  if (state.player.healingUntilTick === null || state.tick < state.player.healingUntilTick) return idle(state)
  const team = state.player.team.map((p) => ({ ...p, hp: p.hpMax }))
  return { state: withPlayer(state, { team, mode: 'searching', healingUntilTick: null, skippedWildIds: [] }), events: [{ type: 'healed', tick: state.tick }] }
}

export function stepPlayer(state: HuntState, deps: EngineDeps): StepResult {
  switch (state.player.mode) {
    case 'searching': return searching(state, deps)
    case 'walking': return walking(state, deps)
    case 'fighting': return fighting(state, deps)
    case 'returning': return returning(state, deps)
    case 'healing': return healing(state)
    case 'stopped': return idle(state)
  }
}
