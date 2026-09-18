import { z } from 'zod'
import { TILE_SIZE, parseHuntMap, parseOrThrow, type HuntMap, type HuntSpawn } from '@pokeidle/shared'
import type { TiledTileset } from './atlas.js'

const TiledPropertySchema = z.object({ name: z.string(), type: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })

const TiledObjectSchema = z.object({
  id: z.number(),
  class: z.string().optional(),
  type: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  properties: z.array(TiledPropertySchema).optional(),
})

const TiledLayerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tilelayer'), name: z.string(), data: z.array(z.number()) }),
  z.object({ type: z.literal('objectgroup'), name: z.string(), objects: z.array(TiledObjectSchema) }),
  z.object({ type: z.literal('imagelayer'), name: z.string() }),
  z.object({ type: z.literal('group'), name: z.string() }),
])

const TiledMapSchema = z.object({
  orientation: z.literal('orthogonal'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.literal(TILE_SIZE),
  tileheight: z.literal(TILE_SIZE),
  tilesets: z.array(z.object({ firstgid: z.number().int().positive() })).min(1),
  layers: z.array(TiledLayerSchema),
})

const TilesetPropertySchema = z.object({ name: z.literal('name'), type: z.literal('string'), value: z.string() })

const TiledTilesetSchema = z.object({
  type: z.literal('tileset'),
  version: z.string(),
  name: z.string(),
  image: z.string(),
  imagewidth: z.number().int().positive(),
  imageheight: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  tilecount: z.number().int().min(0),
  columns: z.number().int().min(0),
  margin: z.number().int().min(0),
  spacing: z.number().int().min(0),
  tiles: z.array(z.object({ id: z.number().int().min(0), properties: z.array(TilesetPropertySchema) })),
  wangsets: z.array(z.unknown()).optional(),
})

type TiledObject = z.infer<typeof TiledObjectSchema>
type TiledMap = z.infer<typeof TiledMapSchema>

export interface ImportOptions {
  readonly knownSpecies?: ReadonlySet<string>
}

export function parseTiledTileset(json: unknown): TiledTileset {
  const parsed = parseOrThrow(TiledTilesetSchema, json, 'tileset', 'dica: use o tiles.tsj gerado pelo comando build')
  // wangsets só precisa ser aceito, não usado: descartamos para não carregar um tipo `unknown[]` adiante.
  const { wangsets: _wangsets, ...tileset } = parsed
  return tileset
}

const GID_FLAG_MASK = 0x1fff_ffff // remove bits de flip/rotação do Tiled

function parseTiledMap(json: unknown): TiledMap {
  return parseOrThrow(
    TiledMapSchema,
    json,
    'mapa Tiled',
    'dica: exporte como JSON com "Tile Layer Format" = CSV e mapa não infinito (sem chunks)',
  )
}

function tileNameLookup(tileset: TiledTileset): Map<number, string> {
  return new Map(tileset.tiles.map((t) => [t.id, t.properties.find((p) => p.name === 'name')?.value ?? `tile-${t.id}`]))
}

function gidToName(gid: number, firstgid: number, names: Map<number, string>): string | null {
  if (gid === 0) return null
  const localId = (gid & GID_FLAG_MASK) - firstgid
  const name = names.get(localId)
  if (name === undefined) throw new Error(`gid ${gid} não existe no tileset (id local ${localId})`)
  return name
}

function tileLayer(map: TiledMap, name: string): number[] {
  const layer = map.layers.find((l) => l.type === 'tilelayer' && l.name === name)
  if (!layer || layer.type !== 'tilelayer') {
    throw new Error(`camada de tiles "${name}" não encontrada no nível raiz (camadas dentro de grupos não são suportadas)`)
  }
  return layer.data
}

function objects(map: TiledMap): TiledObject[] {
  return map.layers.flatMap((l) => (l.type === 'objectgroup' ? l.objects : []))
}

function objectClass(o: TiledObject): string {
  return o.class ?? o.type ?? ''
}

function centerTile(o: TiledObject): { x: number; y: number } {
  return { x: Math.floor((o.x + o.width / 2) / TILE_SIZE), y: Math.floor((o.y + o.height / 2) / TILE_SIZE) }
}

function singleObject(all: TiledObject[], cls: string): TiledObject {
  const found = all.filter((o) => objectClass(o) === cls)
  if (found.length !== 1) throw new Error(`esperado exatamente 1 objeto "${cls}", encontrados ${found.length}`)
  return found[0]!
}

function prop<T extends string | number>(o: TiledObject, name: string, kind: 'string' | 'number'): T {
  const p = o.properties?.find((p) => p.name === name)
  if (!p || typeof p.value !== kind) throw new Error(`objeto ${o.id} (${objectClass(o)}): propriedade "${name}" (${kind}) ausente`)
  return p.value as T
}

function toSpawn(o: TiledObject): HuntSpawn {
  return {
    speciesName: prop<string>(o, 'species', 'string'),
    minLevel: prop<number>(o, 'minLevel', 'number'),
    maxLevel: prop<number>(o, 'maxLevel', 'number'),
    ...centerTile(o),
    radius: Math.ceil(Math.max(o.width, o.height) / 2 / TILE_SIZE),
    count: prop<number>(o, 'count', 'number'),
    respawnSeconds: prop<number>(o, 'respawnSeconds', 'number'),
  }
}

function checkSpecies(spawns: readonly HuntSpawn[], objectIds: readonly number[], known: ReadonlySet<string>): void {
  for (const [i, spawn] of spawns.entries()) {
    if (!known.has(spawn.speciesName)) {
      throw new Error(`espécie desconhecida "${spawn.speciesName}" no spawn (objeto ${objectIds[i]})`)
    }
  }
}

type Point = { x: number; y: number }

const MIN_DISTANCE_FROM_EDGE = 1

/** Deslocamentos ortogonais: o mesmo movimento que o A* do motor usa para caminhar no grid. */
const ORTHOGONAL_OFFSETS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

function blockedAt(blocking: readonly boolean[], width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return true
  return blocking[y * width + x] ?? true
}

/** Um tile livre em qualquer lugar do quadrado de lado `2 * radius + 1` centrado no spawn. */
function hasFreeTile(blocking: readonly boolean[], width: number, height: number, spawn: HuntSpawn): boolean {
  for (let y = spawn.y - spawn.radius; y <= spawn.y + spawn.radius; y++) {
    for (let x = spawn.x - spawn.radius; x <= spawn.x + spawn.radius; x++) {
      if (!blockedAt(blocking, width, height, x, y)) return true
    }
  }
  return false
}

/** BFS a partir de `start` sobre tiles não bloqueados (só movimento ortogonal, como o A* do motor). */
function reachableTiles(blocking: readonly boolean[], width: number, height: number, start: Point): Set<number> {
  if (blockedAt(blocking, width, height, start.x, start.y)) return new Set()
  const visited = new Set<number>([start.y * width + start.x])
  const queue: Point[] = [start]
  let head = 0
  while (head < queue.length) {
    const current = queue[head++]!
    for (const offset of ORTHOGONAL_OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y }
      if (blockedAt(blocking, width, height, next.x, next.y)) continue
      const index = next.y * width + next.x
      if (visited.has(index)) continue
      visited.add(index)
      queue.push(next)
    }
  }
  return visited
}

/** O motor considera o Centro alcançado quando chega nele ou em qualquer vizinho ortogonal. */
function isPokecenterReachable(reachable: ReadonlySet<number>, width: number, height: number, pokecenter: Point): boolean {
  const candidates = [pokecenter, ...ORTHOGONAL_OFFSETS.map((o) => ({ x: pokecenter.x + o.x, y: pokecenter.y + o.y }))]
  return candidates.some((p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height && reachable.has(p.y * width + p.x))
}

/** Algum tile alcançável dentro do quadrado de lado `2 * radius + 1` centrado no spawn. */
function hasReachableTile(reachable: ReadonlySet<number>, width: number, height: number, spawn: HuntSpawn): boolean {
  for (let y = spawn.y - spawn.radius; y <= spawn.y + spawn.radius; y++) {
    for (let x = spawn.x - spawn.radius; x <= spawn.x + spawn.radius; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height && reachable.has(y * width + x)) return true
    }
  }
  return false
}

function checkMap(
  map: { width: number; height: number },
  blocking: readonly boolean[],
  points: { spawnPoint: Point; pokecenter: Point },
  spawns: readonly HuntSpawn[],
): string[] {
  const problems: string[] = []
  if (blockedAt(blocking, map.width, map.height, points.spawnPoint.x, points.spawnPoint.y)) {
    problems.push(`ponto de partida em (${points.spawnPoint.x}, ${points.spawnPoint.y}) está num tile bloqueado`)
  }
  if (blockedAt(blocking, map.width, map.height, points.pokecenter.x, points.pokecenter.y)) {
    problems.push(`Centro Pokémon em (${points.pokecenter.x}, ${points.pokecenter.y}) está num tile bloqueado`)
  }
  const { x, y } = points.pokecenter
  const nearEdge = x < MIN_DISTANCE_FROM_EDGE || y < MIN_DISTANCE_FROM_EDGE || x >= map.width - MIN_DISTANCE_FROM_EDGE || y >= map.height - MIN_DISTANCE_FROM_EDGE
  if (nearEdge) problems.push(`Centro Pokémon em (${x}, ${y}) está na borda do mapa; deixe ao menos um tile de folga`)

  const reachable = reachableTiles(blocking, map.width, map.height, points.spawnPoint)
  if (!isPokecenterReachable(reachable, map.width, map.height, points.pokecenter)) {
    problems.push(`Centro Pokémon em (${x}, ${y}) não é alcançável a partir do ponto de partida`)
  }

  for (const spawn of spawns) {
    if (!hasFreeTile(blocking, map.width, map.height, spawn)) {
      problems.push(`spawn de ${spawn.speciesName} em (${spawn.x}, ${spawn.y}) está sem tile livre no raio ${spawn.radius}`)
    } else if (!hasReachableTile(reachable, map.width, map.height, spawn)) {
      problems.push(`spawn de ${spawn.speciesName} em (${spawn.x}, ${spawn.y}) não tem tile livre alcançável no raio ${spawn.radius}`)
    }
  }
  return problems
}

export function importTiledMap(
  tiledJson: unknown,
  tileset: TiledTileset,
  meta: { id: string; name: string },
  options?: ImportOptions,
): HuntMap {
  const map = parseTiledMap(tiledJson)
  if (map.tilesets.length !== 1) {
    throw new Error(`mapa usa ${map.tilesets.length} tilesets; o importador aceita exatamente 1 (o tiles.tsj gerado pelo build)`)
  }
  const firstgid = map.tilesets[0]!.firstgid
  const names = tileNameLookup(tileset)
  const toNames = (data: number[]): Array<string | null> => data.map((gid) => gidToName(gid, firstgid, names))
  const all = objects(map)
  const spawnObjects = all.filter((o) => objectClass(o) === 'spawn')
  const spawns = spawnObjects.map(toSpawn)
  if (options?.knownSpecies !== undefined) checkSpecies(spawns, spawnObjects.map((o) => o.id), options.knownSpecies)
  const blocking = tileLayer(map, 'blocking').map((gid) => gid !== 0)
  const spawnPoint = centerTile(singleObject(all, 'spawnPoint'))
  const pokecenter = centerTile(singleObject(all, 'pokecenter'))
  const problems = checkMap(map, blocking, { spawnPoint, pokecenter }, spawns)
  if (problems.length > 0) throw new Error(`mapa inválido:\n- ${problems.join('\n- ')}`)
  return parseHuntMap({
    id: meta.id,
    name: meta.name,
    width: map.width,
    height: map.height,
    tileSize: TILE_SIZE,
    layers: {
      ground: toNames(tileLayer(map, 'ground')),
      detail: toNames(tileLayer(map, 'detail')),
      blocking,
    },
    spawnPoint,
    pokecenter,
    spawns,
  })
}
