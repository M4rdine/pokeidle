/**
 * As famílias de tiles, que é o que torna a curadoria possível.
 *
 * O dump tem 18.602 itens e o manifest cura 70. O visual pobre dos mapas não vem do motor — vem de
 * construir tudo com 0,4% da paleta —, e a curadoria não avançava porque a folha de contato
 * despeja os 18.602 numa grade só.
 *
 * A aposta que este módulo faz: no Tibia, as peças de um mesmo terreno foram autoradas juntas e
 * ficaram em IDS CONTÍGUOS. Agrupar por corrida reconstrói as famílias sem ninguém precisar
 * reconhecê-las a olho.
 */
import { describe, expect, it } from 'vitest'
import { agruparEmCorridas, familiasDe } from '../src/familias.js'

const item = (id: number, isGround = false, isBlocking = false) => ({ id, isGround, isBlocking })

describe('agrupar em corridas', () => {
  it('quebra onde o id salta, e mantém junto o que é seguido', () => {
    expect(agruparEmCorridas([3, 1, 2, 10, 11, 40]).map((f) => [f.primeiro, f.ultimo]))
      .toEqual([[1, 3], [10, 11], [40, 40]])
  })

  it('uma peça sozinha também é família', () => {
    // Decoração avulsa existe, e sumir com ela esconderia metade do acervo. Quem filtra por
    // tamanho é quem lê a folha, não esta função.
    expect(agruparEmCorridas([7])).toEqual([{ primeiro: 7, ultimo: 7, ids: [7] }])
  })

  it('id repetido não abre buraco nem duplica a peça', () => {
    expect(agruparEmCorridas([5, 5, 6]).map((f) => f.ids)).toEqual([[5, 6]])
  })

  it('sem ids, sem famílias — e não uma família vazia', () => {
    expect(agruparEmCorridas([])).toEqual([])
  })
})

describe('famílias de um gênero', () => {
  it('separa chão de bloqueante pela bandeira do .dat', () => {
    const itens = [item(1, true), item(2, true), item(8, false, true), item(9, false, true)]
    expect(familiasDe(itens, 'chao').map((f) => f.ids)).toEqual([[1, 2]])
    expect(familiasDe(itens, 'bloqueante').map((f) => f.ids)).toEqual([[8, 9]])
  })

  it('um item que é chão E bloqueia conta como CHÃO, e só', () => {
    /*
     * Existem no dump, e contá-lo nos dois lados partiria a corrida de chão em duas metades com um
     * buraco no meio — justamente a família que a corrida existe para reconstruir.
     */
    const itens = [item(1, true), item(2, true, true), item(3, true)]
    expect(familiasDe(itens, 'chao').map((f) => f.ids)).toEqual([[1, 2, 3]])
    expect(familiasDe(itens, 'bloqueante')).toEqual([])
  })

  it('a maior família vem primeiro: é onde os terrenos completos moram', () => {
    // As tiras grandes são chão mais bordas e cantos, autorados em sequência. As de uma peça são
    // decoração solta, e quem lê a folha quer ver terreno antes de enfeite.
    const itens = [item(1, true), item(5, true), item(6, true), item(7, true)]
    expect(familiasDe(itens, 'chao').map((f) => f.ids.length)).toEqual([3, 1])
  })
})
