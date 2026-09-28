/**
 * Os limites do zoom da cena, FORA do módulo da cena.
 *
 * Eles vivem sozinhos porque `scene/app.ts` importa o PixiJS, e quem só precisa saber até onde o
 * zoom vai — o controle no HUD, para desabilitar o botão na ponta — não pode arrastar o motor de
 * renderização junto. O pedaço inicial do cliente é a tela de entrar: 436 KB de motor para
 * desenhar um formulário de e-mail e senha. Há um teste que barra essa importação, e foi ele que
 * pegou este arquivo não existindo.
 */

/** Um tile por pixel: o mapa inteiro cabe na tela, e é onde se enxerga para onde ir. */
export const ZOOM_MINIMO = 1
/** Três vezes: onde se distingue o Pokémon do cenário sem espremer os olhos. */
export const ZOOM_MAXIMO = 3
/** Dois é o padrão porque é o único nível em que o sprite do Pokémon lê como bicho, e não mancha. */
export const ZOOM_PADRAO = 2
