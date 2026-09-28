import type { Rng } from './rng.js'

const CAPTURE_DIVISOR = 255

export interface CaptureInput {
  readonly captureRate: number
  readonly hpMax: number
  readonly hpCurrent: number
  readonly ballBonus: number
}

export function captureChance({ captureRate, hpMax, hpCurrent, ballBonus }: CaptureInput): number {
  if (hpMax < 1) throw new RangeError(`hpMax inválido: ${hpMax}`)
  if (hpCurrent < 0 || hpCurrent > hpMax) throw new RangeError(`hpCurrent ${hpCurrent} fora de [0, ${hpMax}]`)
  const a = Math.floor(((3 * hpMax - 2 * hpCurrent) * captureRate * ballBonus) / (3 * hpMax))
  return Math.min(1, a / CAPTURE_DIVISOR)
}

export function rollCapture(input: CaptureInput, rng: Rng): boolean {
  return rng.next() < captureChance(input)
}

/**
 * O que a bola sabe sobre o encontro. Tudo isto já existe no estado da caçada — nenhum campo novo
 * foi inventado para sustentar uma bola, que é o mesmo critério que deixou três pedras de fora.
 */
export interface ContextoDeCaptura {
  /** O selvagem ainda não levou golpe nenhum. É o "primeiro turno" sem precisar contar turnos. */
  readonly intacto: boolean
  readonly tipos: readonly string[]
  readonly nivel: number
  readonly jaNaPokedex: boolean
}

/** Acima deste nível a Bola Ninho não vale mais nada: ela é para o que é pequeno. */
const TETO_DA_NINHO = 30

/**
 * O bônus EFETIVO da bola neste encontro.
 *
 * Fora da situação dela, a bola situacional vale o próprio chão — nunca menos. Uma bola que
 * PIORA a captura seria uma armadilha para quem comprou sem ler, e o jogador nem está na tela
 * quando ela é usada.
 */
/** A bola, como esta função precisa vê-la. `| undefined` explícito por `exactOptionalPropertyTypes`. */
export interface BolaComSituacao {
  readonly ballBonus: number
  readonly situacao?: string | undefined
  readonly bonusNaSituacao?: number | undefined
}

export function bonusDaBola(item: BolaComSituacao, ctx: ContextoDeCaptura): number {
  const alvo = item.bonusNaSituacao
  if (item.situacao === undefined || alvo === undefined) return item.ballBonus
  switch (item.situacao) {
    case 'intacto': return ctx.intacto ? alvo : item.ballBonus
    case 'agua-ou-inseto': return ctx.tipos.some((t) => t === 'water' || t === 'bug') ? alvo : item.ballBonus
    // Desce em rampa até o teto, em vez de cair de um degrau: um nível a mais não pode valer a
    // diferença entre a melhor bola da bolsa e a pior.
    case 'nivel-baixo': {
      const fracao = Math.max(0, (TETO_DA_NINHO - ctx.nivel) / TETO_DA_NINHO)
      return item.ballBonus + (alvo - item.ballBonus) * fracao
    }
    case 'ja-na-pokedex': return ctx.jaNaPokedex ? alvo : item.ballBonus
    default: return item.ballBonus
  }
}
