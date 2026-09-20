/**
 * O elenco das regiões: uma lista de biomas por região, cada bioma virando uma área com material,
 * props e espécies. Só dados — quem desenha é `region-draw.ts`.
 */

export interface PropSpec {
  readonly nome: string
  readonly variantes: number
  /** Ocupa 2×2 tiles, com copa acima do jogador e tronco bloqueando. */
  readonly grande: boolean
  readonly densidade: number
  readonly bloqueia: boolean
}

export interface EspecieSpec {
  readonly nome: string
  readonly min: number
  readonly max: number
  readonly quantidade: number
}

export interface Bioma {
  readonly id: string
  readonly nome: string
  /** Conjunto de terreno do atlas; o pincel de canto sai dele. */
  readonly set: string
  /** Fração da área coberta pelo segundo material do pincel. */
  readonly mistura: number
  /**
   * Como o segundo material se distribui. Omitir é `'ruido'`, o comportamento de sempre.
   * - `'ruido'`: manchas espalhadas por limiar sobre ruído suave. É o certo para terra batida
   *   salpicada num campo, e para um arquipélago, onde espalhar é o assunto.
   * - `'corpo'`: uma massa conectada só, de borda recortada. Um lago é um lago; três poças do
   *   mesmo tamanho não são a margem de lago nenhum.
   * - `'margem'`: uma faixa encostada numa borda da área. O mar de uma praia vem de fora do mapa,
   *   não nasce como lagoa no meio dele.
   */
  readonly forma?: 'ruido' | 'corpo' | 'margem'
  /** O segundo material bloqueia passagem (água, rocha). */
  readonly bloqueia: boolean
  /**
   * Conjunto de terreno da trilha que corta a área ligando a partida ao Centro, ou `null` quando
   * o bioma não leva trilha. Só faz sentido onde o material primário é campo: é com ele que o
   * pincel do caminho casa.
   */
  readonly trilha: string | null
  readonly props: readonly PropSpec[]
  readonly especies: readonly EspecieSpec[]
}

/** Pincel de terra batida sobre campo: o segundo material dele é a trilha. */
const TERRA = 'campo-caminho'

const ARVORE = { nome: 'arvore-larga', variantes: 4, grande: true, bloqueia: true } as const
const PINHEIRO = { nome: 'pinheiro', variantes: 4, grande: true, bloqueia: true } as const
const ARBUSTO = { nome: 'arbusto', variantes: 4, grande: false, bloqueia: false } as const
const PEDRA = { nome: 'pedra', variantes: 4, grande: false, bloqueia: true } as const
const FLORES = { nome: 'flores', variantes: 4, grande: false, bloqueia: false } as const

const KANTO: readonly Bioma[] = [
  { id: 'campo-inicial', nome: 'Campo Inicial', set: 'campo-caminho', mistura: 0.18, bloqueia: false,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.012 }, { ...ARBUSTO, densidade: 0.02 }, { ...FLORES, densidade: 0.03 }],
    // A área inicial é o marcador de ritmo do jogo: o teste de balanceamento exige pelo menos
    // 150 derrotas em dez minutos, então ela precisa de densidade alta de selvagens fracos.
    // Cinco espécies porque a captura só conta espécie nova: com três, o teto de capturas em dez
    // minutos fica abaixo do que o GDD pede. Todas de taxa de captura alta — evolução final numa
    // área inicial é errado de design e derruba as capturas abaixo do mínimo.
    //
    // Três de cada, e não quatro: com vinte selvagens a área rendia o dobro do ouro que o GDD §6
    // prevê para os dez primeiros minutos, e ainda assim sobra folga de três vezes sobre o mínimo
    // de derrotas.
    especies: [
      { nome: 'zubat', min: 2, max: 5, quantidade: 3 },
      { nome: 'bellsprout', min: 2, max: 6, quantidade: 3 },
      { nome: 'diglett', min: 2, max: 5, quantidade: 3 },
      { nome: 'gastly', min: 3, max: 6, quantidade: 3 },
      { nome: 'vulpix', min: 3, max: 6, quantidade: 3 },
    ] },
  { id: 'bosque-denso', nome: 'Bosque Denso', set: 'campo-caminho', mistura: 0.1, bloqueia: false,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.03 }, { ...PINHEIRO, densidade: 0.025 }, { ...ARBUSTO, densidade: 0.03 }],
    especies: [
      { nome: 'bellsprout', min: 5, max: 9, quantidade: 4 },
      { nome: 'butterfree', min: 6, max: 10, quantidade: 3 },
      { nome: 'scyther', min: 7, max: 10, quantidade: 2 },
      { nome: 'jigglypuff', min: 5, max: 9, quantidade: 3 },
    ] },
  { id: 'trilha-pedregosa', nome: 'Trilha Pedregosa', set: 'campo-pedra', mistura: 0.32, bloqueia: false,
    trilha: TERRA,
    props: [{ ...PEDRA, densidade: 0.04 }, { ...ARBUSTO, densidade: 0.015 }],
    especies: [
      { nome: 'diglett', min: 8, max: 13, quantidade: 4 },
      { nome: 'growlithe', min: 9, max: 14, quantidade: 3 },
      { nome: 'pikachu', min: 9, max: 14, quantidade: 3 },
    ] },
  { id: 'margem-do-lago', nome: 'Margem do Lago', set: 'campo-agua', mistura: 0.34, bloqueia: true, forma: 'corpo',
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.01 }, { ...FLORES, densidade: 0.03 }],
    especies: [
      { nome: 'horsea', min: 10, max: 15, quantidade: 4 },
      { nome: 'staryu', min: 11, max: 16, quantidade: 3 },
      { nome: 'dratini', min: 12, max: 16, quantidade: 2 },
    ] },
  { id: 'praia-longa', nome: 'Praia Longa', set: 'areia-agua', mistura: 0.38, bloqueia: true, forma: 'margem',
    // Primário é areia: o pincel de caminho sobre campo não casaria com a praia.
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.02 }],
    especies: [
      { nome: 'squirtle', min: 12, max: 17, quantidade: 3 },
      { nome: 'staryu', min: 13, max: 18, quantidade: 3 },
      { nome: 'doduo', min: 13, max: 18, quantidade: 4 },
    ] },
  { id: 'entrada-da-caverna', nome: 'Entrada da Caverna', set: 'pedra-caverna', mistura: 0.3, bloqueia: true,
    // Primário é pedra: o chão de rocha já faz o papel de caminho.
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.03 }],
    especies: [
      { nome: 'zubat', min: 15, max: 21, quantidade: 5 },
      { nome: 'gastly', min: 16, max: 22, quantidade: 3 },
      { nome: 'grimer', min: 17, max: 22, quantidade: 3 },
    ] },
  { id: 'caverna-funda', nome: 'Caverna Funda', set: 'pedra-caverna', mistura: 0.42, bloqueia: true,
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.045 }],
    especies: [{ nome: 'golbat', min: 20, max: 27, quantidade: 4 }, { nome: 'haunter', min: 21, max: 28, quantidade: 3 }] },
  { id: 'pico-rochoso', nome: 'Pico Rochoso', set: 'campo-pedra', mistura: 0.46, bloqueia: true, forma: 'corpo',
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.05 }, { ...PINHEIRO, densidade: 0.01 }],
    especies: [{ nome: 'rhydon', min: 25, max: 32, quantidade: 3 }, { nome: 'arcanine', min: 27, max: 35, quantidade: 3 }] },
]

/**
 * O que existe depois que Kanto acaba. A ordem das áreas segue a experiência base das espécies,
 * de 157 a 227: a progressão de recompensa sai do elenco, não de um multiplicador inventado.
 *
 * Só espécies de experiência alta entram aqui. As fracas que nunca tiveram casa — doduo, grimer,
 * dratini, jigglypuff, pikachu, scyther — foram para Kanto, no bioma de cada uma: medido, um
 * doduo de nível 38 rende menos XP que um rhydon de nível 35, então abrir a região avançada com
 * ele seria um degrau para baixo logo depois do portão.
 */
const TERRAS_ALTAS: readonly Bioma[] = [
  { id: 'gruta-umida', nome: 'Gruta Úmida', set: 'pedra-caverna', mistura: 0.28, bloqueia: true,
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.03 }],
    especies: [{ nome: 'arbok', min: 36, max: 42, quantidade: 6 }, { nome: 'magmar', min: 38, max: 44, quantidade: 4 }] },
  { id: 'tunel-rocha', nome: 'Túnel Rocha', set: 'pedra-caverna', mistura: 0.44, bloqueia: true,
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.045 }],
    especies: [{ nome: 'kabutops', min: 40, max: 46, quantidade: 3 }, { nome: 'beedrill', min: 41, max: 48, quantidade: 6 }] },
  { id: 'campo-safari', nome: 'Campo Safári', set: 'campo-caminho', mistura: 0.16, bloqueia: false,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.014 }, { ...ARBUSTO, densidade: 0.025 }, { ...FLORES, densidade: 0.025 }],
    especies: [{ nome: 'exeggutor', min: 44, max: 50, quantidade: 5 }, { nome: 'wigglytuff', min: 45, max: 52, quantidade: 5 }] },
  { id: 'usina-velha', nome: 'Usina Velha', set: 'campo-pedra', mistura: 0.38, bloqueia: true,
    trilha: TERRA,
    props: [{ ...PEDRA, densidade: 0.04 }, { ...ARBUSTO, densidade: 0.01 }],
    especies: [{ nome: 'raichu', min: 48, max: 54, quantidade: 2 }, { nome: 'magmar', min: 49, max: 56, quantidade: 7 }] },
  { id: 'ilhas-espuma', nome: 'Ilhas Espuma', set: 'areia-agua', mistura: 0.4, bloqueia: true,
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.025 }],
    especies: [{ nome: 'kabutops', min: 52, max: 58, quantidade: 2 }, { nome: 'wigglytuff', min: 53, max: 60, quantidade: 7 }] },
  { id: 'mata-fechada', nome: 'Mata Fechada', set: 'campo-caminho', mistura: 0.12, bloqueia: false,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.032 }, { ...PINHEIRO, densidade: 0.028 }, { ...ARBUSTO, densidade: 0.03 }],
    especies: [{ nome: 'exeggutor', min: 56, max: 62, quantidade: 5 }, { nome: 'pidgeot', min: 58, max: 64, quantidade: 4 }] },
  { id: 'trilha-da-vitoria', nome: 'Trilha da Vitória', set: 'campo-pedra', mistura: 0.46, bloqueia: true, forma: 'corpo',
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.05 }],
    especies: [{ nome: 'pidgeot', min: 60, max: 66, quantidade: 5 }, { nome: 'wigglytuff', min: 61, max: 68, quantidade: 4 }] },
  { id: 'cume-indigo', nome: 'Cume Índigo', set: 'campo-pedra', mistura: 0.5, bloqueia: true, forma: 'corpo',
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.055 }, { ...PINHEIRO, densidade: 0.008 }],
    especies: [
      { nome: 'nidoking', min: 64, max: 70, quantidade: 6 },
      { nome: 'raichu', min: 66, max: 72, quantidade: 2 },
      { nome: 'snorlax', min: 68, max: 72, quantidade: 1 },
    ] },
]

/** Uma região do jogo: metadados mais a lista de biomas que viram as áreas dela. */
export interface RegionSpec {
  readonly id: string
  readonly nome: string
  readonly order: number
  readonly minTrainerLevel: number
  readonly biomas: readonly Bioma[]
}

export const REGIOES: readonly RegionSpec[] = [
  { id: 'kanto', nome: 'Kanto', order: 1, minTrainerLevel: 1, biomas: KANTO },
  { id: 'terras-altas', nome: 'Terras Altas', order: 2, minTrainerLevel: 34, biomas: TERRAS_ALTAS },
]

export const regiaoPorId = (id: string): RegionSpec | undefined => REGIOES.find((r) => r.id === id)
