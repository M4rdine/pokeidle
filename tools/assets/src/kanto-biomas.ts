/** O elenco de Kanto: um bioma por área, com material, props e espécies. Só dados. */

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

export const BIOMAS: readonly Bioma[] = [
  { id: 'campo-inicial', nome: 'Campo Inicial', set: 'campo-caminho', mistura: 0.18, bloqueia: false,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.012 }, { ...ARBUSTO, densidade: 0.02 }, { ...FLORES, densidade: 0.03 }],
    // A área inicial é o marcador de ritmo do jogo: o teste de balanceamento exige pelo menos
    // 150 derrotas em dez minutos, então ela precisa de densidade alta de selvagens fracos.
    // Cinco espécies porque a captura só conta espécie nova: com três, o teto de capturas em dez
    // minutos fica abaixo do que o GDD pede. Todas de taxa de captura alta — evolução final numa
    // área inicial é errado de design e derruba as capturas abaixo do mínimo.
    especies: [
      { nome: 'zubat', min: 2, max: 5, quantidade: 4 },
      { nome: 'bellsprout', min: 2, max: 6, quantidade: 4 },
      { nome: 'diglett', min: 2, max: 5, quantidade: 4 },
      { nome: 'gastly', min: 3, max: 6, quantidade: 4 },
      { nome: 'vulpix', min: 3, max: 6, quantidade: 4 },
    ] },
  { id: 'bosque-denso', nome: 'Bosque Denso', set: 'campo-caminho', mistura: 0.1, bloqueia: false,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.03 }, { ...PINHEIRO, densidade: 0.025 }, { ...ARBUSTO, densidade: 0.03 }],
    especies: [{ nome: 'bellsprout', min: 5, max: 9, quantidade: 4 }, { nome: 'butterfree', min: 6, max: 10, quantidade: 3 }] },
  { id: 'trilha-pedregosa', nome: 'Trilha Pedregosa', set: 'campo-pedra', mistura: 0.32, bloqueia: false,
    trilha: TERRA,
    props: [{ ...PEDRA, densidade: 0.04 }, { ...ARBUSTO, densidade: 0.015 }],
    especies: [{ nome: 'diglett', min: 8, max: 13, quantidade: 4 }, { nome: 'growlithe', min: 9, max: 14, quantidade: 3 }] },
  { id: 'margem-do-lago', nome: 'Margem do Lago', set: 'campo-agua', mistura: 0.34, bloqueia: true,
    trilha: TERRA,
    props: [{ ...ARVORE, densidade: 0.01 }, { ...FLORES, densidade: 0.03 }],
    especies: [{ nome: 'horsea', min: 10, max: 15, quantidade: 4 }, { nome: 'staryu', min: 11, max: 16, quantidade: 3 }] },
  { id: 'praia-longa', nome: 'Praia Longa', set: 'areia-agua', mistura: 0.38, bloqueia: true,
    // Primário é areia: o pincel de caminho sobre campo não casaria com a praia.
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.02 }],
    especies: [{ nome: 'squirtle', min: 12, max: 17, quantidade: 3 }, { nome: 'staryu', min: 13, max: 18, quantidade: 3 }] },
  { id: 'entrada-da-caverna', nome: 'Entrada da Caverna', set: 'pedra-caverna', mistura: 0.3, bloqueia: true,
    // Primário é pedra: o chão de rocha já faz o papel de caminho.
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.03 }],
    especies: [{ nome: 'zubat', min: 15, max: 21, quantidade: 5 }, { nome: 'gastly', min: 16, max: 22, quantidade: 3 }] },
  { id: 'caverna-funda', nome: 'Caverna Funda', set: 'pedra-caverna', mistura: 0.42, bloqueia: true,
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.045 }],
    especies: [{ nome: 'golbat', min: 20, max: 27, quantidade: 4 }, { nome: 'haunter', min: 21, max: 28, quantidade: 3 }] },
  { id: 'pico-rochoso', nome: 'Pico Rochoso', set: 'campo-pedra', mistura: 0.46, bloqueia: true,
    trilha: null,
    props: [{ ...PEDRA, densidade: 0.05 }, { ...PINHEIRO, densidade: 0.01 }],
    especies: [{ nome: 'rhydon', min: 25, max: 32, quantidade: 3 }, { nome: 'arcanine', min: 27, max: 35, quantidade: 3 }] },
]
