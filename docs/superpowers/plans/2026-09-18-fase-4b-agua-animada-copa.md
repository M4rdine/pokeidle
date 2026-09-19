# Fase 4b: água animada e copa acima do jogador — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o cenário se mexer e a copa da árvore cobrir o jogador, sem tocar no motor, no servidor nem no protocolo.

**Architecture:** O extrator passa a gravar todas as fases de cada item; o atlas emite um quadro por fase e declara a animação sob o nome simples do tile; o mapa ganha uma camada `canopy` opcional; e a cena assa o que é estático, anima só o que se move e desenha a copa depois dos personagens.

**Tech Stack:** TypeScript 5 strict ESM (imports com `.js`), zod 3, PixiJS 8, Vitest 2, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-18-fase-4b-agua-animada-copa-design.md`

## Global Constraints

- Commit em conventional commits, uma linha só, sem rodapé de atribuição (nada de `Co-Authored-By` nem `Claude-Session`).
- TDD obrigatório: escreva o teste, rode e veja falhar, implemente o mínimo, rode e veja passar, commite.
- **Testes sempre em primeiro plano, um run por vez.** Nunca em segundo plano, nunca `--watch`, nunca via monitor, nunca `git stash` durante um run. Os testes de integração do servidor compartilham um Postgres só e runs concorrentes se truncam.
- Nada de `console.log`. Saída de CLI usa o `Logger` que já existe.
- Imutabilidade: nunca mutar objeto ou array de entrada; devolva cópia nova.
- Arquivos abaixo de 800 linhas, funções abaixo de 50 linhas, sem aninhamento acima de 4 níveis.
- Cobertura mínima de 80% por pacote, que é o limiar já configurado.
- O build do atlas roda com `pnpm assets build --extracted assets/extracted-otp2019`. Sem a flag ele lê `assets/extracted` e falha.
- A fase 0 de um tile mantém o nome simples, sem sufixo. Esse é o nome que o mapa, o Tiled e a prévia usam.
- Um quadro de fase maior que zero se chama `<tile>_<fase>` e nunca entra no tileset do Tiled.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `tools/assets/src/extract.ts` | grava um PNG por fase de cada item | 1 |
| `tools/assets/src/tile-animation.ts` (novo) | nomes de quadro por fase e detecção de quadro de fase | 2 |
| `tools/assets/src/atlas.ts` | `packGrid` aceita animações explícitas; tileset aceita subconjunto | 2 |
| `tools/assets/src/build-atlases.ts` | lê as fases do catálogo, monta as animações, tira as fases do tileset | 2 |
| `tools/assets/src/manifest.ts` | recusa nome de tile ou transição terminado em `_<número>` | 2 |
| `tools/assets/src/transition.ts` | compõe cada peça mista fase a fase | 3 |
| `packages/shared/src/schemas/hunt-map.ts` | camada `canopy` opcional | 4 |
| `tools/assets/src/tiled-import.ts` | importa a camada `canopy` quando existe | 5 |
| `tools/assets/src/map-preview.ts` | desenha a copa por último | 5 |
| `tools/assets/maps/route-1.tmj` | passa a trazer a camada de copa vazia | 5 |
| `packages/client/src/scene/map-parts.ts` (novo) | função pura que separa assado de animado | 6 |
| `packages/client/src/scene/map-layer.ts` | assa um conjunto de posições; monta os sprites animados | 7 |
| `packages/client/src/scene/app.ts` | ordem de desenho e relógio único da animação | 7 |
| `packages/client/src/config.ts` | `TILE_ANIMATION_MS` | 7 |
| `tools/assets/manifest.json` | troca de peça cuja fase é variação, não animação | 8 |

---

### Task 1: Extrator grava todas as fases do item

**Files:**
- Modify: `tools/assets/src/extract.ts` (`itemFramePath`, `writeItem`)
- Test: `tools/assets/test/extract.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `itemFramePath(outDir: string, id: number, px: number, py: number, phase?: number): string`. Com `phase` ausente ou 0 devolve `items/<id>_<px>_<py>.png`, exatamente como hoje; com fase maior que zero devolve `items/<id>_<px>_<py>_<fase>.png`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente em `tools/assets/test/extract.test.ts`, dentro do `describe('extractAll', …)`:

```ts
  it('grava um PNG por fase do item, com a fase 0 no caminho antigo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-extract-fases-'))
    const sprPath = join(dir, 'Tibia.spr')
    const datPath = join(dir, 'Tibia.dat')
    const outDir = join(dir, 'out')

    // dois sprites de cores diferentes; o item 100 tem 3 fases e usa um sprite por fase
    await writeFile(sprPath, buildSpr([solidSprite(RED), solidSprite(GREEN)]))
    const animated = { ...groundItemSpec(1), phases: 3, spriteIds: [1, 2, 1] }
    await writeFile(datPath, buildDat({ items: [animated], outfits: [] }))

    const catalog = await extractAll({ sprPath, datPath, outDir, version: 860 })
    expect(catalog.items[0]).toMatchObject({ id: 100, phases: 3 })

    const phase0 = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0)))
    const phase1 = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0, 1)))
    const phase2 = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0, 2)))
    expect(Array.from(phase0.data.subarray(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(phase1.data.subarray(0, 4))).toEqual([0, 255, 0, 255])
    expect(Array.from(phase2.data.subarray(0, 4))).toEqual([255, 0, 0, 255])
  })
```

No topo do arquivo, ao lado de `const RED: Rgb = [255, 0, 0]`, acrescente:

```ts
const GREEN: Rgb = [0, 255, 0]
```

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/extract.test.ts`
Expected: FAIL. `itemFramePath` aceita só quatro argumentos, então a chamada com fase não compila, e o arquivo da fase 1 não existe.

- [ ] **Step 3: Implemente**

Em `tools/assets/src/extract.ts`, troque `itemFramePath` e `writeItem`:

```ts
export function itemFramePath(outDir: string, id: number, px: number, py: number, phase = 0): string {
  const suffix = phase === 0 ? '' : `_${phase}`
  return join(outDir, 'items', `${id}_${px}_${py}${suffix}.png`)
}
```

```ts
async function writeItem(spr: SprFile, item: ThingType, outDir: string): Promise<void> {
  for (let px = 0; px < item.patternX; px++) {
    for (let py = 0; py < item.patternY; py++) {
      for (let phase = 0; phase < item.phases; phase++) {
        const img = composeFrame(spr, item, { patternX: px, patternY: py, phase })
        await writeFile(itemFramePath(outDir, item.id, px, py, phase), encodePng(img))
      }
    }
  }
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `pnpm --filter @pokeidle/assets-tools test`
Expected: PASS em todos os arquivos. O teste antigo que lê `itemFramePath(outDir, 100, 0, 0)` continua valendo porque a fase 0 manteve o caminho.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/src/extract.ts tools/assets/test/extract.test.ts
git commit -m "feat(assets): extrator grava todas as fases de cada item"
```

---

### Task 2: Atlas emite as fases e declara a animação

**Files:**
- Create: `tools/assets/src/tile-animation.ts`
- Create: `tools/assets/test/tile-animation.test.ts`
- Modify: `tools/assets/src/atlas.ts` (`packGrid`, `toTiledTileset`)
- Modify: `tools/assets/src/build-atlases.ts` (`tileFrames`, `writeAtlas`, `buildAtlases`)
- Modify: `tools/assets/src/manifest.ts` (`validateTile`, `validateTransition`)
- Test: `tools/assets/test/atlas.test.ts`, `tools/assets/test/build-atlases.test.ts`, `tools/assets/test/manifest.test.ts`

**Interfaces:**
- Consumes: `itemFramePath(outDir, id, px, py, phase?)` da Task 1.
- Produces:
  - `phaseFrameName(tile: string, phase: number): string`
  - `phaseFrameNames(tile: string, phases: number): string[]`
  - `isPhaseFrame(name: string): boolean`
  - `packGrid(frames, imageName, padding?, animations?)`, onde `animations?: Readonly<Record<string, readonly string[]>>` substitui o agrupamento por sufixo quando vem preenchido.
  - `tileFrames(extractedDir, tiles, catalog)` devolve `{ frames: AtlasFrame[]; animations: Record<string, string[]> }`.

- [ ] **Step 1: Escreva o teste do módulo novo**

Crie `tools/assets/test/tile-animation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isPhaseFrame, phaseFrameName, phaseFrameNames } from '../src/tile-animation.js'

describe('phaseFrameName', () => {
  it('mantém o nome simples na fase 0 e sufixa as demais', () => {
    expect(phaseFrameName('water', 0)).toBe('water')
    expect(phaseFrameName('water', 3)).toBe('water_3')
  })
})

describe('phaseFrameNames', () => {
  it('lista os quadros em ordem de fase, começando pelo nome simples', () => {
    expect(phaseFrameNames('water', 3)).toEqual(['water', 'water_1', 'water_2'])
  })
  it('um tile de fase única devolve só o nome simples', () => {
    expect(phaseFrameNames('grass', 1)).toEqual(['grass'])
  })
})

describe('isPhaseFrame', () => {
  it('reconhece quadro de fase e não confunde com peça fatiada nem com transição', () => {
    expect(isPhaseFrame('water_2')).toBe(true)
    expect(isPhaseFrame('water')).toBe(false)
    expect(isPhaseFrame('tree-oak-x0-y1')).toBe(false)
    expect(isPhaseFrame('grama-terra-baaa')).toBe(false)
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/tile-animation.test.ts`
Expected: FAIL. O módulo `../src/tile-animation.js` não existe.

- [ ] **Step 3: Implemente o módulo**

Crie `tools/assets/src/tile-animation.ts`:

```ts
/** A fase 0 mantém o nome simples do tile: é o nome que o mapa, o Tiled e a prévia usam. */
export function phaseFrameName(tile: string, phase: number): string {
  return phase === 0 ? tile : `${tile}_${phase}`
}

/** Todos os quadros de um tile, em ordem de fase. Um tile de fase única devolve só o nome simples. */
export function phaseFrameNames(tile: string, phases: number): string[] {
  return Array.from({ length: phases }, (_unused, phase) => phaseFrameName(tile, phase))
}

const PHASE_SUFFIX = /_\d+$/

/** Quadro de fase maior que zero: não entra no tileset do Tiled nem pode ser nome de entrada do manifesto. */
export function isPhaseFrame(name: string): boolean {
  return PHASE_SUFFIX.test(name)
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `pnpm --filter @pokeidle/assets-tools test test/tile-animation.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Escreva os testes do atlas**

Em `tools/assets/test/atlas.test.ts`, acrescente:

```ts
  it('usa as animações passadas em vez de agrupar por sufixo', () => {
    const { sheet } = packGrid(
      [
        { name: 'water', image: solid(32, 32, 1) },
        { name: 'water_1', image: solid(32, 32, 2) },
      ],
      'tiles.png',
      0,
      { water: ['water', 'water_1'] },
    )
    expect(sheet.animations).toEqual({ water: ['water', 'water_1'] })
  })

  it('o tileset aceita uma ordem que cobre só parte dos frames', () => {
    const { sheet } = packGrid(
      [
        { name: 'water', image: solid(32, 32, 1) },
        { name: 'water_1', image: solid(32, 32, 2) },
      ],
      'tiles.png',
    )
    const tileset = toTiledTileset(sheet, 'tibia-tiles', ['water'])
    expect(tileset.tilecount).toBe(1)
    expect(tileset.tiles).toEqual([{ id: 0, properties: [{ name: 'name', type: 'string', value: 'water' }] }])
  })

  it('o tileset recusa ordem com nome fora do spritesheet e nome repetido', () => {
    const { sheet } = packGrid([{ name: 'grass', image: solid(32, 32, 1) }], 'tiles.png')
    expect(() => toTiledTileset(sheet, 'x', ['grass', 'sumiu'])).toThrow(/fora do spritesheet: sumiu/)
    expect(() => toTiledTileset(sheet, 'x', ['grass', 'grass'])).toThrow(/nome repetido/)
  })
```

Se `solid` ou `toTiledTileset` ainda não estiverem importados nesse arquivo, acrescente aos imports existentes.

Procure no arquivo o teste que hoje espera a mensagem `/ordem de frames não corresponde/` e troque a expectativa para `/fora do spritesheet/`. A regra antiga exigia que a ordem cobrisse todos os frames, e é justamente essa regra que esta task remove.

- [ ] **Step 6: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/atlas.test.ts`
Expected: FAIL. `packGrid` não aceita o quarto argumento e `toTiledTileset` ainda recusa ordem parcial.

- [ ] **Step 7: Implemente no atlas**

Em `tools/assets/src/atlas.ts`, troque a assinatura e o retorno de `packGrid`:

```ts
export function packGrid(
  frames: readonly AtlasFrame[],
  imageName: string,
  padding = 0,
  animations?: Readonly<Record<string, readonly string[]>>,
): { image: RgbaImage; sheet: PixiSpritesheet } {
```

e, dentro do objeto devolvido, troque a linha de `animations` por:

```ts
      animations: animations
        ? Object.fromEntries(Object.entries(animations).map(([key, names]) => [key, [...names]]))
        : groupAnimations(frames.map((f) => f.name)),
```

Em `toTiledTileset`, troque a checagem de ordem por:

```ts
  const unknown = order.filter((n) => sheet.frames[n] === undefined)
  if (unknown.length > 0) throw new Error(`ordem de frames cita nomes fora do spritesheet: ${unknown.join(', ')}`)
  if (new Set(order).size !== order.length) throw new Error('ordem de frames tem nome repetido')
```

A ordem agora pode ser um subconjunto de propósito: os quadros de fase ficam no `tiles.json` e fora do `tiles.tsj`.

- [ ] **Step 8: Rode e veja passar**

Run: `pnpm --filter @pokeidle/assets-tools test test/atlas.test.ts`
Expected: PASS.

- [ ] **Step 9: Escreva o teste do build**

Em `tools/assets/test/build-atlases.test.ts`, acrescente dentro do `describe('buildAtlases', …)`:

```ts
  it('um tile animado gera um quadro por fase, declara a animação e fica com uma entrada só no tileset', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    // o item 103 tem 3 fases no catálogo do fixture; grava os três PNGs
    await writePng(itemFramePath(extractedDir, 103, 0, 0), 32, 32, 10)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 1), 32, 32, 20)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 2), 32, 32, 30)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'water', itemId: 103 }],
    }))

    await buildAtlases({ extractedDir, manifestPath, outDir: dir }, () => {})

    const sheet = JSON.parse(await readFile(join(dir, 'tiles.json'), 'utf8'))
    expect(Object.keys(sheet.frames).sort()).toEqual(['grass', 'water', 'water_1', 'water_2'])
    expect(sheet.animations).toEqual({ water: ['water', 'water_1', 'water_2'] })

    const tileset = JSON.parse(await readFile(join(dir, 'tiles.tsj'), 'utf8'))
    expect(tileset.tiles.map((t: { properties: { value: string }[] }) => t.properties[0]!.value)).toEqual(['grass', 'water'])
  })

  it('avisa qual quadro de fase falta quando a extração é antiga', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    // só a fase 0 existe; o item 103 declara 3 fases no catálogo
    await writePng(itemFramePath(extractedDir, 103, 0, 0), 32, 32, 10)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'water', itemId: 103 }],
    }))

    await expect(buildAtlases({ extractedDir, manifestPath, outDir: dir }, () => {})).rejects.toThrow(
      /tile water: falta o quadro da fase 1[\s\S]*pnpm assets extract/,
    )
  })
```

No catálogo do fixture desse arquivo de teste, acrescente o item animado ao lado dos que já existem:

```ts
  { id: 103, width: 1, height: 1, patternX: 1, patternY: 1, phases: 3, isGround: true, isBlocking: false },
```

- [ ] **Step 10: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/build-atlases.test.ts`
Expected: FAIL. O build ignora as fases, então `water_1` não aparece nos frames e `animations` sai vazio.

- [ ] **Step 11: Implemente no build**

Em `tools/assets/src/build-atlases.ts`, acrescente aos imports:

```ts
import { access } from 'node:fs/promises'
import { isPhaseFrame, phaseFrameName, phaseFrameNames } from './tile-animation.js'
```

Troque `tileFrames` por:

```ts
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Frames de todos os tiles, um por fase, mais a tabela de animação dos que têm mais de uma fase. */
async function tileFrames(
  extractedDir: string,
  tiles: readonly TileEntry[],
  catalog: Catalog,
): Promise<{ frames: AtlasFrame[]; animations: Record<string, string[]> }> {
  const frames: AtlasFrame[] = []
  const animations: Record<string, string[]> = {}
  for (const t of tiles) {
    const phases = catalog.items.find((i) => i.id === t.itemId)?.phases ?? 1
    const names = expandedTileNames(t)
    for (const name of names) {
      if (phases > 1) animations[name] = phaseFrameNames(name, phases)
    }
    for (let phase = 0; phase < phases; phase++) {
      const path = itemFramePath(extractedDir, t.itemId, t.patternX, t.patternY, phase)
      if (!(await exists(path))) {
        throw new Error(`tile ${t.name}: falta o quadro da fase ${phase} em ${path}; rode "pnpm assets extract" de novo para gravar as fases`)
      }
      const pieces = sliceImage(decodePng(await readFile(path)), t.slice?.cols ?? 1, t.slice?.rows ?? 1)
      // `expandedTileNames` e `sliceImage` percorrem na mesma ordem de leitura.
      pieces.forEach((piece, i) => frames.push({ name: phaseFrameName(names[i]!, phase), image: piece }))
    }
  }
  return { frames, animations }
}
```

Troque `writeAtlas` para repassar as animações:

```ts
async function writeAtlas(
  outDir: string,
  baseName: string,
  frames: readonly AtlasFrame[],
  animations?: Readonly<Record<string, readonly string[]>>,
): Promise<ReturnType<typeof packGrid>> {
  const packed = packGrid(frames, `${baseName}.png`, 0, animations)
  await writeFile(join(outDir, `${baseName}.png`), encodePng(packed.image))
  await writeFile(join(outDir, `${baseName}.json`), JSON.stringify(packed.sheet, null, 2))
  return packed
}
```

E, dentro de `buildAtlases`, troque o bloco dos tiles por:

```ts
  const base = await tileFrames(opts.extractedDir, manifest.tiles, catalog)
  const transitions = manifest.transitions ?? []
  const tiles = [...base.frames, ...transitionFrames(base.frames, transitions)]
  const packedTiles = await writeAtlas(opts.outDir, 'tiles', tiles, base.animations)
  const tileOrder = tiles.filter((f) => !isPhaseFrame(f.name)).map((f) => f.name)
  const terrains = [...(manifest.terrains ?? []), ...transitions.map(transitionTerrain)]
  await writeFile(
    join(opts.outDir, 'tiles.tsj'),
    JSON.stringify(toTiledTileset(packedTiles.sheet, 'tibia-tiles', tileOrder, terrains), null, 2),
  )
  log(`tiles.png: ${tileOrder.length} tiles em ${tiles.length} quadros; tiles.tsj pronto para o Tiled`)
```

O `transitionFrames` continua recebendo só os frames e compõe a partir da fase 0; a Task 3 é que o torna consciente de fase.

- [ ] **Step 12: Rode e veja passar**

Run: `pnpm --filter @pokeidle/assets-tools test`
Expected: PASS em todos os arquivos.

- [ ] **Step 13: Escreva o teste do manifesto**

Em `tools/assets/test/manifest.test.ts`, acrescente:

```ts
  it('recusa nome de tile terminado em _<número>, que colidiria com quadro de animação', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'water_2', itemId: 100 }],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/tile water_2: nome não pode terminar em _<número>/)
  })
  it('recusa nome de transição terminado em _<número>', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 1 }],
      transitions: [{ name: 'grama-terra_1', from: 'grass', to: 'dirt' }],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/transição grama-terra_1: nome não pode terminar em _<número>/)
  })
```

- [ ] **Step 14: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/manifest.test.ts`
Expected: FAIL. Nenhuma das duas mensagens é emitida hoje.

- [ ] **Step 15: Implemente a validação**

Em `tools/assets/src/manifest.ts`, acrescente ao import de `./transition.js` um import novo:

```ts
import { isPhaseFrame } from './tile-animation.js'
```

Em `validateTile`, logo depois da linha `const problems: string[] = []`, acrescente:

```ts
  if (isPhaseFrame(t.name)) {
    problems.push(`tile ${t.name}: nome não pode terminar em _<número>, que é como os quadros de animação são nomeados`)
  }
```

Em `validateTransition`, logo depois de `const problems: string[] = []`, acrescente:

```ts
  if (isPhaseFrame(t.name)) {
    problems.push(`transição ${t.name}: nome não pode terminar em _<número>, que é como os quadros de animação são nomeados`)
  }
```

- [ ] **Step 16: Rode a suíte do pacote e o typecheck**

Run: `pnpm --filter @pokeidle/assets-tools test`
Run: `pnpm --filter @pokeidle/assets-tools typecheck`
Expected: PASS nos dois.

- [ ] **Step 17: Commit**

```bash
git add tools/assets/src tools/assets/test
git commit -m "feat(assets): atlas emite os quadros de fase e declara a animação do tile"
```

---

### Task 3: Transições compostas fase a fase

**Files:**
- Modify: `tools/assets/src/transition.ts` (`transitionTiles`, novo `transitionAnimations`)
- Modify: `tools/assets/src/build-atlases.ts` (`transitionFrames`, `buildAtlases`)
- Test: `tools/assets/test/transition.test.ts`, `tools/assets/test/build-atlases.test.ts`

**Interfaces:**
- Consumes: `phaseFrameName`, `phaseFrameNames` da Task 2; `tileFrames` devolvendo `{ frames, animations }`.
- Produces:
  - `transitionTiles(entry: TransitionEntry, images: { from: readonly RgbaImage[]; to: readonly RgbaImage[] }): { name: string; image: RgbaImage }[]`. A contagem de quadros é o máximo entre os dois lados; o lado curto repete por índice cíclico; a máscara de uma peça é a mesma em todas as fases.
  - `transitionAnimations(entry: TransitionEntry, phases: number): Record<string, string[]>`, vazio quando `phases` é menor que 2.

- [ ] **Step 1: Escreva o teste**

Em `tools/assets/test/transition.test.ts`, acrescente:

```ts
describe('transitionTiles com fases', () => {
  const entry = { name: 'grama-agua', from: 'grass', to: 'water' }
  const solidOf = (v: number): RgbaImage => ({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(v) })

  it('sai com a contagem de quadros do lado longo e faz o lado curto repetir', () => {
    const from = [solidOf(10)]
    const to = [solidOf(100), solidOf(110), solidOf(120)]
    const tiles = transitionTiles(entry, { from, to })
    // 14 peças mistas x 3 fases
    expect(tiles).toHaveLength(42)
    const names = tiles.map((t) => t.name)
    expect(names).toContain('grama-agua-baaa')
    expect(names).toContain('grama-agua-baaa_1')
    expect(names).toContain('grama-agua-baaa_2')
    expect(names).not.toContain('grama-agua-baaa_3')
  })

  it('usa a mesma máscara em todas as fases da mesma peça, senão a borda cintila', () => {
    // os dois lados iguais em todas as fases: se a máscara mudasse entre fases, as peças
    // resultantes ainda seriam idênticas, então o lado `to` muda e a comparação é feita
    // pelo conjunto de pixels que vieram de `from`.
    const from = [solidOf(10), solidOf(10)]
    const to = [solidOf(200), solidOf(201)]
    const tiles = transitionTiles(entry, { from, to })
    const phase0 = tiles.find((t) => t.name === 'grama-agua-baaa')!
    const phase1 = tiles.find((t) => t.name === 'grama-agua-baaa_1')!
    const fromPixels = (image: RgbaImage): number[] =>
      [...image.data].map((v, i) => (i % 4 === 0 && v === 10 ? i : -1)).filter((i) => i >= 0)
    expect(fromPixels(phase1.image)).toEqual(fromPixels(phase0.image))
  })

  it('recusa lado sem nenhuma imagem', () => {
    expect(() => transitionTiles(entry, { from: [], to: [solidOf(1)] })).toThrow(/sem imagem/)
  })
})

describe('transitionAnimations', () => {
  const entry = { name: 'grama-agua', from: 'grass', to: 'water' }

  it('declara os quadros de cada peça mista quando há mais de uma fase', () => {
    const anims = transitionAnimations(entry, 3)
    expect(Object.keys(anims)).toHaveLength(14)
    expect(anims['grama-agua-baaa']).toEqual(['grama-agua-baaa', 'grama-agua-baaa_1', 'grama-agua-baaa_2'])
  })

  it('não declara nada quando os dois lados são parados', () => {
    expect(transitionAnimations(entry, 1)).toEqual({})
  })
})
```

Acrescente `transitionAnimations` ao import de `../src/transition.js` no topo do arquivo.

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/transition.test.ts`
Expected: FAIL. `transitionTiles` ainda recebe uma imagem por lado e `transitionAnimations` não existe.

- [ ] **Step 3: Implemente**

Em `tools/assets/src/transition.ts`, acrescente ao topo:

```ts
import { phaseFrameName, phaseFrameNames } from './tile-animation.js'
```

Troque `transitionTiles` por:

```ts
/** As catorze peças mistas, uma por fase; as puras (aaaa/bbbb) reaproveitam os tiles originais. */
export function transitionTiles(
  entry: TransitionEntry,
  images: { from: readonly RgbaImage[]; to: readonly RgbaImage[] },
): { name: string; image: RgbaImage }[] {
  if (images.from.length === 0 || images.to.length === 0) {
    throw new Error(`transição ${entry.name}: lado sem imagem nenhuma`)
  }
  const phases = Math.max(images.from.length, images.to.length)
  return MIXED_CORNER_CODES.flatMap((code, i) => {
    // A máscara depende só do código e da semente: fica igual em todas as fases desta peça,
    // senão o ruído da borda mudaria a cada quadro e a junção cintilaria.
    const mask = transitionMask(code, i + 1, entry.softness)
    return Array.from({ length: phases }, (_unused, phase) => ({
      name: phaseFrameName(`${entry.name}-${code}`, phase),
      image: composeTransition(
        images.from[phase % images.from.length]!,
        images.to[phase % images.to.length]!,
        mask,
      ),
    }))
  })
}

/** Os quadros de cada peça mista, para o atlas declarar a animação. Vazio quando não há o que animar. */
export function transitionAnimations(entry: TransitionEntry, phases: number): Record<string, string[]> {
  if (phases < 2) return {}
  return Object.fromEntries(transitionTileNames(entry).map((name) => [name, phaseFrameNames(name, phases)]))
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `pnpm --filter @pokeidle/assets-tools test test/transition.test.ts`
Expected: PASS. O build ainda não compila, porque `transitionFrames` passa uma imagem só; o passo seguinte conserta.

- [ ] **Step 5: Ligue no build**

Em `tools/assets/src/build-atlases.ts`, acrescente `transitionAnimations` ao import de `./transition.js` e troque `transitionFrames` por:

```ts
/** Todas as fases de um tile, na ordem, para compor a transição quadro a quadro. */
function tileImages(
  frames: readonly AtlasFrame[],
  transitionName: string,
  tileName: string,
  animations: Readonly<Record<string, readonly string[]>>,
): RgbaImage[] {
  const names = animations[tileName] ?? [tileName]
  return names.map((name) => findTileImage(frames, transitionName, name))
}

/** As peças mistas de cada transição, com os quadros de fase, e a tabela de animação delas. */
function transitionFrames(
  frames: readonly AtlasFrame[],
  transitions: readonly TransitionEntry[],
  animations: Readonly<Record<string, readonly string[]>>,
): { frames: AtlasFrame[]; animations: Record<string, string[]> } {
  const built = transitions.map((entry) => {
    const from = tileImages(frames, entry.name, entry.from, animations)
    const to = tileImages(frames, entry.name, entry.to, animations)
    return {
      tiles: transitionTiles(entry, { from, to }),
      anims: transitionAnimations(entry, Math.max(from.length, to.length)),
    }
  })
  return {
    frames: built.flatMap((b) => b.tiles),
    animations: Object.assign({}, ...built.map((b) => b.anims)) as Record<string, string[]>,
  }
}
```

E, em `buildAtlases`, troque o bloco dos tiles por:

```ts
  const base = await tileFrames(opts.extractedDir, manifest.tiles, catalog)
  const transitions = manifest.transitions ?? []
  const mixed = transitionFrames(base.frames, transitions, base.animations)
  const tiles = [...base.frames, ...mixed.frames]
  const animations = { ...base.animations, ...mixed.animations }
  const packedTiles = await writeAtlas(opts.outDir, 'tiles', tiles, animations)
```

O resto do bloco (ordem do tileset, terrenos, log) continua igual ao que a Task 2 deixou.

- [ ] **Step 6: Escreva o teste de ponta a ponta do build**

Em `tools/assets/test/build-atlases.test.ts`, acrescente:

```ts
  it('transição com um lado animado sai com os quadros do lado animado', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    await writePng(itemFramePath(extractedDir, 103, 0, 0), 32, 32, 10)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 1), 32, 32, 20)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 2), 32, 32, 30)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'water', itemId: 103 }],
      transitions: [{ name: 'grama-agua', from: 'grass', to: 'water' }],
    }))

    await buildAtlases({ extractedDir, manifestPath, outDir: dir }, () => {})

    const sheet = JSON.parse(await readFile(join(dir, 'tiles.json'), 'utf8'))
    expect(sheet.frames['grama-agua-baaa_2']).toBeDefined()
    expect(sheet.animations['grama-agua-baaa']).toEqual(['grama-agua-baaa', 'grama-agua-baaa_1', 'grama-agua-baaa_2'])

    const tileset = JSON.parse(await readFile(join(dir, 'tiles.tsj'), 'utf8'))
    const names = tileset.tiles.map((t: { properties: { value: string }[] }) => t.properties[0]!.value)
    expect(names).toContain('grama-agua-baaa')
    expect(names).not.toContain('grama-agua-baaa_1')
  })
```

- [ ] **Step 7: Rode tudo e o typecheck**

Run: `pnpm --filter @pokeidle/assets-tools test`
Run: `pnpm --filter @pokeidle/assets-tools typecheck`
Expected: PASS nos dois.

- [ ] **Step 8: Commit**

```bash
git add tools/assets/src tools/assets/test
git commit -m "feat(assets): peças de transição compostas fase a fase"
```

---

### Task 4: HuntMap ganha a camada de copa

**Files:**
- Modify: `packages/shared/src/schemas/hunt-map.ts`
- Test: `packages/shared/test/schemas.test.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `HuntMap['layers']['canopy']`, do tipo `Array<string | null> | undefined`. Quando presente, obedece à mesma regra de `width * height` das outras camadas. Consumido pelas Tasks 5, 6 e 7.

- [ ] **Step 1: Escreva o teste**

Em `packages/shared/test/schemas.test.ts`, dentro do `describe('parseOrThrow e HuntMap', …)`, acrescente:

```ts
  const mapWithSpawn = { ...validMap, spawns: [validSpawn] }

  it('aceita mapa sem camada de copa, que é o formato de hoje', () => {
    const parsed = parseHuntMap(mapWithSpawn)
    expect(parsed.layers.canopy).toBeUndefined()
  })

  it('aceita a camada de copa e a devolve', () => {
    const map = { ...mapWithSpawn, layers: { ...mapWithSpawn.layers, canopy: ['tree-oak-x0-y0', null] } }
    expect(parseHuntMap(map).layers.canopy).toEqual(['tree-oak-x0-y0', null])
  })

  it('rejeita camada de copa com tamanho errado', () => {
    const map = { ...mapWithSpawn, layers: { ...mapWithSpawn.layers, canopy: ['tree-oak-x0-y0'] } }
    expect(() => parseHuntMap(map)).toThrow(/width\*height/)
  })
```

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/shared test test/schemas.test.ts`
Expected: FAIL. O schema não conhece `canopy`, então o segundo teste devolve `undefined` e o terceiro não lança.

- [ ] **Step 3: Implemente**

Em `packages/shared/src/schemas/hunt-map.ts`, dentro de `layers`, acrescente a linha da copa depois de `blocking`:

```ts
    layers: z.object({
      ground: z.array(z.string().nullable()),
      detail: z.array(z.string().nullable()),
      blocking: z.array(z.boolean()),
      // Desenhada depois dos personagens. Opcional: é o que mantém os mapas já importados válidos.
      canopy: z.array(z.string().nullable()).optional(),
    }),
```

A checagem de tamanho já percorre `Object.entries(m.layers)`, então a copa entra nela sozinha quando está presente e some quando não está.

- [ ] **Step 4: Rode e veja passar**

Run: `pnpm --filter @pokeidle/shared test`
Run: `pnpm --filter @pokeidle/shared typecheck`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/hunt-map.ts packages/shared/test/schemas.test.ts
git commit -m "feat(shared): camada de copa opcional no mapa da hunt"
```

---

### Task 5: Importador, prévia, mapa de partida e README

**Files:**
- Modify: `tools/assets/src/tiled-import.ts` (`importTiledMap`, novo `optionalTileLayer`)
- Modify: `tools/assets/src/map-preview.ts` (`renderMapPreview`)
- Modify: `tools/assets/maps/route-1.tmj`
- Modify: `tools/assets/README.md`
- Test: `tools/assets/test/tiled-import.test.ts`, `tools/assets/test/map-preview.test.ts`

**Interfaces:**
- Consumes: `HuntMap['layers']['canopy']` da Task 4.
- Produces: mapa importado com `layers.canopy` quando o arquivo do Tiled tem a camada, e sem o campo quando não tem. A prévia desenha `ground`, `detail` e `canopy` nessa ordem.

- [ ] **Step 1: Escreva o teste do importador**

Em `tools/assets/test/tiled-import.test.ts`, acrescente dentro do `describe('importTiledMap', …)`:

```ts
  it('importa a camada de copa quando ela existe', () => {
    const withCanopy = {
      ...tiled,
      layers: [
        ...tiled.layers.slice(0, 3),
        { type: 'tilelayer', name: 'canopy', width: 3, height: 3, data: [0, 0, 2, 0, 0, 0, 0, 0, 0] },
        ...tiled.layers.slice(3),
      ],
    }
    const imported = importTiledMap(withCanopy, tileset, { id: 'route-1', name: 'Rota 1' })
    expect(imported.layers.canopy).toEqual([null, null, 'mountain', null, null, null, null, null, null])
  })

  it('omite a copa quando o arquivo não tem a camada', () => {
    expect(map.layers.canopy).toBeUndefined()
  })
```

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/tiled-import.test.ts`
Expected: FAIL no primeiro caso: `layers.canopy` sai `undefined` porque o importador não lê essa camada.

- [ ] **Step 3: Implemente no importador**

Em `tools/assets/src/tiled-import.ts`, acrescente ao lado de `tileLayer`:

```ts
/** Como `tileLayer`, mas devolve `undefined` em vez de lançar: serve às camadas opcionais. */
function optionalTileLayer(map: TiledMap, name: string): number[] | undefined {
  const layer = map.layers.find((l) => l.type === 'tilelayer' && l.name === name)
  return layer && layer.type === 'tilelayer' ? layer.data : undefined
}
```

Dentro de `importTiledMap`, antes do `return parseHuntMap({…})`, acrescente:

```ts
  const canopy = optionalTileLayer(map, 'canopy')
```

e troque o objeto `layers` do `parseHuntMap` por:

```ts
    layers: {
      ground: toNames(tileLayer(map, 'ground')),
      detail: toNames(tileLayer(map, 'detail')),
      blocking,
      ...(canopy === undefined ? {} : { canopy: toNames(canopy) }),
    },
```

O espalhamento condicional é o que respeita `exactOptionalPropertyTypes`: sem camada, a chave não existe.

- [ ] **Step 4: Rode e veja passar**

Run: `pnpm --filter @pokeidle/assets-tools test test/tiled-import.test.ts`
Expected: PASS.

- [ ] **Step 5: Escreva o teste da prévia**

Em `tools/assets/test/map-preview.test.ts`, acrescente:

Primeiro acrescente um terceiro tile ao fixture do arquivo, na lista `frames`:

```ts
  { name: 'stone', image: solid(200) },
```

Depois acrescente o caso, dentro do `describe('renderMapPreview', …)`:

```ts
  it('desenha a copa depois do detalhe', () => {
    // o tile 1 já tem 'tree' no detail; pôr 'stone' na copa da mesma posição prova a ordem,
    // porque só a camada desenhada por último pode vencer aquele pixel.
    const withCanopy: HuntMap = { ...map, layers: { ...map.layers, canopy: [null, 'stone'] } }
    const preview = renderMapPreview(withCanopy, atlas)
    expect(pixelAt(preview, 37, 5)).toEqual([200, 200, 200])
    expect(pixelAt(preview, 5, 5)).toEqual([60, 60, 60])
  })
```

- [ ] **Step 6: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/assets-tools test test/map-preview.test.ts`
Expected: FAIL. A prévia ignora a copa, então o pixel continua sendo o do detalhe.

- [ ] **Step 7: Implemente na prévia**

Em `tools/assets/src/map-preview.ts`, troque o laço das camadas e o comentário do cabeçalho da função:

```ts
/** Desenha `ground`, `detail` e `canopy` nessa ordem; com `blocking`, tinge de vermelho os tiles bloqueados. */
export function renderMapPreview(map: HuntMap, atlas: TilesAtlas, opts: { blocking?: boolean } = {}): RgbaImage {
```

```ts
  for (const layer of [map.layers.ground, map.layers.detail, map.layers.canopy ?? []]) {
```

A tinta de bloqueio continua por último, porque é marcação de conferência e não faz parte do desenho do jogo.

- [ ] **Step 8: Ponha a camada vazia no mapa de partida**

O `route-1.tmj` tem 40 por 30. Acrescente uma camada de tiles chamada `canopy`, toda zerada, logo depois da camada `blocking`, mantendo o arquivo válido para o Tiled:

```bash
node -e '
const fs = require("fs");
const path = "tools/assets/maps/route-1.tmj";
const map = JSON.parse(fs.readFileSync(path, "utf8"));
if (map.layers.some((l) => l.name === "canopy")) { console.error("já existe"); process.exit(1); }
const blocking = map.layers.find((l) => l.name === "blocking");
const ids = map.layers.filter((l) => typeof l.id === "number").map((l) => l.id);
const canopy = {
  ...blocking,
  id: Math.max(...ids) + 1,
  name: "canopy",
  data: new Array(map.width * map.height).fill(0),
};
const at = map.layers.indexOf(blocking) + 1;
map.layers = [...map.layers.slice(0, at), canopy, ...map.layers.slice(at)];
fs.writeFileSync(path, JSON.stringify(map, null, 1));
'
```

Confira que o mapa continua importando:

Run: `pnpm assets map-import tools/assets/maps/route-1.tmj --id route-1 --name "Rota 1" --out /tmp/route-1-check`
Expected: grava a hunt sem erro, agora com a camada de copa vazia.

- [ ] **Step 9: Atualize o README**

Em `tools/assets/README.md`, no contrato de autoria do mapa, acrescente a camada à lista de camadas esperadas, com este texto:

```markdown
- `canopy` (opcional): desenhada **depois** dos personagens, é o que cobre o jogador quando ele
  passa por baixo. Serve para a metade de cima da árvore, varanda, ponte e placa. Ela não bloqueia
  nada: o tronco continua sendo marcado por você na camada `blocking`.
```

E, na seção que descreve o atlas, acrescente:

```markdown
Um item que o catálogo marca com mais de uma fase entra no `tiles.json` com um quadro por fase.
A fase 0 fica com o nome simples do tile, as demais com `<tile>_<fase>`, e o `tiles.json` declara
`animations[<tile>]` com a lista na ordem. O `tiles.tsj` do Tiled recebe só os nomes simples, para
a paleta não repetir a mesma água uma vez por fase.
```

- [ ] **Step 10: Rode tudo e o typecheck**

Run: `pnpm --filter @pokeidle/assets-tools test`
Run: `pnpm --filter @pokeidle/assets-tools typecheck`
Expected: PASS nos dois.

- [ ] **Step 11: Commit**

```bash
git add tools/assets
git commit -m "feat(assets): importador e prévia com a camada de copa"
```

---

### Task 6: Separação pura entre o que assa e o que anima

**Files:**
- Create: `packages/client/src/scene/map-parts.ts`
- Create: `packages/client/test/scene/map-parts.test.ts`

**Interfaces:**
- Consumes: `HuntMap['layers']` da Task 4 e a tabela `animations` do `tiles.json` que a Task 2 passou a escrever.
- Produces:
  - `interface TilePlacement { readonly name: string; readonly col: number; readonly row: number }`
  - `interface LayerParts { readonly baked: readonly TilePlacement[]; readonly animated: readonly TilePlacement[] }`
  - `splitLayer(names: readonly (string | null)[], width: number, animations: Readonly<Record<string, readonly string[]>>): LayerParts`

- [ ] **Step 1: Escreva o teste**

Crie `packages/client/test/scene/map-parts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitLayer } from '../../src/scene/map-parts.js'

const animations = { water: ['water', 'water_1', 'water_2'] }

describe('splitLayer', () => {
  it('manda para o balde animado só o tile com animação, com a posição em tiles', () => {
    const parts = splitLayer(['grass', 'water', 'grass', 'water'], 2, animations)
    expect(parts.animated).toEqual([
      { name: 'water', col: 1, row: 0 },
      { name: 'water', col: 1, row: 1 },
    ])
    expect(parts.baked).toEqual([
      { name: 'grass', col: 0, row: 0 },
      { name: 'grass', col: 0, row: 1 },
    ])
  })

  it('ignora posição vazia', () => {
    const parts = splitLayer([null, 'grass'], 2, animations)
    expect(parts.animated).toEqual([])
    expect(parts.baked).toEqual([{ name: 'grass', col: 1, row: 0 }])
  })

  it('um tile nunca cai nos dois baldes', () => {
    const parts = splitLayer(['water', 'grass'], 2, animations)
    const names = [...parts.baked, ...parts.animated].map((p) => `${p.col},${p.row}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('animação de um quadro só continua sendo assada, porque não há o que animar', () => {
    const parts = splitLayer(['water'], 1, { water: ['water'] })
    expect(parts.animated).toEqual([])
    expect(parts.baked).toEqual([{ name: 'water', col: 0, row: 0 }])
  })

  it('camada ausente devolve os dois baldes vazios', () => {
    expect(splitLayer([], 10, animations)).toEqual({ baked: [], animated: [] })
  })
})
```

- [ ] **Step 2: Rode e veja falhar**

Run: `pnpm --filter @pokeidle/client test test/scene/map-parts.test.ts`
Expected: FAIL. O módulo `../../src/scene/map-parts.js` não existe.

- [ ] **Step 3: Implemente**

Crie `packages/client/src/scene/map-parts.ts`:

```ts
/** Uma posição de tile na camada, em unidades de tile (não em pixels). */
export interface TilePlacement {
  readonly name: string
  readonly col: number
  readonly row: number
}

export interface LayerParts {
  readonly baked: readonly TilePlacement[]
  readonly animated: readonly TilePlacement[]
}

/**
 * Separa uma camada do mapa entre o que entra na textura assada e o que vira sprite animado.
 * Anima quem tem mais de um quadro declarado no atlas; o resto é assado, inclusive o tile de
 * uma fase só, que não teria o que animar.
 */
export function splitLayer(
  names: readonly (string | null)[],
  width: number,
  animations: Readonly<Record<string, readonly string[]>>,
): LayerParts {
  const baked: TilePlacement[] = []
  const animated: TilePlacement[] = []
  names.forEach((name, i) => {
    if (name === null) return
    const placement: TilePlacement = { name, col: i % width, row: Math.floor(i / width) }
    const frames = animations[name]
    if (frames && frames.length > 1) animated.push(placement)
    else baked.push(placement)
  })
  return { baked, animated }
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `pnpm --filter @pokeidle/client test test/scene/map-parts.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/scene/map-parts.ts packages/client/test/scene/map-parts.test.ts
git commit -m "feat(client): separa tiles assados de tiles animados"
```

---

### Task 7: A cena anima o cenário e desenha a copa na frente

**Files:**
- Modify: `packages/client/src/scene/map-layer.ts` (substitui `buildMapSprite`)
- Modify: `packages/client/src/scene/app.ts` (montagem, ticker, destroy)
- Modify: `packages/client/src/config.ts`
- Test: `packages/client/test/scene/map-parts.test.ts` já cobre a parte pura; a montagem é coberta pela smoke Playwright que já existe.

**Interfaces:**
- Consumes: `splitLayer`, `TilePlacement` da Task 6; `HuntMap['layers']['canopy']` da Task 4; `animations` do `tiles.json` da Task 2.
- Produces:
  - `bakePlacements(renderer: Renderer, placements: readonly TilePlacement[], worldSize: { w: number; h: number }, sheets: Sheets): Sprite | null`
  - `animatedTileLayer(placements: readonly TilePlacement[], sheets: Sheets): { container: Container; sprites: AnimatedSprite[] }`
  - `TILE_ANIMATION_MS = 500` em `packages/client/src/config.ts`.

- [ ] **Step 1: Acrescente a constante**

Em `packages/client/src/config.ts`, depois de `export const LOG_MAX_LINES = 200`, acrescente:

```ts
/** Tempo de cada fase de um tile animado. Todos compartilham o mesmo relógio, para a água pulsar junta. */
export const TILE_ANIMATION_MS = 500
```

- [ ] **Step 2: Reescreva o módulo da camada**

Substitua todo o conteúdo de `packages/client/src/scene/map-layer.ts` por:

```ts
import { AnimatedSprite, Container, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js'
import { TILE_SIZE } from '../config.js'
import type { TilePlacement } from './map-parts.js'
import type { Sheets } from './sprites.js'

/**
 * Assa as posições numa textura só (width×32 × height×32). Tile sem frame no atlas fica vazio.
 * Devolve null quando não há nada a assar, que é o caso comum da copa num mapa sem árvore.
 */
export function bakePlacements(
  renderer: Renderer,
  placements: readonly TilePlacement[],
  worldSize: { readonly w: number; readonly h: number },
  sheets: Sheets,
): Sprite | null {
  if (placements.length === 0) return null
  const layer = new Container()
  for (const p of placements) {
    const tex: Texture | undefined = sheets.tiles.textures[p.name]
    if (!tex) continue
    const s = new Sprite(tex)
    s.x = p.col * TILE_SIZE
    s.y = p.row * TILE_SIZE
    layer.addChild(s)
  }
  const frame = new Rectangle(0, 0, worldSize.w, worldSize.h)
  // resolution: 1 — o mapa já é pixel art em escala 1:1; sem isso o Pixi usa o DPR da tela (2x em
  // telas retina) e o mapa pode passar de MAX_TEXTURE_SIZE em mapas grandes.
  const texture = renderer.generateTexture({ target: layer, frame, resolution: 1 })
  layer.destroy({ children: true })
  return new Sprite(texture)
}

/** Um sprite parado por posição animada; quem avança o quadro é o relógio único da cena. */
export function animatedTileLayer(
  placements: readonly TilePlacement[],
  sheets: Sheets,
): { container: Container; sprites: AnimatedSprite[] } {
  const container = new Container()
  const sprites: AnimatedSprite[] = []
  for (const p of placements) {
    const frames = sheets.tiles.animations[p.name]
    if (!frames || frames.length === 0) continue
    const sprite = new AnimatedSprite(frames)
    sprite.x = p.col * TILE_SIZE
    sprite.y = p.row * TILE_SIZE
    sprite.gotoAndStop(0)
    container.addChild(sprite)
    sprites.push(sprite)
  }
  return { container, sprites }
}
```

- [ ] **Step 3: Ligue na cena**

Em `packages/client/src/scene/app.ts`:

Troque o import do módulo da camada:

```ts
import { animatedTileLayer, bakePlacements } from './map-layer.js'
import { splitLayer } from './map-parts.js'
```

Acrescente `TILE_ANIMATION_MS` ao import de `../config.js`, que hoje traz `TILE_SIZE`.

Troque o bloco que monta o mundo (hoje entre `const sheets = await loadSheets(deps.atlas)` e `app.stage.addChild(world)`) por:

```ts
  const sheets = await loadSheets(deps.atlas)
  const world = new Container()
  const worldSize = { w: deps.map.width * TILE_SIZE, h: deps.map.height * TILE_SIZE }
  const anims = deps.atlas.tiles.animations
  const ground = splitLayer(deps.map.layers.ground, deps.map.width, anims)
  const detail = splitLayer(deps.map.layers.detail, deps.map.width, anims)
  const canopy = splitLayer(deps.map.layers.canopy ?? [], deps.map.width, anims)
  const mapLayer = bakePlacements(app.renderer, [...ground.baked, ...detail.baked], worldSize, sheets)
  const animatedGround = animatedTileLayer([...ground.animated, ...detail.animated], sheets)
  const canopyLayer = bakePlacements(app.renderer, canopy.baked, worldSize, sheets)
  const animatedCanopy = animatedTileLayer(canopy.animated, sheets)
  const animatedTiles = [...animatedGround.sprites, ...animatedCanopy.sprites]
  const entities = new Container()
  entities.sortableChildren = true
  const overlay = new Container()
  // De baixo para cima: chão assado, chão animado, personagens, copa assada, copa animada e o
  // overlay de barra de vida e rótulo, que fica acima de tudo para o jogador não sumir na mata.
  if (mapLayer) world.addChild(mapLayer)
  world.addChild(animatedGround.container, entities)
  if (canopyLayer) world.addChild(canopyLayer)
  world.addChild(animatedCanopy.container, overlay)
  app.stage.addChild(world)
```

Logo abaixo, apague a linha que hoje recalcula `const worldSize = …`, porque ela passou a ser declarada no bloco acima.

Dentro do `app.ticker.add(() => {…})`, logo depois de `const now = deps.now()`, acrescente:

```ts
    // Relógio único: todos os tiles animados trocam de quadro no mesmo instante.
    const tileFrame = Math.floor(now / TILE_ANIMATION_MS)
    for (const sprite of animatedTiles) sprite.gotoAndStop(tileFrame % sprite.totalFrames)
```

No `destroy`, troque a linha que destrói a textura do mapa por:

```ts
      mapLayer?.texture.destroy(true)
      canopyLayer?.texture.destroy(true)
```

- [ ] **Step 4: Rode a suíte do cliente e o typecheck**

Run: `pnpm --filter @pokeidle/client test`
Run: `pnpm --filter @pokeidle/client typecheck`
Expected: PASS nos dois.

- [ ] **Step 5: Regere o atlas e confira no navegador de verdade**

A parte visual não é coberta por teste unitário: quem pega erro de renderização aqui é a smoke.

```bash
lsof -ti tcp:3100 | xargs -r kill -9
pnpm assets extract --extracted assets/extracted-otp2019 || true
pnpm assets build --extracted assets/extracted-otp2019
pnpm client:build
pnpm client:e2e
```

Expected: a smoke passa. Se o `extract` for demorado ou já tiver sido rodado nesta branch, pode pular o primeiro comando; o `build` é que precisa achar os quadros de fase em disco e falha com mensagem clara se não achar.

- [ ] **Step 6: Meça o atlas e anote**

```bash
ls -l assets/atlas/tiles.png assets/atlas/tiles.json
```

Anote os dois tamanhos no relatório da task. A spec pede o número na mão para decidir se alguma família precisa sair.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src
git commit -m "feat(client): cenário animado e copa desenhada na frente do jogador"
```

---

### Task 8: Conferir as fases e fechar a curadoria (do controlador)

Esta task exige olhar imagem e decidir por gosto, então **não despache subagente para ela**.

**Files:**
- Modify: `tools/assets/manifest.json` (só se alguma peça precisar ser trocada)

**Interfaces:**
- Consumes: o atlas gerado pelas Tasks 2 e 3, e a folha `assets/atlas/tileset.html`.
- Produces: a curadoria final, com o número do tamanho do atlas para o relatório.

- [ ] **Step 1: Gere a folha com os quadros de fase**

```bash
pnpm assets build --extracted assets/extracted-otp2019
pnpm assets contact-sheet --tileset assets/atlas
```

A folha lista uma célula por quadro do `tiles.json`, então os quadros de fase aparecem sozinhos,
lado a lado, com o nome embaixo. Não é preciso mudar o gerador da folha.

- [ ] **Step 2: Olhe cada família animada**

Abra `assets/atlas/tileset.html` e filtre por nome. Para cada tile com quadros `_1`, `_2` e
seguintes, confira se as fases são o mesmo desenho em movimento ou se são variações diferentes do
material. Fase que é variação vira tremeliqueira em jogo, que é o risco número um da spec.

- [ ] **Step 3: Troque o que estiver ruim**

Quando uma peça animada for variação e não animação, escolha outra peça da mesma família em
`assets/curadoria-otp2019/` e troque o `itemId` da entrada em `tools/assets/manifest.json`.
Reconstrua e olhe de novo.

- [ ] **Step 4: Meça e anote**

```bash
ls -l assets/atlas/tiles.png assets/atlas/tiles.json
```

Anote os dois tamanhos. A spec pede o número na mão para decidir se alguma família precisa sair.

- [ ] **Step 5: Commit, se o manifesto mudou**

```bash
git add tools/assets/manifest.json
git commit -m "feat(assets): troca peças cuja fase é variação, não animação"
```

---

## Conferência final

Depois da última task, rode a suíte inteira uma vez, em primeiro plano:

```bash
pnpm test
```

Expected: todos os pacotes verdes. Se algum teste do servidor estourar tempo, confira a carga da máquina antes de investigar código: os testes de `realtime/boot` têm limite de 20 segundos e falham por saturação de CPU sem que nada tenha quebrado.
