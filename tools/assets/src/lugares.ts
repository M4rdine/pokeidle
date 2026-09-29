/**
 * Acha LUGARES FECHADOS no mapa do mundo — os pedaços que já são hunt.
 *
 * O ERRO QUE ISTO CONSERTA. O primeiro recorte foi um retângulo qualquer em campo aberto: grama
 * chapada com arbusto polvilhado, calçada de cidade entrando por um canto e um buraco branco onde
 * o mundo simplesmente acabava. Uma hunt de Tibia não é um retângulo de mundo — é um LUGAR: a
 * caverna tem rocha em toda a volta, e é a rocha que faz o mapa terminar sem parecer cortado.
 *
 * O QUE SE MEDE, e por que cada medida existe:
 *
 *  - VEDAÇÃO: quanto do perímetro do recorte não é andável. É a medida que separa "caverna" de
 *    "pedaço de campo": num campo o jogador anda para fora da tela, numa caverna ele bate na pedra.
 *  - BURACOS: tiles sem chão. Subterrâneo, o que nunca foi escavado não tem tile nenhum, e isso
 *    desenha um furo transparente. Um único buraco visível estraga o mapa inteiro.
 *  - CASAS: tile de casa é cidade. Calçada de pedra engana qualquer classificador de cor; a
 *    bandeira de casa não engana.
 *  - ILHA: a maior parte andável conectada, sobre o total andável. Uma sala atrás de uma parede é
 *    área que o jogador vê e nunca alcança.
 *  - DECORAÇÃO: células com algo em cima do chão que NÃO é sujeira de servidor. A primeira caverna
 *    escolhida tinha geometria impecável e ficou vazia depois da varrida: era rocha e corredor, e
 *    nada mais. Cenário não se espalha por script — quem o pôs foi quem desenhou o mapa —, então
 *    a busca precisa saber onde ele está em vez de torcer.
 *
 * Nada aqui lê pixel: tudo sai da geometria do `.otbm`.
 */

/** Um andar do mundo, achatado em grades paralelas. */
export interface Plano {
  readonly largura: number
  readonly altura: number
  /** 1 quando o tile tem chão. 0 é vazio — o mundo não existe ali. */
  readonly temChao: Uint8Array
  readonly bloqueia: Uint8Array
  readonly casa: Uint8Array
  /** 1 quando há algo empilhado que não é sujeira de servidor. Ver `sujeira.ts`. */
  readonly decoracao: Uint8Array
}

export interface Medidas {
  readonly x: number
  readonly y: number
  /** Fração do perímetro que não é andável, de 0 a 1. */
  readonly vedado: number
  readonly buracos: number
  readonly casas: number
  /** Fração de tiles andáveis, de 0 a 1. */
  readonly andavel: number
  /** A maior área andável conectada, sobre o total andável. */
  readonly ilha: number
  readonly andaveis: number
  /** Células com decoração de verdade. */
  readonly decorados: number
}

export interface Limites {
  readonly largura: number
  readonly altura: number
  /** De quantos em quantos tiles a janela anda. Menor acha mais, e custa mais. */
  readonly passo: number
  readonly vedadoMinimo: number
  readonly andavelMinimo: number
  readonly andavelMaximo: number
  readonly ilhaMinima: number
  readonly buracosMaximos: number
  /** Piso de células decoradas. Zero aceita caverna pelada; ver `DECORACAO_IDEAL`. */
  readonly decoradosMinimos: number
}

export const LIMITES_PADRAO: Limites = {
  largura: 24,
  altura: 36,
  passo: 2,
  /*
   * Não exijo 100% de vedação: o recorte quase nunca cai exatamente dentro do anel de rocha, e a
   * conversão fecha o resto. O que este número rejeita é campo aberto, que fica perto de zero.
   */
  vedadoMinimo: 0.8,
  /*
   * Abaixo de 25% o recorte é maciço de pedra e não se anda; acima de 70% é campo. A caverna
   * jogável do Tibia vive no meio, e é essa faixa que descreve "corredor com salas".
   *
   * O PISO É POR CAVERNA. Para recorte de SUPERFÍCIE ele precisa subir para perto de 0,55, e isso
   * custou duas repescagens: a Trilha Pedregosa saiu com 367 células andáveis contra as 848 do
   * mapa desenhado, e a mesma quantidade de selvagens em menos da metade do espaço dobrou a
   * densidade — um Charmander nível 20 desmaiou quatro vezes numa área de nível 8–14. Em caverna
   * isso não acontece porque CORREDOR É ESTREITO: só um ou dois bichos alcançam o jogador por vez.
   * Em campo aberto, todos alcançam.
   */
  andavelMinimo: 0.25,
  andavelMaximo: 0.7,
  ilhaMinima: 0.9,
  buracosMaximos: 0,
  decoradosMinimos: 0,
}

const andavelEm = (p: Plano, i: number): boolean => p.temChao[i] === 1 && p.bloqueia[i] === 0

/**
 * A maior área andável conectada dentro da janela, em tiles.
 *
 * Quatro vizinhos, e não oito: o jogo anda em cruz, então uma passagem só na diagonal não é
 * passagem. Contar oito diria que a sala é alcançável quando ela não é.
 */
function maiorIlha(p: Plano, x0: number, y0: number, largura: number, altura: number): number {
  const visto = new Uint8Array(largura * altura)
  const fila = new Int32Array(largura * altura)
  let maior = 0
  for (let s = 0; s < visto.length; s++) {
    if (visto[s] === 1) continue
    const sx = s % largura
    const sy = (s / largura) | 0
    if (!andavelEm(p, (y0 + sy) * p.largura + x0 + sx)) { visto[s] = 1; continue }
    let inicio = 0
    let fim = 0
    fila[fim++] = s
    visto[s] = 1
    let tamanho = 0
    while (inicio < fim) {
      const atual = fila[inicio++]!
      tamanho++
      const ax = atual % largura
      const ay = (atual / largura) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = ax + dx
        const ny = ay + dy
        if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue
        const n = ny * largura + nx
        if (visto[n] === 1) continue
        visto[n] = 1
        if (andavelEm(p, (y0 + ny) * p.largura + x0 + nx)) fila[fim++] = n
      }
    }
    if (tamanho > maior) maior = tamanho
  }
  return maior
}

export function medir(p: Plano, x0: number, y0: number, largura: number, altura: number): Medidas {
  let buracos = 0
  let casas = 0
  let andaveis = 0
  let decorados = 0
  for (let dy = 0; dy < altura; dy++) {
    for (let dx = 0; dx < largura; dx++) {
      const i = (y0 + dy) * p.largura + x0 + dx
      if (p.temChao[i] === 0) buracos++
      if (p.casa[i] === 1) casas++
      if (p.decoracao[i] === 1) decorados++
      if (andavelEm(p, i)) andaveis++
    }
  }
  let fechados = 0
  let perimetro = 0
  for (let dy = 0; dy < altura; dy++) {
    for (let dx = 0; dx < largura; dx++) {
      if (dx !== 0 && dy !== 0 && dx !== largura - 1 && dy !== altura - 1) continue
      perimetro++
      if (!andavelEm(p, (y0 + dy) * p.largura + x0 + dx)) fechados++
    }
  }
  const celulas = largura * altura
  return {
    x: x0,
    y: y0,
    vedado: fechados / perimetro,
    buracos,
    casas,
    andavel: andaveis / celulas,
    ilha: andaveis === 0 ? 0 : maiorIlha(p, x0, y0, largura, altura) / andaveis,
    andaveis,
    decorados,
  }
}

/**
 * A nota de um lugar. Vedação pesa o dobro porque é o defeito que o jogador enxerga primeiro — o
 * mapa terminando no nada —, e a andabilidade é premiada por chegar perto da metade, que é a
 * proporção de corredor e parede que se lê como caverna e não como labirinto nem como salão.
 */
const IDEAL_ANDAVEL = 0.45
/**
 * A partir daqui o cenário já não é o que falta. Uma peça a cada vinte células é o que separa
 * "caverna mobiliada" de "corredor vazio"; acima disso a diferença deixa de decidir a escolha, e
 * por isso a parcela satura em vez de premiar acúmulo.
 */
export const DECORACAO_IDEAL = 0.05

export const nota = (m: Medidas, celulas: number): number =>
  m.vedado * 2
  + (1 - Math.abs(m.andavel - IDEAL_ANDAVEL) / IDEAL_ANDAVEL)
  + Math.min(1, m.decorados / (celulas * DECORACAO_IDEAL))

export function aprovado(m: Medidas, l: Limites): boolean {
  return m.buracos <= l.buracosMaximos && m.casas === 0 && m.vedado >= l.vedadoMinimo
    && m.andavel >= l.andavelMinimo && m.andavel <= l.andavelMaximo && m.ilha >= l.ilhaMinima
    && m.decorados >= l.decoradosMinimos
}

/**
 * Varre o andar e devolve os lugares aprovados, do melhor para o pior, sem vizinhos: duas janelas
 * separadas por dois tiles são o mesmo lugar, e uma lista cheia delas esconde as alternativas
 * reais. Fica a de melhor nota de cada vizinhança.
 */
export function procurar(p: Plano, limites: Limites = LIMITES_PADRAO): Medidas[] {
  const { largura, altura, passo } = limites
  const achados: Medidas[] = []
  for (let y = 0; y + altura <= p.altura; y += passo) {
    for (let x = 0; x + largura <= p.largura; x += passo) {
      const m = medir(p, x, y, largura, altura)
      if (aprovado(m, limites)) achados.push(m)
    }
  }
  const celulas = largura * altura
  achados.sort((a, b) => nota(b, celulas) - nota(a, celulas))
  const escolhidos: Medidas[] = []
  for (const m of achados) {
    const perto = escolhidos.some((e) => Math.abs(e.x - m.x) < largura / 2 && Math.abs(e.y - m.y) < altura / 2)
    if (!perto) escolhidos.push(m)
  }
  return escolhidos
}
