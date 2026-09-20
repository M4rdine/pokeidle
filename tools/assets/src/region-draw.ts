/**
 * Compõe uma região: oito áreas de biomas distintos, cada uma pintada com um pincel de canto
 * desenhado e povoada com os props gerados. Devolve um rascunho em nomes de tile — quem chama
 * traduz para gid e grava o `.tmj`. É ponto de partida para o Tiled, não substituto: o usuário
 * abre o arquivo e ajusta qualquer área à mão.
 *
 * O gerador não conhece região nenhuma: recebe a lista de biomas e desenha. Kanto e as Terras
 * Altas saem do mesmo código, e é por isso que o mapa de uma não pode quebrar quando a outra
 * muda.
 */
import type { Bioma, RegionSpec } from './regioes.js'

/** Toda região tem a mesma grade: oito áreas de 24×36 numa folha de 96×72. */
export const GRADE = { width: 96, height: 72, areaWidth: 24, areaHeight: 36, tileSize: 32 } as const
/**
 * Anel de material primário na borda da área, em tiles. Como o material sai dos quatro cantos do
 * tile, um anel de dois cantos garante dois tiles puros em toda a volta: é o que mantém a borda
 * caminhável e o Centro acessível mesmo com o ruído puxando água ou rocha para perto da beirada.
 */
const MARGEM = 2
/** Semente de cada área: espalha as manchas de ruído sem repetir bioma a bioma. */
const SEMENTE_POR_AREA = (indice: number): number => indice * 77 + 3
/** Lado, em tiles, do retângulo de spawn em volta do alvo. */
const RAIO_SPAWN = 4
const RESPAWN_SEGUNDOS = 20
/** Escala do ruído do terreno, em tiles: manchas desse tamanho em vez de chuvisco. */
const ESCALA_RUIDO = 7
/**
 * Meia largura da trilha, em cantos de tile. Zero dá a faixa mais estreita que o pincel de canto
 * consegue desenhar — dois tiles, contando as bordas. Mais que isso vira praça, não caminho.
 */
const LARGURA_TRILHA = 0

export interface ObjetoDraft {
  readonly classe: 'area' | 'spawnPoint' | 'pokecenter' | 'spawn'
  readonly nome: string
  /** Em pixels, como o Tiled grava. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly properties: readonly { readonly name: string; readonly type: 'string' | 'int'; readonly value: string | number }[]
}

export interface RegionDraft {
  readonly width: number
  readonly height: number
  /** Nome do tile de cada célula; todas preenchidas. */
  readonly ground: readonly string[]
  readonly detail: readonly (string | null)[]
  readonly canopy: readonly (string | null)[]
  readonly blocked: readonly boolean[]
  readonly objetos: readonly ObjetoDraft[]
}

function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Ruído suave: média de quatro cantos de uma célula grande, para manchas em vez de chuvisco. */
function smooth(x: number, y: number, escala: number, seed: number): number {
  const fx = x / escala
  const fy = y / escala
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const s = (a: number, b: number, t: number): number => a + (b - a) * (t * t * (3 - 2 * t))
  return s(
    s(noise(x0, y0, seed), noise(x0 + 1, y0, seed), tx),
    s(noise(x0, y0 + 1, seed), noise(x0 + 1, y0 + 1, seed), tx),
    ty)
}

/** Grade mutável de trabalho: a mutação não escapa de `desenharRegiao`, que congela o resultado. */
interface Grade {
  readonly ground: string[]
  readonly detail: (string | null)[]
  readonly canopy: (string | null)[]
  readonly blocked: boolean[]
  /** Células de partida e Centro: escolhidas antes dos props, e nenhum prop pode ocupá-las. */
  readonly reservado: Set<number>
}

interface Area {
  readonly bioma: Bioma
  readonly ax: number
  readonly ay: number
  readonly seed: number
}

const indiceDe = (area: Area, x: number, y: number): number => (area.ay + y) * GRADE.width + area.ax + x

/** Pinta o terreno da área com o pincel de canto do bioma, variando as peças puras. */
function pintarTerreno(grade: Grade, area: Area, temTile: (nome: string) => boolean): void {
  const { bioma, ax, ay, seed } = area
  const secundario = (cx: number, cy: number): boolean => {
    const dentro = cx > MARGEM && cy > MARGEM && cx < GRADE.areaWidth - MARGEM && cy < GRADE.areaHeight - MARGEM
    return dentro && smooth(cx, cy, ESCALA_RUIDO, seed) < bioma.mistura
  }
  const canto = (cx: number, cy: number): string => (secundario(cx, cy) ? 'b' : 'a')

  for (let y = 0; y < GRADE.areaHeight; y++) {
    for (let x = 0; x < GRADE.areaWidth; x++) {
      const code = `${canto(x + 1, y)}${canto(x + 1, y + 1)}${canto(x, y + 1)}${canto(x, y)}`
      const i = indiceDe(area, x, y)
      // Peça pura ganha variação quando o atlas trouxe alternativas: sem isso o campo fica
      // chapado e a repetição denuncia geração.
      const base = `${bioma.set}-${code}`
      const variantes = code === 'aaaa' || code === 'bbbb'
        ? [base, ...[2, 3, 4].map((v) => `${base}-v${v}`).filter(temTile)]
        : [base]
      grade.ground[i] = variantes[Math.floor(noise(ax + x, ay + y, seed + 5) * variantes.length)]!
      if (bioma.bloqueia && code === 'bbbb') grade.blocked[i] = true
    }
  }
}

/** Livre = dentro da borda, em material primário e sem nada por cima. */
function livre(grade: Grade, area: Area, x: number, y: number, largura: number, altura: number): boolean {
  for (let dy = 0; dy < altura; dy++) {
    for (let dx = 0; dx < largura; dx++) {
      const px = x + dx
      const py = y + dy
      if (px < 1 || py < 1 || px >= GRADE.areaWidth - 1 || py >= GRADE.areaHeight - 1) return false
      const i = indiceDe(area, px, py)
      if (grade.blocked[i] || grade.detail[i] !== null || grade.canopy[i] !== null) return false
      if (grade.reservado.has(i)) return false
      // O nome pode terminar em '-v2' por causa das variações: o que importa é o código.
      if (!grade.ground[i]!.includes('-aaaa')) return false
    }
  }
  return true
}

/** Espalha os props do bioma por densidade, com árvore ocupando 2×2 e copa acima do jogador. */
function espalharProps(grade: Grade, area: Area): void {
  const { bioma, ax, ay, seed } = area
  // O índice separa a máscara de cada prop. Usar o nome (ou o comprimento dele) faria dois props
  // do mesmo bioma sortearem as mesmas células, e o segundo nunca apareceria.
  bioma.props.forEach((prop, ordem) => {
    for (let y = 1; y < GRADE.areaHeight - 1; y++) {
      for (let x = 1; x < GRADE.areaWidth - 1; x++) {
        if (noise(ax + x, ay + y, seed + ordem * 13 + 1) > prop.densidade) continue
        const variante = 1 + Math.floor(noise(ax + x, ay + y, seed + 991) * prop.variantes)
        const nome = `${prop.nome}-${variante}`
        if (prop.grande) {
          if (!livre(grade, area, x, y, 2, 2)) continue
          // Copa acima do jogador, tronco bloqueando: é o recurso da fase 4b em uso.
          grade.canopy[indiceDe(area, x, y)] = `${nome}-x0-y0`
          grade.canopy[indiceDe(area, x + 1, y)] = `${nome}-x1-y0`
          grade.detail[indiceDe(area, x, y + 1)] = `${nome}-x0-y1`
          grade.detail[indiceDe(area, x + 1, y + 1)] = `${nome}-x1-y1`
          grade.blocked[indiceDe(area, x, y + 1)] = true
          grade.blocked[indiceDe(area, x + 1, y + 1)] = true
          continue
        }
        if (!livre(grade, area, x, y, 1, 1)) continue
        grade.detail[indiceDe(area, x, y)] = nome
        if (prop.bloqueia) grade.blocked[indiceDe(area, x, y)] = true
      }
    }
  })
}

/**
 * Varre a área inteira a partir de (x0,y0), linha a linha na direção `dx`, dando a volta quando
 * chega na borda. Andável, vazio e fora da copa: um Centro debaixo de uma árvore existe, mas o
 * jogador nunca o vê, porque a copa desenha acima dele.
 */
function acharLivre(grade: Grade, area: Area, x0: number, y0: number, dx: number): { x: number; y: number } {
  const { areaWidth: aw, areaHeight: ah } = GRADE
  let x = x0
  let y = y0
  for (let passo = 0; passo < aw * ah; passo++) {
    const i = indiceDe(area, x, y)
    if (!grade.blocked[i] && grade.detail[i] === null && grade.canopy[i] === null && !grade.reservado.has(i)) return { x, y }
    x += dx
    if (x < 1 || x >= aw - 1) {
      x = dx > 0 ? 1 : aw - 2
      y += 1
      if (y >= ah - 1) y = 1
    }
  }
  throw new Error(`área ${area.bioma.id}: nenhum tile livre em ${aw}x${ah} para posicionar spawn, partida ou Centro`)
}

interface Ponto { readonly x: number; readonly y: number }
interface Pontos {
  readonly alvos: readonly Ponto[]
  readonly partida: Ponto
  readonly centro: Ponto
}

/**
 * Escolhe onde ficam os spawns, a partida e o Centro, e reserva as duas últimas. Roda logo depois
 * do terreno e antes dos props: a trilha precisa saber para onde ir, e nenhum prop pode nascer em
 * cima do Centro.
 */
function escolherPontos(grade: Grade, area: Area): Pontos {
  const { bioma } = area
  const { areaWidth: aw, areaHeight: ah } = GRADE
  // Os spawns primeiro: a partida nasce perto do primeiro deles — a caçada começa sem uma
  // travessia longa — e o Centro fica no canto oposto, para a volta custar alguma coisa.
  const alvos = bioma.especies.map((_esp, n) =>
    acharLivre(grade, area, 4 + ((n * 7) % (aw - 9)), 5 + ((n * 11) % (ah - 11)), 1))
  const primeiro = alvos[0]!
  const partida = acharLivre(grade, area, Math.max(1, primeiro.x - 2), Math.max(1, primeiro.y - 2), 1)
  grade.reservado.add(indiceDe(area, partida.x, partida.y))
  const centro = acharLivre(grade, area, aw - 3, ah - 3, -1)
  grade.reservado.add(indiceDe(area, centro.x, centro.y))
  return { alvos, partida, centro }
}

const entre = (v: number, a: number, b: number): boolean => v >= Math.min(a, b) && v <= Math.max(a, b)

/** Distância de um canto a um segmento reto (horizontal ou vertical), em cantos de tile. */
function distanciaAoSegmento(cx: number, cy: number, de: Ponto, para: Ponto): number {
  if (de.y === para.y) return entre(cx, de.x, para.x) ? Math.abs(cy - de.y) : Infinity
  return entre(cy, de.y, para.y) ? Math.abs(cx - de.x) : Infinity
}

/**
 * O percurso da trilha: da partida até o Centro com a dobra no meio da área, não no canto. Um L
 * colado na borda vira moldura; o Z pelo meio cruza a área e é o que dá direção ao olho.
 */
function percurso(partida: Ponto, centro: Ponto): readonly (readonly [Ponto, Ponto])[] {
  const meio = Math.round((partida.x + centro.x) / 2)
  const dobra1 = { x: meio, y: partida.y }
  const dobra2 = { x: meio, y: centro.y }
  return [[partida, dobra1], [dobra1, dobra2], [dobra2, centro]]
}

/**
 * Trilha de terra batida ligando a partida ao Centro, em L. Ela é pintada com o pincel de canto
 * do conjunto de caminho — nunca com o tile puro solto, que deixaria a faixa com borda reta e
 * denunciaria o gerador. Além de dar direção ao olho, garante um corredor sem props entre os dois
 * pontos: prop só nasce em material primário.
 */
function pintarTrilha(grade: Grade, area: Area, pontos: Pontos): void {
  const { bioma } = area
  if (bioma.trilha === null) return
  const { partida, centro } = pontos
  const trechos = percurso(partida, centro)
  const naTrilha = (cx: number, cy: number): boolean =>
    trechos.some(([de, para]) => distanciaAoSegmento(cx, cy, de, para) <= LARGURA_TRILHA)

  for (let y = 0; y < GRADE.areaHeight; y++) {
    for (let x = 0; x < GRADE.areaWidth; x++) {
      const i = indiceDe(area, x, y)
      // Só sobre material primário: a trilha não atravessa água nem rocha, e é o primário do
      // bioma que combina com o campo do conjunto de caminho.
      if (grade.blocked[i] || !grade.ground[i]!.includes('-aaaa')) continue
      const canto = (cx: number, cy: number): string => (naTrilha(cx, cy) ? 'b' : 'a')
      const code = `${canto(x + 1, y)}${canto(x + 1, y + 1)}${canto(x, y + 1)}${canto(x, y)}`
      if (code === 'aaaa') continue
      grade.ground[i] = `${bioma.trilha}-${code}`
    }
  }
}

/** Objetos da área: retângulo da área, ponto de partida, Centro e um spawn por espécie. */
function objetosDaArea(area: Area, pontos: Pontos): ObjetoDraft[] {
  const { bioma, ax, ay } = area
  const { areaWidth: aw, areaHeight: ah, tileSize: tile } = GRADE
  const px = (t: number): number => t * tile
  const { alvos, partida, centro } = pontos
  const unitario = (classe: ObjetoDraft['classe'], p: { x: number; y: number }): ObjetoDraft =>
    ({ classe, nome: classe, x: px(ax + p.x), y: px(ay + p.y), width: tile, height: tile, properties: [] })

  const lado = RAIO_SPAWN * 2 * tile
  return [
    { classe: 'area', nome: bioma.id, x: px(ax), y: px(ay), width: px(aw), height: px(ah),
      properties: [{ name: 'id', type: 'string', value: bioma.id }, { name: 'name', type: 'string', value: bioma.nome }] },
    unitario('spawnPoint', partida),
    unitario('pokecenter', centro),
    ...bioma.especies.map((esp, n): ObjetoDraft => {
      const alvo = alvos[n]!
      return {
        classe: 'spawn', nome: 'spawn',
        x: px(ax + alvo.x) + tile / 2 - lado / 2,
        y: px(ay + alvo.y) + tile / 2 - lado / 2,
        width: lado, height: lado,
        properties: [
          { name: 'species', type: 'string', value: esp.nome },
          { name: 'minLevel', type: 'int', value: esp.min },
          { name: 'maxLevel', type: 'int', value: esp.max },
          { name: 'count', type: 'int', value: esp.quantidade },
          { name: 'respawnSeconds', type: 'int', value: RESPAWN_SEGUNDOS },
        ],
      }
    }),
  ]
}

/**
 * @param spec a região a desenhar: metadados e a lista de biomas, um por área.
 * @param temTile diz se um nome existe no atlas; as variações de peça pura são opcionais e o
 * gerador só as usa quando o conjunto de terreno realmente as produziu.
 */
export function desenharRegiao(spec: RegionSpec, temTile: (nome: string) => boolean): RegionDraft {
  const celulas = GRADE.width * GRADE.height
  const grade: Grade = {
    ground: Array.from({ length: celulas }, () => ''),
    detail: Array.from({ length: celulas }, () => null),
    canopy: Array.from({ length: celulas }, () => null),
    blocked: Array.from({ length: celulas }, () => false),
    reservado: new Set<number>(),
  }
  const { biomas } = spec
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  const cabem = porLinha * Math.floor(GRADE.height / GRADE.areaHeight)
  // Sem esta guarda, um bioma a mais escreveria fora da grade em silêncio: os arrays crescem e a
  // área extra simplesmente não aparece no mapa recortado.
  if (biomas.length > cabem) {
    throw new Error(`região ${spec.id}: ${biomas.length} biomas não cabem em ${GRADE.width}x${GRADE.height}, que comporta ${cabem}`)
  }
  const objetos: ObjetoDraft[] = []

  biomas.forEach((bioma, indice) => {
    const area: Area = {
      bioma,
      ax: (indice % porLinha) * GRADE.areaWidth,
      ay: Math.floor(indice / porLinha) * GRADE.areaHeight,
      seed: SEMENTE_POR_AREA(indice),
    }
    pintarTerreno(grade, area, temTile)
    const pontos = escolherPontos(grade, area)
    pintarTrilha(grade, area, pontos)
    espalharProps(grade, area)
    objetos.push(...objetosDaArea(area, pontos))
  })

  return Object.freeze({
    width: GRADE.width,
    height: GRADE.height,
    ground: Object.freeze([...grade.ground]),
    detail: Object.freeze([...grade.detail]),
    canopy: Object.freeze([...grade.canopy]),
    blocked: Object.freeze([...grade.blocked]),
    objetos: Object.freeze(objetos),
  })
}
