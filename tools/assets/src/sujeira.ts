/**
 * O que um servidor VIVO deixou no chão, e o tempo apagaria.
 *
 * O `.otbm` é uma fotografia. Quem gravou o mapa gravou um instante do servidor rodando, e nesse
 * instante havia cadáver de monstro, poça de sangue e campo mágico aceso — coisas que existem por
 * minutos e decaem. Recortar uma caverna traz esse lixo junto, e no jogo ele não decai nunca: fica
 * espalhado para sempre. Foi exatamente o que se viu na primeira caverna importada, descrito por
 * quem olhou como "bichos mortos e umas gosmas verdes e amarelas".
 *
 * As três famílias, e como o próprio cliente do Tibia as denuncia:
 *
 *  - POÇA: a bandeira `splash` do `.dat` diz literalmente "líquido no chão". São as gosmas, e a
 *    cor muda com a posição — por isso apareciam vermelhas, amarelas e roxas no mesmo mapa.
 *  - CADÁVER: `lyingCorpse` marca o corpo caído, mas não todos: o corpo de bicho grande é só um
 *    CONTAINER — é dele que se saqueia. O que separa cadáver de baú é passar por cima: baú, barril
 *    e caixa barram passagem; cadáver não.
 *  - CAMPO MÁGICO: veneno é verde, fogo é amarelo. Anima, acende luz e barra rota sem barrar
 *    passagem — nenhuma decoração de chão faz as três coisas ao mesmo tempo.
 *
 * Isto quase NÃO é uma lista de ids. Uma lista morre no próximo mapa; estas bandeiras valem para o
 * dump inteiro — 1.553 dos 19.312 itens — e portanto para as dezesseis áreas.
 *
 * A exceção, e por que ela é inevitável: existe cadáver que o AUTOR do mapa pôs de propósito, como
 * cenário. Ele não decai e nenhuma bandeira o denuncia — é só um item imóvel. O primeiro que
 * apareceu foi um corpo humano ensanguentado numa caverna; em Tibia é atmosfera, em Pokeidle é
 * tom errado. Esses saem por id, e a lista cresce a cada área convertida — por isso o importador
 * IMPRIME a decoração que sobreviveu: a lista só funciona se alguém olhar.
 */

/**
 * Cadáveres de cenário, que nenhuma bandeira denuncia. Ids de CLIENTE. Ver o cabeçalho.
 *
 * 3204: corpo humano caído, com sangue.
 */
export const CENARIO_PROIBIDO: ReadonlySet<number> = new Set([3204])

/** O que este juízo precisa saber de um item. Um subconjunto de `CatalogItem`. */
export interface ItemJulgavel {
  readonly id: number
  readonly phases: number
  readonly isGround: boolean
  readonly isBlocking: boolean
  readonly isSplash: boolean
  readonly isCorpse: boolean
  readonly isContainer: boolean
  readonly isNotPathable: boolean
  readonly hasLight: boolean
}

/** Cadáver: o corpo marcado, ou o container que se pisa por cima — baú e barril barram passagem. */
const ehCadaver = (i: ItemJulgavel): boolean => i.isCorpse || (i.isContainer && !i.isBlocking)

/** Campo mágico: anima, acende e barra rota, sem ser chão nem barrar passagem. */
const ehCampoMagico = (i: ItemJulgavel): boolean =>
  i.phases > 1 && i.hasLight && i.isNotPathable && !i.isGround && !i.isBlocking

export function ehSujeira(item: ItemJulgavel): boolean {
  return CENARIO_PROIBIDO.has(item.id) || item.isSplash || ehCadaver(item) || ehCampoMagico(item)
}
