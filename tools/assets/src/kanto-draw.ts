/**
 * Compõe a região de Kanto: oito áreas de biomas distintos, cada uma pintada com um pincel de
 * canto desenhado e povoada com os props gerados. Devolve um rascunho em nomes de tile — quem
 * chama traduz para gid e grava o `.tmj`. É ponto de partida para o Tiled, não substituto: o
 * usuário abre o arquivo e ajusta qualquer área à mão.
 */
import { BIOMAS, type Bioma } from './kanto-biomas.js'

export const KANTO = { width: 96, height: 72, areaWidth: 24, areaHeight: 36, tileSize: 32 } as const
/** Faixa de material primário na borda da área: garante borda caminhável e Centro acessível. */
const MARGEM = 2
/** Semente de cada área: espalha as manchas de ruído sem repetir bioma a bioma. */
const SEMENTE_POR_AREA = (indice: number): number => indice * 77 + 3
/** Lado, em tiles, do retângulo de spawn em volta do alvo. */
const RAIO_SPAWN = 4
const RESPAWN_SEGUNDOS = 20
/** Escala do ruído do terreno, em tiles: manchas desse tamanho em vez de chuvisco. */
const ESCALA_RUIDO = 7

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

export interface KantoDraft {
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

/** Grade mutável de trabalho. Só esta função enxerga a mutação; o resultado sai congelado. */
interface Grade {
  readonly ground: string[]
  readonly detail: (string | null)[]
  readonly canopy: (string | null)[]
  readonly blocked: boolean[]
}

interface Area {
  readonly bioma: Bioma
  readonly ax: number
  readonly ay: number
  readonly seed: number
}

const indiceDe = (area: Area, x: number, y: number): number => (area.ay + y) * KANTO.width + area.ax + x

/** Pinta o terreno da área com o pincel de canto do bioma, variando as peças puras. */
function pintarTerreno(grade: Grade, area: Area, temTile: (nome: string) => boolean): void {
  const { bioma, ax, ay, seed } = area
  const secundario = (cx: number, cy: number): boolean => {
    const dentro = cx >= MARGEM && cy >= MARGEM && cx <= KANTO.areaWidth - MARGEM && cy <= KANTO.areaHeight - MARGEM
    return dentro && smooth(cx, cy, ESCALA_RUIDO, seed) < bioma.mistura
  }
  const canto = (cx: number, cy: number): string => (secundario(cx, cy) ? 'b' : 'a')

  for (let y = 0; y < KANTO.areaHeight; y++) {
    for (let x = 0; x < KANTO.areaWidth; x++) {
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
      if (px < 1 || py < 1 || px >= KANTO.areaWidth - 1 || py >= KANTO.areaHeight - 1) return false
      const i = indiceDe(area, px, py)
      if (grade.blocked[i] || grade.detail[i] !== null || grade.canopy[i] !== null) return false
      // O nome pode terminar em '-v2' por causa das variações: o que importa é o código.
      if (!grade.ground[i]!.includes('-aaaa')) return false
    }
  }
  return true
}

/** Espalha os props do bioma por densidade, com árvore ocupando 2×2 e copa acima do jogador. */
function espalharProps(grade: Grade, area: Area): void {
  const { bioma, ax, ay, seed } = area
  for (const prop of bioma.props) {
    for (let y = 1; y < KANTO.areaHeight - 1; y++) {
      for (let x = 1; x < KANTO.areaWidth - 1; x++) {
        if (noise(ax + x, ay + y, seed + prop.nome.length * 13) > prop.densidade) continue
        const variante = 1 + Math.floor(noise(x, y, seed + 991) * prop.variantes)
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
  }
}

/** Varre a área a partir de (x0,y0) até achar um tile andável e vazio. */
function acharLivre(grade: Grade, area: Area, x0: number, y0: number, dx: number, dy: number): { x: number; y: number } {
  let x = x0
  let y = y0
  for (let passo = 0; passo < KANTO.areaWidth * KANTO.areaHeight; passo++) {
    const i = indiceDe(area, x, y)
    if (!grade.blocked[i] && grade.detail[i] === null) return { x, y }
    x += dx
    y += dy
    if (x < 1 || x >= KANTO.areaWidth - 1) { x = x0; y += dy }
    if (y < 1 || y >= KANTO.areaHeight - 1) { y = y0 }
  }
  throw new Error(`área ${area.bioma.id}: não achei tile livre para posicionar spawn, partida ou Centro`)
}

/**
 * Objetos da área: retângulo da área, ponto de partida, Centro e um spawn por espécie. Os spawns
 * vêm primeiro porque o ponto de partida nasce perto do primeiro deles — a caçada começa sem uma
 * travessia longa — e o Centro fica no canto oposto, para a volta custar alguma coisa.
 */
function objetosDaArea(grade: Grade, area: Area): ObjetoDraft[] {
  const { bioma, ax, ay } = area
  const { areaWidth: aw, areaHeight: ah, tileSize: tile } = KANTO
  const px = (t: number): number => t * tile

  const alvos = bioma.especies.map((_esp, n) =>
    acharLivre(grade, area, 4 + ((n * 7) % (aw - 9)), 5 + ((n * 11) % (ah - 11)), 1, 0))
  const primeiro = alvos[0]!
  const partida = acharLivre(grade, area, Math.max(1, primeiro.x - 2), Math.max(1, primeiro.y - 2), 1, 0)
  const centro = acharLivre(grade, area, aw - 3, ah - 3, -1, 0)
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
 * @param temTile diz se um nome existe no atlas; as variações de peça pura são opcionais e o
 * gerador só as usa quando o conjunto de terreno realmente as produziu.
 */
export function desenharKanto(temTile: (nome: string) => boolean): KantoDraft {
  const celulas = KANTO.width * KANTO.height
  const grade: Grade = {
    ground: Array.from({ length: celulas }, () => ''),
    detail: Array.from({ length: celulas }, () => null),
    canopy: Array.from({ length: celulas }, () => null),
    blocked: Array.from({ length: celulas }, () => false),
  }
  const porLinha = Math.floor(KANTO.width / KANTO.areaWidth)
  const objetos: ObjetoDraft[] = []

  BIOMAS.forEach((bioma, indice) => {
    const area: Area = {
      bioma,
      ax: (indice % porLinha) * KANTO.areaWidth,
      ay: Math.floor(indice / porLinha) * KANTO.areaHeight,
      seed: SEMENTE_POR_AREA(indice),
    }
    pintarTerreno(grade, area, temTile)
    espalharProps(grade, area)
    objetos.push(...objetosDaArea(grade, area))
  })

  return { width: KANTO.width, height: KANTO.height, ...grade, objetos }
}
