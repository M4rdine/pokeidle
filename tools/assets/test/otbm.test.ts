/**
 * O leitor do mapa dos servidores OpenTibia.
 *
 * O arquivo real é o mundo de um servidor de terceiro e não vive no repositório — então a prova é
 * um `.otbm` SINTÉTICO, montado aqui byte a byte. Ele cobre exatamente o que me derrubou lendo o
 * arquivo de verdade, e que nenhum teste de "lê um mapa bonito" pegaria:
 *
 *  1. o nó NÃO tem campo de bandeiras (o `.otb` dos itens tem; este não);
 *  2. os atributos não são uniformemente prefixados por tamanho;
 *  3. cidade e ponto de rota não têm atributo nenhum — têm campos crus.
 *
 * O terceiro é o que atravessou 2 MB certos e morreu a 43 bytes do fim.
 */
import { describe, expect, it } from 'vitest'
import { lerMapa, recortar } from '../src/otbm.js'

const NO = 0xfe
const FIM = 0xff

const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff]
const u32 = (v: number): number[] => [...u16(v & 0xffff), ...u16(v >>> 16)]
const texto = (s: string): number[] => [...u16(s.length), ...[...s].map((c) => c.charCodeAt(0))]

/** Um tile com chão e, opcionalmente, itens empilhados. */
const tile = (dx: number, dy: number, chao: number, pilha: readonly number[] = []): number[] => [
  NO, 5, dx, dy,
  9, ...u16(chao),
  ...pilha.flatMap((id) => [NO, 6, ...u16(id), FIM]),
  FIM,
]

function mapaSintetico(tiles: readonly number[][], comCidade = true): Uint8Array {
  return Uint8Array.from([
    ...u32(0),                       // versão da árvore
    NO, 0,                           // raiz — SEM campo de bandeiras
    ...u32(2), ...u16(500), ...u16(400), ...u32(3), ...u32(20),
    NO, 2,                           // dados do mapa
    1, ...texto('feito no teste'),   // descrição: atributo de TEXTO, prefixado
    NO, 4, ...u16(1000), ...u16(2000), 7,  // área em (1000,2000,7)
    ...tiles.flat(),
    FIM,                             // fecha a área
    ...(comCidade
      ? [NO, 12, NO, 13, ...u32(1), ...texto('Thais'), ...u16(100), ...u16(120), 7, FIM, FIM]
      : []),
    NO, 15, FIM,                     // pontos de rota, vazio
    FIM,                             // fecha dados do mapa
    FIM,                             // fecha a raiz
  ])
}

describe('ler o mapa', () => {
  it('lê as dimensões e a posição absoluta de cada tile', () => {
    // A posição do tile é RELATIVA à área: um byte por eixo, que é o que permite a área de 256.
    const m = lerMapa(mapaSintetico([tile(3, 4, 106), tile(5, 6, 107)]))
    expect(m.largura).toBe(500)
    expect(m.altura).toBe(400)
    expect(m.tiles).toHaveLength(2)
    expect(m.tiles[0]).toMatchObject({ x: 1003, y: 2004, z: 7, chao: 106 })
    expect(m.tiles[1]).toMatchObject({ x: 1005, y: 2006, z: 7, chao: 107 })
  })

  it('a pilha do tile sai na ordem em que foi posta', () => {
    // É ela que diz o que fica por cima: árvore sobre grama, e não o contrário.
    const m = lerMapa(mapaSintetico([tile(0, 0, 106, [2700, 1234])]))
    expect(m.tiles[0]!.pilha).toEqual([2700, 1234])
  })

  it('CIDADE tem campos crus, e não atributos — foi o que matou a leitura a 43 bytes do fim', () => {
    /*
     * Ela traz id, nome e a posição do templo, sem nenhum cabeçalho de atributo. Lidos como
     * atributo, o id vira um tipo desconhecido e o resto do arquivo vira lixo. Nada de cidade
     * desenha chão — mas sem consumir os campos não se acha o fim do nó.
     */
    const m = lerMapa(mapaSintetico([tile(1, 1, 106)], true))
    expect(m.tiles).toHaveLength(1)
    expect(m.tiles[0]!.chao).toBe(106)
  })

  it('recusa um atributo que não conhece, em vez de seguir lendo lixo', () => {
    // Num formato binário, adivinhar o tamanho de um campo desconhecido é escolher corromper o
    // resto do arquivo — e o estrago aparece longe, como tile errado no meio do mundo.
    const ruim = Uint8Array.from([
      ...u32(0), NO, 0, ...u32(2), ...u16(10), ...u16(10), ...u32(3), ...u32(20),
      NO, 2, 0x7f, 0x00, FIM, FIM,
    ])
    expect(() => lerMapa(ruim)).toThrow(/desconhecido/)
  })

  it('recusa arquivo que não abre como nó', () => {
    expect(() => lerMapa(Uint8Array.from([0, 0, 0, 0, 0x41, 0x42]))).toThrow(/não é um \.otbm/)
  })
})

describe('recortar', () => {
  it('devolve a grade do retângulo pedido, com buraco onde não há tile', () => {
    const m = lerMapa(mapaSintetico([tile(0, 0, 106), tile(2, 1, 107)]))
    const g = recortar(m, 1000, 2000, 7, 3, 2)
    expect(g).toHaveLength(6)
    expect(g[0]?.chao).toBe(106)
    expect(g[1]).toBeNull()
    expect(g[5]?.chao).toBe(107)
  })

  it('ignora outro andar: o mundo tem dez, e o recorte é de um', () => {
    const m = lerMapa(mapaSintetico([tile(0, 0, 106)]))
    expect(recortar(m, 1000, 2000, 6, 2, 2).every((t) => t === null)).toBe(true)
  })
})
