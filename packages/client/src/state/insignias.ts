import type { Region } from '@pokeidle/shared'
import type { PokedexEntry } from '../api/dto.js'

/**
 * As insígnias: uma por área, ganha ao completar a Pokédex daquela área.
 *
 * O jogo não tinha nenhum OBJETO de progresso — o avanço do treinador era um número e uma barra,
 * e nada dizia "cheguei até aqui". E a Pokédex não tinha recompensa: capturar a última espécie
 * de uma área não mudava nada em lugar nenhum da tela.
 *
 * A insígnia resolve os dois com uma peça só e SEM INVENTAR MECÂNICA. O dado de conclusão já
 * existe: é o cruzamento entre `area.species` e o que o treinador capturou. Nada disso precisa de
 * campo novo, de migração nem de regra no servidor.
 *
 * A numeração é a do acervo (1 a 8 é Kanto, 9 a 16 a região seguinte), e ela segue a ordem em que
 * o jogo abre as áreas — a primeira insígnia é da primeira área, como num jogo de ginásio.
 */
export interface Insignia {
  readonly areaId: string
  readonly areaNome: string
  readonly regiaoNome: string
  /** 1 a 16: o número do sprite no acervo, e a ordem de conquista. */
  readonly numero: number
  readonly capturados: number
  readonly total: number
  readonly conquistada: boolean
}

export function insignias(
  regioes: ReadonlyMap<string, Region>,
  entries: readonly PokedexEntry[],
  vistosNaSessao: readonly string[],
): readonly Insignia[] {
  /*
   * O espelho da sessão entra JUNTO com a Pokédex do servidor. O `/trainer/pokedex` é lido uma
   * vez, e uma captura feita agora só apareceria nele depois de recarregar a página — a insígnia
   * chegaria com um recarregamento de atraso, bem no momento em que ela é a recompensa.
   *
   * Só `caughtAt` conta: insígnia é de CAPTURA. Ter visto a espécie passar pela tela não é o
   * mesmo que tê-la, e tratar os dois igual esvaziaria a conquista.
   */
  const capturadas = new Set([
    ...entries.filter((e) => e.caughtAt !== null).map((e) => e.speciesName),
    ...vistosNaSessao,
  ])

  return [...regioes.values()]
    .sort((a, b) => a.order - b.order)
    .flatMap((regiao) => regiao.areas.map((area) => ({ regiao, area })))
    .map(({ regiao, area }, indice) => {
      const capturados = area.species.filter((nome) => capturadas.has(nome)).length
      return {
        areaId: area.id,
        areaNome: area.name,
        regiaoNome: regiao.name,
        numero: indice + 1,
        capturados,
        total: area.species.length,
        // Área sem espécie nenhuma não é conquista: seria uma insígnia de graça.
        conquistada: area.species.length > 0 && capturados === area.species.length,
      }
    })
}
