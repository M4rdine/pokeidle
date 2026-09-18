# Fase 4a: Tileset rico e autoria de mapa no Tiled — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao usuário um tileset rico (itens grandes fatiados, terrenos para o pincel automático do Tiled) e as ferramentas para desenhar, validar e conferir a Rota 1 sem abrir o jogo.

**Architecture:** Tudo acontece em `tools/assets`, que já extrai o dump, gera o atlas e importa mapas do Tiled. O manifesto ganha fatiamento e terrenos; o gerador de atlas expande e escreve `wangsets` no `tiles.tsj`; o importador ganha validações; e entram dois comandos novos, um que desenha o mapa em PNG e outro que desenha o tileset em HTML para aprovação. Motor, cliente, servidor e protocolo não mudam.

**Tech Stack:** TypeScript 5 strict ESM, Node 22, Vitest 2, zod 3 (via `@pokeidle/shared`), PNG decodificado e codificado pelo módulo próprio `png.ts` (sem dependência nativa).

**Spec:** `docs/superpowers/specs/2026-09-18-fase-4a-tileset-autoria-design.md`

## Global Constraints

- Nada fora de `tools/assets`, `tools/assets/manifest.json`, `assets/atlas/` e `packages/shared/data/hunts/`. Se surgir vontade de mexer em `packages/client`, `packages/server` ou no schema `HuntMap`, pare: isso é fase 4b.
- Testes em PRIMEIRO PLANO, um run por vez, sem watch. Os testes de `tools/assets` não usam banco, mas a regra vale para não competir com nenhum outro run.
- TDD; sem `console.*` (a CLI escreve por `out()`, que já existe em `cli.ts`); imutabilidade; imports locais `.js`; TS strict com `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess`; funções < 50 linhas; arquivos pequenos.
- Nome de tile é kebab-case ascii e não pode ser só dígitos (regra que já existe em `manifest.ts`). Peça fatiada recebe `-x<col>-y<row>`, por exemplo `pokecenter-x0-y2`.
- O extrator salva item de 2×2 como um único PNG de 64×64 em `assets/extracted-otp2019/items/<id>_<patternX>_<patternY>.png`. Fatiar é responsabilidade do gerador de atlas.
- `packGrid` usa a maior largura e altura entre os frames como tamanho de célula: todo tile precisa sair 32×32, senão o atlas inteiro incha.
- Formato do Tiled: versão 1.10. `wangsets` entram no `tiles.tsj`; a ordem de `wangid` é `[topo, topo-direita, direita, baixo-direita, baixo, baixo-esquerda, esquerda, topo-esquerda]`, e num conjunto do tipo `corner` só os índices ímpares (1, 3, 5, 7) são preenchidos.
- Commits convencionais de UMA linha, sem trailers. Cobertura de `tools/assets` continua no patamar atual (o pacote roda com `vitest run --coverage` no CI do projeto).

## Estrutura de arquivos

```
tools/assets/
  manifest.json                   (curadoria: ~70 tiles, fatiamento e terrenos)
  src/manifest.ts                 slice, terrains e validações novas
  src/tile-slice.ts               NOVO: corte puro de imagem em peças 32×32
  src/build-atlases.ts            expande tiles fatiados; passa terrenos ao tileset
  src/atlas.ts                    toTiledTileset escreve wangsets
  src/tiled-import.ts             validações novas de mapa
  src/map-preview.ts              NOVO: desenha HuntMap em PNG
  src/contact-sheet.ts            modo --tileset
  src/cli.ts                      comandos map-preview e flag --tileset
  README.md                       fluxo de autoria atualizado
  test/…                          um arquivo de teste por módulo tocado
```

---

### Task 1: Fatiamento no manifesto e corte de imagem

**Files:**
- Create: `tools/assets/src/tile-slice.ts`, `tools/assets/test/tile-slice.test.ts`
- Modify: `tools/assets/src/manifest.ts`, `tools/assets/test/manifest.test.ts`

**Interfaces:**
- Produces: `sliceImage(image: RgbaImage, cols: number, rows: number): RgbaImage[]` (ordem: linha por linha, da esquerda para a direita, de cima para baixo) e `sliceName(base: string, col: number, row: number): string` em `tile-slice.ts`; `TileEntry` ganha `slice?: { cols: number; rows: number }`; `expandedTileNames(tile: TileEntry): string[]` em `manifest.ts` (um nome sem `slice`, `cols × rows` nomes com `slice`).

- [ ] **Step 1: Teste do corte**

`tools/assets/test/tile-slice.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { sliceImage, sliceName } from '../src/tile-slice.js'

/** Imagem 64×64 em que cada quadrante 32×32 tem uma cor sólida distinta. */
function quadrants(): RgbaImage {
  const width = 64
  const height = 64
  const data = new Uint8Array(width * height * 4)
  const colors = [10, 20, 30, 40]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const quadrant = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const i = (y * width + x) * 4
      data[i] = colors[quadrant]!
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

const firstPixel = (img: RgbaImage): number => img.data[0]!

describe('sliceImage', () => {
  it('corta 2×2 em quatro peças de 32×32, na ordem de leitura', () => {
    const pieces = sliceImage(quadrants(), 2, 2)
    expect(pieces).toHaveLength(4)
    expect(pieces.map((p) => [p.width, p.height])).toEqual([[32, 32], [32, 32], [32, 32], [32, 32]])
    expect(pieces.map(firstPixel)).toEqual([10, 20, 30, 40])
  })
  it('1×1 devolve a imagem inteira', () => {
    const img = quadrants()
    expect(sliceImage(img, 1, 1)).toEqual([img])
  })
  it('recusa corte que não divide a imagem', () => {
    expect(() => sliceImage(quadrants(), 3, 2)).toThrow(/não divide/)
  })
})

describe('sliceName', () => {
  it('nomeia pela posição', () => {
    expect(sliceName('pokecenter', 0, 2)).toBe('pokecenter-x0-y2')
  })
})
```

- [ ] **Step 2: Teste do manifesto**

Em `tools/assets/test/manifest.test.ts`. O arquivo já tem um `catalog` de módulo com o item `100`
(1×1, `patternX: 2`) e o item `101` (2×2), que é exatamente o que estes casos precisam:
```ts
describe('tiles fatiados', () => {
  it('aceita slice compatível com o catálogo e expande os nomes', () => {
    const manifest = parseManifest({ version: 1, species: [], tiles: [{ name: 'pokecenter', itemId: 101, slice: { cols: 2, rows: 2 } }] })
    const tile = manifest.tiles[0]!
    expect(tile.slice).toEqual({ cols: 2, rows: 2 })
    expect(expandedTileNames(tile)).toEqual(['pokecenter-x0-y0', 'pokecenter-x1-y0', 'pokecenter-x0-y1', 'pokecenter-x1-y1'])
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
  it('tile simples continua com um nome só', () => {
    const manifest = parseManifest({ version: 1, species: [], tiles: [{ name: 'grass', itemId: 100 }] })
    expect(expandedTileNames(manifest.tiles[0]!)).toEqual(['grass'])
  })
  it('recusa slice que não bate com o item e item grande sem slice', () => {
    const wrongSlice = parseManifest({ version: 1, species: [], tiles: [{ name: 'pokecenter', itemId: 101, slice: { cols: 3, rows: 2 } }] })
    expect(validateManifest(wrongSlice, catalog).join('\n')).toMatch(/pokecenter.*3x2.*101.*2x2/)
    const missingSlice = parseManifest({ version: 1, species: [], tiles: [{ name: 'pokecenter', itemId: 101 }] })
    expect(validateManifest(missingSlice, catalog).join('\n')).toMatch(/pokecenter.*use "slice"/)
  })
  it('nome duplicado depois da expansão é recusado', () => {
    const clash = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'casa', itemId: 101, slice: { cols: 2, rows: 2 } }, { name: 'casa-x0-y0', itemId: 100 }],
    })
    expect(validateManifest(clash, catalog).join('\n')).toMatch(/nome de tile duplicado: casa-x0-y0/)
  })
})
```
Importe `expandedTileNames` junto de `loadManifest`, `parseManifest` e `validateManifest`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- tile-slice manifest`
Expected: falha por módulo inexistente e por `expandedTileNames` não exportado.

- [ ] **Step 4: Implementar o corte**

`tools/assets/src/tile-slice.ts`:
```ts
import type { RgbaImage } from './compose.js'

const BYTES_PER_RGBA = 4

/** Nome de uma peça de item grande: `pokecenter` 2×2 vira `pokecenter-x0-y0` … `pokecenter-x1-y1`. */
export const sliceName = (base: string, col: number, row: number): string => `${base}-x${col}-y${row}`

/** Corta a imagem em `cols × rows` peças iguais, na ordem de leitura. */
export function sliceImage(image: RgbaImage, cols: number, rows: number): RgbaImage[] {
  if (cols === 1 && rows === 1) return [image]
  if (image.width % cols !== 0 || image.height % rows !== 0) {
    throw new Error(`corte ${cols}x${rows} não divide a imagem ${image.width}x${image.height}`)
  }
  const pieceW = image.width / cols
  const pieceH = image.height / rows
  const pieces: RgbaImage[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const data = new Uint8Array(pieceW * pieceH * BYTES_PER_RGBA)
      for (let y = 0; y < pieceH; y++) {
        const from = ((row * pieceH + y) * image.width + col * pieceW) * BYTES_PER_RGBA
        data.set(image.data.subarray(from, from + pieceW * BYTES_PER_RGBA), y * pieceW * BYTES_PER_RGBA)
      }
      pieces.push({ width: pieceW, height: pieceH, data })
    }
  }
  return pieces
}
```

- [ ] **Step 5: Implementar o manifesto**

Em `tools/assets/src/manifest.ts`:
```ts
const SliceSchema = z.object({ cols: z.number().int().min(1).max(8), rows: z.number().int().min(1).max(8) }).strict()

const TileSchema = z.object({
  name: nameSchema,
  itemId: z.number().int().min(100),
  patternX: z.number().int().min(0).default(0),
  patternY: z.number().int().min(0).default(0),
  slice: SliceSchema.optional(),
})

/** Um tile simples vira um nome; um tile fatiado vira um nome por peça, na ordem de leitura. */
export function expandedTileNames(tile: TileEntry): string[] {
  if (!tile.slice) return [tile.name]
  const { cols, rows } = tile.slice
  return Array.from({ length: cols * rows }, (_unused, i) => sliceName(tile.name, i % cols, Math.floor(i / cols)))
}
```
`validateTile` passa a aceitar item grande quando há `slice` e a exigir `slice` quando o item é grande:
```ts
function validateTile(t: TileEntry, catalog: Catalog): string[] {
  const item = catalog.items.find((i) => i.id === t.itemId)
  if (!item) return [`tile ${t.name}: item ${t.itemId} não existe no catálogo`]
  const problems: string[] = []
  const big = item.width !== TILE_SIZE_IN_TILES || item.height !== TILE_SIZE_IN_TILES
  if (big && !t.slice) problems.push(`tile ${t.name}: item ${t.itemId} é ${item.width}x${item.height}; use "slice" para cortá-lo em peças de um tile`)
  if (t.slice && (t.slice.cols !== item.width || t.slice.rows !== item.height)) {
    problems.push(`tile ${t.name}: slice ${t.slice.cols}x${t.slice.rows} não bate com o item ${t.itemId}, que é ${item.width}x${item.height}`)
  }
  if (t.patternX >= item.patternX) problems.push(`tile ${t.name}: patternX ${t.patternX} fora da faixa 0..${item.patternX - 1}`)
  if (t.patternY >= item.patternY) problems.push(`tile ${t.name}: patternY ${t.patternY} fora da faixa 0..${item.patternY - 1}`)
  return problems
}
```
E a checagem de duplicados passa a usar os nomes expandidos:
```ts
    ...duplicates(m.tiles.flatMap(expandedTileNames)).map((n) => `nome de tile duplicado: ${n}`),
```
(importe `sliceName` de `./tile-slice.js`.)

- [ ] **Step 6: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test -- tile-slice manifest`, depois `pnpm --filter @pokeidle/assets-tools typecheck`.

- [ ] **Step 7: Commit**

```bash
git add tools/assets/src/tile-slice.ts tools/assets/src/manifest.ts tools/assets/test
git commit -m "feat(assets): tiles fatiados no manifesto e corte de imagem em peças de 32"
```

---

### Task 2: Gerador de atlas expandindo os tiles fatiados

**Files:**
- Modify: `tools/assets/src/build-atlases.ts`, `tools/assets/test/build-atlases.test.ts`

**Interfaces:**
- Consumes: `sliceImage`, `sliceName`, `expandedTileNames` (Task 1).
- Produces: `tiles.png`/`tiles.json` com um quadro por peça; a ordem dos nomes continua sendo a ordem do manifesto, com as peças de um item grande em sequência. `buildAtlases` continua devolvendo `{ pokemonFrames, tileFrames }`, agora contando peças.

- [ ] **Step 1: Teste**

Em `tools/assets/test/build-atlases.test.ts`. O arquivo tem um `catalog` de módulo (hoje só com o
item `100`, 1×1) e os auxiliares `writePng(path, w, h, v)` e `setupFixtures()`. Acrescente ao
`catalog.items` o item grande e, em `setupFixtures`, o PNG dele:
```ts
  // no catalog.items, ao lado do item 100:
  { id: 101, width: 2, height: 2, patternX: 1, patternY: 1, phases: 1, isGround: false, isBlocking: true },
```
```ts
  // dentro de setupFixtures, junto dos outros writePng:
  await writePng(itemFramePath(extractedDir, 101, 0, 0), 64, 64, 90)
```
E o caso novo:
```ts
it('item grande vira uma peça por tile, cada uma 32×32', async () => {
  const { dir, extractedDir } = await setupFixtures()
  const manifestPath = join(dir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify({
    version: 1,
    species: [],
    tiles: [{ name: 'grass', itemId: 100 }, { name: 'pokecenter', itemId: 101, slice: { cols: 2, rows: 2 } }],
  }))
  const outDir = join(dir, 'atlas')
  const result = await buildAtlases({ extractedDir, manifestPath, outDir })
  expect(result.tileFrames).toBe(5)
  const sheet = JSON.parse(await readFile(join(outDir, 'tiles.json'), 'utf8')) as { frames: Record<string, { frame: { w: number; h: number } }> }
  expect(Object.keys(sheet.frames)).toEqual(['grass', 'pokecenter-x0-y0', 'pokecenter-x1-y0', 'pokecenter-x0-y1', 'pokecenter-x1-y1'])
  expect(Object.values(sheet.frames).every((f) => f.frame.w === 32 && f.frame.h === 32)).toBe(true)
  const tileset = JSON.parse(await readFile(join(outDir, 'tiles.tsj'), 'utf8')) as { tilecount: number }
  expect(tileset.tilecount).toBe(5)
})
```
Se o manifesto do teste precisar de ao menos uma espécie (o `buildAtlases` recusa manifesto sem
espécies), reaproveite a espécie que os outros casos do arquivo já usam em vez de `species: []`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- build-atlases`
Expected: falha porque hoje sai um quadro de 64×64 com o nome `pokecenter`.

- [ ] **Step 3: Implementar**

Em `build-atlases.ts`, `tileFrames` passa a cortar:
```ts
async function tileFrames(extractedDir: string, tiles: readonly TileEntry[]): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const t of tiles) {
    const image = decodePng(await readFile(itemFramePath(extractedDir, t.itemId, t.patternX, t.patternY)))
    const pieces = sliceImage(image, t.slice?.cols ?? 1, t.slice?.rows ?? 1)
    const names = expandedTileNames(t)
    // `expandedTileNames` e `sliceImage` percorrem na mesma ordem de leitura.
    pieces.forEach((piece, i) => frames.push({ name: names[i]!, image: piece }))
  }
  return frames
}
```
(importe `sliceImage` de `./tile-slice.js` e `expandedTileNames` de `./manifest.js`; `readFrame` continua servindo os outfits.)

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test -- build-atlases` e depois `pnpm --filter @pokeidle/assets-tools test` (suíte inteira do pacote, um run).

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/build-atlases.ts tools/assets/test/build-atlases.test.ts
git commit -m "feat(assets): gerador de atlas corta itens grandes em peças de um tile"
```

---

### Task 3: Terrenos no manifesto e `wangsets` no tileset

**Files:**
- Modify: `tools/assets/src/manifest.ts`, `tools/assets/src/atlas.ts`, `tools/assets/src/build-atlases.ts`, `tools/assets/test/manifest.test.ts`, `tools/assets/test/atlas.test.ts`

**Interfaces:**
- Produces: `Manifest.terrains?: TerrainEntry[]` com `TerrainEntry = { name: string; colors: string[]; tiles: { tile: string; corners: [string, string, string, string] }[] }`, onde `corners` é a cor de cada canto na ordem `[superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo]`; `toTiledTileset(sheet, name, order, terrains?)` passa a aceitar os terrenos e escrever `wangsets`; `TiledTileset` ganha `wangsets?: TiledWangset[]`.
- Consumes: `expandedTileNames` (Task 1) para validar que todo tile citado existe.

Por que `corners` e não papéis como "norte" ou "canto nordeste": o Tiled guarda exatamente isso, quatro cores de canto por tile num conjunto do tipo `corner`. Declarar a cor de cada canto é mecânico de preencher durante a curadoria e não exige tabela de conversão nenhuma.

- [ ] **Step 1: Teste do manifesto**

Em `tools/assets/test/manifest.test.ts`:
```ts
describe('terrenos', () => {
  const terrainManifest = (over: Record<string, unknown> = {}) => ({
    version: 1,
    species: [],
    tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 1 }],
    terrains: [{
      name: 'grama-terra',
      colors: ['grama', 'terra'],
      tiles: [
        { tile: 'grass', corners: ['grama', 'grama', 'grama', 'grama'] },
        { tile: 'dirt', corners: ['terra', 'terra', 'terra', 'terra'] },
      ],
    }],
    ...over,
  })
  it('aceita um terreno coerente', () => {
    const manifest = parseManifest(terrainManifest())
    expect(manifest.terrains?.[0]?.tiles).toHaveLength(2)
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
  it('recusa terreno citando tile inexistente ou cor fora da lista', () => {
    const unknownTile = parseManifest(terrainManifest({
      terrains: [{ name: 'grama-terra', colors: ['grama'], tiles: [{ tile: 'nao-existe', corners: ['grama', 'grama', 'grama', 'grama'] }] }],
    }))
    expect(validateManifest(unknownTile, catalog).join('\n')).toMatch(/terreno grama-terra: tile "nao-existe" não existe/)
    const unknownColor = parseManifest(terrainManifest({
      terrains: [{ name: 'grama-terra', colors: ['grama'], tiles: [{ tile: 'grass', corners: ['grama', 'agua', 'grama', 'grama'] }] }],
    }))
    expect(validateManifest(unknownColor, catalog).join('\n')).toMatch(/terreno grama-terra: cor "agua" não está em colors/)
  })
  it('um tile fatiado também pode entrar num terreno', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'casa', itemId: 101, slice: { cols: 2, rows: 2 } }],
      terrains: [{ name: 'parede', colors: ['muro'], tiles: [{ tile: 'casa-x0-y0', corners: ['muro', 'muro', 'muro', 'muro'] }] }],
    })
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
})
```

- [ ] **Step 2: Teste do tileset**

Em `tools/assets/test/atlas.test.ts` (o arquivo já monta frames e chama `packGrid`/`toTiledTileset`; siga o estilo dele):
```ts
it('escreve os terrenos como wangsets no formato do Tiled', () => {
  const frames = [solidFrame('grass', 1), solidFrame('dirt', 2), solidFrame('grass-dirt-ne', 3)]
  const packed = packGrid(frames, 'tiles.png')
  const order = frames.map((f) => f.name)
  const tileset = toTiledTileset(packed.sheet, 'tibia-tiles', order, [{
    name: 'grama-terra',
    colors: ['grama', 'terra'],
    tiles: [
      { tile: 'grass', corners: ['grama', 'grama', 'grama', 'grama'] },
      { tile: 'dirt', corners: ['terra', 'terra', 'terra', 'terra'] },
      { tile: 'grass-dirt-ne', corners: ['terra', 'grama', 'grama', 'grama'] },
    ],
  }])
  const wangset = tileset.wangsets?.[0]
  expect(wangset).toMatchObject({ name: 'grama-terra', type: 'corner', tile: -1 })
  expect(wangset?.colors.map((c) => c.name)).toEqual(['grama', 'terra'])
  // wangid: [topo, topo-direita, direita, baixo-direita, baixo, baixo-esquerda, esquerda, topo-esquerda]
  expect(wangset?.wangtiles).toEqual([
    { tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
    { tileid: 1, wangid: [0, 2, 0, 2, 0, 2, 0, 2] },
    { tileid: 2, wangid: [0, 2, 0, 1, 0, 1, 0, 1] },
  ])
})
it('recusa terreno citando tile fora do tileset', () => {
  const frames = [solidFrame('grass', 1)]
  const packed = packGrid(frames, 'tiles.png')
  expect(() => toTiledTileset(packed.sheet, 'tibia-tiles', ['grass'], [{
    name: 'x', colors: ['grama'], tiles: [{ tile: 'sumiu', corners: ['grama', 'grama', 'grama', 'grama'] }],
  }])).toThrow(/sumiu/)
})
```
Se o arquivo não tiver um auxiliar `solidFrame(name, value)`, crie-o devolvendo `{ name, image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(value) } }`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- manifest atlas`

- [ ] **Step 4: Implementar o manifesto**

```ts
const TerrainTileSchema = z.object({
  tile: nameSchema,
  corners: z.tuple([z.string(), z.string(), z.string(), z.string()]),
}).strict()

const TerrainSchema = z.object({
  name: nameSchema,
  colors: z.array(z.string().min(1)).min(1).max(15), // o Tiled aceita até 15 cores por conjunto
  tiles: z.array(TerrainTileSchema).min(1),
}).strict()

export const ManifestSchema = z.object({
  version: z.literal(1),
  species: z.array(SpeciesSchema),
  tiles: z.array(TileSchema),
  terrains: z.array(TerrainSchema).optional(),
})
export type TerrainEntry = NonNullable<Manifest['terrains']>[number]
```
E a validação, chamada dentro de `validateManifest`:
```ts
function validateTerrain(t: TerrainEntry, tileNames: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const colors = new Set(t.colors)
  for (const entry of t.tiles) {
    if (!tileNames.has(entry.tile)) problems.push(`terreno ${t.name}: tile "${entry.tile}" não existe na lista de tiles`)
    for (const color of entry.corners) {
      if (!colors.has(color)) problems.push(`terreno ${t.name}: cor "${color}" não está em colors`)
    }
  }
  return problems
}
```
```ts
export function validateManifest(m: Manifest, catalog: Catalog): string[] {
  const tileNames = new Set(m.tiles.flatMap(expandedTileNames))
  return [
    // …as checagens que já existem…
    ...(m.terrains ?? []).flatMap((t) => validateTerrain(t, tileNames)),
  ]
}
```

- [ ] **Step 5: Implementar o tileset**

Em `atlas.ts`:
```ts
export interface TiledWangColor { name: string; color: string; probability: number; tile: number }
export interface TiledWangTile { tileid: number; wangid: number[] }
export interface TiledWangset { name: string; type: 'corner'; tile: -1; colors: TiledWangColor[]; wangtiles: TiledWangTile[] }

export interface TerrainInput {
  readonly name: string
  readonly colors: readonly string[]
  readonly tiles: readonly { readonly tile: string; readonly corners: readonly [string, string, string, string] }[]
}

/** Cores de exibição no Tiled; só precisam ser distintas entre si. */
const WANG_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#8000ff', '#808080', '#804000', '#008080', '#800000', '#008000', '#000080', '#c0c0c0']

function toWangset(terrain: TerrainInput, tileId: (name: string) => number): TiledWangset {
  const colorIndex = new Map(terrain.colors.map((name, i) => [name, i + 1]))
  return {
    name: terrain.name,
    type: 'corner',
    tile: -1,
    colors: terrain.colors.map((name, i) => ({ name, color: WANG_COLORS[i % WANG_COLORS.length]!, probability: 1, tile: -1 })),
    wangtiles: terrain.tiles.map((entry) => {
      const corner = (name: string): number => {
        const index = colorIndex.get(name)
        if (index === undefined) throw new Error(`terreno ${terrain.name}: cor "${name}" não está em colors`)
        return index
      }
      const [topRight, bottomRight, bottomLeft, topLeft] = entry.corners
      // Num conjunto "corner" o Tiled só lê os índices ímpares; os pares ficam em 0.
      return { tileid: tileId(entry.tile), wangid: [0, corner(topRight), 0, corner(bottomRight), 0, corner(bottomLeft), 0, corner(topLeft)] }
    }),
  }
}

export function toTiledTileset(sheet: PixiSpritesheet, name: string, order: readonly string[], terrains: readonly TerrainInput[] = []): TiledTileset {
  // …a checagem de ordem que já existe…
  const idByName = new Map(order.map((tileName, id) => [tileName, id]))
  const tileId = (tileName: string): number => {
    const id = idByName.get(tileName)
    if (id === undefined) throw new Error(`terreno cita tile "${tileName}", que não está no tileset`)
    return id
  }
  return {
    // …os campos que já existem…
    ...(terrains.length > 0 && { wangsets: terrains.map((t) => toWangset(t, tileId)) }),
  }
}
```
`TiledTileset` ganha `wangsets?: TiledWangset[]`. Em `build-atlases.ts`, a chamada passa a ser `toTiledTileset(packedTiles.sheet, 'tibia-tiles', tileOrder, manifest.terrains ?? [])`.

Atenção ao schema de leitura em `tiled-import.ts`: `TiledTilesetSchema` precisa continuar aceitando o arquivo gerado. Se ele for estrito, acrescente `wangsets: z.array(z.unknown()).optional()` — o importador não usa terrenos, só não pode recusar o arquivo.

- [ ] **Step 6: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test` (suíte inteira, um run) e `pnpm --filter @pokeidle/assets-tools typecheck`.

- [ ] **Step 7: Commit**

```bash
git add tools/assets/src tools/assets/test
git commit -m "feat(assets): terrenos no manifesto viram wangsets no tileset do Tiled"
```

---

### Task 4: Validações novas do importador

**Files:**
- Modify: `tools/assets/src/tiled-import.ts`, `tools/assets/test/tiled-import.test.ts`

**Interfaces:**
- Produces: `importTiledMap` continua com a mesma assinatura e passa a lançar um erro único listando todos os problemas encontrados, uma linha por problema, no formato `mapa inválido:\n- …`.

- [ ] **Step 1: Teste**

Em `tools/assets/test/tiled-import.test.ts` (o arquivo já monta um mapa Tiled falso; reaproveite o auxiliar existente e só mude o que cada caso precisa):
```ts
describe('validações do mapa', () => {
  it('recusa ponto de partida e Centro em tile bloqueado, e lista os dois de uma vez', () => {
    const map = tiledMapWith({ blockingAt: [{ x: 0, y: 0 }, { x: 1, y: 1 }], spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 1 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/ponto de partida[\s\S]*Centro Pokémon/)
  })
  it('recusa spawn sem nenhum tile livre no raio', () => {
    const map = tiledMapWith({ blockingAll: true, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 }, spawnAt: { x: 2, y: 0, radius: 0 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/spawn.*sem tile livre/)
  })
  it('recusa Centro colado na borda do mapa', () => {
    const map = tiledMapWith({ pokecenter: { x: 0, y: 0 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/Centro Pokémon.*borda/)
  })
  it('aceita um mapa correto e devolve as camadas', () => {
    const map = tiledMapWith({})
    const hunt = importTiledMap(map, tileset, meta)
    expect(hunt.layers.ground).toHaveLength(hunt.width * hunt.height)
    expect(hunt.spawns.length).toBeGreaterThan(0)
  })
})
```
O auxiliar `tiledMapWith` provavelmente não existe com essas opções: escreva-o no arquivo de teste, montando o JSON do Tiled a partir do que os casos atuais já usam (largura, altura, três camadas de tiles em CSV e uma camada de objetos). Mantenha o mapa pequeno, por exemplo 4×4, para o teste ficar legível.

Atenção: um tile citado que não existe no tileset já é recusado hoje dentro de `gidToName`, com a mensagem `gid … não existe no tileset`. Não duplique essa validação; o item da spec está coberto.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- tiled-import`

- [ ] **Step 3: Implementar**

```ts
const MIN_DISTANCE_FROM_EDGE = 1

function blockedAt(blocking: readonly boolean[], width: number, x: number, y: number): boolean {
  return blocking[y * width + x] ?? true
}

/** Um tile livre em qualquer lugar do quadrado de lado `2 * radius + 1` centrado no spawn. */
function hasFreeTile(blocking: readonly boolean[], width: number, height: number, spawn: HuntSpawn): boolean {
  for (let y = spawn.y - spawn.radius; y <= spawn.y + spawn.radius; y++) {
    for (let x = spawn.x - spawn.radius; x <= spawn.x + spawn.radius; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height && !blockedAt(blocking, width, x, y)) return true
    }
  }
  return false
}

function checkMap(map: { width: number; height: number }, blocking: readonly boolean[], points: { spawnPoint: Point; pokecenter: Point }, spawns: readonly HuntSpawn[]): string[] {
  const problems: string[] = []
  if (blockedAt(blocking, map.width, points.spawnPoint.x, points.spawnPoint.y)) {
    problems.push(`ponto de partida em (${points.spawnPoint.x}, ${points.spawnPoint.y}) está num tile bloqueado`)
  }
  if (blockedAt(blocking, map.width, points.pokecenter.x, points.pokecenter.y)) {
    problems.push(`Centro Pokémon em (${points.pokecenter.x}, ${points.pokecenter.y}) está num tile bloqueado`)
  }
  const { x, y } = points.pokecenter
  const nearEdge = x < MIN_DISTANCE_FROM_EDGE || y < MIN_DISTANCE_FROM_EDGE || x >= map.width - MIN_DISTANCE_FROM_EDGE || y >= map.height - MIN_DISTANCE_FROM_EDGE
  if (nearEdge) problems.push(`Centro Pokémon em (${x}, ${y}) está na borda do mapa; deixe ao menos um tile de folga`)
  for (const spawn of spawns) {
    if (!hasFreeTile(blocking, map.width, map.height, spawn)) {
      problems.push(`spawn de ${spawn.speciesName} em (${spawn.x}, ${spawn.y}) está sem tile livre no raio ${spawn.radius}`)
    }
  }
  return problems
}
```
Dentro de `importTiledMap`, depois de montar `blocking`, `spawnPoint`, `pokecenter` e `spawns` e antes de `parseHuntMap`:
```ts
  const problems = checkMap(map, blocking, { spawnPoint, pokecenter }, spawns)
  if (problems.length > 0) throw new Error(`mapa inválido:\n- ${problems.join('\n- ')}`)
```
(`Point` vem de `@pokeidle/shared`, junto de `HuntSpawn`, que o arquivo já importa.)

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test -- tiled-import` e depois a suíte do pacote.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/tiled-import.ts tools/assets/test/tiled-import.test.ts
git commit -m "feat(assets): importador recusa mapa com partida, Centro ou spawn inviável"
```

---

### Task 5: Prévia do mapa em PNG

**Files:**
- Create: `tools/assets/src/map-preview.ts`, `tools/assets/test/map-preview.test.ts`
- Modify: `tools/assets/src/cli.ts`, `tools/assets/test/cli.test.ts`

**Interfaces:**
- Produces: `renderMapPreview(map: HuntMap, tiles: { sheet: PixiSpritesheet; image: RgbaImage }, opts?: { blocking?: boolean }): RgbaImage` (puro) e `loadTilesAtlas(dir: string): Promise<{ sheet: PixiSpritesheet; image: RgbaImage }>`; comando `pnpm assets map-preview <mapa.json> [--atlas assets/atlas] [--out preview.png] [--blocking]`.
- Consumes: `decodePng`/`encodePng` de `png.ts`, `RgbaImage` de `compose.ts`, `PixiSpritesheet` de `atlas.ts`, `parseHuntMap` de `@pokeidle/shared`.

- [ ] **Step 1: Teste**

`tools/assets/test/map-preview.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { HuntMap } from '@pokeidle/shared'
import { packGrid, type AtlasFrame } from '../src/atlas.js'
import type { RgbaImage } from '../src/compose.js'
import { renderMapPreview } from '../src/map-preview.js'

const solid = (value: number): RgbaImage => ({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(value) })
const frames: AtlasFrame[] = [
  { name: 'grass', image: solid(60) },
  { name: 'tree', image: solid(120) },
]
const atlas = (() => {
  const packed = packGrid(frames, 'tiles.png')
  return { sheet: packed.sheet, image: packed.image }
})()

const map: HuntMap = {
  id: 'teste', name: 'Teste', width: 2, height: 1, tileSize: 32,
  layers: { ground: ['grass', 'grass'], detail: [null, 'tree'], blocking: [false, true] },
  spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 },
  spawns: [{ speciesName: 'zubat', minLevel: 2, maxLevel: 3, x: 0, y: 0, radius: 1, count: 1, respawnSeconds: 10 }],
}
const pixelAt = (img: RgbaImage, x: number, y: number): number[] => {
  const i = (y * img.width + x) * 4
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]
}

describe('renderMapPreview', () => {
  it('desenha o mapa no tamanho certo, com o detalhe por cima do chão', () => {
    const preview = renderMapPreview(map, atlas)
    expect([preview.width, preview.height]).toEqual([64, 32])
    expect(pixelAt(preview, 5, 5)).toEqual([60, 60, 60]) // só chão
    expect(pixelAt(preview, 37, 5)).toEqual([120, 120, 120]) // detalhe cobre o chão
  })
  it('com blocking, tinge de vermelho só os tiles bloqueados', () => {
    const plain = renderMapPreview(map, atlas)
    const marked = renderMapPreview(map, atlas, { blocking: true })
    expect(pixelAt(marked, 5, 5)).toEqual(pixelAt(plain, 5, 5))
    const [r, g, b] = pixelAt(marked, 37, 5)
    expect(r).toBeGreaterThan(pixelAt(plain, 37, 5)[0]!)
    expect(g).toBeLessThan(r)
    expect(b).toBeLessThan(r)
  })
  it('tile que não está no atlas vira erro com o nome dele', () => {
    const broken = { ...map, layers: { ...map.layers, ground: ['grass', 'sumiu'] } }
    expect(() => renderMapPreview(broken as HuntMap, atlas)).toThrow(/sumiu/)
  })
})
```

Em `tools/assets/test/cli.test.ts`, no estilo dos casos que já existem:
```ts
it('map-preview grava o PNG do mapa', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pokeidle-preview-'))
  const atlasDir = join(dir, 'atlas')
  await mkdir(atlasDir, { recursive: true })
  const packed = packGrid([{ name: 'grass', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(60) } }], 'tiles.png')
  await writeFile(join(atlasDir, 'tiles.png'), encodePng(packed.image))
  await writeFile(join(atlasDir, 'tiles.json'), JSON.stringify(packed.sheet))
  const mapPath = join(dir, 'mapa.json')
  await writeFile(mapPath, JSON.stringify({
    id: 'teste', name: 'Teste', width: 1, height: 1, tileSize: 32,
    layers: { ground: ['grass'], detail: [null], blocking: [false] },
    spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 0, y: 0 },
    spawns: [{ speciesName: 'zubat', minLevel: 2, maxLevel: 3, x: 0, y: 0, radius: 0, count: 1, respawnSeconds: 10 }],
  }))
  const out = join(dir, 'preview.png')
  await program.parseAsync(['node', 'cli', 'map-preview', mapPath, '--atlas', atlasDir, '--out', out])
  const written = decodePng(await readFile(out))
  expect([written.width, written.height]).toEqual([32, 32])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- map-preview cli`

- [ ] **Step 3: Implementar**

`tools/assets/src/map-preview.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HuntMap } from '@pokeidle/shared'
import type { PixiSpritesheet } from './atlas.js'
import type { RgbaImage } from './compose.js'
import { decodePng } from './png.js'

const BYTES_PER_RGBA = 4
const BLOCKING_TINT = { r: 255, g: 40, b: 40, alpha: 0.45 }

export interface TilesAtlas { readonly sheet: PixiSpritesheet; readonly image: RgbaImage }

export async function loadTilesAtlas(dir: string): Promise<TilesAtlas> {
  const sheet = JSON.parse(await readFile(join(dir, 'tiles.json'), 'utf8')) as PixiSpritesheet
  return { sheet, image: decodePng(await readFile(join(dir, 'tiles.png'))) }
}

function blitTile(target: RgbaImage, atlas: TilesAtlas, name: string, destX: number, destY: number): void {
  const frame = atlas.sheet.frames[name]?.frame
  if (!frame) throw new Error(`tile "${name}" não está no atlas`)
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      const from = ((frame.y + y) * atlas.image.width + frame.x + x) * BYTES_PER_RGBA
      const alpha = atlas.image.data[from + 3]!
      if (alpha === 0) continue
      const to = ((destY + y) * target.width + destX + x) * BYTES_PER_RGBA
      target.data.set(atlas.image.data.subarray(from, from + BYTES_PER_RGBA), to)
    }
  }
}

function tintBlocking(target: RgbaImage, destX: number, destY: number, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((destY + y) * target.width + destX + x) * BYTES_PER_RGBA
      target.data[i] = Math.round(target.data[i]! * (1 - BLOCKING_TINT.alpha) + BLOCKING_TINT.r * BLOCKING_TINT.alpha)
      target.data[i + 1] = Math.round(target.data[i + 1]! * (1 - BLOCKING_TINT.alpha) + BLOCKING_TINT.g * BLOCKING_TINT.alpha)
      target.data[i + 2] = Math.round(target.data[i + 2]! * (1 - BLOCKING_TINT.alpha) + BLOCKING_TINT.b * BLOCKING_TINT.alpha)
    }
  }
}

/** Desenha `ground` e depois `detail`; com `blocking`, tinge de vermelho os tiles bloqueados. */
export function renderMapPreview(map: HuntMap, atlas: TilesAtlas, opts: { blocking?: boolean } = {}): RgbaImage {
  const size = map.tileSize
  const target: RgbaImage = {
    width: map.width * size,
    height: map.height * size,
    data: new Uint8Array(map.width * size * map.height * size * BYTES_PER_RGBA),
  }
  for (const layer of [map.layers.ground, map.layers.detail]) {
    layer.forEach((name, i) => {
      if (name !== null) blitTile(target, atlas, name, (i % map.width) * size, Math.floor(i / map.width) * size)
    })
  }
  if (opts.blocking === true) {
    map.layers.blocking.forEach((blocked, i) => {
      if (blocked) tintBlocking(target, (i % map.width) * size, Math.floor(i / map.width) * size, size)
    })
  }
  return target
}
```
Em `cli.ts`, ao lado dos outros comandos:
```ts
program
  .command('map-preview')
  .argument('<mapa>', 'hunt em JSON (packages/shared/data/hunts/route-1.json)')
  .option('--atlas <dir>', 'pasta do atlas gerado pelo build', 'assets/atlas')
  .option('--out <file>', 'arquivo PNG de saída', 'preview.png')
  .option('--blocking', 'pinta de vermelho os tiles bloqueados', false)
  .action(async (mapPath: string, opts: { atlas: string; out: string; blocking: boolean }) => {
    const map = parseHuntMap(await readJson(mapPath))
    const atlas = await loadTilesAtlas(opts.atlas)
    const image = renderMapPreview(map, atlas, { blocking: opts.blocking })
    await writeFile(opts.out, encodePng(image))
    out(`prévia em ${opts.out} (${image.width}x${image.height})`)
  })
```
(importe `parseHuntMap` de `@pokeidle/shared`, `encodePng` de `./png.js` e as duas funções novas.)

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test` e `pnpm --filter @pokeidle/assets-tools typecheck`.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/map-preview.ts tools/assets/src/cli.ts tools/assets/test
git commit -m "feat(assets): comando map-preview desenha a hunt em PNG"
```

---

### Task 6: Folha de contato do tileset e README

**Files:**
- Modify: `tools/assets/src/contact-sheet.ts`, `tools/assets/src/cli.ts`, `tools/assets/test/contact-sheet.test.ts`, `tools/assets/README.md`

**Interfaces:**
- Produces: `renderTilesetSheet(sheet: PixiSpritesheet): string` (HTML) em `contact-sheet.ts`; a flag `--tileset <dir>` no comando `contact-sheet`, que grava `tileset.html` na pasta do atlas em vez da folha do dump.

- [ ] **Step 1: Teste**

Em `tools/assets/test/contact-sheet.test.ts`:
```ts
it('desenha uma célula por tile do atlas, com o nome', () => {
  const packed = packGrid([
    { name: 'grass', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(60) } },
    { name: 'pokecenter-x0-y0', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(90) } },
  ], 'tiles.png')
  const html = renderTilesetSheet(packed.sheet)
  expect(html).toContain('grass')
  expect(html).toContain('pokecenter-x0-y0')
  expect(html.match(/<figure/g)).toHaveLength(2)
  // cada célula recorta o atlas pela posição do frame
  expect(html).toContain('background-position:-32px 0px')
  expect(html).toContain('url(tiles.png)')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- contact-sheet`

- [ ] **Step 3: Implementar**

Em `contact-sheet.ts`:
```ts
/** Folha de aprovação do tileset: cada peça recortada do atlas, com o nome embaixo. */
export function renderTilesetSheet(sheet: PixiSpritesheet): string {
  const cells = Object.entries(sheet.frames).map(([name, f]) =>
    `<figure data-id="${name}"><span style="width:${f.frame.w}px;height:${f.frame.h}px;display:block;image-rendering:pixelated;background-image:url(${sheet.meta.image});background-position:-${f.frame.x}px -${f.frame.y}px"></span><figcaption>${name}</figcaption></figure>`)
  return `<!doctype html><meta charset="utf-8"><title>Tileset do Pokeidle</title><style>${STYLE}</style>
<input placeholder="filtrar por nome" autofocus>
<h2>Tiles (${cells.length})</h2><section>${cells.join('')}</section>
<script>${SCRIPT}</script>`
}
```
O `SCRIPT` atual filtra por `dataset.id` começando com o texto digitado, o que funciona igual para nomes. `background-position` com `-0px` é válido em CSS; o teste acima espera exatamente `-32px 0px` para o segundo tile, então gere a coordenada `y` sem sinal quando for zero (`f.frame.y === 0 ? '0px' : \`-${f.frame.y}px\``).

Em `cli.ts`, o comando `contact-sheet` ganha:
```ts
  .option('--tileset <dir>', 'desenha o atlas gerado em vez do dump extraído')
```
e, no início da ação, o desvio:
```ts
    if (opts.tileset !== undefined) {
      const sheet = JSON.parse(await readFile(join(opts.tileset, 'tiles.json'), 'utf8')) as PixiSpritesheet
      const target = join(opts.tileset, 'tileset.html')
      await writeFile(target, renderTilesetSheet(sheet))
      out(`folha do tileset em ${target} (${Object.keys(sheet.frames).length} tiles)`)
      return
    }
```

- [ ] **Step 4: README**

Em `tools/assets/README.md`, a seção de comandos ganha `map-preview` e a flag `--tileset`, e entra uma seção curta "Desenhar um mapa", com o fluxo: rodar `build`; abrir `assets/atlas/tiles.tsj` no Tiled; pintar com o pincel de terreno; salvar como JSON; rodar `map-import`; rodar `map-preview` para conferir. Documente também as validações novas (partida, Centro, borda e spawn sem tile livre) e o fatiamento (`slice` no manifesto, nomes `-x<col>-y<row>`).

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test` e `pnpm --filter @pokeidle/assets-tools typecheck`.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/src tools/assets/test tools/assets/README.md
git commit -m "feat(assets): folha de contato do tileset e documentação do fluxo de autoria"
```

---

### Task 7: Curadoria do tileset (tarefa do controlador, não de subagente)

Esta task é de gosto, não de código: quem a executa precisa OLHAR as folhas de contato e escolher peças que combinem. Um subagente que não vê imagem não consegue fazê-la. O controlador executa, com as ferramentas das tasks anteriores prontas.

**Files:**
- Modify: `tools/assets/manifest.json`
- Gera (não versionado): `assets/atlas/*`, `assets/atlas/tileset.html`

**Interfaces:**
- Consumes: `slice` e `terrains` no manifesto (Tasks 1 e 3), `contact-sheet --tileset` (Task 6).

- [ ] **Step 1: Escolher as peças**

Abrir as folhas em `assets/curadoria-otp2019/items-all-*.png`, onde cada sprite aparece com o id, e escolher por família, mirando os números da spec §3: grama e bordas para terra (12), terra, caminho e areia (8), água e margens (9), vegetação (10), pedras, cercas e placa (10), Centro Pokémon fatiado (9), caverna e degraus (8). Regras: peças da mesma família saem do mesmo conjunto do dump; nada de sombra embutida que brigue com o vizinho; toda borda precisa do par oposto.

Conferir cada id escolhido contra o catálogo antes de escrever no manifesto:
```bash
python3 -c "
import json
c=json.load(open('assets/extracted-otp2019/catalog.json'))
items={i['id']:i for i in c['items']}
for i in [106, 351, 230]:
    print(i, items.get(i))
"
```
Item com `width` ou `height` maior que 1 entra com `slice` do mesmo tamanho. Item com `patternX`/`patternY` maior que 1 tem variações: escolher a que serve e registrar em `patternX`/`patternY`.

- [ ] **Step 2: Escrever o manifesto**

Acrescentar as entradas em `tools/assets/manifest.json`, mantendo `version: 1` e as 42 espécies como estão. Declarar os terrenos das transições que valem a pena pintar com pincel: grama para terra, grama para água, grama para areia e caminho de pedra para grama. Cada tile do terreno declara a cor dos quatro cantos, na ordem superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo.

- [ ] **Step 3: Gerar e conferir**

```bash
pnpm assets build --extracted assets/extracted-otp2019
pnpm assets contact-sheet --tileset assets/atlas
```
Expected: o build lista o número de tiles (perto de 70) sem erro de validação; `assets/atlas/tileset.html` abre com uma célula por peça.

Se o build reclamar de manifesto incoerente, a mensagem diz qual entrada está errada: item inexistente, `slice` que não bate, terreno citando tile inexistente ou nome duplicado.

- [ ] **Step 4: Aprovação do usuário**

Mandar a folha do tileset para o usuário aprovar ou pedir troca, ANTES de ele desenhar. Trocas viram edição do manifesto e novo `build`.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/manifest.json
git commit -m "feat(assets): curadoria generosa de tiles para rota, vila e caverna"
```

- [ ] **Step 6: Entregar o tileset ao usuário**

Explicar onde está o arquivo para abrir no Tiled (`assets/atlas/tiles.tsj`), que o mapa atual (`tools/assets/maps/route-1.tmj`) serve de ponto de partida, e que ao terminar basta avisar: o controlador roda `map-import` e `map-preview` e mostra o resultado.

---

## Self-review (feito ao escrever)

- Spec §3 (curadoria) → Task 7; §4 (manifesto: `slice` e `terrains`) → Tasks 1 e 3; §5 (gerador: fatiamento e `wangsets`) → Tasks 2 e 3; §6 (importador e prévia) → Tasks 4 e 5; §7 (fluxo) → Tasks 6 e 7; §8 (testes) → um bloco de teste em cada task, incluindo o caso da folha de contato na Task 6.
- Nomes cruzados conferidos: `sliceImage`/`sliceName` (Task 1 → 2), `expandedTileNames` (Task 1 → 2 e 3), `TerrainInput`/`toTiledTileset` (Task 3), `renderMapPreview`/`loadTilesAtlas` (Task 5), `renderTilesetSheet` (Task 6 → 7).
- Pacote correto em todos os comandos: `@pokeidle/assets-tools`.
- Fora do escopo, repetido de propósito: água animada e camada acima do jogador são fase 4b; esta fase não toca cliente, servidor nem `HuntMap`.

---

### Task 8: Peças de transição geradas (acrescentada durante a execução)

Motivo: a curadoria descobriu que o dump não traz conjuntos de borda em oito peças. As transições dele são anéis fechados dentro de um tile, feitos para o editor do Tibia, e não servem ao pincel de terreno do Tiled, que quer a cor de cada canto. Em vez de caçar no dump algo que não existe, o gerador passa a compor as peças a partir de dois tiles de chão.

**Files:**
- Create: `tools/assets/src/transition.ts`, `tools/assets/test/transition.test.ts`
- Modify: `tools/assets/src/manifest.ts`, `tools/assets/src/build-atlases.ts`, `tools/assets/src/atlas.ts`, `tools/assets/test/manifest.test.ts`, `tools/assets/test/build-atlases.test.ts`, `tools/assets/README.md`

**Interfaces:**
- Consumes: `RgbaImage` (`compose.ts`), `TerrainInput`/`toTiledTileset` (Task 3), `expandedTileNames` (Task 1).
- Produces: `CORNER_CODES: readonly string[]` (as 16 combinações de quatro letras `a`/`b`, na ordem superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo); `transitionMask(code: string, seed: number): Uint8Array` (32×32, 0 ou 255, puro e determinístico); `composeTransition(base: RgbaImage, over: RgbaImage, mask: Uint8Array): RgbaImage`; `transitionTiles(entry, images): { name: string; image: RgbaImage }[]`; `transitionTerrain(entry): TerrainInput`; `Manifest.transitions?: { name: string; from: string; to: string; softness?: number }[]`.

O nome de cada peça é `<name>-<code>`, por exemplo `grama-terra-abba`. As duas peças puras (`aaaa` e `bbbb`) reaproveitam os tiles originais em vez de gerar cópia: o terreno aponta para `from` e `to` nesses dois casos.

- [ ] **Step 1: Teste da máscara e da composição**

`tools/assets/test/transition.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { composeTransition, CORNER_CODES, transitionMask } from '../src/transition.js'

const solid = (value: number): RgbaImage => ({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(value) })
const at = (mask: Uint8Array, x: number, y: number): number => mask[y * 32 + x]!

describe('CORNER_CODES', () => {
  it('cobre as dezesseis combinações de quatro cantos', () => {
    expect(CORNER_CODES).toHaveLength(16)
    expect(new Set(CORNER_CODES).size).toBe(16)
    expect(CORNER_CODES).toContain('aaaa')
    expect(CORNER_CODES).toContain('bbbb')
    expect(CORNER_CODES.every((c) => /^[ab]{4}$/.test(c))).toBe(true)
  })
})

describe('transitionMask', () => {
  it('aaaa é toda transparente e bbbb é toda opaca', () => {
    expect([...transitionMask('aaaa', 1)].every((v) => v === 0)).toBe(true)
    expect([...transitionMask('bbbb', 1)].every((v) => v === 255)).toBe(true)
  })
  it('um canto b cobre o seu quadrante e não o oposto', () => {
    // ordem: superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo
    const topRight = transitionMask('baaa', 7)
    expect(at(topRight, 28, 3)).toBe(255)
    expect(at(topRight, 3, 28)).toBe(0)
    const bottomLeft = transitionMask('aaba', 7)
    expect(at(bottomLeft, 3, 28)).toBe(255)
    expect(at(bottomLeft, 28, 3)).toBe(0)
  })
  it('é determinística: mesma semente, mesma máscara; sementes diferentes mudam a borda', () => {
    expect([...transitionMask('abab', 3)]).toEqual([...transitionMask('abab', 3)])
    expect([...transitionMask('abab', 3)]).not.toEqual([...transitionMask('abab', 4)])
  })
  it('a borda não é uma linha reta: existe pixel de cada lado da diagonal do quadrante', () => {
    const mask = transitionMask('baaa', 11)
    const edge = [...Array(32).keys()].flatMap((y) => [...Array(32).keys()].map((x) => ({ x, y, v: at(mask, x, y) })))
    const mixedRows = new Set(edge.filter((p) => p.v === 255).map((p) => p.y))
    expect(mixedRows.size).toBeGreaterThan(8) // o recorte acompanha a altura, não um corte único
  })
})

describe('composeTransition', () => {
  it('usa o tile de baixo onde a máscara é 0 e o de cima onde é 255', () => {
    const mask = transitionMask('baaa', 5)
    const out = composeTransition(solid(40), solid(200), mask)
    expect([out.width, out.height]).toEqual([32, 32])
    const pixel = (x: number, y: number): number => out.data[(y * 32 + x) * 4]!
    expect(pixel(28, 3)).toBe(200)
    expect(pixel(3, 28)).toBe(40)
  })
  it('não altera as imagens de entrada', () => {
    const base = solid(40)
    const over = solid(200)
    const copy = new Uint8Array(base.data)
    composeTransition(base, over, transitionMask('abab', 2))
    expect([...base.data]).toEqual([...copy])
    expect(over.data.every((v) => v === 200)).toBe(true)
  })
})
```

- [ ] **Step 2: Teste do manifesto e do build**

Em `tools/assets/test/manifest.test.ts`:
```ts
describe('transições', () => {
  it('aceita uma transição entre dois tiles existentes', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 1 }],
      transitions: [{ name: 'grama-terra', from: 'grass', to: 'dirt' }],
    })
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
  it('recusa transição citando tile inexistente', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }],
      transitions: [{ name: 'grama-terra', from: 'grass', to: 'sumiu' }],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/transição grama-terra: tile "sumiu" não existe/)
  })
})
```
Em `tools/assets/test/build-atlases.test.ts`, um caso que usa o `setupFixtures()` existente:
```ts
it('uma transição gera as catorze peças mistas e o terreno correspondente', async () => {
  const { dir, extractedDir } = await setupFixtures()
  const manifestPath = join(dir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify({
    version: 1,
    species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
    tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 0 }],
    transitions: [{ name: 'grama-terra', from: 'grass', to: 'dirt' }],
  }))
  const outDir = join(dir, 'atlas')
  await buildAtlases({ extractedDir, manifestPath, outDir })
  const sheet = JSON.parse(await readFile(join(outDir, 'tiles.json'), 'utf8')) as { frames: Record<string, unknown> }
  const names = Object.keys(sheet.frames)
  expect(names).toContain('grama-terra-abba')
  expect(names.filter((n) => n.startsWith('grama-terra-'))).toHaveLength(14) // 16 menos as duas puras
  const tileset = JSON.parse(await readFile(join(outDir, 'tiles.tsj'), 'utf8')) as { wangsets?: { name: string; wangtiles: unknown[] }[] }
  const wangset = tileset.wangsets?.find((w) => w.name === 'grama-terra')
  expect(wangset?.wangtiles).toHaveLength(16) // as catorze mistas mais as duas puras
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- transition manifest build-atlases`

- [ ] **Step 4: Implementar a máscara e a composição**

`tools/assets/src/transition.ts`:
```ts
import type { RgbaImage } from './compose.js'

const SIZE = 32
const HALF = SIZE / 2
const BYTES_PER_RGBA = 4
const DEFAULT_SOFTNESS = 5

/** Ordem dos cantos, igual à do Tiled num conjunto "corner". */
const CORNER_ORDER = ['topRight', 'bottomRight', 'bottomLeft', 'topLeft'] as const

export const CORNER_CODES: readonly string[] = Array.from({ length: 16 }, (_unused, i) =>
  CORNER_ORDER.map((_c, bit) => ((i >> bit) & 1 ? 'b' : 'a')).join(''))

/** PRNG determinístico (xorshift de 32 bits): mesma semente, mesmo ruído. */
function noise(seed: number): () => number {
  let state = (seed | 0) || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1000) / 1000
  }
}

const cornerOf = (x: number, y: number): (typeof CORNER_ORDER)[number] =>
  y < HALF ? (x < HALF ? 'topLeft' : 'topRight') : x < HALF ? 'bottomLeft' : 'bottomRight'

/**
 * Máscara do tile de cima: 255 onde o material `b` aparece. A borda entre quadrantes vizinhos
 * ganha ruído determinístico, para o recorte não virar uma diagonal perfeita.
 */
export function transitionMask(code: string, seed: number, softness = DEFAULT_SOFTNESS): Uint8Array {
  const isB = Object.fromEntries(CORNER_ORDER.map((corner, i) => [corner, code[i] === 'b'])) as Record<string, boolean>
  const rand = noise(seed + code.length * 7919 + code.charCodeAt(0))
  const mask = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const here = isB[cornerOf(x, y)] === true
      const dx = Math.abs((x % HALF) - (x < HALF ? HALF - 1 : 0))
      const dy = Math.abs((y % HALF) - (y < HALF ? HALF - 1 : 0))
      const nearEdge = Math.min(dx, dy) < softness
      const jitter = nearEdge && rand() < 0.35
      mask[y * SIZE + x] = (jitter ? !here : here) ? 255 : 0
    }
  }
  return mask
}

/** Desenha `over` sobre `base` onde a máscara manda; devolve imagem nova, sem tocar nas entradas. */
export function composeTransition(base: RgbaImage, over: RgbaImage, mask: Uint8Array): RgbaImage {
  const data = new Uint8Array(base.data)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 255) continue
    const at = i * BYTES_PER_RGBA
    data.set(over.data.subarray(at, at + BYTES_PER_RGBA), at)
  }
  return { width: base.width, height: base.height, data }
}
```
Atenção ao `jitter`: ele só pode inverter o pixel quando o vizinho do outro lado da borda tem material diferente; se os dois quadrantes vizinhos forem iguais, inverter cria sujeira no meio de uma área sólida. Garanta isso comparando com o quadrante espelhado antes de inverter, e escreva um teste que prove: em `bbbb` e `aaaa` a máscara continua uniforme mesmo com ruído (o teste do Step 1 já cobre).

- [ ] **Step 5: Implementar manifesto, geração e terreno**

`manifest.ts`:
```ts
const TransitionSchema = z.object({
  name: nameSchema,
  from: nameSchema,
  to: nameSchema,
  softness: z.number().int().min(1).max(12).optional(),
}).strict()
```
`ManifestSchema` ganha `transitions: z.array(TransitionSchema).optional()`, e `validateManifest` acrescenta, para cada transição, `tile "<x>" não existe na lista de tiles` quando `from` ou `to` não estiver em `expandedTileNames`, com o prefixo `transição <name>: `.

`transition.ts` ganha as duas funções que o build usa:
```ts
export interface TransitionEntry { readonly name: string; readonly from: string; readonly to: string; readonly softness?: number }

/** As catorze peças mistas; as puras reaproveitam os tiles originais. */
export function transitionTiles(entry: TransitionEntry, images: { from: RgbaImage; to: RgbaImage }): { name: string; image: RgbaImage }[] {
  return CORNER_CODES.filter((code) => code !== 'aaaa' && code !== 'bbbb').map((code, i) => ({
    name: `${entry.name}-${code}`,
    image: composeTransition(images.from, images.to, transitionMask(code, i + 1, entry.softness)),
  }))
}

/** Terreno de duas cores apontando cada código de canto para a peça correspondente. */
export function transitionTerrain(entry: TransitionEntry): TerrainInput {
  const colors = [entry.from, entry.to]
  const tileFor = (code: string): string => (code === 'aaaa' ? entry.from : code === 'bbbb' ? entry.to : `${entry.name}-${code}`)
  return {
    name: entry.name,
    colors,
    tiles: CORNER_CODES.map((code) => ({
      tile: tileFor(code),
      corners: [0, 1, 2, 3].map((i) => (code[i] === 'b' ? entry.to : entry.from)) as [string, string, string, string],
    })),
  }
}
```
(importe `TerrainInput` de `./atlas.js`.)

`build-atlases.ts`: depois de montar os frames de tiles, gera as peças de cada transição a partir dos frames já decodificados (busque por nome no array), acrescenta ao final da lista, e passa `[...(manifest.terrains ?? []), ...(manifest.transitions ?? []).map(transitionTerrain)]` para `toTiledTileset`. Se `from` ou `to` não estiver entre os frames, lance `transição <name>: tile "<x>" não está no atlas`.

- [ ] **Step 6: README**

Na seção "Desenhar um mapa", explique: declarar `transitions` no manifesto gera as peças de borda e já deixa o terreno pronto no Tiled; o autor do mapa pinta com o pincel de terreno e não precisa escolher peça de borda na mão.

- [ ] **Step 7: Rodar**

Run: `pnpm --filter @pokeidle/assets-tools test` e `pnpm --filter @pokeidle/assets-tools typecheck`.

- [ ] **Step 8: Commit**

```bash
git add tools/assets/src tools/assets/test tools/assets/README.md
git commit -m "feat(assets): peças de transição geradas a partir de dois tiles, com terreno pronto"
```
