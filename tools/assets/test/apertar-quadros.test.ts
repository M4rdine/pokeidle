/**
 * Deixar os quadros quadrados sem cortar o desenho.
 *
 * A grade do atlas é de células quadradas, e todo consumidor escala o sprite pelo lado do quadro.
 * Uma folha de origem com margem morta — o Charmander do dump vem em 64×32 com o bicho na metade
 * direita — vira um quadro retangular, e o bicho passa a ser desenhado menor que os vizinhos e
 * fora do centro, em silêncio, porque nada quebra.
 *
 * O caso que dá nome a este arquivo é o `prenderNaCelula`. Os dois chamadores querem o oposto, e
 * usar o mesmo comportamento nos dois CORTA O DESENHO — foi o que a primeira versão fez.
 */
import { describe, expect, it } from 'vitest'
import { aoQuadrado, aoQuadradoNoGrupo, grupoDoQuadro, limitesDoConteudo, recortar, unir } from '../src/apertar-quadros.js'

const CANAIS = 4

/** Uma folha com um retângulo opaco dentro, para os limites serem conhecidos de antemão. */
function folha(w: number, h: number, marca: { x: number; y: number; w: number; h: number }) {
  const data = new Uint8Array(w * h * CANAIS)
  for (let y = marca.y; y < marca.y + marca.h; y++) {
    for (let x = marca.x; x < marca.x + marca.w; x++) data[(y * w + x) * CANAIS + 3] = 255
  }
  return { width: w, height: h, data }
}

describe('limites do conteúdo', () => {
  it('acha a caixa do que não é transparente, e ignora o resto', () => {
    const img = folha(64, 32, { x: 30, y: 4, w: 20, h: 20 })
    expect(limitesDoConteudo(img.data, 64, { x: 0, y: 0, w: 64, h: 32 })).toEqual({ x: 30, y: 4, w: 20, h: 20 })
  })

  it('devolve nulo quando não há nada — e não uma caixa de tamanho zero', () => {
    const vazia = folha(32, 32, { x: 0, y: 0, w: 0, h: 0 })
    expect(limitesDoConteudo(vazia.data, 32, { x: 0, y: 0, w: 32, h: 32 })).toBeNull()
  })
})

describe('ao quadrado', () => {
  it('cresce pelo maior lado e centra no conteúdo', () => {
    // Centrado, o quadrado de 20 começaria em y = 4 + 5 - 10 = -1; preso na célula, ele encosta
    // em 0. As duas leituras do mesmo caso, que é o que o terceiro caso abaixo separa.
    expect(aoQuadrado({ x: 10, y: 4, w: 20, h: 10 }, { x: 0, y: 0, w: 64, h: 64 }))
      .toEqual({ x: 10, y: 0, w: 20, h: 20 })
    expect(aoQuadrado({ x: 10, y: 4, w: 20, h: 10 }, { x: 0, y: 0, w: 64, h: 64 }, false))
      .toEqual({ x: 10, y: -1, w: 20, h: 20 })
  })

  it('PRESO NA CÉLULA, não passa dos limites: o vizinho apareceria dentro do quadro', () => {
    // O retângulo do atlas é uma janela sobre uma folha compartilhada. Vazar da célula significa
    // mostrar o sprite do lado.
    const r = aoQuadrado({ x: 60, y: 0, w: 4, h: 30 }, { x: 0, y: 0, w: 64, h: 64 })
    expect(r.x + r.w).toBeLessThanOrEqual(64)
    expect(r.y).toBeGreaterThanOrEqual(0)
  })

  it('SOLTO, pode passar — e é isso que impede o corte do desenho', () => {
    /*
     * O caso do Charmander: conteúdo de 34 px de largura numa folha de 64×32. Preso, o lado cai
     * para 32 (a altura da folha) e dois pixels do bicho somem. Solto, o quadrado tem os 34 e o
     * que cai fora da folha vira transparente — que é o certo, porque aqui não há vizinho.
     */
    const preso = aoQuadrado({ x: 30, y: 0, w: 34, h: 32 }, { x: 0, y: 0, w: 64, h: 32 })
    expect(preso.w).toBe(32)

    const solto = aoQuadrado({ x: 30, y: 0, w: 34, h: 32 }, { x: 0, y: 0, w: 64, h: 32 }, false)
    expect(solto.w).toBe(34)
    expect(solto.x).toBe(30)
  })
})

describe('recortar', () => {
  it('o que cai fora da imagem vira transparente, em vez de estourar', () => {
    const img = folha(8, 8, { x: 4, y: 0, w: 4, h: 8 })
    const r = recortar(img, { x: 4, y: 0, w: 8, h: 8 })
    expect(r.width).toBe(8)
    // A metade que existia veio opaca; a que passou do fim da folha, transparente.
    expect(r.data[3]).toBe(255)
    expect(r.data[(0 * 8 + 6) * CANAIS + 3]).toBe(0)
  })
})

describe('ao quadrado no grupo', () => {
  const comQuadro = (name: string, img: ReturnType<typeof folha>) => ({ name, image: img })

  it('uma caixa POR GRUPO: as fases compartilham o recorte, senão a caminhada salta', () => {
    /*
     * É o deslocamento do desenho DENTRO do quadro que produz o passo. Apertar cada fase contra o
     * próprio conteúdo remove justamente esse deslocamento, e o bicho anda parado.
     */
    const quadros = [
      comQuadro('pé/walk_south_0', folha(64, 32, { x: 30, y: 0, w: 20, h: 30 })),
      comQuadro('pé/walk_south_1', folha(64, 32, { x: 36, y: 0, w: 20, h: 30 })),
    ]
    const saida = aoQuadradoNoGrupo(quadros)
    // A união vai de x=30 a x=56 (26 de largura) e tem 30 de altura: o lado é o MAIOR dos dois.
    expect(saida.map((q) => q.image.width)).toEqual([30, 30])
    expect(saida.map((q) => q.image.height)).toEqual([30, 30])

    /*
     * E o passo sobrevive: o desenho começa em colunas DIFERENTES dentro do recorte, separadas
     * pelos mesmos 6 px que separavam as duas fases na folha de origem. Se cada fase tivesse sido
     * apertada contra o próprio conteúdo, as duas começariam na coluna 0 e o bicho andaria parado.
     */
    const primeiraColunaOpaca = (img: { width: number; data: Uint8Array }): number => {
      for (let x = 0; x < img.width; x++) if (img.data[x * CANAIS + 3] !== 0) return x
      return -1
    }
    const [a, b] = saida.map((q) => primeiraColunaOpaca(q.image))
    expect(b! - a!).toBe(6)
  })

  it('quem já é quadrado passa intacto: normalizar tudo seria recortar o atlas inteiro', () => {
    const original = folha(32, 32, { x: 8, y: 8, w: 8, h: 8 })
    const [saida] = aoQuadradoNoGrupo([comQuadro('ok/walk_south_0', original)])
    expect(saida!.image).toBe(original)
  })
})

describe('grupo do quadro', () => {
  it('é o nome sem o número da fase', () => {
    expect(grupoDoQuadro('charmander/walk_south_0')).toBe('charmander/walk_south')
    expect(grupoDoQuadro('charmander/attack_north_12')).toBe('charmander/attack_north')
  })
})

describe('unir', () => {
  it('cobre as duas caixas', () => {
    expect(unir({ x: 2, y: 4, w: 4, h: 4 }, { x: 8, y: 0, w: 2, h: 2 })).toEqual({ x: 2, y: 0, w: 8, h: 8 })
  })
})
