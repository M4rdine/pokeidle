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
