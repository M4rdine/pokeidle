# Fase Zero: Pipeline de Assets — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar um pack PokeTibia bruto (`Tibia.spr` + `Tibia.dat`) em spritesheets PNG com atlas JSON no formato do PixiJS, mais um formato de mapa de hunt em JSON importado do Tiled.

**Architecture:** Um pacote `tools/assets` em TypeScript puro lê os binários do cliente Tibia 8.60 (ou 8.54), decodifica sprites RLE de 32x32, compõe frames de outfits multi-tile, exporta PNGs por outfit/item, e a partir de um `manifest.json` curado empacota atlases em grade. Um importador converte mapas exportados do Tiled para o schema `HuntMap` que o servidor e o cliente consumirão nas fases seguintes.

**Tech Stack:** pnpm workspaces, TypeScript 5 (strict, ESM), Vitest, tsx, pngjs (PNG puro em JS), zod, commander.

**Spec:** `docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md` (seção 4 e seção 3)

## Global Constraints

- Monorepo pnpm com `packages/*` e `tools/*`; `assets/` é saída gerada e está no `.gitignore`.
- Toda função de decodificação e composição é pura: recebe bytes, devolve estruturas; I/O só nos comandos de CLI.
- Sprites do Tibia são 32x32 RGB com transparência por RLE; sem canal alpha nos formatos 8.x.
- Versões de `.dat` suportadas: 860 (padrão) e 854. Outras falham com erro explícito.
- Nomes de espécie e de tile são `kebab-case` ASCII (`^[a-z0-9-]+$`).
- Atlas no formato de spritesheet do PixiJS v8 (`frames`, `animations`, `meta`).
- Sem `console.log`; saída de CLI via `process.stdout.write` e erros via `process.stderr.write` e exit code 1.
- Commits em conventional commits, sem linhas de atribuição.

## Estrutura de arquivos

```
package.json                     # raiz do workspace
pnpm-workspace.yaml
tsconfig.base.json
tools/assets/
  package.json
  tsconfig.json
  vitest.config.ts
  manifest.example.json          # exemplo para o usuário copiar para manifest.json
  manifest.json                  # curadoria real (commitado, só números e nomes)
  src/
    cli.ts                       # commander: inspect, extract, contact-sheet, build, map-import
    binary-reader.ts             # cursor little-endian sobre Uint8Array
    spr.ts                       # parseSpr, decodeSprite
    dat.ts                       # parseDat, ThingType, flags 860/854
    compose.ts                   # spriteIndex, composeFrame, RgbaImage
    png.ts                       # encodePng, decodePng
    catalog.ts                   # buildCatalog (metadados por outfit/item)
    extract.ts                   # extractAll: binários → PNGs + catalog.json
    contact-sheet.ts             # index.html para achar ids de outfit no navegador
    manifest.ts                  # schema zod + validação contra catálogo
    atlas.ts                     # packGrid, PixiSpritesheet, writeTiledTileset
    build-atlases.ts             # manifest + extraídos → pokemon.*, tiles.*, tiles.tsj
    hunt-map.ts                  # HuntMapSchema
    tiled-import.ts              # Tiled JSON → HuntMap
  test/
    fixtures/spr-fixture.ts      # codificador RLE para montar .spr sintéticos
    fixtures/dat-fixture.ts      # montador de .dat sintético
    binary-reader.test.ts
    spr.test.ts
    dat.test.ts
    compose.test.ts
    extract.test.ts
    manifest.test.ts
    atlas.test.ts
    build-atlases.test.ts
    tiled-import.test.ts
data/hunts/                      # HuntMap JSON commitados (são nossos)
assets/                          # gitignored
  raw/Tibia.spr, raw/Tibia.dat   # pack baixado manualmente
  extracted/                     # PNGs + catalog.json + index.html
  atlas/                         # pokemon.png/json, tiles.png/json, tiles.tsj
```

## Referência do formato binário (Tibia 8.x)

**Tibia.spr:** `u32 signature`, `u16 spriteCount`, depois `spriteCount` × `u32 address` (sprite id é 1-based; address 0 = sprite vazio). Em cada address: 3 bytes de cor-chave (ignorar), `u16 size`, depois `size` bytes de RLE: repetir `u16 transparentPixels`, `u16 coloredPixels`, `coloredPixels × (u8 r, u8 g, u8 b)`. Pixels em ordem de linha, 32 por linha, 1024 no total.

**Tibia.dat:** `u32 signature`, `u16 lastItemId`, `u16 outfitCount`, `u16 effectCount`, `u16 missileCount`. Depois os things em sequência: itens com id de 100 até `lastItemId`, outfits de 1 até `outfitCount`, efeitos, mísseis. Cada thing: lista de flags (1 byte cada, termina em `0xFF`, algumas carregam dados), depois `u8 width`, `u8 height`, se `width > 1 || height > 1` então `u8 exactSize`, `u8 layers`, `u8 patternX`, `u8 patternY`, `u8 patternZ`, `u8 phases`, e `width*height*layers*patternX*patternY*patternZ*phases` × `u16 spriteId`.

Flags com dados na numeração 8.60: `0x00 Ground (u16)`, `0x08 Writable (u16)`, `0x09 WritableOnce (u16)`, `0x15 Light (u16,u16)`, `0x18 Displacement (u16 x, u16 y)`, `0x19 Elevation (u16)`, `0x1C MinimapColor (u16)`, `0x1D LensHelp (u16)`, `0x20 Cloth (u16)`, `0x21 Market (u16,u16,u16, string u16-len, u16,u16)`. Em 8.54 a flag `0x08` é `Chargeable` sem dados e todas as flags acima de 8 valem um a MAIS que em 8.60 (ex.: Displacement é `0x19` em 8.54 e `0x18` em 8.60); a normalização para 8.60 subtrai 1.

Para outfits, `patternX` são as direções na ordem norte, leste, sul, oeste; `patternY` são addons; `patternZ` é montaria (1 em 8.x); `layers` 2 significa camada 1 de máscara de cor, usamos só a camada 0. Um frame multi-tile é desenhado com o sprite `(w=0,h=0)` no canto inferior direito: o sprite `(w,h)` vai em `x=(width-w-1)*32`, `y=(height-h-1)*32`.

Índice de sprite dentro de `spriteIds`:

```
((((((phase * patternZ + z) * patternY + y) * patternX + x) * layers + layer) * height + h) * width + w
```

---

### Task 1: Scaffold do monorepo e do pacote de ferramentas

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `tools/assets/package.json`, `tools/assets/tsconfig.json`, `tools/assets/vitest.config.ts`
- Create: `tools/assets/src/index.ts`
- Test: `tools/assets/test/smoke.test.ts`

**Interfaces:**
- Produces: workspace onde `pnpm --filter @pokeidle/assets-tools test` roda Vitest e `pnpm --filter @pokeidle/assets-tools cli` roda `src/cli.ts` via tsx.

- [ ] **Step 1: Criar os arquivos da raiz**

`package.json`:
```json
{
  "name": "pokeidle",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "pnpm -r test",
    "assets": "pnpm --filter @pokeidle/assets-tools cli"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "tools/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 2: Criar o pacote `tools/assets`**

`tools/assets/package.json`:
```json
{
  "name": "@pokeidle/assets-tools",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "cli": "tsx src/cli.ts"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "pngjs": "^7.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@types/pngjs": "^6.0.5",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.1.0"
  }
}
```

`tools/assets/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test"]
}
```

`tools/assets/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'], thresholds: { lines: 80 } },
  },
})
```

`tools/assets/src/index.ts`:
```ts
export const TOOL_NAME = '@pokeidle/assets-tools'
```

- [ ] **Step 3: Escrever o teste de fumaça**

`tools/assets/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TOOL_NAME } from '../src/index.js'

describe('scaffold', () => {
  it('exporta o nome da ferramenta', () => {
    expect(TOOL_NAME).toBe('@pokeidle/assets-tools')
  })
})
```

- [ ] **Step 4: Instalar e rodar**

Run: `cd /Users/raphaelmardine/programacao/Jogos/pokeidle && pnpm install && pnpm --filter @pokeidle/assets-tools test`
Expected: 1 teste passando. Se `pnpm` não existir: `corepack enable && corepack prepare pnpm@9.12.0 --activate`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tools/assets
git commit -m "chore: scaffold do monorepo e do pacote tools/assets"
```

---

### Task 2: BinaryReader (cursor little-endian)

**Files:**
- Create: `tools/assets/src/binary-reader.ts`
- Test: `tools/assets/test/binary-reader.test.ts`

**Interfaces:**
- Produces: `class BinaryReader { static fromBuffer(buf: Uint8Array): BinaryReader; readonly position: number; readonly length: number; seek(pos: number): void; u8(): number; u16(): number; u32(): number; bytes(n: number): Uint8Array }`. Todos os inteiros são little-endian. Leitura além do fim lança `RangeError`.

Nota: o cursor é o único estado mutável do pacote; é uma exceção deliberada à regra de imutabilidade, isolada nesta classe.

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/binary-reader.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BinaryReader } from '../src/binary-reader.js'

describe('BinaryReader', () => {
  const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xaa, 0xbb])

  it('lê u8, u16 e u32 em little-endian avançando o cursor', () => {
    const r = BinaryReader.fromBuffer(bytes)
    expect(r.u8()).toBe(0x01)
    expect(r.u16()).toBe(0x0302)
    expect(r.u32()).toBe(0x07060504)
    expect(r.position).toBe(7)
  })

  it('lê um bloco de bytes e faz seek', () => {
    const r = BinaryReader.fromBuffer(bytes)
    r.seek(7)
    expect(Array.from(r.bytes(2))).toEqual([0xaa, 0xbb])
    expect(r.length).toBe(9)
  })

  it('lança RangeError ao ler além do fim', () => {
    const r = BinaryReader.fromBuffer(bytes)
    r.seek(8)
    expect(() => r.u16()).toThrow(RangeError)
  })

  it('lança RangeError em seek fora do buffer', () => {
    const r = BinaryReader.fromBuffer(bytes)
    expect(() => r.seek(10)).toThrow(RangeError)
  })

  it('respeita o byteOffset de uma subarray', () => {
    const r = BinaryReader.fromBuffer(bytes.subarray(7))
    expect(r.u8()).toBe(0xaa)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- binary-reader`
Expected: FAIL, módulo `../src/binary-reader.js` não encontrado.

- [ ] **Step 3: Implementar**

`tools/assets/src/binary-reader.ts`:
```ts
export class BinaryReader {
  private offset = 0

  private constructor(private readonly view: DataView) {}

  static fromBuffer(buf: Uint8Array): BinaryReader {
    return new BinaryReader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength))
  }

  get position(): number {
    return this.offset
  }

  get length(): number {
    return this.view.byteLength
  }

  seek(pos: number): void {
    if (pos < 0 || pos > this.view.byteLength) {
      throw new RangeError(`seek para ${pos} fora do buffer de ${this.view.byteLength} bytes`)
    }
    this.offset = pos
  }

  u8(): number {
    this.ensure(1)
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  u16(): number {
    this.ensure(2)
    const value = this.view.getUint16(this.offset, true)
    this.offset += 2
    return value
  }

  u32(): number {
    this.ensure(4)
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  bytes(n: number): Uint8Array {
    this.ensure(n)
    const start = this.view.byteOffset + this.offset
    const out = new Uint8Array(this.view.buffer.slice(start, start + n))
    this.offset += n
    return out
  }

  private ensure(n: number): void {
    if (this.offset + n > this.view.byteLength) {
      throw new RangeError(
        `leitura de ${n} bytes na posição ${this.offset} ultrapassa o buffer de ${this.view.byteLength} bytes`,
      )
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- binary-reader`
Expected: 5 testes passando.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/binary-reader.ts tools/assets/test/binary-reader.test.ts
git commit -m "feat(assets): BinaryReader little-endian"
```

---

### Task 3: Parser de Tibia.spr e decodificador RLE

**Files:**
- Create: `tools/assets/src/spr.ts`
- Create: `tools/assets/test/fixtures/spr-fixture.ts`
- Test: `tools/assets/test/spr.test.ts`

**Interfaces:**
- Consumes: `BinaryReader` da Task 2.
- Produces:
  - `SPRITE_SIZE = 32`, `SPRITE_PIXELS = 1024`
  - `type Rgb = readonly [number, number, number]`
  - `interface SprFile { signature: number; spriteCount: number; offsets: readonly number[]; data: Uint8Array }`
  - `parseSpr(data: Uint8Array): SprFile`
  - `decodeSprite(spr: SprFile, id: number): Uint8Array` devolve RGBA de 4096 bytes; id fora da faixa ou address 0 devolve tudo zero (transparente).
  - Fixture: `encodeRle(pixels: ReadonlyArray<Rgb | null>): Uint8Array` e `buildSpr(sprites: ReadonlyArray<ReadonlyArray<Rgb | null> | null>, signature?: number): Uint8Array` onde `null` na lista externa gera address 0.

- [ ] **Step 1: Escrever a fixture que codifica RLE**

`tools/assets/test/fixtures/spr-fixture.ts`:
```ts
import type { Rgb } from '../../src/spr.js'

const SPRITE_PIXELS = 1024

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

/** Codifica 1024 pixels (null = transparente) no RLE do Tibia, sem os 3 bytes de cor-chave nem o u16 de tamanho. */
export function encodeRle(pixels: ReadonlyArray<Rgb | null>): Uint8Array {
  if (pixels.length !== SPRITE_PIXELS) throw new Error(`esperados ${SPRITE_PIXELS} pixels`)
  const out: number[] = []
  let i = 0
  while (i < SPRITE_PIXELS) {
    let transparent = 0
    while (i < SPRITE_PIXELS && pixels[i] === null) {
      transparent++
      i++
    }
    const colored: Rgb[] = []
    while (i < SPRITE_PIXELS && pixels[i] !== null) {
      colored.push(pixels[i] as Rgb)
      i++
    }
    if (transparent === 0 && colored.length === 0) break
    if (colored.length === 0) break // rabo transparente não precisa ser codificado
    out.push(...u16(transparent), ...u16(colored.length))
    for (const [r, g, b] of colored) out.push(r, g, b)
  }
  return new Uint8Array(out)
}

/** Monta um arquivo .spr completo. Cada entrada é a lista de pixels de um sprite, ou null para address 0. */
export function buildSpr(
  sprites: ReadonlyArray<ReadonlyArray<Rgb | null> | null>,
  signature = 0x4a10_0000,
): Uint8Array {
  const headerSize = 4 + 2 + sprites.length * 4
  const bodies = sprites.map((s) => (s === null ? null : encodeRle(s)))
  const offsets: number[] = []
  let cursor = headerSize
  const bodyBytes: number[] = []
  for (const body of bodies) {
    if (body === null) {
      offsets.push(0)
      continue
    }
    offsets.push(cursor)
    const chunk = [0xff, 0x00, 0xff, ...u16(body.length), ...body]
    bodyBytes.push(...chunk)
    cursor += chunk.length
  }
  const header = [...u32(signature), ...u16(sprites.length), ...offsets.flatMap(u32)]
  return new Uint8Array([...header, ...bodyBytes])
}

/** Sprite 32x32 preenchido inteiro com uma cor. */
export function solidSprite(color: Rgb): Rgb[] {
  return Array.from({ length: SPRITE_PIXELS }, () => color)
}
```

- [ ] **Step 2: Escrever o teste que falha**

`tools/assets/test/spr.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { SPRITE_PIXELS, decodeSprite, parseSpr, type Rgb } from '../src/spr.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]
const BLUE: Rgb = [0, 0, 255]

function pixelAt(rgba: Uint8Array, index: number): number[] {
  return Array.from(rgba.subarray(index * 4, index * 4 + 4))
}

describe('parseSpr', () => {
  it('lê assinatura, contagem e offsets', () => {
    const file = buildSpr([solidSprite(RED), null], 0xdead_beef)
    const spr = parseSpr(file)
    expect(spr.signature).toBe(0xdead_beef)
    expect(spr.spriteCount).toBe(2)
    expect(spr.offsets).toHaveLength(2)
    expect(spr.offsets[0]).toBe(4 + 2 + 8)
    expect(spr.offsets[1]).toBe(0)
  })
})

describe('decodeSprite', () => {
  it('decodifica um sprite sólido em RGBA opaco', () => {
    const spr = parseSpr(buildSpr([solidSprite(RED)]))
    const rgba = decodeSprite(spr, 1)
    expect(rgba).toHaveLength(SPRITE_PIXELS * 4)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, SPRITE_PIXELS - 1)).toEqual([255, 0, 0, 255])
  })

  it('respeita runs transparentes entre pixels coloridos', () => {
    const pixels: Array<Rgb | null> = Array.from({ length: SPRITE_PIXELS }, () => null)
    pixels[0] = RED
    pixels[33] = BLUE // linha 1, coluna 1
    pixels[SPRITE_PIXELS - 1] = BLUE
    const spr = parseSpr(buildSpr([pixels]))
    const rgba = decodeSprite(spr, 1)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, 1)).toEqual([0, 0, 0, 0])
    expect(pixelAt(rgba, 33)).toEqual([0, 0, 255, 255])
    expect(pixelAt(rgba, SPRITE_PIXELS - 1)).toEqual([0, 0, 255, 255])
  })

  it('devolve transparente para address 0, id 0 e id fora da faixa', () => {
    const spr = parseSpr(buildSpr([solidSprite(RED), null]))
    const empty = new Uint8Array(SPRITE_PIXELS * 4)
    expect(decodeSprite(spr, 2)).toEqual(empty)
    expect(decodeSprite(spr, 0)).toEqual(empty)
    expect(decodeSprite(spr, 99)).toEqual(empty)
  })

  it('lança erro se o RLE exceder 1024 pixels', () => {
    const file = buildSpr([solidSprite(RED)])
    // corrompe o u16 de coloredPixels do primeiro run para 2000
    const bodyStart = 4 + 2 + 4 + 3 + 2
    file[bodyStart + 2] = 2000 & 0xff
    file[bodyStart + 3] = 2000 >> 8
    const spr = parseSpr(file)
    expect(() => decodeSprite(spr, 1)).toThrow(/excesso de pixels/)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- spr`
Expected: FAIL, `../src/spr.js` não encontrado.

- [ ] **Step 4: Implementar**

`tools/assets/src/spr.ts`:
```ts
import { BinaryReader } from './binary-reader.js'

export const SPRITE_SIZE = 32
export const SPRITE_PIXELS = SPRITE_SIZE * SPRITE_SIZE
const COLOR_KEY_BYTES = 3
const BYTES_PER_RGBA = 4

export type Rgb = readonly [number, number, number]

export interface SprFile {
  readonly signature: number
  readonly spriteCount: number
  readonly offsets: readonly number[]
  readonly data: Uint8Array
}

export function parseSpr(data: Uint8Array): SprFile {
  const reader = BinaryReader.fromBuffer(data)
  const signature = reader.u32()
  const spriteCount = reader.u16()
  const offsets = Array.from({ length: spriteCount }, () => reader.u32())
  return { signature, spriteCount, offsets, data }
}

/** Decodifica o sprite `id` (1-based) para RGBA 32x32. Ids inválidos ou vazios viram transparente. */
export function decodeSprite(spr: SprFile, id: number): Uint8Array {
  const rgba = new Uint8Array(SPRITE_PIXELS * BYTES_PER_RGBA)
  if (id <= 0 || id > spr.spriteCount) return rgba
  const address = spr.offsets[id - 1] ?? 0
  if (address === 0) return rgba

  const reader = BinaryReader.fromBuffer(spr.data)
  reader.seek(address)
  reader.bytes(COLOR_KEY_BYTES)
  const size = reader.u16()
  const end = reader.position + size

  let pixel = 0
  while (reader.position < end) {
    const transparent = reader.u16()
    const colored = reader.u16()
    pixel += transparent
    for (let i = 0; i < colored; i++) {
      if (pixel >= SPRITE_PIXELS) throw new Error(`sprite ${id}: excesso de pixels no RLE`)
      const o = pixel * BYTES_PER_RGBA
      rgba[o] = reader.u8()
      rgba[o + 1] = reader.u8()
      rgba[o + 2] = reader.u8()
      rgba[o + 3] = 255
      pixel++
    }
  }
  return rgba
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- spr`
Expected: 5 testes passando.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/src/spr.ts tools/assets/test/spr.test.ts tools/assets/test/fixtures/spr-fixture.ts
git commit -m "feat(assets): parser de Tibia.spr e decodificador RLE"
```

---

### Task 4: Parser de Tibia.dat (things, flags 860/854, sprite ids)

**Files:**
- Create: `tools/assets/src/dat.ts`
- Create: `tools/assets/test/fixtures/dat-fixture.ts`
- Test: `tools/assets/test/dat.test.ts`

**Interfaces:**
- Consumes: `BinaryReader`.
- Produces:
  - `type DatVersion = 854 | 860`
  - `type ThingCategory = 'item' | 'outfit' | 'effect' | 'missile'`
  - `interface ThingType { id: number; category: ThingCategory; width: number; height: number; layers: number; patternX: number; patternY: number; patternZ: number; phases: number; spriteIds: readonly number[]; displacement: { x: number; y: number }; groundSpeed: number | null; flags: ReadonlySet<number> }` (flags já na numeração 8.60)
  - `interface DatFile { signature: number; version: DatVersion; items: readonly ThingType[]; outfits: readonly ThingType[]; effects: readonly ThingType[]; missiles: readonly ThingType[] }`
  - `parseDat(data: Uint8Array, version?: DatVersion): DatFile` (padrão 860)
  - `FIRST_ITEM_ID = 100`
  - Constantes de flag exportadas: `FLAG_GROUND = 0x00`, `FLAG_NOT_WALKABLE = 0x0c`, `FLAG_DISPLACEMENT = 0x18`, `FLAG_END = 0xff`
  - Fixture: `buildDat(spec: DatSpec): Uint8Array` com `interface ThingSpec { flags: number[]; width: number; height: number; layers: number; patternX: number; patternY: number; patternZ: number; phases: number; spriteIds: number[] }` e `interface DatSpec { signature?: number; items: ThingSpec[]; outfits: ThingSpec[]; effects?: ThingSpec[]; missiles?: ThingSpec[] }`. Em `flags`, escrever os bytes brutos incluindo dados, sem o `0xff` final.

- [ ] **Step 1: Escrever a fixture**

`tools/assets/test/fixtures/dat-fixture.ts`:
```ts
export interface ThingSpec {
  flags: number[]
  width: number
  height: number
  layers: number
  patternX: number
  patternY: number
  patternZ: number
  phases: number
  spriteIds: number[]
}

export interface DatSpec {
  signature?: number
  items: ThingSpec[]
  outfits: ThingSpec[]
  effects?: ThingSpec[]
  missiles?: ThingSpec[]
}

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

function encodeThing(t: ThingSpec): number[] {
  const expected = t.width * t.height * t.layers * t.patternX * t.patternY * t.patternZ * t.phases
  if (t.spriteIds.length !== expected) {
    throw new Error(`spriteIds tem ${t.spriteIds.length}, esperado ${expected}`)
  }
  const size = t.width > 1 || t.height > 1 ? [32 * Math.max(t.width, t.height)] : []
  return [
    ...t.flags,
    0xff,
    t.width,
    t.height,
    ...size,
    t.layers,
    t.patternX,
    t.patternY,
    t.patternZ,
    t.phases,
    ...t.spriteIds.flatMap(u16),
  ]
}

export function buildDat(spec: DatSpec): Uint8Array {
  const effects = spec.effects ?? []
  const missiles = spec.missiles ?? []
  const lastItemId = 100 + spec.items.length - 1
  const header = [
    ...u32(spec.signature ?? 0x4a10_0001),
    ...u16(spec.items.length === 0 ? 99 : lastItemId),
    ...u16(spec.outfits.length),
    ...u16(effects.length),
    ...u16(missiles.length),
  ]
  const body = [...spec.items, ...spec.outfits, ...effects, ...missiles].flatMap(encodeThing)
  return new Uint8Array([...header, ...body])
}

/** Outfit 2x2, 4 direções, sem addon, 1 camada, N fases. */
export function outfitSpec(phases: number, firstSpriteId: number, extraFlags: number[] = []): ThingSpec {
  const count = 2 * 2 * 1 * 4 * 1 * 1 * phases
  return {
    flags: extraFlags,
    width: 2,
    height: 2,
    layers: 1,
    patternX: 4,
    patternY: 1,
    patternZ: 1,
    phases,
    spriteIds: Array.from({ length: count }, (_, i) => firstSpriteId + i),
  }
}

/** Item 1x1 de chão com velocidade. */
export function groundItemSpec(spriteId: number, speed = 100): ThingSpec {
  return {
    flags: [0x00, ...u16(speed)],
    width: 1,
    height: 1,
    layers: 1,
    patternX: 1,
    patternY: 1,
    patternZ: 1,
    phases: 1,
    spriteIds: [spriteId],
  }
}
```

- [ ] **Step 2: Escrever o teste que falha**

`tools/assets/test/dat.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FIRST_ITEM_ID, FLAG_DISPLACEMENT, FLAG_GROUND, FLAG_NOT_WALKABLE, parseDat } from '../src/dat.js'
import { buildDat, groundItemSpec, outfitSpec } from './fixtures/dat-fixture.js'

describe('parseDat (860)', () => {
  const file = buildDat({
    signature: 0x0102_0304,
    items: [groundItemSpec(1, 150), { ...groundItemSpec(2), flags: [FLAG_NOT_WALKABLE] }],
    outfits: [outfitSpec(2, 10, [FLAG_DISPLACEMENT, 8, 0, 8, 0])],
  })
  const dat = parseDat(file, 860)

  it('lê o cabeçalho e as contagens', () => {
    expect(dat.signature).toBe(0x0102_0304)
    expect(dat.version).toBe(860)
    expect(dat.items).toHaveLength(2)
    expect(dat.outfits).toHaveLength(1)
    expect(dat.effects).toHaveLength(0)
    expect(dat.missiles).toHaveLength(0)
  })

  it('numera itens a partir de 100 e outfits a partir de 1', () => {
    expect(dat.items[0]?.id).toBe(FIRST_ITEM_ID)
    expect(dat.items[1]?.id).toBe(FIRST_ITEM_ID + 1)
    expect(dat.outfits[0]?.id).toBe(1)
    expect(dat.outfits[0]?.category).toBe('outfit')
  })

  it('lê flags com dados e flags sem dados', () => {
    const ground = dat.items[0]!
    expect(ground.flags.has(FLAG_GROUND)).toBe(true)
    expect(ground.groundSpeed).toBe(150)
    const wall = dat.items[1]!
    expect(wall.flags.has(FLAG_NOT_WALKABLE)).toBe(true)
    expect(wall.groundSpeed).toBeNull()
  })

  it('lê dimensões, padrões, fases e sprite ids do outfit', () => {
    const o = dat.outfits[0]!
    expect(o).toMatchObject({ width: 2, height: 2, layers: 1, patternX: 4, patternY: 1, patternZ: 1, phases: 2 })
    expect(o.spriteIds).toHaveLength(32)
    expect(o.spriteIds[0]).toBe(10)
    expect(o.spriteIds[31]).toBe(41)
    expect(o.displacement).toEqual({ x: 8, y: 8 })
  })

  it('lança erro claro para flag desconhecida', () => {
    const broken = buildDat({ items: [{ ...groundItemSpec(1), flags: [0x7e] }], outfits: [] })
    expect(() => parseDat(broken, 860)).toThrow(/flag desconhecida 0x7e.*item 100/)
  })
})

describe('parseDat (854)', () => {
  it('trata a flag 8 como Chargeable sem dados e desloca as demais', () => {
    // em 854: 0x19 = Displacement (0x18 em 860), 0x08 = Chargeable
    const file = buildDat({
      items: [{ ...groundItemSpec(1), flags: [0x00, 100, 0, 0x08] }],
      outfits: [outfitSpec(1, 10, [0x19, 4, 0, 4, 0])],
    })
    const dat = parseDat(file, 854)
    expect(dat.items[0]?.groundSpeed).toBe(100)
    expect(dat.outfits[0]?.displacement).toEqual({ x: 4, y: 4 })
    expect(dat.outfits[0]?.flags.has(FLAG_DISPLACEMENT)).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- dat`
Expected: FAIL, `../src/dat.js` não encontrado.

- [ ] **Step 4: Implementar**

`tools/assets/src/dat.ts`:
```ts
import { BinaryReader } from './binary-reader.js'

export type DatVersion = 854 | 860
export type ThingCategory = 'item' | 'outfit' | 'effect' | 'missile'

export const FIRST_ITEM_ID = 100
export const FLAG_GROUND = 0x00
export const FLAG_WRITABLE = 0x08
export const FLAG_WRITABLE_ONCE = 0x09
export const FLAG_NOT_WALKABLE = 0x0c
export const FLAG_LIGHT = 0x15
export const FLAG_DISPLACEMENT = 0x18
export const FLAG_ELEVATION = 0x19
export const FLAG_MINIMAP_COLOR = 0x1c
export const FLAG_LENS_HELP = 0x1d
export const FLAG_CLOTH = 0x20
export const FLAG_MARKET = 0x21
export const FLAG_END = 0xff
const FLAG_MAX_KNOWN = 0x25
/** Sentinela interna para a flag Chargeable do formato 8.54, que não existe em 8.60. */
const FLAG_CHARGEABLE_854 = 0xfe

export interface ThingType {
  readonly id: number
  readonly category: ThingCategory
  readonly width: number
  readonly height: number
  readonly layers: number
  readonly patternX: number
  readonly patternY: number
  readonly patternZ: number
  readonly phases: number
  readonly spriteIds: readonly number[]
  readonly displacement: { readonly x: number; readonly y: number }
  readonly groundSpeed: number | null
  readonly flags: ReadonlySet<number>
}

export interface DatFile {
  readonly signature: number
  readonly version: DatVersion
  readonly items: readonly ThingType[]
  readonly outfits: readonly ThingType[]
  readonly effects: readonly ThingType[]
  readonly missiles: readonly ThingType[]
}

interface FlagBlock {
  readonly flags: ReadonlySet<number>
  readonly displacement: { readonly x: number; readonly y: number }
  readonly groundSpeed: number | null
}

function normalizeFlag(raw: number, version: DatVersion): number {
  if (version === 860) return raw
  if (raw === 0x08) return FLAG_CHARGEABLE_854
  return raw > 0x08 ? raw - 1 : raw
}

function skipMarketData(reader: BinaryReader): void {
  reader.u16() // category
  reader.u16() // tradeAs
  reader.u16() // showAs
  const nameLength = reader.u16()
  reader.bytes(nameLength)
  reader.u16() // restrictVocation
  reader.u16() // requiredLevel
}

function readFlags(reader: BinaryReader, version: DatVersion, label: string): FlagBlock {
  const flags = new Set<number>()
  let displacement = { x: 0, y: 0 }
  let groundSpeed: number | null = null
  for (;;) {
    const raw = reader.u8()
    if (raw === FLAG_END) break
    const flag = normalizeFlag(raw, version)
    flags.add(flag)
    switch (flag) {
      case FLAG_GROUND:
        groundSpeed = reader.u16()
        break
      case FLAG_WRITABLE:
      case FLAG_WRITABLE_ONCE:
      case FLAG_ELEVATION:
      case FLAG_MINIMAP_COLOR:
      case FLAG_LENS_HELP:
      case FLAG_CLOTH:
        reader.u16()
        break
      case FLAG_LIGHT:
        reader.u16()
        reader.u16()
        break
      case FLAG_DISPLACEMENT:
        displacement = { x: reader.u16(), y: reader.u16() }
        break
      case FLAG_MARKET:
        skipMarketData(reader)
        break
      case FLAG_CHARGEABLE_854:
        break
      default:
        if (flag > FLAG_MAX_KNOWN) {
          const hex = raw.toString(16).padStart(2, '0')
          throw new Error(`flag desconhecida 0x${hex} no ${label} (posição ${reader.position - 1})`)
        }
    }
  }
  return { flags, displacement, groundSpeed }
}

function readThing(reader: BinaryReader, id: number, category: ThingCategory, version: DatVersion): ThingType {
  const block = readFlags(reader, version, `${category} ${id}`)
  const width = reader.u8()
  const height = reader.u8()
  if (width > 1 || height > 1) reader.u8() // exactSize, não usado
  const layers = reader.u8()
  const patternX = reader.u8()
  const patternY = reader.u8()
  const patternZ = reader.u8()
  const phases = reader.u8()
  const count = width * height * layers * patternX * patternY * patternZ * phases
  const spriteIds = Array.from({ length: count }, () => reader.u16())
  return { id, category, width, height, layers, patternX, patternY, patternZ, phases, spriteIds, ...block }
}

function readCategory(
  reader: BinaryReader,
  category: ThingCategory,
  firstId: number,
  lastId: number,
  version: DatVersion,
): ThingType[] {
  const things: ThingType[] = []
  for (let id = firstId; id <= lastId; id++) {
    things.push(readThing(reader, id, category, version))
  }
  return things
}

export function parseDat(data: Uint8Array, version: DatVersion = 860): DatFile {
  const reader = BinaryReader.fromBuffer(data)
  const signature = reader.u32()
  const lastItemId = reader.u16()
  const outfitCount = reader.u16()
  const effectCount = reader.u16()
  const missileCount = reader.u16()
  const items = readCategory(reader, 'item', FIRST_ITEM_ID, lastItemId, version)
  const outfits = readCategory(reader, 'outfit', 1, outfitCount, version)
  const effects = readCategory(reader, 'effect', 1, effectCount, version)
  const missiles = readCategory(reader, 'missile', 1, missileCount, version)
  return { signature, version, items, outfits, effects, missiles }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- dat`
Expected: 6 testes passando.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/src/dat.ts tools/assets/test/dat.test.ts tools/assets/test/fixtures/dat-fixture.ts
git commit -m "feat(assets): parser de Tibia.dat com flags 8.60 e 8.54"
```

---

### Task 5: Composição de frames multi-tile

**Files:**
- Create: `tools/assets/src/compose.ts`
- Test: `tools/assets/test/compose.test.ts`

**Interfaces:**
- Consumes: `SprFile`, `decodeSprite`, `SPRITE_SIZE` (Task 3); `ThingType` (Task 4).
- Produces:
  - `interface RgbaImage { readonly width: number; readonly height: number; readonly data: Uint8Array }`
  - `interface FrameSelector { readonly layer?: number; readonly patternX: number; readonly patternY?: number; readonly patternZ?: number; readonly phase: number }`
  - `spriteIndex(thing: ThingType, w: number, h: number, layer: number, x: number, y: number, z: number, phase: number): number`
  - `composeFrame(spr: SprFile, thing: ThingType, sel: FrameSelector): RgbaImage` com `width = thing.width*32`, `height = thing.height*32`; sprite `(w,h)` desenhado em `x=(width-w-1)*32, y=(height-h-1)*32`; só pixels com alpha > 0 são copiados.
  - `DIRECTION_NAMES = ['north', 'east', 'south', 'west'] as const`

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/compose.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { DIRECTION_NAMES, composeFrame, spriteIndex } from '../src/compose.js'
import { parseDat } from '../src/dat.js'
import { parseSpr, type Rgb } from '../src/spr.js'
import { buildDat, outfitSpec } from './fixtures/dat-fixture.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]
const GREEN: Rgb = [0, 255, 0]
const BLUE: Rgb = [0, 0, 255]
const WHITE: Rgb = [255, 255, 255]

function pixel(img: { width: number; data: Uint8Array }, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4
  return Array.from(img.data.subarray(o, o + 4))
}

describe('spriteIndex', () => {
  const thing = parseDat(buildDat({ items: [], outfits: [outfitSpec(2, 1)] })).outfits[0]!

  it('segue a ordem fase > z > y > x > camada > altura > largura', () => {
    expect(spriteIndex(thing, 0, 0, 0, 0, 0, 0, 0)).toBe(0)
    expect(spriteIndex(thing, 1, 0, 0, 0, 0, 0, 0)).toBe(1)
    expect(spriteIndex(thing, 0, 1, 0, 0, 0, 0, 0)).toBe(2)
    expect(spriteIndex(thing, 0, 0, 0, 1, 0, 0, 0)).toBe(4) // direção leste
    expect(spriteIndex(thing, 0, 0, 0, 0, 0, 0, 1)).toBe(16) // segunda fase
  })

  it('faz wrap da fase', () => {
    expect(spriteIndex(thing, 0, 0, 0, 0, 0, 0, 2)).toBe(0)
  })
})

describe('composeFrame', () => {
  // sprites 1..4 são as quatro peças da direção norte, fase 0: (w0,h0)=RED, (w1,h0)=GREEN, (w0,h1)=BLUE, (w1,h1)=WHITE
  const spr = parseSpr(buildSpr([solidSprite(RED), solidSprite(GREEN), solidSprite(BLUE), solidSprite(WHITE)]))
  const outfit = { ...outfitSpec(1, 1), spriteIds: [1, 2, 3, 4, ...Array.from({ length: 12 }, () => 0)] }
  const thing = parseDat(buildDat({ items: [], outfits: [outfit] })).outfits[0]!

  it('posiciona (w0,h0) no canto inferior direito e (w1,h1) no superior esquerdo', () => {
    const img = composeFrame(spr, thing, { patternX: 0, phase: 0 })
    expect(img.width).toBe(64)
    expect(img.height).toBe(64)
    expect(pixel(img, 63, 63)).toEqual([255, 0, 0, 255]) // RED
    expect(pixel(img, 0, 63)).toEqual([0, 255, 0, 255]) // GREEN
    expect(pixel(img, 63, 0)).toEqual([0, 0, 255, 255]) // BLUE
    expect(pixel(img, 0, 0)).toEqual([255, 255, 255, 255]) // WHITE
  })

  it('deixa transparente onde o sprite id é 0', () => {
    const img = composeFrame(spr, thing, { patternX: 1, phase: 0 })
    expect(pixel(img, 63, 63)).toEqual([0, 0, 0, 0])
  })

  it('exporta os nomes de direção na ordem do Tibia', () => {
    expect(DIRECTION_NAMES).toEqual(['north', 'east', 'south', 'west'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- compose`
Expected: FAIL, `../src/compose.js` não encontrado.

- [ ] **Step 3: Implementar**

`tools/assets/src/compose.ts`:
```ts
import type { ThingType } from './dat.js'
import { SPRITE_SIZE, decodeSprite, type SprFile } from './spr.js'

const BYTES_PER_RGBA = 4

export const DIRECTION_NAMES = ['north', 'east', 'south', 'west'] as const
export type DirectionName = (typeof DIRECTION_NAMES)[number]

export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

export interface FrameSelector {
  readonly layer?: number
  readonly patternX: number
  readonly patternY?: number
  readonly patternZ?: number
  readonly phase: number
}

export function spriteIndex(
  t: ThingType,
  w: number,
  h: number,
  layer: number,
  x: number,
  y: number,
  z: number,
  phase: number,
): number {
  const p = phase % t.phases
  return ((((((p * t.patternZ + z) * t.patternY + y) * t.patternX + x) * t.layers + layer) * t.height + h) * t.width + w)
}

function blit(src: Uint8Array, dst: Uint8Array, dstWidth: number, originX: number, originY: number): void {
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const s = (y * SPRITE_SIZE + x) * BYTES_PER_RGBA
      if (src[s + 3] === 0) continue
      const d = ((originY + y) * dstWidth + originX + x) * BYTES_PER_RGBA
      dst[d] = src[s]!
      dst[d + 1] = src[s + 1]!
      dst[d + 2] = src[s + 2]!
      dst[d + 3] = src[s + 3]!
    }
  }
}

export function composeFrame(spr: SprFile, thing: ThingType, sel: FrameSelector): RgbaImage {
  const width = thing.width * SPRITE_SIZE
  const height = thing.height * SPRITE_SIZE
  const data = new Uint8Array(width * height * BYTES_PER_RGBA)
  const layer = sel.layer ?? 0
  const y = sel.patternY ?? 0
  const z = sel.patternZ ?? 0
  for (let h = 0; h < thing.height; h++) {
    for (let w = 0; w < thing.width; w++) {
      const id = thing.spriteIds[spriteIndex(thing, w, h, layer, sel.patternX, y, z, sel.phase)] ?? 0
      if (id === 0) continue
      const originX = (thing.width - w - 1) * SPRITE_SIZE
      const originY = (thing.height - h - 1) * SPRITE_SIZE
      blit(decodeSprite(spr, id), data, width, originX, originY)
    }
  }
  return { width, height, data }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- compose`
Expected: 5 testes passando.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/compose.ts tools/assets/test/compose.test.ts
git commit -m "feat(assets): composição de frames multi-tile"
```

---

### Task 6: PNG, catálogo, extração completa e CLI `inspect`/`extract`

**Files:**
- Create: `tools/assets/src/png.ts`, `tools/assets/src/catalog.ts`, `tools/assets/src/extract.ts`, `tools/assets/src/cli.ts`
- Test: `tools/assets/test/extract.test.ts`

**Interfaces:**
- Consumes: `parseSpr`, `parseDat`, `composeFrame`, `DIRECTION_NAMES`, `RgbaImage`, `FLAG_GROUND`, `FLAG_NOT_WALKABLE`.
- Produces:
  - `encodePng(img: RgbaImage): Buffer`, `decodePng(buf: Uint8Array): RgbaImage`
  - `interface CatalogOutfit { id: number; width: number; height: number; directions: number; phases: number; layers: number; displacement: { x: number; y: number } }`
  - `interface CatalogItem { id: number; width: number; height: number; patternX: number; patternY: number; phases: number; isGround: boolean; isBlocking: boolean }`
  - `interface Catalog { version: DatVersion; sprSignature: number; datSignature: number; outfits: CatalogOutfit[]; items: CatalogItem[] }`
  - `buildCatalog(spr: SprFile, dat: DatFile): Catalog` (só inclui things com pelo menos um sprite id diferente de 0)
  - `interface ExtractOptions { sprPath: string; datPath: string; outDir: string; version: DatVersion }`
  - `extractAll(opts: ExtractOptions, log?: (line: string) => void): Promise<Catalog>` escreve `outfits/<id>/<direction>_<phase>.png` (direção pelo nome se `patternX === 4`, senão `x<n>`), `items/<id>_<px>_<py>.png` (fase 0), e `catalog.json`.
  - Nome de arquivo de outfit: `outfitFramePath(outDir, id, direction: string, phase: number): string`; de item: `itemFramePath(outDir, id, px, py): string`. Exportados para as tasks 8 e 10 reutilizarem.
  - CLI: `inspect <spr> <dat> [--version 860|854]` e `extract <spr> <dat> [--out assets/extracted] [--version 860|854]`.

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/extract.test.ts`:
```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractAll, itemFramePath, outfitFramePath } from '../src/extract.js'
import { decodePng } from '../src/png.js'
import type { Rgb } from '../src/spr.js'
import { buildDat, groundItemSpec, outfitSpec } from './fixtures/dat-fixture.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]

describe('extractAll', () => {
  it('escreve PNGs por outfit/direção/fase, por item, e o catalog.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-extract-'))
    const sprPath = join(dir, 'Tibia.spr')
    const datPath = join(dir, 'Tibia.dat')
    const outDir = join(dir, 'out')

    // 1 sprite vermelho; item 100 usa sprite 1; outfit 1 (2 fases, 32 ids) usa sprite 1 em tudo; outfit 2 é vazio
    await writeFile(sprPath, buildSpr([solidSprite(RED)]))
    const emptyOutfit = { ...outfitSpec(1, 0), spriteIds: Array.from({ length: 16 }, () => 0) }
    await writeFile(
      datPath,
      buildDat({
        items: [groundItemSpec(1)],
        outfits: [{ ...outfitSpec(2, 1), spriteIds: Array.from({ length: 32 }, () => 1) }, emptyOutfit],
      }),
    )

    const catalog = await extractAll({ sprPath, datPath, outDir, version: 860 })

    expect(catalog.outfits.map((o) => o.id)).toEqual([1])
    expect(catalog.outfits[0]).toMatchObject({ width: 2, height: 2, directions: 4, phases: 2 })
    expect(catalog.items[0]).toMatchObject({ id: 100, isGround: true, isBlocking: false })

    const png = decodePng(await readFile(outfitFramePath(outDir, 1, 'south', 1)))
    expect(png.width).toBe(64)
    expect(Array.from(png.data.subarray(0, 4))).toEqual([255, 0, 0, 255])

    const item = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0)))
    expect(item.width).toBe(32)

    const written = JSON.parse(await readFile(join(outDir, 'catalog.json'), 'utf8'))
    expect(written.outfits).toHaveLength(1)
    expect(written.version).toBe(860)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- extract`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar `png.ts`**

```ts
import { PNG } from 'pngjs'
import type { RgbaImage } from './compose.js'

export function encodePng(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data)
  return PNG.sync.write(png)
}

export function decodePng(buf: Uint8Array): RgbaImage {
  const png = PNG.sync.read(Buffer.from(buf))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}
```

- [ ] **Step 4: Implementar `catalog.ts`**

```ts
import { FLAG_GROUND, FLAG_NOT_WALKABLE, type DatFile, type DatVersion, type ThingType } from './dat.js'
import type { SprFile } from './spr.js'

export interface CatalogOutfit {
  readonly id: number
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly phases: number
  readonly layers: number
  readonly displacement: { readonly x: number; readonly y: number }
}

export interface CatalogItem {
  readonly id: number
  readonly width: number
  readonly height: number
  readonly patternX: number
  readonly patternY: number
  readonly phases: number
  readonly isGround: boolean
  readonly isBlocking: boolean
}

export interface Catalog {
  readonly version: DatVersion
  readonly sprSignature: number
  readonly datSignature: number
  readonly outfits: readonly CatalogOutfit[]
  readonly items: readonly CatalogItem[]
}

export function hasSprites(t: ThingType): boolean {
  return t.spriteIds.some((id) => id !== 0)
}

function toOutfit(t: ThingType): CatalogOutfit {
  return {
    id: t.id,
    width: t.width,
    height: t.height,
    directions: t.patternX,
    phases: t.phases,
    layers: t.layers,
    displacement: t.displacement,
  }
}

function toItem(t: ThingType): CatalogItem {
  return {
    id: t.id,
    width: t.width,
    height: t.height,
    patternX: t.patternX,
    patternY: t.patternY,
    phases: t.phases,
    isGround: t.flags.has(FLAG_GROUND),
    isBlocking: t.flags.has(FLAG_NOT_WALKABLE),
  }
}

export function buildCatalog(spr: SprFile, dat: DatFile): Catalog {
  return {
    version: dat.version,
    sprSignature: spr.signature,
    datSignature: dat.signature,
    outfits: dat.outfits.filter(hasSprites).map(toOutfit),
    items: dat.items.filter(hasSprites).map(toItem),
  }
}
```

- [ ] **Step 5: Implementar `extract.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildCatalog, hasSprites, type Catalog } from './catalog.js'
import { DIRECTION_NAMES, composeFrame } from './compose.js'
import { parseDat, type DatVersion, type ThingType } from './dat.js'
import { encodePng } from './png.js'
import { parseSpr, type SprFile } from './spr.js'

export interface ExtractOptions {
  readonly sprPath: string
  readonly datPath: string
  readonly outDir: string
  readonly version: DatVersion
}

export type Logger = (line: string) => void

export function directionName(patternX: number, index: number): string {
  return patternX === DIRECTION_NAMES.length ? DIRECTION_NAMES[index]! : `x${index}`
}

export function outfitFramePath(outDir: string, id: number, direction: string, phase: number): string {
  return join(outDir, 'outfits', String(id), `${direction}_${phase}.png`)
}

export function itemFramePath(outDir: string, id: number, px: number, py: number): string {
  return join(outDir, 'items', `${id}_${px}_${py}.png`)
}

async function writeOutfit(spr: SprFile, outfit: ThingType, outDir: string): Promise<void> {
  await mkdir(join(outDir, 'outfits', String(outfit.id)), { recursive: true })
  for (let x = 0; x < outfit.patternX; x++) {
    for (let phase = 0; phase < outfit.phases; phase++) {
      const img = composeFrame(spr, outfit, { patternX: x, phase })
      await writeFile(outfitFramePath(outDir, outfit.id, directionName(outfit.patternX, x), phase), encodePng(img))
    }
  }
}

async function writeItem(spr: SprFile, item: ThingType, outDir: string): Promise<void> {
  for (let px = 0; px < item.patternX; px++) {
    for (let py = 0; py < item.patternY; py++) {
      const img = composeFrame(spr, item, { patternX: px, patternY: py, phase: 0 })
      await writeFile(itemFramePath(outDir, item.id, px, py), encodePng(img))
    }
  }
}

export async function extractAll(opts: ExtractOptions, log: Logger = () => {}): Promise<Catalog> {
  const spr = parseSpr(new Uint8Array(await readFile(opts.sprPath)))
  const dat = parseDat(new Uint8Array(await readFile(opts.datPath)), opts.version)
  log(`spr: ${spr.spriteCount} sprites; dat: ${dat.items.length} itens, ${dat.outfits.length} outfits`)

  await mkdir(join(opts.outDir, 'items'), { recursive: true })
  const outfits = dat.outfits.filter(hasSprites)
  for (const [i, outfit] of outfits.entries()) {
    await writeOutfit(spr, outfit, opts.outDir)
    if (i % 100 === 0) log(`outfits: ${i}/${outfits.length}`)
  }
  const items = dat.items.filter(hasSprites)
  for (const [i, item] of items.entries()) {
    await writeItem(spr, item, opts.outDir)
    if (i % 1000 === 0) log(`itens: ${i}/${items.length}`)
  }

  const catalog = buildCatalog(spr, dat)
  await writeFile(join(opts.outDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  log(`catalog.json com ${catalog.outfits.length} outfits e ${catalog.items.length} itens`)
  return catalog
}

export async function loadCatalog(outDir: string): Promise<Catalog> {
  return JSON.parse(await readFile(join(outDir, 'catalog.json'), 'utf8')) as Catalog
}
```

- [ ] **Step 6: Implementar `cli.ts` com `inspect` e `extract`**

```ts
import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { parseDat, type DatVersion } from './dat.js'
import { extractAll } from './extract.js'
import { parseSpr } from './spr.js'

const out = (line: string): void => void process.stdout.write(`${line}\n`)

export function parseVersion(raw: string): DatVersion {
  if (raw === '860') return 860
  if (raw === '854') return 854
  throw new Error(`versão de .dat não suportada: ${raw} (use 860 ou 854)`)
}

const program = new Command().name('pokeidle-assets').description('Pipeline de assets do Pokeidle')

program
  .command('inspect')
  .argument('<spr>')
  .argument('<dat>')
  .option('--version <v>', 'versão do .dat (860 ou 854)', '860')
  .action(async (sprPath: string, datPath: string, opts: { version: string }) => {
    const spr = parseSpr(new Uint8Array(await readFile(sprPath)))
    const dat = parseDat(new Uint8Array(await readFile(datPath)), parseVersion(opts.version))
    out(`spr signature 0x${spr.signature.toString(16)}, ${spr.spriteCount} sprites`)
    out(`dat signature 0x${dat.signature.toString(16)}`)
    out(`itens: ${dat.items.length} (100..${dat.items.length + 99})`)
    out(`outfits: ${dat.outfits.length}, efeitos: ${dat.effects.length}, mísseis: ${dat.missiles.length}`)
    const big = dat.outfits.filter((o) => o.width > 1 || o.height > 1).length
    out(`outfits multi-tile: ${big}`)
  })

program
  .command('extract')
  .argument('<spr>')
  .argument('<dat>')
  .option('--out <dir>', 'pasta de saída', 'assets/extracted')
  .option('--version <v>', 'versão do .dat (860 ou 854)', '860')
  .action(async (sprPath: string, datPath: string, opts: { out: string; version: string }) => {
    await extractAll({ sprPath, datPath, outDir: opts.out, version: parseVersion(opts.version) }, out)
  })

export { program }

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- extract && pnpm --filter @pokeidle/assets-tools typecheck`
Expected: 1 teste passando, typecheck sem erros.

- [ ] **Step 8: Commit**

```bash
git add tools/assets/src/png.ts tools/assets/src/catalog.ts tools/assets/src/extract.ts tools/assets/src/cli.ts tools/assets/test/extract.test.ts
git commit -m "feat(assets): extração de outfits e itens para PNG com catálogo e CLI"
```

---

### Task 7: Manifest de curadoria (schema + validação contra o catálogo)

**Files:**
- Create: `tools/assets/src/manifest.ts`, `tools/assets/manifest.example.json`
- Test: `tools/assets/test/manifest.test.ts`

**Interfaces:**
- Consumes: `Catalog` (Task 6).
- Produces:
  - `ManifestSchema` (zod) e `type Manifest = { version: 1; species: Array<{ id: number; name: string; outfitId: number; attackOutfitId?: number }>; tiles: Array<{ name: string; itemId: number; patternX: number; patternY: number }> }`
  - `parseManifest(json: unknown): Manifest` (lança `Error` com mensagem legível dos problemas do zod)
  - `loadManifest(path: string): Promise<Manifest>`
  - `validateManifest(m: Manifest, catalog: Catalog): string[]` devolve lista de problemas; vazia significa válido. Regras: nome de espécie único, `id` de espécie único, nome de tile único, `outfitId` e `attackOutfitId` existem no catálogo e têm 4 direções, `itemId` existe no catálogo e `patternX/patternY` estão dentro da faixa do item.

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/manifest.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/catalog.js'
import { parseManifest, validateManifest } from '../src/manifest.js'

const catalog: Catalog = {
  version: 860,
  sprSignature: 1,
  datSignature: 2,
  outfits: [
    { id: 10, width: 2, height: 2, directions: 4, phases: 3, layers: 1, displacement: { x: 8, y: 8 } },
    { id: 11, width: 1, height: 1, directions: 1, phases: 1, layers: 1, displacement: { x: 0, y: 0 } },
  ],
  items: [{ id: 100, width: 1, height: 1, patternX: 2, patternY: 1, phases: 1, isGround: true, isBlocking: false }],
}

const valid = {
  version: 1,
  species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
  tiles: [{ name: 'grass', itemId: 100, patternX: 1, patternY: 0 }],
}

describe('parseManifest', () => {
  it('aceita um manifest válido e aplica defaults de pattern', () => {
    const m = parseManifest({ ...valid, tiles: [{ name: 'grass', itemId: 100 }] })
    expect(m.tiles[0]).toEqual({ name: 'grass', itemId: 100, patternX: 0, patternY: 0 })
  })

  it('rejeita nome fora de kebab-case com mensagem legível', () => {
    expect(() => parseManifest({ ...valid, species: [{ id: 1, name: 'Bulbasaur', outfitId: 10 }] })).toThrow(/species\.0\.name/)
  })
})

describe('validateManifest', () => {
  it('devolve lista vazia para manifest coerente com o catálogo', () => {
    expect(validateManifest(parseManifest(valid), catalog)).toEqual([])
  })

  it('aponta outfit inexistente, outfit sem 4 direções e item inexistente', () => {
    const m = parseManifest({
      version: 1,
      species: [
        { id: 1, name: 'a', outfitId: 999 },
        { id: 2, name: 'b', outfitId: 11 },
      ],
      tiles: [{ name: 't', itemId: 555 }],
    })
    const problems = validateManifest(m, catalog)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toMatch(/a.*outfit 999/)
    expect(problems[1]).toMatch(/b.*4 direções/)
    expect(problems[2]).toMatch(/t.*item 555/)
  })

  it('aponta nomes e ids duplicados e pattern fora da faixa', () => {
    const m = parseManifest({
      version: 1,
      species: [
        { id: 1, name: 'dup', outfitId: 10 },
        { id: 1, name: 'dup', outfitId: 10 },
      ],
      tiles: [{ name: 'grass', itemId: 100, patternX: 2, patternY: 0 }],
    })
    const problems = validateManifest(m, catalog)
    expect(problems.some((p) => /nome de espécie duplicado.*dup/.test(p))).toBe(true)
    expect(problems.some((p) => /id de espécie duplicado.*1/.test(p))).toBe(true)
    expect(problems.some((p) => /grass.*patternX 2/.test(p))).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- manifest`
Expected: FAIL, `../src/manifest.js` não encontrado.

- [ ] **Step 3: Implementar**

`tools/assets/src/manifest.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Catalog } from './catalog.js'

const KEBAB = /^[a-z0-9-]+$/
const REQUIRED_DIRECTIONS = 4

const SpeciesSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().regex(KEBAB, 'use kebab-case ascii'),
  outfitId: z.number().int().positive(),
  attackOutfitId: z.number().int().positive().optional(),
})

const TileSchema = z.object({
  name: z.string().regex(KEBAB, 'use kebab-case ascii'),
  itemId: z.number().int().min(100),
  patternX: z.number().int().min(0).default(0),
  patternY: z.number().int().min(0).default(0),
})

export const ManifestSchema = z.object({
  version: z.literal(1),
  species: z.array(SpeciesSchema),
  tiles: z.array(TileSchema),
})

export type Manifest = z.infer<typeof ManifestSchema>
export type SpeciesEntry = Manifest['species'][number]
export type TileEntry = Manifest['tiles'][number]

export function parseManifest(json: unknown): Manifest {
  const result = ManifestSchema.safeParse(json)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`manifest inválido:\n${lines.join('\n')}`)
}

export async function loadManifest(path: string): Promise<Manifest> {
  return parseManifest(JSON.parse(await readFile(path, 'utf8')))
}

function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>()
  const dups = new Set<T>()
  for (const v of values) (seen.has(v) ? dups : seen).add(v)
  return [...dups]
}

function validateSpecies(s: SpeciesEntry, catalog: Catalog): string[] {
  const check = (outfitId: number, role: string): string[] => {
    const outfit = catalog.outfits.find((o) => o.id === outfitId)
    if (!outfit) return [`espécie ${s.name}: ${role} outfit ${outfitId} não existe no catálogo`]
    if (outfit.directions !== REQUIRED_DIRECTIONS) {
      return [`espécie ${s.name}: ${role} outfit ${outfitId} tem ${outfit.directions} direções, esperadas ${REQUIRED_DIRECTIONS} direções`]
    }
    return []
  }
  return [...check(s.outfitId, 'walk'), ...(s.attackOutfitId === undefined ? [] : check(s.attackOutfitId, 'attack'))]
}

function validateTile(t: TileEntry, catalog: Catalog): string[] {
  const item = catalog.items.find((i) => i.id === t.itemId)
  if (!item) return [`tile ${t.name}: item ${t.itemId} não existe no catálogo`]
  const problems: string[] = []
  if (t.patternX >= item.patternX) problems.push(`tile ${t.name}: patternX ${t.patternX} fora da faixa 0..${item.patternX - 1}`)
  if (t.patternY >= item.patternY) problems.push(`tile ${t.name}: patternY ${t.patternY} fora da faixa 0..${item.patternY - 1}`)
  return problems
}

export function validateManifest(m: Manifest, catalog: Catalog): string[] {
  return [
    ...duplicates(m.species.map((s) => s.name)).map((n) => `nome de espécie duplicado: ${n}`),
    ...duplicates(m.species.map((s) => s.id)).map((id) => `id de espécie duplicado: ${id}`),
    ...duplicates(m.tiles.map((t) => t.name)).map((n) => `nome de tile duplicado: ${n}`),
    ...m.species.flatMap((s) => validateSpecies(s, catalog)),
    ...m.tiles.flatMap((t) => validateTile(t, catalog)),
  ]
}
```

- [ ] **Step 4: Criar o exemplo**

`tools/assets/manifest.example.json` (ids fictícios, substituir após o `contact-sheet` da Task 10):
```json
{
  "version": 1,
  "species": [
    { "id": 1, "name": "bulbasaur", "outfitId": 0 },
    { "id": 4, "name": "charmander", "outfitId": 0 },
    { "id": 7, "name": "squirtle", "outfitId": 0 },
    { "id": 16, "name": "pidgey", "outfitId": 0 },
    { "id": 19, "name": "rattata", "outfitId": 0 }
  ],
  "tiles": [
    { "name": "grass", "itemId": 0 },
    { "name": "dirt", "itemId": 0 },
    { "name": "stone-floor", "itemId": 0 },
    { "name": "mountain", "itemId": 0 },
    { "name": "water", "itemId": 0 }
  ]
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- manifest`
Expected: 5 testes passando.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/src/manifest.ts tools/assets/manifest.example.json tools/assets/test/manifest.test.ts
git commit -m "feat(assets): schema e validação do manifest de curadoria"
```

---

### Task 8: Empacotador em grade, spritesheet PixiJS e tileset do Tiled

**Files:**
- Create: `tools/assets/src/atlas.ts`
- Test: `tools/assets/test/atlas.test.ts`

**Interfaces:**
- Consumes: `RgbaImage` (Task 5).
- Produces:
  - `interface AtlasFrame { readonly name: string; readonly image: RgbaImage }`
  - `interface PixiFrame { frame: {x,y,w,h}; rotated: false; trimmed: false; spriteSourceSize: {x:0,y:0,w,h}; sourceSize: {w,h} }`
  - `interface PixiSpritesheet { frames: Record<string, PixiFrame>; animations: Record<string, string[]>; meta: { image: string; format: 'RGBA8888'; size: {w,h}; scale: '1'; columns: number; cell: {w,h}; padding: number } }`
  - `packGrid(frames: readonly AtlasFrame[], imageName: string, padding?: number): { image: RgbaImage; sheet: PixiSpritesheet }`. Célula = maior largura/altura entre os frames; colunas = `ceil(sqrt(n))`; ordem dos frames preservada; cada frame desenhado no canto superior esquerdo da célula. `animations` agrupa nomes que terminam em `_<n>` pelo prefixo, ordenados por `n`.
  - `interface TiledTileset { type: 'tileset'; version: '1.10'; name: string; image: string; imagewidth: number; imageheight: number; tilewidth: number; tileheight: number; tilecount: number; columns: number; margin: 0; spacing: number; tiles: Array<{ id: number; properties: Array<{ name: 'name'; type: 'string'; value: string }> }> }`
  - `toTiledTileset(sheet: PixiSpritesheet, name: string): TiledTileset` (id local = índice do frame na ordem de inserção; exige todas as células iguais, o que a grade garante)

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/atlas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { packGrid, toTiledTileset, type AtlasFrame } from '../src/atlas.js'
import type { RgbaImage } from '../src/compose.js'

function solid(w: number, h: number, v: number): RgbaImage {
  return { width: w, height: h, data: new Uint8Array(w * h * 4).fill(v) }
}

function px(img: RgbaImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4]!
}

describe('packGrid', () => {
  const frames: AtlasFrame[] = [
    { name: 'a/walk_south_0', image: solid(2, 2, 10) },
    { name: 'a/walk_south_1', image: solid(2, 2, 20) },
    { name: 'a/walk_north_0', image: solid(2, 2, 30) },
    { name: 'grass', image: solid(1, 1, 40) },
    { name: 'water', image: solid(2, 2, 50) },
  ]
  const { image, sheet } = packGrid(frames, 'sheet.png', 0)

  it('usa ceil(sqrt(n)) colunas e a maior célula', () => {
    expect(sheet.meta.columns).toBe(3)
    expect(sheet.meta.cell).toEqual({ w: 2, h: 2 })
    expect(image.width).toBe(6)
    expect(image.height).toBe(4)
    expect(sheet.meta).toMatchObject({ image: 'sheet.png', size: { w: 6, h: 4 }, format: 'RGBA8888', scale: '1' })
  })

  it('posiciona frames em ordem, linha por linha', () => {
    expect(sheet.frames['a/walk_south_1']?.frame).toEqual({ x: 2, y: 0, w: 2, h: 2 })
    expect(sheet.frames['grass']?.frame).toEqual({ x: 0, y: 2, w: 1, h: 1 })
    expect(px(image, 2, 0)).toBe(20)
    expect(px(image, 0, 2)).toBe(40)
    expect(px(image, 1, 2)).toBe(0) // resto da célula do grass fica transparente
  })

  it('agrupa animações pelo prefixo antes de _<n>', () => {
    expect(sheet.animations).toEqual({
      'a/walk_south': ['a/walk_south_0', 'a/walk_south_1'],
      'a/walk_north': ['a/walk_north_0'],
    })
  })

  it('aplica padding entre células', () => {
    const packed = packGrid(frames.slice(0, 2), 'p.png', 1)
    expect(packed.image.width).toBe(2 * 2 + 1)
    expect(packed.sheet.frames['a/walk_south_1']?.frame.x).toBe(3)
  })

  it('lança erro para lista vazia', () => {
    expect(() => packGrid([], 'x.png')).toThrow(/nenhum frame/)
  })
})

describe('toTiledTileset', () => {
  it('gera tileset com ids locais na ordem dos frames e nome como propriedade', () => {
    const { sheet } = packGrid(
      [
        { name: 'grass', image: solid(32, 32, 1) },
        { name: 'water', image: solid(32, 32, 2) },
      ],
      'tiles.png',
      0,
    )
    const ts = toTiledTileset(sheet, 'tibia-tiles')
    expect(ts).toMatchObject({ type: 'tileset', image: 'tiles.png', tilewidth: 32, tileheight: 32, tilecount: 2, columns: 2, spacing: 0 })
    expect(ts.tiles[1]).toEqual({ id: 1, properties: [{ name: 'name', type: 'string', value: 'water' }] })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- atlas`
Expected: FAIL, `../src/atlas.js` não encontrado.

- [ ] **Step 3: Implementar**

`tools/assets/src/atlas.ts`:
```ts
import type { RgbaImage } from './compose.js'

const BYTES_PER_RGBA = 4
const ANIMATION_SUFFIX = /^(.*)_(\d+)$/

export interface AtlasFrame {
  readonly name: string
  readonly image: RgbaImage
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PixiFrame {
  frame: Rect
  rotated: false
  trimmed: false
  spriteSourceSize: Rect
  sourceSize: { w: number; h: number }
}

export interface PixiSpritesheet {
  frames: Record<string, PixiFrame>
  animations: Record<string, string[]>
  meta: {
    image: string
    format: 'RGBA8888'
    size: { w: number; h: number }
    scale: '1'
    columns: number
    cell: { w: number; h: number }
    padding: number
  }
}

export interface TiledTileset {
  type: 'tileset'
  version: '1.10'
  name: string
  image: string
  imagewidth: number
  imageheight: number
  tilewidth: number
  tileheight: number
  tilecount: number
  columns: number
  margin: 0
  spacing: number
  tiles: Array<{ id: number; properties: Array<{ name: 'name'; type: 'string'; value: string }> }>
}

function blitInto(src: RgbaImage, dst: Uint8Array, dstWidth: number, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++) {
    const srcRow = y * src.width * BYTES_PER_RGBA
    const dstRow = ((oy + y) * dstWidth + ox) * BYTES_PER_RGBA
    dst.set(src.data.subarray(srcRow, srcRow + src.width * BYTES_PER_RGBA), dstRow)
  }
}

function groupAnimations(names: readonly string[]): Record<string, string[]> {
  const groups = new Map<string, Array<{ n: number; name: string }>>()
  for (const name of names) {
    const match = ANIMATION_SUFFIX.exec(name)
    if (!match) continue
    const prefix = match[1]!
    const list = groups.get(prefix) ?? []
    groups.set(prefix, [...list, { n: Number(match[2]), name }])
  }
  return Object.fromEntries(
    [...groups.entries()].map(([prefix, list]) => [prefix, [...list].sort((a, b) => a.n - b.n).map((e) => e.name)]),
  )
}

export function packGrid(frames: readonly AtlasFrame[], imageName: string, padding = 0): { image: RgbaImage; sheet: PixiSpritesheet } {
  if (frames.length === 0) throw new Error('packGrid: nenhum frame para empacotar')
  const cellW = Math.max(...frames.map((f) => f.image.width))
  const cellH = Math.max(...frames.map((f) => f.image.height))
  const columns = Math.ceil(Math.sqrt(frames.length))
  const rows = Math.ceil(frames.length / columns)
  const width = columns * cellW + (columns - 1) * padding
  const height = rows * cellH + (rows - 1) * padding
  const data = new Uint8Array(width * height * BYTES_PER_RGBA)

  const pixiFrames: Record<string, PixiFrame> = {}
  frames.forEach((f, i) => {
    const x = (i % columns) * (cellW + padding)
    const y = Math.floor(i / columns) * (cellH + padding)
    blitInto(f.image, data, width, x, y)
    const w = f.image.width
    const h = f.image.height
    pixiFrames[f.name] = {
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    }
  })

  return {
    image: { width, height, data },
    sheet: {
      frames: pixiFrames,
      animations: groupAnimations(frames.map((f) => f.name)),
      meta: { image: imageName, format: 'RGBA8888', size: { w: width, h: height }, scale: '1', columns, cell: { w: cellW, h: cellH }, padding },
    },
  }
}

export function toTiledTileset(sheet: PixiSpritesheet, name: string): TiledTileset {
  const names = Object.keys(sheet.frames)
  return {
    type: 'tileset',
    version: '1.10',
    name,
    image: sheet.meta.image,
    imagewidth: sheet.meta.size.w,
    imageheight: sheet.meta.size.h,
    tilewidth: sheet.meta.cell.w,
    tileheight: sheet.meta.cell.h,
    tilecount: names.length,
    columns: sheet.meta.columns,
    margin: 0,
    spacing: sheet.meta.padding,
    tiles: names.map((value, id) => ({ id, properties: [{ name: 'name', type: 'string', value }] })),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- atlas`
Expected: 6 testes passando.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/atlas.ts tools/assets/test/atlas.test.ts
git commit -m "feat(assets): empacotador em grade com spritesheet PixiJS e tileset Tiled"
```

---

### Task 9: Construção dos atlases a partir do manifest

**Files:**
- Create: `tools/assets/src/build-atlases.ts`
- Modify: `tools/assets/src/cli.ts` (adicionar comando `build`)
- Test: `tools/assets/test/build-atlases.test.ts`

**Interfaces:**
- Consumes: `loadManifest`, `validateManifest` (Task 7); `packGrid`, `toTiledTileset` (Task 8); `loadCatalog`, `outfitFramePath`, `itemFramePath` (Task 6); `decodePng`, `encodePng`; `DIRECTION_NAMES`.
- Produces:
  - `interface BuildOptions { extractedDir: string; manifestPath: string; outDir: string }`
  - `buildAtlases(opts: BuildOptions, log?: Logger): Promise<{ pokemonFrames: number; tileFrames: number }>` escreve `pokemon.png`, `pokemon.json`, `tiles.png`, `tiles.json`, `tiles.tsj` em `outDir`. Lança `Error` listando os problemas se `validateManifest` devolver algo.
  - Nomes de frame: `<species>/walk_<direction>_<phase>` e, se houver `attackOutfitId`, `<species>/attack_<direction>_<phase>`; tiles usam `<tile.name>`.
  - CLI: `build [--extracted assets/extracted] [--manifest tools/assets/manifest.json] [--out assets/atlas]`.

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/build-atlases.test.ts`:
```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAtlases } from '../src/build-atlases.js'
import type { Catalog } from '../src/catalog.js'
import { itemFramePath, outfitFramePath } from '../src/extract.js'
import { decodePng, encodePng } from '../src/png.js'

const catalog: Catalog = {
  version: 860,
  sprSignature: 1,
  datSignature: 2,
  outfits: [{ id: 10, width: 2, height: 2, directions: 4, phases: 2, layers: 1, displacement: { x: 8, y: 8 } }],
  items: [{ id: 100, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false }],
}

async function writePng(path: string, w: number, h: number, v: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(v) }))
}

describe('buildAtlases', () => {
  it('gera pokemon e tiles com nomes de frame e animações', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    const extractedDir = join(dir, 'extracted')
    const outDir = join(dir, 'atlas')
    await mkdir(extractedDir, { recursive: true })
    await writeFile(join(extractedDir, 'catalog.json'), JSON.stringify(catalog))
    for (const d of ['north', 'east', 'south', 'west']) {
      for (const phase of [0, 1]) await writePng(outfitFramePath(extractedDir, 10, d, phase), 64, 64, 200)
    }
    await writePng(itemFramePath(extractedDir, 100, 0, 0), 32, 32, 90)
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(
      manifestPath,
      JSON.stringify({ version: 1, species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }], tiles: [{ name: 'grass', itemId: 100 }] }),
    )

    const result = await buildAtlases({ extractedDir, manifestPath, outDir })
    expect(result).toEqual({ pokemonFrames: 8, tileFrames: 1 })

    const pokemon = JSON.parse(await readFile(join(outDir, 'pokemon.json'), 'utf8'))
    expect(pokemon.frames['bulbasaur/walk_south_1']).toBeDefined()
    expect(pokemon.animations['bulbasaur/walk_south']).toEqual(['bulbasaur/walk_south_0', 'bulbasaur/walk_south_1'])
    expect(pokemon.meta.image).toBe('pokemon.png')
    const img = decodePng(await readFile(join(outDir, 'pokemon.png')))
    expect(img.width).toBe(3 * 64)

    const tiles = JSON.parse(await readFile(join(outDir, 'tiles.json'), 'utf8'))
    expect(tiles.frames['grass'].frame).toEqual({ x: 0, y: 0, w: 32, h: 32 })
    const tsj = JSON.parse(await readFile(join(outDir, 'tiles.tsj'), 'utf8'))
    expect(tsj.tiles[0].properties[0].value).toBe('grass')
  })

  it('falha listando problemas de validação', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    const extractedDir = join(dir, 'extracted')
    await mkdir(extractedDir, { recursive: true })
    await writeFile(join(extractedDir, 'catalog.json'), JSON.stringify(catalog))
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify({ version: 1, species: [{ id: 1, name: 'x', outfitId: 999 }], tiles: [] }))
    await expect(buildAtlases({ extractedDir, manifestPath, outDir: join(dir, 'atlas') })).rejects.toThrow(/outfit 999/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- build-atlases`
Expected: FAIL, `../src/build-atlases.js` não encontrado.

- [ ] **Step 3: Implementar**

`tools/assets/src/build-atlases.ts`:
```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packGrid, toTiledTileset, type AtlasFrame } from './atlas.js'
import type { Catalog, CatalogOutfit } from './catalog.js'
import { DIRECTION_NAMES } from './compose.js'
import { itemFramePath, loadCatalog, outfitFramePath, type Logger } from './extract.js'
import { loadManifest, validateManifest, type Manifest, type SpeciesEntry, type TileEntry } from './manifest.js'
import { decodePng, encodePng } from './png.js'

export interface BuildOptions {
  readonly extractedDir: string
  readonly manifestPath: string
  readonly outDir: string
}

async function readFrame(name: string, path: string): Promise<AtlasFrame> {
  return { name, image: decodePng(await readFile(path)) }
}

async function outfitFrames(extractedDir: string, species: SpeciesEntry, outfit: CatalogOutfit, action: string): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const direction of DIRECTION_NAMES) {
    for (let phase = 0; phase < outfit.phases; phase++) {
      frames.push(await readFrame(`${species.name}/${action}_${direction}_${phase}`, outfitFramePath(extractedDir, outfit.id, direction, phase)))
    }
  }
  return frames
}

function findOutfit(catalog: Catalog, id: number): CatalogOutfit {
  const outfit = catalog.outfits.find((o) => o.id === id)
  if (!outfit) throw new Error(`outfit ${id} não está no catálogo`)
  return outfit
}

async function pokemonFrames(extractedDir: string, manifest: Manifest, catalog: Catalog): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const species of manifest.species) {
    frames.push(...(await outfitFrames(extractedDir, species, findOutfit(catalog, species.outfitId), 'walk')))
    if (species.attackOutfitId !== undefined) {
      frames.push(...(await outfitFrames(extractedDir, species, findOutfit(catalog, species.attackOutfitId), 'attack')))
    }
  }
  return frames
}

async function tileFrames(extractedDir: string, tiles: readonly TileEntry[]): Promise<AtlasFrame[]> {
  return Promise.all(tiles.map((t) => readFrame(t.name, itemFramePath(extractedDir, t.itemId, t.patternX, t.patternY))))
}

async function writeAtlas(outDir: string, baseName: string, frames: readonly AtlasFrame[]): Promise<ReturnType<typeof packGrid>> {
  const packed = packGrid(frames, `${baseName}.png`)
  await writeFile(join(outDir, `${baseName}.png`), encodePng(packed.image))
  await writeFile(join(outDir, `${baseName}.json`), JSON.stringify(packed.sheet, null, 2))
  return packed
}

export async function buildAtlases(opts: BuildOptions, log: Logger = () => {}): Promise<{ pokemonFrames: number; tileFrames: number }> {
  const [manifest, catalog] = await Promise.all([loadManifest(opts.manifestPath), loadCatalog(opts.extractedDir)])
  const problems = validateManifest(manifest, catalog)
  if (problems.length > 0) throw new Error(`manifest incoerente com o catálogo:\n${problems.join('\n')}`)

  await mkdir(opts.outDir, { recursive: true })
  const pokemon = await pokemonFrames(opts.extractedDir, manifest, catalog)
  await writeAtlas(opts.outDir, 'pokemon', pokemon)
  log(`pokemon.png: ${pokemon.length} frames de ${manifest.species.length} espécies`)

  const tiles = await tileFrames(opts.extractedDir, manifest.tiles)
  const packedTiles = await writeAtlas(opts.outDir, 'tiles', tiles)
  await writeFile(join(opts.outDir, 'tiles.tsj'), JSON.stringify(toTiledTileset(packedTiles.sheet, 'tibia-tiles'), null, 2))
  log(`tiles.png: ${tiles.length} tiles; tiles.tsj pronto para o Tiled`)

  return { pokemonFrames: pokemon.length, tileFrames: tiles.length }
}
```

- [ ] **Step 4: Adicionar o comando `build` ao `cli.ts`**

Inserir antes de `export { program }`:
```ts
program
  .command('build')
  .option('--extracted <dir>', 'pasta com PNGs extraídos e catalog.json', 'assets/extracted')
  .option('--manifest <file>', 'manifest de curadoria', 'tools/assets/manifest.json')
  .option('--out <dir>', 'pasta de saída dos atlases', 'assets/atlas')
  .action(async (opts: { extracted: string; manifest: string; out: string }) => {
    await buildAtlases({ extractedDir: opts.extracted, manifestPath: opts.manifest, outDir: opts.out }, out)
  })
```
E o import no topo: `import { buildAtlases } from './build-atlases.js'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- build-atlases && pnpm --filter @pokeidle/assets-tools typecheck`
Expected: 2 testes passando, typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/src/build-atlases.ts tools/assets/src/cli.ts tools/assets/test/build-atlases.test.ts
git commit -m "feat(assets): build dos atlases pokemon e tiles a partir do manifest"
```

---

### Task 10: Contact sheet HTML para achar ids no navegador

**Files:**
- Create: `tools/assets/src/contact-sheet.ts`
- Modify: `tools/assets/src/cli.ts` (comando `contact-sheet`)
- Test: `tools/assets/test/contact-sheet.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `loadCatalog`, `outfitFramePath`, `itemFramePath`, `directionName` (Task 6).
- Produces:
  - `renderContactSheet(catalog: Catalog, opts: { onlyMultiTileOutfits: boolean; groundItemsOnly: boolean }): string` devolve HTML com uma `<figure>` por outfit (frame `south_0`) e por item (`_0_0`), legenda com o id, caminhos relativos a `assets/extracted/`, filtro por id via `<input>` e JS inline mínimo.
  - `writeContactSheet(extractedDir: string, opts): Promise<string>` grava `index.html` em `extractedDir` e devolve o caminho.
  - CLI: `contact-sheet [--extracted assets/extracted] [--all-outfits] [--all-items]`. Padrão: só outfits multi-tile (Pokémon do PXG são 2x2 ou maiores) e só itens de chão, para a página não ter 30 mil imagens.

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/contact-sheet.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/catalog.js'
import { renderContactSheet } from '../src/contact-sheet.js'

const catalog: Catalog = {
  version: 860,
  sprSignature: 1,
  datSignature: 2,
  outfits: [
    { id: 10, width: 2, height: 2, directions: 4, phases: 3, layers: 1, displacement: { x: 8, y: 8 } },
    { id: 11, width: 1, height: 1, directions: 4, phases: 1, layers: 1, displacement: { x: 0, y: 0 } },
  ],
  items: [
    { id: 100, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false },
    { id: 101, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: false, isBlocking: true },
  ],
}

describe('renderContactSheet', () => {
  it('lista só outfits multi-tile e itens de chão por padrão', () => {
    const html = renderContactSheet(catalog, { onlyMultiTileOutfits: true, groundItemsOnly: true })
    expect(html).toContain('outfits/10/south_0.png')
    expect(html).not.toContain('outfits/11/')
    expect(html).toContain('items/100_0_0.png')
    expect(html).not.toContain('items/101_0_0.png')
    expect(html).toContain('data-id="10"')
  })

  it('lista tudo quando os filtros estão desligados', () => {
    const html = renderContactSheet(catalog, { onlyMultiTileOutfits: false, groundItemsOnly: false })
    expect(html).toContain('outfits/11/south_0.png')
    expect(html).toContain('items/101_0_0.png')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- contact-sheet`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implementar**

`tools/assets/src/contact-sheet.ts`:
```ts
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Catalog, CatalogItem, CatalogOutfit } from './catalog.js'
import { directionName, loadCatalog } from './extract.js'

export interface ContactSheetOptions {
  readonly onlyMultiTileOutfits: boolean
  readonly groundItemsOnly: boolean
}

const STYLE = `
body{font-family:system-ui;background:#222;color:#eee;margin:0;padding:16px}
section{display:flex;flex-wrap:wrap;gap:8px}
figure{margin:0;padding:4px;background:#333;border-radius:4px;text-align:center;min-width:72px}
figure img{image-rendering:pixelated;display:block;margin:0 auto}
figcaption{font-size:12px;margin-top:4px}
input{font-size:16px;padding:6px;margin-bottom:12px;width:200px}
h2{margin:24px 0 8px}
`

const SCRIPT = `const input=document.querySelector('input');
input.addEventListener('input',()=>{const q=input.value.trim();
for(const f of document.querySelectorAll('figure')){f.hidden=q!==''&&!f.dataset.id.startsWith(q)}});`

function outfitFigure(o: CatalogOutfit): string {
  const src = `outfits/${o.id}/${directionName(o.directions, Math.min(2, o.directions - 1))}_0.png`
  return `<figure data-id="${o.id}"><img src="${src}" width="${o.width * 32}" height="${o.height * 32}" loading="lazy"><figcaption>#${o.id} · ${o.phases}f</figcaption></figure>`
}

function itemFigure(i: CatalogItem): string {
  return `<figure data-id="${i.id}"><img src="items/${i.id}_0_0.png" width="${i.width * 32}" height="${i.height * 32}" loading="lazy"><figcaption>#${i.id}</figcaption></figure>`
}

export function renderContactSheet(catalog: Catalog, opts: ContactSheetOptions): string {
  const outfits = catalog.outfits.filter((o) => !opts.onlyMultiTileOutfits || o.width > 1 || o.height > 1)
  const items = catalog.items.filter((i) => !opts.groundItemsOnly || i.isGround)
  return `<!doctype html><meta charset="utf-8"><title>Pokeidle contact sheet</title><style>${STYLE}</style>
<input placeholder="filtrar por id" autofocus>
<h2>Outfits (${outfits.length})</h2><section>${outfits.map(outfitFigure).join('')}</section>
<h2>Itens (${items.length})</h2><section>${items.map(itemFigure).join('')}</section>
<script>${SCRIPT}</script>`
}

export async function writeContactSheet(extractedDir: string, opts: ContactSheetOptions): Promise<string> {
  const catalog = await loadCatalog(extractedDir)
  const path = join(extractedDir, 'index.html')
  await writeFile(path, renderContactSheet(catalog, opts))
  return path
}
```

- [ ] **Step 4: Adicionar o comando ao `cli.ts`**

```ts
program
  .command('contact-sheet')
  .option('--extracted <dir>', 'pasta com PNGs extraídos e catalog.json', 'assets/extracted')
  .option('--all-outfits', 'incluir outfits 1x1', false)
  .option('--all-items', 'incluir itens que não são chão', false)
  .action(async (opts: { extracted: string; allOutfits: boolean; allItems: boolean }) => {
    const path = await writeContactSheet(opts.extracted, { onlyMultiTileOutfits: !opts.allOutfits, groundItemsOnly: !opts.allItems })
    out(`abra no navegador: ${path}`)
  })
```
Import: `import { writeContactSheet } from './contact-sheet.js'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/assets-tools test -- contact-sheet && pnpm --filter @pokeidle/assets-tools typecheck`
Expected: 2 testes passando.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/src/contact-sheet.ts tools/assets/src/cli.ts tools/assets/test/contact-sheet.test.ts
git commit -m "feat(assets): contact sheet HTML para localizar ids de outfit e item"
```

---

### Task 11: Formato HuntMap e importador de mapas do Tiled

**Files:**
- Create: `tools/assets/src/hunt-map.ts`, `tools/assets/src/tiled-import.ts`
- Modify: `tools/assets/src/cli.ts` (comando `map-import`)
- Create: `data/hunts/.gitkeep`
- Test: `tools/assets/test/tiled-import.test.ts`

**Interfaces:**
- Consumes: `TiledTileset` (Task 8).
- Produces:
  - `HuntMapSchema` (zod) e `type HuntMap = { id: string; name: string; width: number; height: number; tileSize: 32; layers: { ground: Array<string | null>; detail: Array<string | null>; blocking: boolean[] }; spawnPoint: {x,y}; pokecenter: {x,y}; spawns: Array<{ speciesName: string; minLevel: number; maxLevel: number; x: number; y: number; radius: number; count: number; respawnSeconds: number }> }`. Arrays de camada são row-major com `width*height` entradas; `ground` e `detail` guardam o nome do tile (propriedade `name` do tileset) ou `null`.
  - `parseHuntMap(json: unknown): HuntMap`
  - `importTiledMap(tiled: unknown, tileset: TiledTileset, meta: { id: string; name: string }): HuntMap`. Espera mapa ortogonal com `tilewidth`/`tileheight` 32, camadas de tile `ground`, `detail`, `blocking` (qualquer gid diferente de 0 bloqueia), um tileset com `firstgid`, e uma camada de objetos `objects` com objetos de `class` (ou `type`) `spawnPoint`, `pokecenter` e `spawn`. Objetos de `spawn` têm propriedades `species` (string), `minLevel`, `maxLevel`, `count`, `respawnSeconds` (int) e o raio é `max(width, height) / 2 / 32` arredondado para cima. Posições de objeto são o centro do objeto convertido para tile.
  - CLI: `map-import <tiled.tmj> --id <id> --name <nome> [--tileset assets/atlas/tiles.tsj] [--out data/hunts]` grava `data/hunts/<id>.json`.

- [ ] **Step 1: Escrever o teste que falha**

`tools/assets/test/tiled-import.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { TiledTileset } from '../src/atlas.js'
import { parseHuntMap } from '../src/hunt-map.js'
import { importTiledMap } from '../src/tiled-import.js'

const tileset: TiledTileset = {
  type: 'tileset',
  version: '1.10',
  name: 'tibia-tiles',
  image: 'tiles.png',
  imagewidth: 64,
  imageheight: 32,
  tilewidth: 32,
  tileheight: 32,
  tilecount: 2,
  columns: 2,
  margin: 0,
  spacing: 0,
  tiles: [
    { id: 0, properties: [{ name: 'name', type: 'string', value: 'grass' }] },
    { id: 1, properties: [{ name: 'name', type: 'string', value: 'mountain' }] },
  ],
}

// mapa 2x2: chão todo grass, montanha no canto inferior direito, bloqueio nesse tile
const tiled = {
  type: 'map',
  orientation: 'orthogonal',
  width: 2,
  height: 2,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
  layers: [
    { type: 'tilelayer', name: 'ground', width: 2, height: 2, data: [1, 1, 1, 1] },
    { type: 'tilelayer', name: 'detail', width: 2, height: 2, data: [0, 0, 0, 2] },
    { type: 'tilelayer', name: 'blocking', width: 2, height: 2, data: [0, 0, 0, 1] },
    {
      type: 'objectgroup',
      name: 'objects',
      objects: [
        { id: 1, class: 'spawnPoint', x: 0, y: 0, width: 32, height: 32 },
        { id: 2, class: 'pokecenter', x: 32, y: 0, width: 32, height: 32 },
        {
          id: 3,
          class: 'spawn',
          x: 0,
          y: 32,
          width: 64,
          height: 32,
          properties: [
            { name: 'species', type: 'string', value: 'rattata' },
            { name: 'minLevel', type: 'int', value: 2 },
            { name: 'maxLevel', type: 'int', value: 5 },
            { name: 'count', type: 'int', value: 3 },
            { name: 'respawnSeconds', type: 'int', value: 20 },
          ],
        },
      ],
    },
  ],
}

describe('importTiledMap', () => {
  const map = importTiledMap(tiled, tileset, { id: 'route-1', name: 'Rota 1' })

  it('converte camadas de tile em nomes e bloqueio em booleanos', () => {
    expect(map).toMatchObject({ id: 'route-1', name: 'Rota 1', width: 2, height: 2, tileSize: 32 })
    expect(map.layers.ground).toEqual(['grass', 'grass', 'grass', 'grass'])
    expect(map.layers.detail).toEqual([null, null, null, 'mountain'])
    expect(map.layers.blocking).toEqual([false, false, false, true])
  })

  it('converte objetos em posições de tile e spawns', () => {
    expect(map.spawnPoint).toEqual({ x: 0, y: 0 })
    expect(map.pokecenter).toEqual({ x: 1, y: 0 })
    expect(map.spawns).toEqual([
      { speciesName: 'rattata', minLevel: 2, maxLevel: 5, x: 1, y: 1, radius: 1, count: 3, respawnSeconds: 20 },
    ])
  })

  it('o resultado passa no HuntMapSchema', () => {
    expect(() => parseHuntMap(map)).not.toThrow()
  })

  it('falha se faltar spawnPoint ou pokecenter', () => {
    const noObjects = { ...tiled, layers: tiled.layers.slice(0, 3) }
    expect(() => importTiledMap(noObjects, tileset, { id: 'x', name: 'x' })).toThrow(/spawnPoint/)
  })

  it('falha em gid sem nome no tileset', () => {
    const bad = { ...tiled, layers: [{ ...tiled.layers[0]!, data: [1, 1, 1, 9] }, ...tiled.layers.slice(1)] }
    expect(() => importTiledMap(bad, tileset, { id: 'x', name: 'x' })).toThrow(/gid 9/)
  })
})

describe('parseHuntMap', () => {
  it('rejeita camada com tamanho errado', () => {
    const map = importTiledMap(tiled, tileset, { id: 'r', name: 'r' })
    expect(() => parseHuntMap({ ...map, layers: { ...map.layers, ground: ['grass'] } })).toThrow(/width\*height/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- tiled-import`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar `hunt-map.ts`**

```ts
import { z } from 'zod'

export const TILE_SIZE = 32
const KEBAB = /^[a-z0-9-]+$/

const PointSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) })

const SpawnSchema = z.object({
  speciesName: z.string().regex(KEBAB),
  minLevel: z.number().int().positive(),
  maxLevel: z.number().int().positive(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  radius: z.number().int().min(0),
  count: z.number().int().positive(),
  respawnSeconds: z.number().int().positive(),
})

export const HuntMapSchema = z
  .object({
    id: z.string().regex(KEBAB),
    name: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileSize: z.literal(TILE_SIZE),
    layers: z.object({
      ground: z.array(z.string().nullable()),
      detail: z.array(z.string().nullable()),
      blocking: z.array(z.boolean()),
    }),
    spawnPoint: PointSchema,
    pokecenter: PointSchema,
    spawns: z.array(SpawnSchema),
  })
  .superRefine((m, ctx) => {
    const expected = m.width * m.height
    for (const [name, layer] of Object.entries(m.layers)) {
      if (layer.length !== expected) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['layers', name], message: `tem ${layer.length} tiles, esperado width*height = ${expected}` })
      }
    }
    for (const [i, s] of m.spawns.entries()) {
      if (s.minLevel > s.maxLevel) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spawns', i], message: 'minLevel maior que maxLevel' })
      }
    }
  })

export type HuntMap = z.infer<typeof HuntMapSchema>
export type HuntSpawn = HuntMap['spawns'][number]

export function parseHuntMap(json: unknown): HuntMap {
  const result = HuntMapSchema.safeParse(json)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`HuntMap inválido:\n${lines.join('\n')}`)
}
```

- [ ] **Step 4: Implementar `tiled-import.ts`**

```ts
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
```

- [ ] **Step 5: Adicionar o comando `map-import` ao `cli.ts`**

```ts
program
  .command('map-import')
  .argument('<tiled>', 'mapa exportado do Tiled em JSON (.tmj)')
  .requiredOption('--id <id>', 'id kebab-case da hunt')
  .requiredOption('--name <nome>', 'nome exibido da hunt')
  .option('--tileset <file>', 'tileset gerado pelo build', 'assets/atlas/tiles.tsj')
  .option('--out <dir>', 'pasta de saída', 'data/hunts')
  .action(async (tiledPath: string, opts: { id: string; name: string; tileset: string; out: string }) => {
    const tiled = JSON.parse(await readFile(tiledPath, 'utf8')) as unknown
    const tileset = JSON.parse(await readFile(opts.tileset, 'utf8')) as TiledTileset
    const map = importTiledMap(tiled, tileset, { id: opts.id, name: opts.name })
    await mkdir(opts.out, { recursive: true })
    const target = join(opts.out, `${map.id}.json`)
    await writeFile(target, JSON.stringify(map, null, 2))
    out(`hunt gravada em ${target} (${map.width}x${map.height}, ${map.spawns.length} spawns)`)
  })
```
Imports adicionais no topo: `import { mkdir, readFile, writeFile } from 'node:fs/promises'` (substituindo o import só de `readFile`), `import { join } from 'node:path'`, `import type { TiledTileset } from './atlas.js'`, `import { importTiledMap } from './tiled-import.js'`.

- [ ] **Step 6: Rodar e ver passar**

Run: `touch data/hunts/.gitkeep && pnpm --filter @pokeidle/assets-tools test && pnpm --filter @pokeidle/assets-tools typecheck`
Expected: todos os testes do pacote passando, typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add tools/assets/src/hunt-map.ts tools/assets/src/tiled-import.ts tools/assets/src/cli.ts tools/assets/test/tiled-import.test.ts data/hunts/.gitkeep
git commit -m "feat(assets): schema HuntMap e importador de mapas do Tiled"
```

---

### Task 12: Rodada no pack real, manifest curado e primeira hunt

Esta task tem passos manuais. Ela só pode ser concluída pela pessoa, não por subagente, porque envolve baixar arquivos de fóruns e escolher sprites olhando para eles.

**Files:**
- Create: `tools/assets/manifest.json`, `data/hunts/route-1.json`, `data/hunts/route-1.tmj` (fonte do Tiled, commitada)
- Create: `assets/raw/Tibia.spr`, `assets/raw/Tibia.dat` (gitignored)

- [ ] **Step 1: Obter o pack**

Procurar em TibiaKing e OTLand por um cliente de PokeTibia derivado de PXG na versão 8.54 ou 8.60 (termos: "cliente poketibia 8.54", "sprites PXG spr dat", "PokeXGames client remake"). Copiar `Tibia.spr` e `Tibia.dat` para `assets/raw/`. Anotar a versão declarada pelo tópico.

- [ ] **Step 2: Inspecionar**

Run: `pnpm assets inspect assets/raw/Tibia.spr assets/raw/Tibia.dat --version 860`
Expected: contagens plausíveis (milhares de sprites, centenas de outfits, dezenas de outfits multi-tile). Se falhar com "flag desconhecida", tentar `--version 854`. Se ambos falharem, o pack usa formato fora do escopo; anotar a assinatura impressa e trocar de pack.

- [ ] **Step 3: Extrair e gerar o contact sheet**

Run: `pnpm assets extract assets/raw/Tibia.spr assets/raw/Tibia.dat --version 860 && pnpm assets contact-sheet`
Abrir `assets/extracted/index.html` no navegador. Anotar o id de outfit de 20 Pokémon da Gen 1 (incluindo os iniciais, pidgey, rattata, geodude, zubat) e o id de item de pelo menos grass, dirt, stone-floor, mountain e water.

- [ ] **Step 4: Escrever o manifest e buildar**

Copiar `tools/assets/manifest.example.json` para `tools/assets/manifest.json`, preencher os ids anotados, e rodar:

Run: `pnpm assets build`
Expected: `assets/atlas/pokemon.png`, `pokemon.json`, `tiles.png`, `tiles.json`, `tiles.tsj`. Abrir `pokemon.png` e confirmar visualmente que os frames estão inteiros e nas direções certas (sul deve ser o Pokémon de frente). Se um outfit tiver `layers: 2` e sair com cores estranhas, ele usa máscara de cor; trocar por outro id.

- [ ] **Step 5: Desenhar a primeira hunt no Tiled**

No Tiled: novo mapa ortogonal, 40x30 tiles de 32x32, salvar como `data/hunts/route-1.tmj` (formato JSON). Adicionar o tileset `assets/atlas/tiles.tsj` (embutir no mapa não é necessário). Criar as camadas de tile `ground`, `detail`, `blocking` e a camada de objetos `objects`. Pintar chão, algumas montanhas, e na camada `blocking` marcar com qualquer tile os lugares intransitáveis. Inserir um objeto de classe `spawnPoint`, um `pokecenter` e dois ou três retângulos de classe `spawn` com as propriedades `species`, `minLevel`, `maxLevel`, `count`, `respawnSeconds`.

Run: `pnpm assets map-import data/hunts/route-1.tmj --id route-1 --name "Rota 1"`
Expected: `data/hunts/route-1.json` gravado sem erro de validação.

- [ ] **Step 6: Commit**

```bash
git add tools/assets/manifest.json data/hunts/route-1.tmj data/hunts/route-1.json
git commit -m "feat(assets): manifest curado e primeira hunt (Rota 1)"
```

Repetir os passos 5 e 6 para mais duas hunts quando o servidor precisar delas (fase 3); uma basta para destravar `shared` e `server`.

---

## Autorrevisão do plano

**Cobertura da spec (seção 4):** fonte (Task 12.1), extração com leitor próprio (Tasks 3, 4, 5, 6), curadoria com manifest (Tasks 7, 10, 12), empacotamento em spritesheet + atlas PixiJS (Tasks 8, 9), mapa JSON via Tiled (Tasks 11, 12). Contingência de sprites gratuitos: qualquer PNG colocado em `assets/extracted/outfits/<id>/<dir>_<phase>.png` com um `catalog.json` escrito à mão passa pelo mesmo `build`, então a troca de fonte não toca código.

**Consistência de tipos:** `RgbaImage` definido na Task 5 e usado em 6, 8, 9. `Catalog`/`CatalogOutfit`/`CatalogItem` definidos na Task 6 e usados em 7, 9, 10. `outfitFramePath`/`itemFramePath`/`directionName`/`loadCatalog`/`Logger` definidos na Task 6 e usados em 9 e 10. `PixiSpritesheet`/`TiledTileset` definidos na Task 8 e usados em 9 e 11. `HuntMap`/`HuntSpawn`/`TILE_SIZE` definidos na Task 11. `DIRECTION_NAMES` definido na Task 5 e usado em 6 e 9.

**Fora do escopo desta fase, por decisão:** efeitos e mísseis do `.dat` são lidos mas não exportados; camadas de máscara de cor (`layers: 2`) são ignoradas; itens são exportados só na fase 0 de animação; não há empacotador por hunt, o atlas único basta para 20 espécies.
