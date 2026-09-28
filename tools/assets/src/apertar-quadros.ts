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
 * O conserto acontece ANTES de empacotar, sobre os pixels da folha de origem — não depois, sobre
 * o retângulo do atlas publicado. Houve uma versão que corrigia o retângulo depois, num roteiro à
 * parte, porque na época o build não rodava: o padrão do CLI apontava para a extração errada. Com
 * o build reproduzível de novo, manter os dois caminhos seria manter duas verdades sobre a mesma
 * geometria, e a segunda envelheceria calada.
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
 * `prenderNaCelula` decide o que acontece quando o quadrado não cabe, e os dois chamadores querem
 * coisas opostas:
 *
 *  - **Retângulo dentro do atlas** (`true`): o quadro é uma janela sobre uma folha compartilhada, e
 *    passar da célula significa mostrar o vizinho. O lado é limitado — melhor apertado que sujo.
 *  - **Recorte da imagem de origem** (`false`): aqui não há vizinho, e o que cai fora vira
 *    transparente. Limitar seria CORTAR O DESENHO: um conteúdo de 34 px de largura numa folha de
 *    64×32 virava um recorte de 32 e comia dois pixels do bicho — que foi exatamente o que o
 *    primeiro build normalizado fez com o Charmander.
 */
export function aoQuadrado(conteudo: Caixa, celula: Caixa, prenderNaCelula = true): Caixa {
  const desejado = Math.max(conteudo.w, conteudo.h)
  const lado = prenderNaCelula ? Math.min(desejado, celula.w, celula.h) : desejado
  const centroX = conteudo.x + conteudo.w / 2
  const centroY = conteudo.y + conteudo.h / 2
  const prender = (valor: number, minimo: number, maximo: number): number => Math.min(Math.max(valor, minimo), maximo)
  const x = Math.round(centroX - lado / 2)
  const y = Math.round(centroY - lado / 2)
  return {
    x: prenderNaCelula ? prender(x, celula.x, celula.x + celula.w - lado) : x,
    y: prenderNaCelula ? prender(y, celula.y, celula.y + celula.h - lado) : y,
    w: lado,
    h: lado,
  }
}

/*
 * ── A NORMALIZAÇÃO NA ORIGEM ──
 *
 * O conserto no lugar certo: antes de empacotar, e sobre os pixels em vez do retângulo. Uma folha
 * de origem com margem morta deixa de virar quadro torto, e o problema morre onde nasce em vez de
 * precisar de um passo de correção depois de publicar.
 */
export interface ImagemRgba { readonly width: number; readonly height: number; readonly data: Uint8Array }

/** Recorta uma região. Fora dos limites vira transparente, que é o certo para uma caixa ampliada. */
export function recortar(img: ImagemRgba, caixa: Caixa): ImagemRgba {
  const data = new Uint8Array(caixa.w * caixa.h * CANAIS)
  for (let y = 0; y < caixa.h; y++) {
    const oy = caixa.y + y
    if (oy < 0 || oy >= img.height) continue
    for (let x = 0; x < caixa.w; x++) {
      const ox = caixa.x + x
      if (ox < 0 || ox >= img.width) continue
      const de = (oy * img.width + ox) * CANAIS
      const para = (y * caixa.w + x) * CANAIS
      for (let c = 0; c < CANAIS; c++) data[para + c] = img.data[de + c]!
    }
  }
  return { width: caixa.w, height: caixa.h, data }
}

/**
 * Deixa QUADRADOS os quadros de um grupo, recortando a margem morta comum a todos eles.
 *
 * A caixa é a UNIÃO das fases: apertar fase a fase faria o desenho saltar de posição a cada passo,
 * porque é justamente o deslocamento dentro do quadro que produz o movimento da caminhada.
 *
 * Quadros que já são quadrados passam intactos — a normalização existe para o caso torto, e
 * reapertar o que está certo seria recortar o atlas inteiro por causa de uma espécie.
 */
export function aoQuadradoNoGrupo<T extends { readonly name: string; readonly image: ImagemRgba }>(
  quadros: readonly T[],
): T[] {
  const porGrupo = new Map<string, Caixa>()
  for (const q of quadros) {
    if (q.image.width === q.image.height) continue
    const conteudo = limitesDoConteudo(q.image.data, q.image.width, { x: 0, y: 0, w: q.image.width, h: q.image.height })
    if (!conteudo) continue
    const grupo = grupoDoQuadro(q.name)
    const anterior = porGrupo.get(grupo)
    porGrupo.set(grupo, anterior ? unir(anterior, conteudo) : conteudo)
  }
  if (porGrupo.size === 0) return [...quadros]
  return quadros.map((q) => {
    const conteudo = porGrupo.get(grupoDoQuadro(q.name))
    if (!conteudo || q.image.width === q.image.height) return q
    // `false`: o recorte pode passar dos limites da folha de origem, e o que cai fora vira
    // transparente. Prender aqui cortaria o desenho — ver `aoQuadrado`.
    const caixa = aoQuadrado(conteudo, { x: 0, y: 0, w: q.image.width, h: q.image.height }, false)
    return { ...q, image: recortar(q.image, caixa) }
  })
}
