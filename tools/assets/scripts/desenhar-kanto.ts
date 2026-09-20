/**
 * Gera `tools/assets/maps/kanto.tmj` a partir do rascunho de `kanto-draw.ts`. Só faz I/O e a
 * tradução de nome de tile para gid: a composição toda é pura e vive em src/.
 *
 * Uso: `pnpm mapa:kanto` na raiz, ou `pnpm desenhar:kanto` dentro de tools/assets. Os caminhos
 * saem da localização deste arquivo, então o diretório de trabalho não importa.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { desenharKanto, KANTO, type ObjetoDraft } from '../src/kanto-draw.js'
import { parseTiledTileset } from '../src/tiled-import.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TILESET = join(RAIZ, 'assets', 'atlas', 'tiles.tsj')
const SAIDA = join(RAIZ, 'tools', 'assets', 'maps', 'kanto.tmj')
/** Caminho do tileset gravado no `.tmj`, relativo à pasta do mapa, como o Tiled espera. */
const TILESET_RELATIVO = '../../../assets/atlas/tiles.tsj'
/** O mapa usa um tileset só, então o primeiro gid é 1 e o id local do tile vira gid − 1. */
const FIRSTGID = 1
/** Tile usado na camada de bloqueio; nunca é desenhado, só marca passagem. */
const TILE_BLOQUEIO = 'campo-pedra-bbbb'

/** Nome → id local, pelo mesmo parser que o importador usa, para não divergir em silêncio. */
const lerTileset = (caminho: string): ReadonlyMap<string, number> => {
  try {
    const tileset = parseTiledTileset(JSON.parse(readFileSync(caminho, 'utf8')))
    return new Map(tileset.tiles.map((t) => [t.properties[0]!.value, t.id]))
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error)
    throw new Error(`não consegui ler o tileset em ${caminho}: ${motivo}. Rode "pnpm assets build" antes.`)
  }
}

const idByName = lerTileset(TILESET)
const gid = (nome: string): number => {
  const id = idByName.get(nome)
  if (id === undefined) throw new Error(`tile "${nome}" não está no tileset`)
  return id + FIRSTGID
}
const gidOuVazio = (nome: string | null): number => (nome === null ? 0 : gid(nome))

const draft = desenharKanto((nome) => idByName.has(nome))

const camada = (id: number, name: string, data: readonly number[]) => ({
  id, type: 'tilelayer', name, width: draft.width, height: draft.height,
  x: 0, y: 0, opacity: 1, visible: true, data,
})
const objeto = (o: ObjetoDraft, id: number) => ({
  id, class: o.classe, name: o.nome, x: o.x, y: o.y, width: o.width, height: o.height,
  rotation: 0, visible: true, properties: o.properties,
})

const objetos = draft.objetos.map((o, i) => objeto(o, i + 1))
const mapa = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, width: draft.width, height: draft.height, tilewidth: KANTO.tileSize, tileheight: KANTO.tileSize,
  nextlayerid: 6, nextobjectid: objetos.length + 1,
  properties: [
    { name: 'id', type: 'string', value: 'kanto' },
    { name: 'name', type: 'string', value: 'Kanto' },
    { name: 'order', type: 'int', value: 1 },
    { name: 'minTrainerLevel', type: 'int', value: 1 },
  ],
  tilesets: [{ firstgid: FIRSTGID, source: TILESET_RELATIVO }],
  layers: [
    camada(1, 'ground', draft.ground.map(gid)),
    camada(2, 'detail', draft.detail.map(gidOuVazio)),
    camada(3, 'blocking', draft.blocked.map((b) => (b ? gid(TILE_BLOQUEIO) : 0))),
    camada(4, 'canopy', draft.canopy.map(gidOuVazio)),
    { id: 5, type: 'objectgroup', name: 'objects', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: objetos },
  ],
}

writeFileSync(SAIDA, JSON.stringify(mapa, null, 1))
process.stdout.write(`Kanto ${draft.width}x${draft.height} com ${objetos.length} objetos em ${SAIDA}\n`)
