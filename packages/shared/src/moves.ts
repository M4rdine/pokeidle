import type { Move } from './schemas/moves.js'
import type { Species } from './schemas/species.js'

const POWER_PER_SECOND = 20
const MIN_COOLDOWN_S = 1
const MAX_COOLDOWN_S = 8
const TICKS_PER_SECOND = 5

/**
 * Golpe de emergência: usado quando `availableMoves` não encontra nenhum golpe aprendido
 * até o nível atual (ex.: espécie cujo primeiro golpe do learnset é em nível alto).
 * `availableMoves` nunca retorna array vazio — o servidor pode sempre golpear.
 */
export const STRUGGLE: Move = { name: 'struggle', type: 'normal', power: 50, accuracy: null, damageClass: 'physical' }

export function availableMoves(species: Species, level: number, moves: ReadonlyMap<string, Move>): Move[] {
  const seen = new Set<string>()
  const result: Move[] = []
  for (const entry of species.learnset) {
    if (entry.level > level || seen.has(entry.move)) continue
    const move = moves.get(entry.move)
    if (!move) throw new Error(`espécie ${species.name}: golpe ${entry.move} não existe no registro`)
    seen.add(entry.move)
    result.push(move)
  }
  return result.length > 0 ? result : [STRUGGLE]
}

/**
 * O ALCANCE de um golpe, em tiles, e por que ele sai de `damageClass`.
 *
 * O dado já estava lá e ninguém tinha usado: no Pokémon, golpe FÍSICO é contato — arranhar, dar
 * cabeçada, morder — e golpe ESPECIAL é o que sai do corpo e viaja: brasa, jato d'água, raio. Ler
 * alcance dessa coluna é gratuito, vale para os 91 golpes de uma vez (53 corpo a corpo, 38 à
 * distância) e não pede um campo novo que alguém teria de preencher à mão espécie por espécie.
 *
 * Quatro tiles, e não mais: é aproximadamente meia tela no zoom padrão. O selvagem precisa ser uma
 * ameaça que se aproxima, não uma torre que atira do outro lado do mapa antes de aparecer.
 */
export const ALCANCE_CORPO_A_CORPO = 1
export const ALCANCE_A_DISTANCIA = 3

export const alcanceDe = (move: Pick<Move, 'damageClass'>): number =>
  move.damageClass === 'special' ? ALCANCE_A_DISTANCIA : ALCANCE_CORPO_A_CORPO

export function cooldownTicks(move: Pick<Move, 'power'>): number {
  const seconds = Math.min(MAX_COOLDOWN_S, Math.max(MIN_COOLDOWN_S, Math.round(move.power / POWER_PER_SECOND)))
  return seconds * TICKS_PER_SECOND
}
