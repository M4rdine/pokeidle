/**
 * A cabeça do selvagem.
 *
 * ANTES ELE ERA UMA ESTÁTUA. Nascia numa célula, ficava ali para sempre, e só revidava se o
 * jogador tivesse ido até ele e o engajado no tique anterior. A caçada era uma fila de sacos de
 * pancada paradas — o jogador escolhia todos os confrontos, na hora que quisesse, e o mundo não
 * tinha opinião sobre isso.
 *
 * Agora ele tem três posturas, e todas saem do estado que já existe, sem campo novo em `WildState`:
 *
 *   VAGANDO   à toa perto de onde nasceu. É o que faz a área parecer viva quando nada acontece.
 *   CAÇANDO   notou o jogador e vai atrás. Nota só com LINHA DE VISÃO: parede esconde, e é o que
 *             impede um bicho de atravessar a caverna inteira atrás de alguém que ele não viu.
 *   VOLTANDO  se afastou demais de casa e desiste. Sem isso, o jogador junta um cortejo e arrasta
 *             a área inteira atrás de si.
 *
 * SEM ESTADO NOVO, e isso é de propósito. A casa é o centro do `spawn` de onde ele veio, que o
 * `spawnIndex` já dá; a postura sai da distância, medida a cada tique; e o ritmo do passo sai de
 * `(tique + id) % período`, que além de não guardar nada ainda ESPALHA os selvagens por tiques
 * diferentes — todos andando no mesmo tique pareceria um cardume, não bichos.
 *
 * QUEM CHEGA ATACA PRIMEIRO continua valendo (GDD §3.1), e é por isso que o alcance é conferido
 * contra a posição do jogador NO INÍCIO do tique: aproximar-se de um selvagem nunca leva porrada
 * no mesmo tique da chegada. Quem já estava ao alcance, esse sim, revida.
 */
import { alcanceDe, type Move } from '@pokeidle/shared'
import { wildAttack } from './combat.js'
import { RAIO_DA_CORRENTE, RAIO_DE_PERCEPCAO, TIQUES_POR_PASSO_CACANDO, TIQUES_POR_PASSO_VAGANDO } from './constants.js'
import { findPath, isAdjacent, manhattan, neighbors, temLinhaDeVisao } from './grid.js'
import { blockedAt, isWalkable } from './spawn.js'
import type { EngineDeps, Event, HuntState, Point, StepResult, WildState } from './types.js'

export type Postura = 'vagando' | 'cacando' | 'voltando'

/** Onde ele nasceu: o centro do spawn. Sem spawn conhecido, o lugar onde ele está. */
export function casaDo(wild: WildState, deps: EngineDeps): Point {
  const spawn = deps.hunt.spawns[wild.spawnIndex]
  return spawn ? { x: spawn.x, y: spawn.y } : wild.position
}

/** Nota o jogador? Perto E com linha de visão — só a distância faria parede virar vidro. */
export function percebe(wild: WildState, alvo: Point, deps: EngineDeps): boolean {
  if (manhattan(wild.position, alvo) > RAIO_DE_PERCEPCAO) return false
  return temLinhaDeVisao(wild.position, alvo, (p) => blockedAt(deps.hunt, p))
}

export function posturaDe(wild: WildState, alvo: Point, deps: EngineDeps): Postura {
  if (manhattan(wild.position, casaDo(wild, deps)) > RAIO_DA_CORRENTE) return 'voltando'
  return percebe(wild, alvo, deps) ? 'cacando' : 'vagando'
}

/**
 * Pode usar este golpe daqui? Precisa de três coisas ao mesmo tempo:
 *
 *  1. alcance cobrindo onde o jogador ESTÁ — é onde o golpe vai cair;
 *  2. alcance cobrindo onde o jogador ESTAVA no início do tique — é o "quem chega ataca primeiro":
 *     quem acabou de entrar no alcance não leva porrada no mesmo tique da chegada;
 *  3. linha de visão, senão o tiro atravessa a rocha.
 */
const aoAlcance = (wild: WildState, alvo: Point, antes: Point, deps: EngineDeps) => (move: Move): boolean =>
  alcanceDe(move) >= manhattan(wild.position, alvo)
  && alcanceDe(move) >= manhattan(wild.position, antes)
  && temLinhaDeVisao(wild.position, alvo, (p) => blockedAt(deps.hunt, p))

/** Um passo na direção de `destino`, ou `null` quando não há rota nem vizinho livre. */
function passoAte(state: HuntState, deps: EngineDeps, wild: WildState, destino: Point, colar: boolean): Point | null {
  const isBlocked = (p: Point): boolean => !isWalkable(state, deps.hunt, p)
  const isGoal = colar ? (p: Point) => isAdjacent(p, destino) : (p: Point) => p.x === destino.x && p.y === destino.y
  const caminho = findPath({ from: wild.position, target: destino, isBlocked, isGoal, width: deps.hunt.width, height: deps.hunt.height })
  return caminho?.[0] ?? null
}

/**
 * Espalhador determinístico a partir de dois números. NÃO é o RNG do motor, e essa é a questão.
 *
 * O passeio à toa não pode consumir o mesmo fluxo de sorteios do combate e do loot. Quando
 * consumia, qualquer mudança na ordem dos sorteios — um multiplicador de raridade a mais, por
 * exemplo — mexia em QUAL célula cada bicho pisava, e daí em quem lutou com quem e em quanto ouro
 * caiu. Um teste de raridade que só queria comparar drops começou a acusar diferença de ouro, e
 * foi assim que o acoplamento apareceu. Movimento não deve perturbar economia.
 */
function espalha(a: number, b: number): number {
  let h = (Math.imul(a, 0x9e3779b1) + Math.imul(b, 0x85ebca6b)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491) >>> 0
  h ^= h >>> 13
  return h >>> 0
}

/** Um passo à toa, sem sair da coleira. Reprodutível por (tique, id), sem tocar no RNG do motor. */
function passoAToa(state: HuntState, deps: EngineDeps, wild: WildState): Point | null {
  const casa = casaDo(wild, deps)
  const livres = neighbors(wild.position)
    .filter((p) => isWalkable(state, deps.hunt, p) && manhattan(p, casa) <= RAIO_DA_CORRENTE)
  return livres.length === 0 ? null : livres[espalha(state.tick, wild.id) % livres.length]!
}

function mover(state: HuntState, wild: WildState, destino: Point): StepResult {
  const evento: Event = { type: 'wildMoved', tick: state.tick, wildId: wild.id, from: wild.position, to: destino }
  return { state: { ...state, wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, position: destino } : w)) }, events: [evento] }
}

/**
 * O tique de um selvagem: atacar tem precedência sobre andar.
 *
 * `alvoAntes` é onde o jogador estava no começo do tique, e é só isso que autoriza o ataque —
 * ver "quem chega ataca primeiro" no cabeçalho.
 */
export function stepWild(state: HuntState, deps: EngineDeps, wildId: number, alvoAntes: Point): StepResult {
  const wild = state.wilds.find((w) => w.id === wildId)
  if (!wild || wild.hp <= 0) return { state, events: [] }
  const alvo = state.player.position
  /*
   * ATACAR NÃO DEPENDE DA POSTURA. Um selvagem voltando para casa que leva um golpe pelas costas
   * tem que revidar: amarrar o ataque à perseguição faria do jogador um caçador impune — bastaria
   * empurrar o bicho para fora da coleira e bater à vontade.
   */
  const ataque = wildAttack(state, deps, wild, aoAlcance(wild, alvo, alvoAntes, deps))
  if (ataque.outcome === 'hit') return ataque

  const postura = posturaDe(wild, alvo, deps)

  const periodo = postura === 'vagando' ? TIQUES_POR_PASSO_VAGANDO : TIQUES_POR_PASSO_CACANDO
  if ((state.tick + wild.id) % periodo !== 0) return { state, events: [] }

  const destino = postura === 'cacando' ? passoAte(state, deps, wild, alvo, true)
    : postura === 'voltando' ? passoAte(state, deps, wild, casaDo(wild, deps), false)
    : passoAToa(state, deps, wild)
  return destino ? mover(state, wild, destino) : { state, events: [] }
}

/** Todos os selvagens, em ordem de id — a ordem tem que ser fixa para o tique ser reprodutível. */
export function stepWilds(state: HuntState, deps: EngineDeps, alvoAntes: Point): StepResult {
  const ids = state.wilds.map((w) => w.id).sort((a, b) => a - b)
  return ids.reduce<StepResult>((acc, id) => {
    const r = stepWild(acc.state, deps, id, alvoAntes)
    return { state: r.state, events: [...acc.events, ...r.events] }
  }, { state, events: [] })
}
