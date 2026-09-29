export const TICKS_PER_SECOND = 5
export const HEAL_TICKS = 25
export const RESPAWN_RETRY_TICKS = 5
// 50 e não 30: com 30 a seed ruim derruba o inicial e para a hunt (sondagem de 8 seeds, fase 3a)
export const RETURN_HP_PERCENT_DEFAULT = 50
export const POTION_HP_PERCENT_DEFAULT = 50
export const CAPTURE_MAX_WILD_HP_DEFAULT = 30
/*
 * Quanto melhor o companheiro precisa ser para valer a troca: ele tem que aguentar 1,5× mais
 * golpes do selvagem que o ativo, medido no HP cheio. Sem margem, uma diferença de 1% de
 * resistência bastaria e o motor passaria a caçada trocando de Pokémon em vez de lutar.
 */
export const VANTAGEM_MINIMA_DE_TROCA = 1.5
export const MAX_TEAM_SIZE = 6
export const BALL_ITEM_BY_TIER = { poke: 'poke-ball', great: 'great-ball', ultra: 'ultra-ball' } as const

/*
 * A CABEÇA DO SELVAGEM. Ver `wild-ai.ts`.
 *
 * Os raios são em tiles de Manhattan, e os períodos em tiques de 200 ms.
 */
/** Até onde ele nota o jogador — precisando de linha de visão, então parede esconde. */
export const RAIO_DE_PERCEPCAO = 5
/** Até onde ele se afasta de casa antes de desistir e voltar. Sem isto, um bicho persegue o
 * jogador pelo mapa inteiro e a área toda vira uma procissão atrás dele. */
export const RAIO_DA_CORRENTE = 10
/** Um passo a cada dois segundos quando está à toa: presença, não trânsito. */
export const TIQUES_POR_PASSO_VAGANDO = 10
/** Caçando ele anda mais rápido, mas ainda mais devagar que o jogador, que dá um passo por tique:
 * a perseguição precisa ser sentida como ameaça sem ser inescapável. */
export const TIQUES_POR_PASSO_CACANDO = 4
