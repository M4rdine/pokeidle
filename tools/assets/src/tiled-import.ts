import { z } from 'zod'
import type { TiledTileset } from './atlas.js'
import { TILE_SIZE, parseHuntMap, type HuntMap, type HuntSpawn } from './hunt-map.js'

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

type TiledObject = z.infer<typeof TiledObjectSchema>
type TiledMap = z.infer<typeof TiledMapSchema>

const GID_FLAG_MASK = 0x1fff_ffff // remove bits de flip/rotação do Tiled

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
  if (!layer || layer.type !== 'tilelayer') throw new Error(`camada de tiles "${name}" não encontrada`)
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

export function importTiledMap(tiledJson: unknown, tileset: TiledTileset, meta: { id: string; name: string }): HuntMap {
  const map = TiledMapSchema.parse(tiledJson)
  const firstgid = map.tilesets[0]!.firstgid
  const names = tileNameLookup(tileset)
  const toNames = (data: number[]): Array<string | null> => data.map((gid) => gidToName(gid, firstgid, names))
  const all = objects(map)
  return parseHuntMap({
    id: meta.id,
    name: meta.name,
    width: map.width,
    height: map.height,
    tileSize: TILE_SIZE,
    layers: {
      ground: toNames(tileLayer(map, 'ground')),
      detail: toNames(tileLayer(map, 'detail')),
      blocking: tileLayer(map, 'blocking').map((gid) => gid !== 0),
    },
    spawnPoint: centerTile(singleObject(all, 'spawnPoint')),
    pokecenter: centerTile(singleObject(all, 'pokecenter')),
    spawns: all.filter((o) => objectClass(o) === 'spawn').map(toSpawn),
  })
}
