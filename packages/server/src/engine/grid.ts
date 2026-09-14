import type { Point } from './types.js'

export const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
export const isAdjacent = (a: Point, b: Point): boolean => manhattan(a, b) === 1
export const inBounds = (p: Point, width: number, height: number): boolean => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height
export const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y
export const neighbors = (p: Point): Point[] => [{ x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }]
const key = (p: Point): number => p.y * 100_000 + p.x

export interface PathInput {
  readonly from: Point; readonly target: Point
  readonly isBlocked: (p: Point) => boolean; readonly isGoal: (p: Point) => boolean
  readonly width: number; readonly height: number
}

/** A* em 4 vizinhos, custo 1, heurística Manhattan até `target`. Caminho sem a origem; null se inalcançável. */
export function findPath({ from, target, isBlocked, isGoal, width, height }: PathInput): Point[] | null {
  if (isGoal(from)) return []
  const cameFrom = new Map<number, Point>()
  const gScore = new Map<number, number>([[key(from), 0]])
  const open: Point[] = [from]
  const closed = new Set<number>()
  while (open.length > 0) {
    let bestIndex = 0
    for (let i = 1; i < open.length; i++) {
      const fi = (gScore.get(key(open[i]!)) ?? 0) + manhattan(open[i]!, target)
      const fb = (gScore.get(key(open[bestIndex]!)) ?? 0) + manhattan(open[bestIndex]!, target)
      if (fi < fb) bestIndex = i
    }
    const current = open.splice(bestIndex, 1)[0]!
    const ck = key(current)
    if (closed.has(ck)) continue
    closed.add(ck)
    if (isGoal(current)) return reconstruct(cameFrom, current, from)
    for (const next of neighbors(current)) {
      if (!inBounds(next, width, height) || isBlocked(next)) continue
      const nk = key(next)
      if (closed.has(nk)) continue
      const tentative = (gScore.get(ck) ?? 0) + 1
      if (tentative < (gScore.get(nk) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(nk, tentative)
        cameFrom.set(nk, current)
        open.push(next)
      }
    }
  }
  return null
}

function reconstruct(cameFrom: Map<number, Point>, end: Point, from: Point): Point[] {
  const path: Point[] = []
  let cur: Point | undefined = end
  while (cur && !samePoint(cur, from)) { path.push(cur); cur = cameFrom.get(key(cur)) }
  return path.reverse()
}

export interface FloodInput {
  readonly from: Point; readonly isBlocked: (p: Point) => boolean
  readonly width: number; readonly height: number
}

export interface Flood { readonly dist: ReadonlyMap<number, number>; readonly parent: ReadonlyMap<number, number> } // chave = y*width+x

/** BFS em 4 vizinhos (N, E, S, W), custo 1, a partir de `from` (nunca bloqueada). Não revisita tiles. */
export function floodFrom({ from, isBlocked, width, height }: FloodInput): Flood {
  const floodKey = (p: Point): number => p.y * width + p.x
  const dist = new Map<number, number>([[floodKey(from), 0]])
  const parent = new Map<number, number>()
  const queue: Point[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!
    const currentDist = dist.get(floodKey(current))!
    for (const next of neighbors(current)) {
      if (!inBounds(next, width, height) || isBlocked(next)) continue
      const nk = floodKey(next)
      if (dist.has(nk)) continue
      dist.set(nk, currentDist + 1)
      parent.set(nk, floodKey(current))
      queue.push(next)
    }
  }
  return { dist, parent }
}

/** Reconstrói o caminho de `from` até `to` a partir de um `Flood`. Caminho sem a origem; null se `to` não foi alcançado. */
export function pathFromFlood(flood: Flood, from: Point, to: Point, width: number): Point[] | null {
  const floodKey = (p: Point): number => p.y * width + p.x
  const fromKey = floodKey(from)
  let currentKey = floodKey(to)
  if (!flood.dist.has(currentKey)) return null
  const path: Point[] = []
  while (currentKey !== fromKey) {
    path.push({ x: currentKey % width, y: Math.floor(currentKey / width) })
    const parentKey = flood.parent.get(currentKey)
    if (parentKey === undefined) return null
    currentKey = parentKey
  }
  return path.reverse()
}
