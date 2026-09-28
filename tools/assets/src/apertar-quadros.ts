/**
 * Aperta o retângulo de cada quadro do atlas até o conteúdo, e o deixa QUADRADO.
 *
 * O PORQUÊ. O empacotador grava `w = image.width`: o retângulo do quadro é o tamanho do PNG de
 * origem, e nada no caminho conferia esse tamanho. Uma espécie do dump — o Charmander — veio com
 * a folha de 64×32 e o bicho desenhado na METADE DIREITA. O retângulo saiu com 64 de largura, e
 * todo consumidor que escala pelo lado do quadro passou a desenhá-lo pela metade do tamanho dos
 * vizinhos e deslocado para a direita. Na tela do inicial, onde os três aparecem lado a lado, dava
 * para ver a olho nu.
 *
 * Isto NÃO mexe num pixel: só corrige o retângulo. A arte já está certa na folha; o que estava
 * errado era o recorte anunciado sobre ela.
 *
 * UMA CAIXA POR ANIMAÇÃO, e não por quadro. Se cada fase da caminhada fosse apertada contra o
 * próprio conteúdo, o bicho SALTARIA de posição a cada fase — o passo faz o desenho andar dentro
 * do quadro, e é justamente esse deslocamento que dá o movimento. A caixa é a união das fases do
 * mesmo grupo, que preserva o passo e some com a margem morta.
 *
 * E QUADRADO no fim: o consumidor escala pelo maior lado, então um retângulo 34×32 desenharia o
 * bicho 6% menor que um 32×32 do vizinho. O lado é o maior dos dois, centrado no conteúdo e preso
 * dentro da célula — nunca invadindo a vizinha.
 */

/** Um retângulo dentro da folha. */
export interface Caixa { x: number; y: number; w: number; h: number }

const CANAIS = 4
const CANAL_ALFA = 3

/** O grupo de um quadro: tudo antes do número da fase. `charmander/walk_south_0` → `…walk_south`. */
export function grupoDoQuadro(nome: string): string {
  return nome.replace(/_\d+$/, '')
}

/**
 * Os limites do que não é transparente dentro de `caixa`, em coordenadas da folha.
 * Devolve `null` quando o recorte é inteiramente transparente.
 */
export function limitesDoConteudo(pixels: Uint8Array, larguraDaFolha: number, caixa: Caixa): Caixa | null {
  let x0 = caixa.x + caixa.w
  let y0 = caixa.y + caixa.h
  let x1 = caixa.x
  let y1 = caixa.y
  for (let y = caixa.y; y < caixa.y + caixa.h; y++) {
    for (let x = caixa.x; x < caixa.x + caixa.w; x++) {
      if (pixels[(y * larguraDaFolha + x) * CANAIS + CANAL_ALFA] === 0) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x >= x1) x1 = x + 1
      if (y >= y1) y1 = y + 1
    }
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

/** A união de duas caixas. */
export function unir(a: Caixa, b: Caixa): Caixa {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/**
 * Cresce `conteudo` até virar um quadrado, centrado nele e contido em `celula`.
 *
 * Quando o conteúdo é maior que a célula em algum eixo — o que não deve acontecer, mas é o tipo
 * de coisa que um dump novo traz —, o lado é limitado pela célula em vez de vazar para a vizinha.
 */
export function aoQuadrado(conteudo: Caixa, celula: Caixa): Caixa {
  const lado = Math.min(Math.max(conteudo.w, conteudo.h), celula.w, celula.h)
  const centroX = conteudo.x + conteudo.w / 2
  const centroY = conteudo.y + conteudo.h / 2
  const prender = (valor: number, minimo: number, maximo: number): number => Math.min(Math.max(valor, minimo), maximo)
  return {
    x: prender(Math.round(centroX - lado / 2), celula.x, celula.x + celula.w - lado),
    y: prender(Math.round(centroY - lado / 2), celula.y, celula.y + celula.h - lado),
    w: lado,
    h: lado,
  }
}
