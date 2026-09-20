/**
 * Gera o `.tmj` de uma região a partir do rascunho de `region-draw.ts`. Só faz I/O e a tradução
 * de nome de tile para gid: a composição toda é pura e vive em src/.
 *
 * Uso: `pnpm mapa <regiao>` na raiz, ou `pnpm desenhar <regiao>` dentro de tools/assets. Sem
 * argumento, desenha todas. Os caminhos saem da localização deste arquivo, então o diretório de
 * trabalho não importa.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { desenharRegiao, GRADE, type ObjetoDraft, type RegionDraft } from '../src/region-draw.js'
import { REGIOES, regiaoPorId, type RegionSpec } from '../src/regioes.js'
import { parseTiledTileset } from '../src/tiled-import.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TILESET = join(RAIZ, 'assets', 'atlas', 'tiles.tsj')
/** Caminho do tileset gravado no `.tmj`, relativo à pasta do mapa, como o Tiled espera. */
const TILESET_RELATIVO = '../../../assets/atlas/tiles.tsj'
/** O mapa usa um tileset só, então o primeiro gid é 1 e o id local do tile vira gid − 1. */
const FIRSTGID = 1
/** Tile usado na camada de bloqueio; nunca é desenhado, só marca passagem. */
const TILE_BLOQUEIO = 'campo-pedra-bbbb'

interface Tsj { readonly tiles: readonly { readonly id: number; readonly properties: readonly { readonly value: string }[] }[] }

/** Nome → id local, pelo mesmo parser que o importador usa, para não divergir em silêncio. */
const lerTileset = (caminho: string): ReadonlyMap<string, number> => {
  try {
    const tileset = parseTiledTileset(JSON.parse(readFileSync(caminho, 'utf8')) as Tsj)
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

const camada = (draft: RegionDraft, id: number, name: string, data: readonly number[]) => ({
  id, type: 'tilelayer', name, width: draft.width, height: draft.height,
  x: 0, y: 0, opacity: 1, visible: true, data,
})
const objeto = (o: ObjetoDraft, id: number) => ({
  id, class: o.classe, name: o.nome, x: o.x, y: o.y, width: o.width, height: o.height,
  rotation: 0, visible: true, properties: o.properties,
})

function gravar(spec: RegionSpec): string {
  const draft = desenharRegiao(spec, (nome) => idByName.has(nome))
  const objetos = draft.objetos.map((o, i) => objeto(o, i + 1))
  const mapa = {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    infinite: false, width: draft.width, height: draft.height, tilewidth: GRADE.tileSize, tileheight: GRADE.tileSize,
    nextlayerid: 6, nextobjectid: objetos.length + 1,
    properties: [
      { name: 'id', type: 'string', value: spec.id },
      { name: 'name', type: 'string', value: spec.nome },
      { name: 'order', type: 'int', value: spec.order },
      { name: 'minTrainerLevel', type: 'int', value: spec.minTrainerLevel },
    ],
    tilesets: [{ firstgid: FIRSTGID, source: TILESET_RELATIVO }],
    layers: [
      camada(draft, 1, 'ground', draft.ground.map(gid)),
      camada(draft, 2, 'detail', draft.detail.map(gidOuVazio)),
      camada(draft, 3, 'blocking', draft.blocked.map((b) => (b ? gid(TILE_BLOQUEIO) : 0))),
      camada(draft, 4, 'canopy', draft.canopy.map(gidOuVazio)),
      { id: 5, type: 'objectgroup', name: 'objects', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: objetos },
    ],
  }
  const saida = join(RAIZ, 'tools', 'assets', 'maps', `${spec.id}.tmj`)
  writeFileSync(saida, JSON.stringify(mapa, null, 1))
  return `${spec.nome} ${draft.width}x${draft.height} com ${objetos.length} objetos em ${saida}`
}

const pedida = process.argv[2]
const alvos = pedida === undefined ? REGIOES : [regiaoPorId(pedida)]
if (alvos[0] === undefined) {
  throw new Error(`região "${pedida}" não existe. Conhecidas: ${REGIOES.map((r) => r.id).join(', ')}`)
}
for (const spec of alvos as readonly RegionSpec[]) process.stdout.write(`${gravar(spec)}\n`)
