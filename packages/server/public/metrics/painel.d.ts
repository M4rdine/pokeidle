/**
 * Tipos do painel. O arquivo servido ao navegador é JavaScript puro — ele não passa por build,
 * o Fastify entrega o `.js` como está — mas o teste o importa, e num projeto estrito importar
 * `any` não vale. Esta declaração existe só para o TypeScript; o navegador nunca a vê.
 */

export interface Amostra {
  readonly nome: string
  readonly rotulos: Readonly<Record<string, string>>
  readonly valor: number
}

/** Lê o formato de exposição do Prometheus. Linha malformada é ignorada. */
export function parseMetrics(texto: string): Amostra[]

/**
 * Quantil aproximado a partir dos buckets cumulativos, no mesmo espírito do `histogram_quantile`.
 * Devolve `null` quando não há amostra ou quando só o bucket infinito cobre o quantil.
 */
export function quantilDeBuckets(
  amostras: readonly Amostra[],
  nome: string,
  q: number,
  filtro?: Readonly<Record<string, string>>,
): number | null

/** Escreve os números na página. Só faz sentido com o DOM do `index.html` montado. */
export function render(amostras: readonly Amostra[]): void
