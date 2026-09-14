# Fase 1: `packages/shared` — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `@pokeidle/shared`, o pacote de dados do jogo (números oficiais via PokeAPI, gerados por `tools/pokedata`) e fórmulas puras (stats, dano, cooldown, XP, captura, evolução, loot), e migrar o `HuntMap` para ele.

**Architecture:** `tools/pokedata` baixa do PokeAPI (com cache em disco e fetch injetável) e grava JSON determinístico em `packages/shared/data`. `packages/shared` valida esses JSON com zod num `loadRegistry()` que também checa referências cruzadas, e expõe fórmulas puras que recebem fichas como argumento e um PRNG injetado. `tools/assets` passa a importar `HuntMapSchema` e `parseOrThrow` do `shared`.

**Tech Stack:** pnpm workspaces, TypeScript 5 strict ESM (import attributes `with { type: 'json' }`), zod, Vitest + @vitest/coverage-v8, tsx, Node 22 `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-13-fase-1-shared-design.md`

## Global Constraints

- `packages/shared` não faz I/O em runtime: dados entram por `import ... with { type: 'json' }`.
- Toda fórmula é pura e recebe ficha/registro como argumento; aleatoriedade só via `Rng` injetado (`createRng(seed)`, mulberry32).
- `TICK_MS = 200`. Cooldown em ticks = `clamp(round(power / 20), 1, 8) * 5`.
- Stat: `floor((2*base + 31) * L / 100) + 5`; HP: `floor((2*base + 31) * L / 100) + L + 10`. Sem teto de nível.
- Dano: `floor(floor(floor(2*L/5 + 2) * power * A / D) / 50) + 2`, depois `× tipo × STAB(1,5) × rand[0,85..1,00]`, `floor`, mínimo 1, exceto imunidade (multiplicador de tipo 0), que dá 0. Sem crítico, sem precisão.
- XP: `fast = 0,8L³`, `medium-fast = L³`, `medium-slow = 1,2L³ − 15L² + 100L − 140`, `slow = 1,25L³`; `xpForLevel(1) = 0`; negativos viram 0; `erratic`/`fluctuating` rejeitados pelo schema. XP por derrota `floor(baseExperience * L / 7)`.
- Captura: `a = floor((3*hpMax − 2*hp) * captureRate * ballBonus / (3*hpMax))`, chance `min(1, a/255)`. Bolas 1,0 / 1,5 / 2,0.
- Learnset: só `level-up` de `firered-leafgreen`, só golpes com `power` numérico. Evolução só `level-up` com `min_level` e alvo no manifest.
- Tipos: 18 (`normal fire water electric grass ice fighting poison ground flying psychic bug rock ghost dragon dark steel fairy`).
- Nomes em kebab-case ASCII. Sem `console.log` (CLI usa `process.stdout.write`). Conventional commits de uma linha, sem trailers.

## Estrutura de arquivos

```
packages/shared/
  package.json  tsconfig.json  vitest.config.ts
  data/species.json  data/moves.json  data/type-chart.json      # gerados (Task 4)
  data/items.json  data/loot.json                             # autorais (Task 4)
  data/hunts/route-1.json  data/hunts/route-1.tmj             # movidos (Task 4)
  src/index.ts
  src/rng.ts
  src/parse-or-throw.ts
  src/schemas/species.ts  moves.ts  type-chart.ts  items.ts  loot.ts  hunt-map.ts
  src/data-files.ts       # imports estáticos dos JSON
  src/registry.ts
  src/stats.ts  xp.ts  moves.ts  damage.ts  capture.ts  evolution.ts  loot.ts
  test/*.test.ts
tools/pokedata/
  package.json  tsconfig.json  vitest.config.ts
  src/pokeapi.ts          # fetch com cache em disco
  src/transform.ts        # respostas PokeAPI → fichas
  src/sync.ts             # orquestra e grava
  src/main.ts             # CLI
  test/transform.test.ts  test/sync.test.ts
tools/assets/             # Task 8: usa @pokeidle/shared
```

---

### Task 1: Scaffold de `packages/shared` e `createRng`

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/rng.ts`
- Modify: `tsconfig.base.json` (adicionar `"resolveJsonModule": true`), `package.json` raiz (script `shared:test`)
- Test: `packages/shared/test/rng.test.ts`

**Interfaces:**
- Produces: `interface Rng { next(): number; int(min: number, max: number): number }` (`next` em `[0,1)`, `int` inclusivo nos dois lados), `createRng(seed: number): Rng`, `TICK_MS = 200`.

- [ ] **Step 1: Criar o pacote**

`packages/shared/package.json`:
```json
{
  "name": "@pokeidle/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "@types/node": "^22.5.0", "@vitest/coverage-v8": "^2.1.0", "typescript": "^5.5.4", "vitest": "^2.1.0" }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": ".", "noEmit": true }, "include": ["src", "test", "data/**/*.json"] }
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], coverage: { provider: 'v8', include: ['src/**'], thresholds: { lines: 80 } } },
})
```

Em `tsconfig.base.json`, dentro de `compilerOptions`, adicionar `"resolveJsonModule": true`. Na raiz, `package.json` ganha `"shared:test": "pnpm --filter @pokeidle/shared test"`.

`packages/shared/src/index.ts`:
```ts
export const TICK_MS = 200
export { createRng, type Rng } from './rng.js'
```

- [ ] **Step 2: Teste do PRNG**

`packages/shared/test/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'

describe('createRng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = createRng(42), b = createRng(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })
  it('seeds diferentes divergem', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })
  it('next fica em [0,1)', () => {
    const r = createRng(7)
    for (let i = 0; i < 10_000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('int é inclusivo nos dois lados e cobre a faixa', () => {
    const r = createRng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) seen.add(r.int(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('int com min === max devolve min', () => {
    expect(createRng(1).int(5, 5)).toBe(5)
  })
  it('int lança se min > max', () => {
    expect(() => createRng(1).int(6, 5)).toThrow(RangeError)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/raphaelmardine/programacao/Jogos/pokeidle && pnpm install && pnpm --filter @pokeidle/shared test`
Expected: FAIL, `../src/rng.js` não encontrado.

- [ ] **Step 4: Implementar**

`packages/shared/src/rng.ts`:
```ts
export interface Rng {
  readonly next: () => number
  readonly int: (min: number, max: number) => number
}

/** mulberry32: PRNG de 32 bits, rápido e reprodutível. O estado é o único mutável do pacote. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => {
    if (min > max) throw new RangeError(`int: min ${min} > max ${max}`)
    return min + Math.floor(next() * (max - min + 1))
  }
  return { next, int }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck`
Expected: 6 testes passando, typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json package.json pnpm-lock.yaml packages/shared
git commit -m "feat(shared): scaffold do pacote e PRNG seedado"
```

---

### Task 2: Schemas zod e `parseOrThrow`

**Files:**
- Create: `packages/shared/src/parse-or-throw.ts`, `packages/shared/src/schemas/species.ts`, `moves.ts`, `type-chart.ts`, `items.ts`, `loot.ts`, `hunt-map.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/schemas.test.ts`

**Interfaces:**
- Produces:
  - `parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, json: unknown, label: string, hint?: string): T` (mensagem `${label} inválido:\n<path>: <msg>...` + linha `dica: <hint>` opcional).
  - `TYPE_NAMES` (readonly tuple dos 18 tipos), `TypeName`.
  - `GROWTH_RATES = ['fast','medium-fast','medium-slow','slow'] as const`, `GrowthRate`.
  - `BaseStats { hp, attack, defense, spAttack, spDefense, speed }` (ints ≥ 1).
  - `Species { id: int>0; name: kebab; types: TypeName[1..2]; baseStats; baseExperience: int≥0; growthRate; captureRate: int 1..255; learnset: { move: kebab; level: int≥1 }[]; evolvesTo?: { species: kebab; level: int≥2 } }`.
  - `Move { name: kebab; type: TypeName; power: int≥1; accuracy: int 1..100 | null; damageClass: 'physical' | 'special' }`.
  - `TypeChart = Record<TypeName, Record<TypeName, number>>` (18×18, valores em {0, 0.5, 1, 2}).
  - `Item = { id: kebab; name: string; buyPrice: int≥0; sellPrice: int≥0 } & ({ kind: 'potion'; healPercent: int 1..100 } | { kind: 'ball'; ballBonus: number > 0 })`.
  - `LootTable { species: kebab; gold: [int≥0, int≥0] (min ≤ max); drops: { item: kebab; chance: 0..1 }[] }`.
  - `HuntMapSchema`, `HuntMap`, `HuntSpawn`, `TILE_SIZE = 32` — cópia fiel de `tools/assets/src/hunt-map.ts` (incluindo o superRefine de tamanho de camadas, `minLevel ≤ maxLevel` e posições dentro do mapa), com `parseHuntMap` usando `parseOrThrow`.
  - Schemas exportados: `SpeciesSchema`, `SpeciesListSchema = z.array(SpeciesSchema)`, `MoveSchema`, `MoveListSchema`, `TypeChartSchema`, `ItemSchema`, `ItemListSchema`, `LootTableSchema`, `LootListSchema`.

- [ ] **Step 1: Teste**

`packages/shared/test/schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ItemListSchema, LootListSchema, MoveSchema, SpeciesSchema, TYPE_NAMES, TypeChartSchema, parseHuntMap } from '../src/index.js'
import { parseOrThrow } from '../src/parse-or-throw.js'

const charmander = {
  id: 4, name: 'charmander', types: ['fire'],
  baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
  baseExperience: 62, growthRate: 'medium-slow', captureRate: 45,
  learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }],
  evolvesTo: { species: 'charmeleon', level: 16 },
}

describe('SpeciesSchema', () => {
  it('aceita uma ficha válida com e sem evolução', () => {
    expect(SpeciesSchema.parse(charmander).name).toBe('charmander')
    const { evolvesTo: _omit, ...noEvo } = charmander
    expect(SpeciesSchema.parse(noEvo).evolvesTo).toBeUndefined()
  })
  it('rejeita growthRate fora das quatro curvas da Gen 1', () => {
    expect(() => SpeciesSchema.parse({ ...charmander, growthRate: 'erratic' })).toThrow()
  })
  it('rejeita tipo desconhecido, nome fora de kebab-case e mais de dois tipos', () => {
    expect(() => SpeciesSchema.parse({ ...charmander, types: ['lava'] })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, name: 'Charmander' })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, types: ['fire', 'flying', 'dragon'] })).toThrow()
  })
})

describe('MoveSchema', () => {
  it('exige power >= 1 e aceita accuracy null', () => {
    expect(MoveSchema.parse({ name: 'swift', type: 'normal', power: 60, accuracy: null, damageClass: 'physical' }).accuracy).toBeNull()
    expect(() => MoveSchema.parse({ name: 'growl', type: 'normal', power: 0, accuracy: 100, damageClass: 'status' })).toThrow()
  })
})

describe('TypeChartSchema', () => {
  const full = Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))]))
  it('aceita 18x18 completo e rejeita coluna faltando ou multiplicador estranho', () => {
    expect(TypeChartSchema.parse(full).fire.grass).toBe(1)
    const { fairy: _drop, ...missing } = full
    expect(() => TypeChartSchema.parse(missing)).toThrow()
    expect(() => TypeChartSchema.parse({ ...full, fire: { ...full.fire, grass: 3 } })).toThrow()
  })
})

describe('itens e loot', () => {
  it('discrimina poção e bola', () => {
    const items = ItemListSchema.parse([
      { id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: 100, sellPrice: 50 },
      { id: 'poke-ball', name: 'Poké Bola', kind: 'ball', ballBonus: 1, buyPrice: 200, sellPrice: 100 },
    ])
    expect(items[0]?.kind).toBe('potion')
    expect(() => ItemListSchema.parse([{ id: 'x', name: 'x', kind: 'ball', healPercent: 20, buyPrice: 1, sellPrice: 1 }])).toThrow()
  })
  it('loot exige gold min <= max e chance em [0,1]', () => {
    expect(LootListSchema.parse([{ species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.08 }] }])).toHaveLength(1)
    expect(() => LootListSchema.parse([{ species: 'zubat', gold: [9, 4], drops: [] }])).toThrow(/min/)
    expect(() => LootListSchema.parse([{ species: 'zubat', gold: [1, 2], drops: [{ item: 'potion', chance: 1.5 }] }])).toThrow()
  })
})

describe('parseOrThrow e HuntMap', () => {
  it('formata caminho e mensagem, com dica opcional', () => {
    expect(() => parseOrThrow(MoveSchema, { name: 'x' }, 'golpe', 'veja moves.json')).toThrow(/golpe inválido:[\s\S]*type[\s\S]*dica: veja moves.json/)
  })
  it('parseHuntMap rejeita camada com tamanho errado', () => {
    const map = { id: 'r', name: 'R', width: 2, height: 1, tileSize: 32, layers: { ground: ['grass'], detail: [null, null], blocking: [false, false] }, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 }, spawns: [] }
    expect(() => parseHuntMap(map)).toThrow(/width\*height/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- schemas`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar**

`packages/shared/src/parse-or-throw.ts`:
```ts
import type { ZodType, ZodTypeDef } from 'zod'

export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, json: unknown, label: string, hint?: string): T {
  const result = schema.safeParse(json)
  if (result.success) return result.data
  const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  const tail = hint === undefined ? '' : `\ndica: ${hint}`
  throw new Error(`${label} inválido:\n${lines.join('\n')}${tail}`)
}
```

`packages/shared/src/schemas/type-chart.ts`:
```ts
import { z } from 'zod'

export const TYPE_NAMES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const
export type TypeName = (typeof TYPE_NAMES)[number]
export const TypeNameSchema = z.enum(TYPE_NAMES)

const MultiplierSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])
const RowSchema = z.object(Object.fromEntries(TYPE_NAMES.map((t) => [t, MultiplierSchema])) as Record<TypeName, typeof MultiplierSchema>)
export const TypeChartSchema = z.object(Object.fromEntries(TYPE_NAMES.map((t) => [t, RowSchema])) as Record<TypeName, typeof RowSchema>)
export type TypeChart = z.infer<typeof TypeChartSchema>
```

`packages/shared/src/schemas/species.ts`:
```ts
import { z } from 'zod'
import { TypeNameSchema } from './type-chart.js'

export const KEBAB = /^[a-z0-9-]+$/
export const kebab = z.string().regex(KEBAB, 'use kebab-case ascii')
export const GROWTH_RATES = ['fast', 'medium-fast', 'medium-slow', 'slow'] as const
export type GrowthRate = (typeof GROWTH_RATES)[number]

export const BaseStatsSchema = z.object({
  hp: z.number().int().min(1), attack: z.number().int().min(1), defense: z.number().int().min(1),
  spAttack: z.number().int().min(1), spDefense: z.number().int().min(1), speed: z.number().int().min(1),
})
export type BaseStats = z.infer<typeof BaseStatsSchema>

export const SpeciesSchema = z.object({
  id: z.number().int().positive(),
  name: kebab,
  types: z.array(TypeNameSchema).min(1).max(2),
  baseStats: BaseStatsSchema,
  baseExperience: z.number().int().min(0),
  growthRate: z.enum(GROWTH_RATES),
  captureRate: z.number().int().min(1).max(255),
  learnset: z.array(z.object({ move: kebab, level: z.number().int().min(1) })),
  evolvesTo: z.object({ species: kebab, level: z.number().int().min(2) }).optional(),
})
export type Species = z.infer<typeof SpeciesSchema>
export const SpeciesListSchema = z.array(SpeciesSchema)
```

`packages/shared/src/schemas/moves.ts`:
```ts
import { z } from 'zod'
import { kebab } from './species.js'
import { TypeNameSchema } from './type-chart.js'

export const MoveSchema = z.object({
  name: kebab,
  type: TypeNameSchema,
  power: z.number().int().min(1),
  accuracy: z.number().int().min(1).max(100).nullable(),
  damageClass: z.enum(['physical', 'special']),
})
export type Move = z.infer<typeof MoveSchema>
export const MoveListSchema = z.array(MoveSchema)
```

`packages/shared/src/schemas/items.ts`:
```ts
import { z } from 'zod'
import { kebab } from './species.js'

const base = { id: kebab, name: z.string().min(1), buyPrice: z.number().int().min(0), sellPrice: z.number().int().min(0) }
export const ItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('potion'), healPercent: z.number().int().min(1).max(100) }),
  z.object({ ...base, kind: z.literal('ball'), ballBonus: z.number().positive() }),
])
export type Item = z.infer<typeof ItemSchema>
export const ItemListSchema = z.array(ItemSchema)
```

`packages/shared/src/schemas/loot.ts`:
```ts
import { z } from 'zod'
import { kebab } from './species.js'

export const LootTableSchema = z.object({
  species: kebab,
  gold: z.tuple([z.number().int().min(0), z.number().int().min(0)]).refine(([min, max]) => min <= max, 'gold: min deve ser <= max'),
  drops: z.array(z.object({ item: kebab, chance: z.number().min(0).max(1) })),
})
export type LootTable = z.infer<typeof LootTableSchema>
export const LootListSchema = z.array(LootTableSchema)
```

`packages/shared/src/schemas/hunt-map.ts`: copiar o conteúdo atual de `tools/assets/src/hunt-map.ts` na íntegra (schema, `TILE_SIZE`, `HuntMap`, `HuntSpawn`, superRefine de camadas, `minLevel<=maxLevel` e posições dentro do mapa), trocando o import de `../parse-or-throw.js` e usando `kebab` de `./species.js`. `parseHuntMap(json) = parseOrThrow(HuntMapSchema, json, 'HuntMap')`.

`packages/shared/src/index.ts` passa a exportar tudo:
```ts
export const TICK_MS = 200
export { createRng, type Rng } from './rng.js'
export { parseOrThrow } from './parse-or-throw.js'
export * from './schemas/type-chart.js'
export * from './schemas/species.js'
export * from './schemas/moves.js'
export * from './schemas/items.js'
export * from './schemas/loot.js'
export * from './schemas/hunt-map.js'
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck`
Expected: todos passando.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): schemas zod de espécies, golpes, tipos, itens, loot e HuntMap"
```

---

### Task 3: `tools/pokedata`: cliente PokeAPI com cache, transformação e `sync`

**Files:**
- Create: `tools/pokedata/package.json`, `tools/pokedata/tsconfig.json`, `tools/pokedata/vitest.config.ts`, `tools/pokedata/src/pokeapi.ts`, `tools/pokedata/src/transform.ts`, `tools/pokedata/src/sync.ts`, `tools/pokedata/src/main.ts`
- Modify: `package.json` raiz (script `pokedata`), `.gitignore` (adicionar `tools/pokedata/.cache/`)
- Test: `tools/pokedata/test/transform.test.ts`, `tools/pokedata/test/sync.test.ts`

**Interfaces:**
- Consumes: `SpeciesSchema`, `MoveSchema`, `TypeChartSchema`, `TYPE_NAMES`, `parseOrThrow`, tipos `Species`, `Move`, `TypeChart` de `@pokeidle/shared`.
- Produces:
  - `interface PokeApi { get<T>(path: string): Promise<T> }`; `createPokeApi(opts: { baseUrl?: string; cacheDir: string; force?: boolean; fetchJson?: (url: string) => Promise<unknown> }): PokeApi`. Cache: `cacheDir/<path com '/' trocado por '_'>.json`.
  - Tipos mínimos das respostas: `PokeApiPokemon`, `PokeApiSpecies`, `PokeApiChain`, `PokeApiMove`, `PokeApiType` (só os campos lidos).
  - `toSpecies(p: PokeApiPokemon, s: PokeApiSpecies, chain: PokeApiChain, manifestNames: ReadonlySet<string>, warn: (msg: string) => void): Species`
  - `toMove(m: PokeApiMove): Move | null` (null se `power` nulo ou `damage_class` for `status`)
  - `toTypeChart(types: readonly PokeApiType[]): TypeChart`
  - `sync(opts: { api: PokeApi; speciesNames: readonly string[]; outDir: string; warn?: (msg: string) => void }): Promise<{ species: number; moves: number }>` escreve `species.json` (array ordenado por id), `moves.json` (ordenado por nome, só os referenciados por algum learnset) e `type-chart.json`, todos com `JSON.stringify(x, null, 2) + '\n'`, validados com os schemas antes de gravar.
  - CLI: `pnpm pokedata sync [--force] [--manifest tools/assets/manifest.json] [--out packages/shared/data]`.

- [ ] **Step 1: Scaffold**

`tools/pokedata/package.json`:
```json
{
  "name": "@pokeidle/pokedata",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit", "cli": "tsx src/main.ts" },
  "dependencies": { "@pokeidle/shared": "workspace:*", "commander": "^12.1.0", "zod": "^3.23.8" },
  "devDependencies": { "@types/node": "^22.5.0", "tsx": "^4.19.0", "typescript": "^5.5.4", "vitest": "^2.1.0" }
}
```
`tools/pokedata/tsconfig.json` e `vitest.config.ts` iguais aos de `tools/assets` (include `src` e `test`). Raiz: `"pokedata": "tsx tools/pokedata/src/main.ts"`. `.gitignore`: `tools/pokedata/.cache/`. Rodar `pnpm install`.

- [ ] **Step 2: Teste de transformação**

`tools/pokedata/test/transform.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TYPE_NAMES } from '@pokeidle/shared'
import { toMove, toSpecies, toTypeChart, type PokeApiChain, type PokeApiMove, type PokeApiPokemon, type PokeApiSpecies, type PokeApiType } from '../src/transform.js'

const vg = (level: number, method = 'level-up', group = 'firered-leafgreen') => ({ level_learned_at: level, move_learn_method: { name: method }, version_group: { name: group } })

const pokemon: PokeApiPokemon = {
  id: 4, name: 'charmander', base_experience: 62,
  types: [{ slot: 1, type: { name: 'fire' } }],
  stats: [
    { base_stat: 39, stat: { name: 'hp' } }, { base_stat: 52, stat: { name: 'attack' } }, { base_stat: 43, stat: { name: 'defense' } },
    { base_stat: 60, stat: { name: 'special-attack' } }, { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 65, stat: { name: 'speed' } },
  ],
  moves: [
    { move: { name: 'flamethrower' }, version_group_details: [vg(34), vg(1, 'machine')] },
    { move: { name: 'ember' }, version_group_details: [vg(1)] },
    { move: { name: 'growl' }, version_group_details: [vg(1)] },
    { move: { name: 'dragon-claw' }, version_group_details: [vg(1, 'machine'), vg(40, 'level-up', 'sword-shield')] },
  ],
}
const species: PokeApiSpecies = { name: 'charmander', capture_rate: 45, growth_rate: { name: 'medium-slow' }, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' } }
const chain: PokeApiChain = { chain: { species: { name: 'charmander' }, evolution_details: [], evolves_to: [
  { species: { name: 'charmeleon' }, evolution_details: [{ trigger: { name: 'level-up' }, min_level: 16 }], evolves_to: [
    { species: { name: 'charizard' }, evolution_details: [{ trigger: { name: 'level-up' }, min_level: 36 }], evolves_to: [] } ] } ] } }

describe('toSpecies', () => {
  it('mapeia stats, tipos, learnset FRLG level-up e evolução por nível', () => {
    const warnings: string[] = []
    const s = toSpecies(pokemon, species, chain, new Set(['charmander', 'charmeleon']), (m) => warnings.push(m))
    expect(s.baseStats).toEqual({ hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 })
    expect(s.types).toEqual(['fire'])
    expect(s.learnset).toEqual([{ move: 'ember', level: 1 }, { move: 'growl', level: 1 }, { move: 'flamethrower', level: 34 }])
    expect(s.evolvesTo).toEqual({ species: 'charmeleon', level: 16 })
    expect(s.growthRate).toBe('medium-slow')
    expect(warnings).toEqual([])
  })
  it('omite evolução cujo alvo não está no manifest e avisa', () => {
    const warnings: string[] = []
    const s = toSpecies(pokemon, species, chain, new Set(['charmander']), (m) => warnings.push(m))
    expect(s.evolvesTo).toBeUndefined()
    expect(warnings[0]).toMatch(/charmeleon.*fora do manifest/)
  })
  it('lança em growthRate fora da Gen 1', () => {
    expect(() => toSpecies(pokemon, { ...species, growth_rate: { name: 'erratic' } }, chain, new Set(), () => {})).toThrow(/erratic/)
  })
})

describe('toMove', () => {
  const mv = (over: Partial<PokeApiMove>): PokeApiMove => ({ name: 'ember', power: 40, accuracy: 100, type: { name: 'fire' }, damage_class: { name: 'special' }, ...over })
  it('converte golpe com poder', () => {
    expect(toMove(mv({}))).toEqual({ name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' })
  })
  it('descarta golpes sem poder ou de status', () => {
    expect(toMove(mv({ name: 'growl', power: null, damage_class: { name: 'status' } }))).toBeNull()
    expect(toMove(mv({ power: null }))).toBeNull()
  })
})

describe('toTypeChart', () => {
  it('monta 18x18 com 2, 0.5, 0 e 1 por padrão, ignorando tipos fora da lista', () => {
    const types: PokeApiType[] = TYPE_NAMES.map((name) => ({ name, damage_relations: { double_damage_to: [], half_damage_to: [], no_damage_to: [] } }))
    types[1] = { name: 'fire', damage_relations: { double_damage_to: [{ name: 'grass' }], half_damage_to: [{ name: 'water' }], no_damage_to: [] } }
    types.push({ name: 'shadow', damage_relations: { double_damage_to: [{ name: 'fire' }], half_damage_to: [], no_damage_to: [] } })
    const chart = toTypeChart(types)
    expect(chart.fire.grass).toBe(2)
    expect(chart.fire.water).toBe(0.5)
    expect(chart.fire.fire).toBe(1)
    expect(Object.keys(chart)).toHaveLength(18)
  })
  it('lança se faltar um dos 18 tipos', () => {
    expect(() => toTypeChart([])).toThrow(/normal/)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/pokedata test -- transform`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 4: Implementar `transform.ts`**

```ts
import { GROWTH_RATES, TYPE_NAMES, type GrowthRate, type Move, type Species, type TypeChart, type TypeName } from '@pokeidle/shared'

const VERSION_GROUP = 'firered-leafgreen'
const LEVEL_UP = 'level-up'
const STAT_KEYS: Record<string, keyof Species['baseStats']> = {
  hp: 'hp', attack: 'attack', defense: 'defense', 'special-attack': 'spAttack', 'special-defense': 'spDefense', speed: 'speed',
}

export interface PokeApiPokemon {
  id: number; name: string; base_experience: number | null
  types: { slot: number; type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
  moves: { move: { name: string }; version_group_details: { level_learned_at: number; move_learn_method: { name: string }; version_group: { name: string } }[] }[]
}
export interface PokeApiSpecies { name: string; capture_rate: number; growth_rate: { name: string }; evolution_chain: { url: string } }
export interface PokeApiChainNode { species: { name: string }; evolution_details: { trigger: { name: string }; min_level: number | null }[]; evolves_to: PokeApiChainNode[] }
export interface PokeApiChain { chain: PokeApiChainNode }
export interface PokeApiMove { name: string; power: number | null; accuracy: number | null; type: { name: string }; damage_class: { name: string } }
export interface PokeApiType { name: string; damage_relations: { double_damage_to: { name: string }[]; half_damage_to: { name: string }[]; no_damage_to: { name: string }[] } }

const isTypeName = (n: string): n is TypeName => (TYPE_NAMES as readonly string[]).includes(n)
const isGrowthRate = (n: string): n is GrowthRate => (GROWTH_RATES as readonly string[]).includes(n)

function findNode(node: PokeApiChainNode, name: string): PokeApiChainNode | undefined {
  if (node.species.name === name) return node
  for (const child of node.evolves_to) { const hit = findNode(child, name); if (hit) return hit }
  return undefined
}

function evolutionOf(chain: PokeApiChain, name: string, manifest: ReadonlySet<string>, warn: (m: string) => void): Species['evolvesTo'] {
  const node = findNode(chain.chain, name)
  if (!node) return undefined
  for (const next of node.evolves_to) {
    const detail = next.evolution_details.find((d) => d.trigger.name === LEVEL_UP && d.min_level !== null)
    if (!detail || detail.min_level === null) continue
    if (!manifest.has(next.species.name)) { warn(`${name}: evolução para ${next.species.name} omitida, fora do manifest`); continue }
    return { species: next.species.name, level: detail.min_level }
  }
  return undefined
}

function learnsetOf(p: PokeApiPokemon): Species['learnset'] {
  const entries = p.moves.flatMap((m) => {
    const d = m.version_group_details.find((v) => v.version_group.name === VERSION_GROUP && v.move_learn_method.name === LEVEL_UP)
    return d ? [{ move: m.move.name, level: Math.max(1, d.level_learned_at) }] : []
  })
  return [...entries].sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))
}

export function toSpecies(p: PokeApiPokemon, s: PokeApiSpecies, chain: PokeApiChain, manifest: ReadonlySet<string>, warn: (m: string) => void): Species {
  const growth = s.growth_rate.name
  if (!isGrowthRate(growth)) throw new Error(`${p.name}: growthRate ${growth} não é suportada (só as curvas da Gen 1)`)
  const baseStats = Object.fromEntries(p.stats.map((st) => [STAT_KEYS[st.stat.name], st.base_stat])) as Species['baseStats']
  const types = [...p.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name).filter(isTypeName)
  const evolvesTo = evolutionOf(chain, p.name, manifest, warn)
  return {
    id: p.id, name: p.name, types, baseStats,
    baseExperience: p.base_experience ?? 0, growthRate: growth, captureRate: s.capture_rate,
    learnset: learnsetOf(p),
    ...(evolvesTo ? { evolvesTo } : {}),
  }
}

export function toMove(m: PokeApiMove): Move | null {
  const cls = m.damage_class.name
  if (m.power === null || m.power < 1 || (cls !== 'physical' && cls !== 'special')) return null
  if (!isTypeName(m.type.name)) return null
  return { name: m.name, type: m.type.name, power: m.power, accuracy: m.accuracy, damageClass: cls }
}

export function toTypeChart(types: readonly PokeApiType[]): TypeChart {
  const byName = new Map(types.map((t) => [t.name, t]))
  const rows = TYPE_NAMES.map((att) => {
    const t = byName.get(att)
    if (!t) throw new Error(`tipo ${att} ausente nas respostas do PokeAPI`)
    const row = Object.fromEntries(TYPE_NAMES.map((def) => [def, 1])) as Record<TypeName, 0 | 0.5 | 1 | 2>
    const set = (list: { name: string }[], v: 0 | 0.5 | 2): void => { for (const d of list) if (isTypeName(d.name)) row[d.name] = v }
    set(t.damage_relations.double_damage_to, 2); set(t.damage_relations.half_damage_to, 0.5); set(t.damage_relations.no_damage_to, 0)
    return [att, row] as const
  })
  return Object.fromEntries(rows) as TypeChart
}
```

- [ ] **Step 5: Teste de `sync` com API em memória**

`tools/pokedata/test/sync.test.ts`:
```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TYPE_NAMES } from '@pokeidle/shared'
import { createPokeApi } from '../src/pokeapi.js'
import { sync } from '../src/sync.js'

function fakeApi(cacheDir: string) {
  const vg = { level_learned_at: 1, move_learn_method: { name: 'level-up' }, version_group: { name: 'firered-leafgreen' } }
  const stats = (hp: number) => ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((n, i) => ({ base_stat: i === 0 ? hp : 50, stat: { name: n } }))
  const data: Record<string, unknown> = {
    'pokemon/charmander': { id: 4, name: 'charmander', base_experience: 62, types: [{ slot: 1, type: { name: 'fire' } }], stats: stats(39), moves: [{ move: { name: 'ember' }, version_group_details: [vg] }, { move: { name: 'growl' }, version_group_details: [vg] }] },
    'pokemon/squirtle': { id: 7, name: 'squirtle', base_experience: 63, types: [{ slot: 1, type: { name: 'water' } }], stats: stats(44), moves: [{ move: { name: 'bubble' }, version_group_details: [vg] }] },
    'pokemon-species/charmander': { name: 'charmander', capture_rate: 45, growth_rate: { name: 'medium-slow' }, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' } },
    'pokemon-species/squirtle': { name: 'squirtle', capture_rate: 45, growth_rate: { name: 'medium-slow' }, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/3/' } },
    'evolution-chain/2': { chain: { species: { name: 'charmander' }, evolution_details: [], evolves_to: [] } },
    'evolution-chain/3': { chain: { species: { name: 'squirtle' }, evolution_details: [], evolves_to: [] } },
    'move/ember': { name: 'ember', power: 40, accuracy: 100, type: { name: 'fire' }, damage_class: { name: 'special' } },
    'move/growl': { name: 'growl', power: null, accuracy: 100, type: { name: 'normal' }, damage_class: { name: 'status' } },
    'move/bubble': { name: 'bubble', power: 40, accuracy: 100, type: { name: 'water' }, damage_class: { name: 'special' } },
  }
  for (const t of TYPE_NAMES) data[`type/${t}`] = { name: t, damage_relations: { double_damage_to: [], half_damage_to: [], no_damage_to: [] } }
  const calls: string[] = []
  const api = createPokeApi({ cacheDir, fetchJson: async (url) => { calls.push(url); const key = url.replace('https://pokeapi.co/api/v2/', '').replace(/\/$/, ''); if (!(key in data)) throw new Error(`404 ${url}`); return data[key] } })
  return { api, calls }
}

describe('sync', () => {
  it('gera species.json, moves.json e type-chart.json validados e ordenados', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokedata-'))
    const { api } = fakeApi(join(dir, 'cache'))
    const warnings: string[] = []
    const result = await sync({ api, speciesNames: ['squirtle', 'charmander'], outDir: join(dir, 'out'), warn: (m) => warnings.push(m) })
    expect(result).toEqual({ species: 2, moves: 2 })
    const species = JSON.parse(await readFile(join(dir, 'out', 'species.json'), 'utf8'))
    expect(species.map((s: { name: string }) => s.name)).toEqual(['charmander', 'squirtle'])
    const moves = JSON.parse(await readFile(join(dir, 'out', 'moves.json'), 'utf8'))
    expect(moves.map((m: { name: string }) => m.name)).toEqual(['bubble', 'ember'])
    const chart = JSON.parse(await readFile(join(dir, 'out', 'type-chart.json'), 'utf8'))
    expect(Object.keys(chart)).toHaveLength(18)
    expect(warnings.some((w) => /growl/.test(w))).toBe(true)
  })

  it('usa o cache em disco na segunda chamada', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokedata-'))
    const { api, calls } = fakeApi(join(dir, 'cache'))
    await api.get('pokemon/charmander')
    await api.get('pokemon/charmander')
    expect(calls).toHaveLength(1)
  })
})
```

- [ ] **Step 6: Implementar `pokeapi.ts` e `sync.ts`**

`tools/pokedata/src/pokeapi.ts`:
```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PokeApi { readonly get: <T>(path: string) => Promise<T> }

export interface PokeApiOptions {
  readonly baseUrl?: string
  readonly cacheDir: string
  readonly force?: boolean
  readonly fetchJson?: (url: string) => Promise<unknown>
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PokeAPI ${res.status} em ${url}`)
  return res.json()
}

export function createPokeApi(opts: PokeApiOptions): PokeApi {
  const baseUrl = opts.baseUrl ?? 'https://pokeapi.co/api/v2/'
  const fetchJson = opts.fetchJson ?? defaultFetchJson
  const get = async <T>(path: string): Promise<T> => {
    const file = join(opts.cacheDir, `${path.replace(/\//g, '_')}.json`)
    if (!opts.force) {
      try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { /* sem cache */ }
    }
    const data = await fetchJson(`${baseUrl}${path}`)
    await mkdir(opts.cacheDir, { recursive: true })
    await writeFile(file, JSON.stringify(data))
    return data as T
  }
  return { get }
}
```

`tools/pokedata/src/sync.ts`:
```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MoveListSchema, SpeciesListSchema, TYPE_NAMES, TypeChartSchema, parseOrThrow, type Move, type Species } from '@pokeidle/shared'
import type { PokeApi } from './pokeapi.js'
import { toMove, toSpecies, toTypeChart, type PokeApiChain, type PokeApiMove, type PokeApiPokemon, type PokeApiSpecies, type PokeApiType } from './transform.js'

export interface SyncOptions {
  readonly api: PokeApi
  readonly speciesNames: readonly string[]
  readonly outDir: string
  readonly warn?: (msg: string) => void
}

const chainIdFromUrl = (url: string): string => url.replace(/\/$/, '').split('/').at(-1) ?? ''

async function fetchSpecies(api: PokeApi, name: string, manifest: ReadonlySet<string>, warn: (m: string) => void): Promise<Species> {
  const [pokemon, species] = await Promise.all([api.get<PokeApiPokemon>(`pokemon/${name}`), api.get<PokeApiSpecies>(`pokemon-species/${name}`)])
  const chain = await api.get<PokeApiChain>(`evolution-chain/${chainIdFromUrl(species.evolution_chain.url)}`)
  const result = toSpecies(pokemon, species, chain, manifest, warn)
  if (result.learnset.length < 2) warn(`${name}: só ${result.learnset.length} golpe(s) com poder no learnset`)
  return result
}

async function fetchMoves(api: PokeApi, names: readonly string[], warn: (m: string) => void): Promise<Move[]> {
  const moves: Move[] = []
  for (const name of names) {
    const move = toMove(await api.get<PokeApiMove>(`move/${name}`))
    if (move === null) { warn(`golpe ${name} descartado: sem poder ou de status`); continue }
    moves.push(move)
  }
  return moves.sort((a, b) => a.name.localeCompare(b.name))
}

const write = async (dir: string, file: string, data: unknown): Promise<void> => writeFile(join(dir, file), `${JSON.stringify(data, null, 2)}\n`)

export async function sync(opts: SyncOptions): Promise<{ species: number; moves: number }> {
  const warn = opts.warn ?? (() => {})
  const manifest = new Set(opts.speciesNames)
  const speciesList: Species[] = []
  for (const name of opts.speciesNames) speciesList.push(await fetchSpecies(opts.api, name, manifest, warn))
  const sortedSpecies = speciesList.sort((a, b) => a.id - b.id)

  const moveNames = [...new Set(sortedSpecies.flatMap((s) => s.learnset.map((l) => l.move)))].sort()
  const moves = await fetchMoves(opts.api, moveNames, warn)
  const kept = new Set(moves.map((m) => m.name))
  const species = sortedSpecies.map((s) => ({ ...s, learnset: s.learnset.filter((l) => kept.has(l.move)) }))

  const types: PokeApiType[] = []
  for (const t of TYPE_NAMES) types.push(await opts.api.get<PokeApiType>(`type/${t}`))
  const chart = toTypeChart(types)

  await mkdir(opts.outDir, { recursive: true })
  await write(opts.outDir, 'species.json', parseOrThrow(SpeciesListSchema, species, 'species.json'))
  await write(opts.outDir, 'moves.json', parseOrThrow(MoveListSchema, moves, 'moves.json'))
  await write(opts.outDir, 'type-chart.json', parseOrThrow(TypeChartSchema, chart, 'type-chart.json'))
  return { species: species.length, moves: moves.length }
}
```

`tools/pokedata/src/main.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { createPokeApi } from './pokeapi.js'
import { sync } from './sync.js'

const out = (line: string): void => void process.stdout.write(`${line}\n`)

const program = new Command().name('pokedata').description('Gera os dados oficiais do Pokeidle a partir do PokeAPI')
program
  .command('sync')
  .option('--force', 'ignora o cache em disco', false)
  .option('--manifest <file>', 'manifest com as espécies', 'tools/assets/manifest.json')
  .option('--out <dir>', 'pasta de saída', 'packages/shared/data')
  .option('--cache <dir>', 'cache das respostas', 'tools/pokedata/.cache')
  .action(async (opts: { force: boolean; manifest: string; out: string; cache: string }) => {
    const manifest = JSON.parse(await readFile(opts.manifest, 'utf8')) as { species: { name: string }[] }
    const api = createPokeApi({ cacheDir: opts.cache, force: opts.force })
    const result = await sync({ api, speciesNames: manifest.species.map((s) => s.name), outDir: opts.out, warn: (m) => out(`aviso: ${m}`) })
    out(`${result.species} espécies e ${result.moves} golpes gravados em ${opts.out}`)
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/pokedata test && pnpm --filter @pokeidle/pokedata typecheck`
Expected: todos passando.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore tools/pokedata
git commit -m "feat(pokedata): sync do PokeAPI com cache, transformação e validação"
```

---

### Task 4: Dados reais, dados autorais, hunts e `loadRegistry`

**Files:**
- Create (gerados pelo `sync`): `packages/shared/data/species.json`, `moves.json`, `type-chart.json`
- Create (autorais): `packages/shared/data/items.json`, `packages/shared/data/loot.json`
- Move: `data/hunts/route-1.json` e `data/hunts/route-1.tmj` → `packages/shared/data/hunts/`; apagar `data/hunts/.gitkeep` e a pasta `data/`
- Create: `packages/shared/src/data-files.ts`, `packages/shared/src/registry.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/registry.test.ts`

**Interfaces:**
- Consumes: schemas e `parseOrThrow` (Task 2).
- Produces:
  - `interface Registry { species: ReadonlyMap<string, Species>; speciesById: ReadonlyMap<number, Species>; moves: ReadonlyMap<string, Move>; items: ReadonlyMap<string, Item>; loot: ReadonlyMap<string, LootTable>; hunts: ReadonlyMap<string, HuntMap>; typeChart: TypeChart }`
  - `buildRegistry(raw: { species: unknown; moves: unknown; typeChart: unknown; items: unknown; loot: unknown; hunts: readonly unknown[] }): Registry` (pura; valida com schemas e checa referências cruzadas; lança `Error` listando todos os problemas com prefixo `registro inconsistente:`)
  - `loadRegistry(): Registry` (usa os JSON importados em `data-files.ts`; memoizado)
  - Referências checadas: `learnset[].move` existe em moves; `evolvesTo.species` existe em species; `loot[].item` existe em items e `loot[].species` existe; `hunts[].spawns[].speciesName` existe; `hunts[].layers.ground/detail` usam nomes de tile válidos NÃO é checado aqui (tiles pertencem ao atlas, fase 3).

- [ ] **Step 1: Gerar os dados oficiais**

Run: `cd /Users/raphaelmardine/programacao/Jogos/pokeidle && pnpm pokedata sync`
Expected: `42 espécies e N golpes gravados em packages/shared/data`, com avisos de golpes de status descartados e de evoluções fora do manifest (ex.: `raichu` não evolui, `arcanine` idem; `pidgeot` sem pré-evolução no manifest não gera aviso). Se o PokeAPI falhar por rede, repetir; o cache evita refazer o que já baixou. Conferir a olho `species.json`: `charmander.evolvesTo = { species: 'charmeleon', level: 16 }`, `charizard.baseStats.hp = 78`.

- [ ] **Step 2: Escrever os dados autorais**

`packages/shared/data/items.json`:
```json
[
  { "id": "potion", "name": "Poção", "kind": "potion", "healPercent": 20, "buyPrice": 100, "sellPrice": 50 },
  { "id": "super-potion", "name": "Super Poção", "kind": "potion", "healPercent": 50, "buyPrice": 400, "sellPrice": 200 },
  { "id": "poke-ball", "name": "Poké Bola", "kind": "ball", "ballBonus": 1, "buyPrice": 200, "sellPrice": 100 },
  { "id": "great-ball", "name": "Great Bola", "kind": "ball", "ballBonus": 1.5, "buyPrice": 600, "sellPrice": 300 },
  { "id": "ultra-ball", "name": "Ultra Bola", "kind": "ball", "ballBonus": 2, "buyPrice": 1200, "sellPrice": 600 }
]
```

`packages/shared/data/loot.json` (só as espécies dos spawns da Rota 1; as demais usam o padrão):
```json
[
  { "species": "zubat", "gold": [4, 9], "drops": [{ "item": "potion", "chance": 0.08 }] },
  { "species": "bellsprout", "gold": [5, 11], "drops": [{ "item": "potion", "chance": 0.08 }] },
  { "species": "diglett", "gold": [6, 12], "drops": [{ "item": "potion", "chance": 0.06 }, { "item": "poke-ball", "chance": 0.03 }] },
  { "species": "horsea", "gold": [7, 14], "drops": [{ "item": "potion", "chance": 0.1 }] },
  { "species": "gastly", "gold": [10, 20], "drops": [{ "item": "super-potion", "chance": 0.04 }, { "item": "great-ball", "chance": 0.02 }] }
]
```

Mover as hunts:
```bash
mkdir -p packages/shared/data/hunts && git mv data/hunts/route-1.json data/hunts/route-1.tmj packages/shared/data/hunts/ && git rm -q data/hunts/.gitkeep
```
Em `packages/shared/data/hunts/route-1.tmj`, ajustar `tilesets[0].source` para `../../../../assets/atlas/tiles.tsj` (a pasta subiu dois níveis).

- [ ] **Step 3: Teste do registro**

`packages/shared/test/registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TYPE_NAMES } from '../src/index.js'
import { buildRegistry, loadRegistry } from '../src/registry.js'

const minimal = () => ({
  species: [
    { id: 4, name: 'charmander', types: ['fire'], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, baseExperience: 62, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'ember', level: 1 }], evolvesTo: { species: 'charmeleon', level: 16 } },
    { id: 5, name: 'charmeleon', types: ['fire'], baseStats: { hp: 58, attack: 64, defense: 58, spAttack: 80, spDefense: 65, speed: 80 }, baseExperience: 142, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'ember', level: 1 }] },
  ],
  moves: [{ name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' }],
  typeChart: Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))])),
  items: [{ id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: 100, sellPrice: 50 }],
  loot: [{ species: 'charmander', gold: [1, 2], drops: [{ item: 'potion', chance: 0.5 }] }],
  hunts: [{ id: 'r', name: 'R', width: 1, height: 2, tileSize: 32, layers: { ground: ['grass', 'grass'], detail: [null, null], blocking: [false, false] }, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 0, y: 1 }, spawns: [{ speciesName: 'charmander', minLevel: 1, maxLevel: 3, x: 0, y: 0, radius: 0, count: 1, respawnSeconds: 10 }] }],
})

describe('buildRegistry', () => {
  it('indexa por nome e id', () => {
    const r = buildRegistry(minimal())
    expect(r.species.get('charmander')?.id).toBe(4)
    expect(r.speciesById.get(5)?.name).toBe('charmeleon')
    expect(r.moves.get('ember')?.power).toBe(40)
    expect(r.hunts.get('r')?.spawns).toHaveLength(1)
    expect(r.typeChart.fire.fire).toBe(1)
  })
  it('lista todas as referências quebradas de uma vez', () => {
    const raw = minimal()
    raw.species[0]!.learnset = [{ move: 'fire-blast', level: 1 }]
    raw.species[0]!.evolvesTo = { species: 'charizard', level: 36 }
    raw.loot[0]!.drops = [{ item: 'master-ball', chance: 1 }]
    raw.hunts[0]!.spawns[0]!.speciesName = 'mewtwo'
    expect(() => buildRegistry(raw)).toThrow(/registro inconsistente:[\s\S]*fire-blast[\s\S]*charizard[\s\S]*master-ball[\s\S]*mewtwo/)
  })
  it('rejeita id ou nome de espécie duplicado', () => {
    const raw = minimal()
    raw.species[1] = { ...raw.species[1]!, id: 4 }
    expect(() => buildRegistry(raw)).toThrow(/duplicad/)
  })
})

describe('loadRegistry (dados reais do repositório)', () => {
  const r = loadRegistry()
  it('carrega as 42 espécies do manifest com golpes e evoluções coerentes', () => {
    expect(r.species.size).toBe(42)
    expect(r.species.get('charmander')?.evolvesTo).toEqual({ species: 'charmeleon', level: 16 })
    expect(r.species.get('charizard')?.baseStats.hp).toBe(78)
    for (const s of r.species.values()) expect(s.learnset.length).toBeGreaterThanOrEqual(1)
  })
  it('tem a Rota 1 e a tabela de tipos completa', () => {
    expect(r.hunts.get('route-1')?.width).toBe(40)
    expect(r.typeChart.fire.grass).toBe(2)
    expect(r.typeChart.electric.ground).toBe(0)
  })
  it('é memoizado', () => {
    expect(loadRegistry()).toBe(r)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- registry`
Expected: FAIL, `../src/registry.js` não encontrado.

- [ ] **Step 5: Implementar `data-files.ts` e `registry.ts`**

`packages/shared/src/data-files.ts`:
```ts
import species from '../data/species.json' with { type: 'json' }
import moves from '../data/moves.json' with { type: 'json' }
import typeChart from '../data/type-chart.json' with { type: 'json' }
import items from '../data/items.json' with { type: 'json' }
import loot from '../data/loot.json' with { type: 'json' }
import route1 from '../data/hunts/route-1.json' with { type: 'json' }

/** Adicionar uma hunt = adicionar um import aqui. Tudo é validado em buildRegistry. */
export const rawData = { species, moves, typeChart, items, loot, hunts: [route1] } as const
```

`packages/shared/src/registry.ts`:
```ts
import { rawData } from './data-files.js'
import { parseOrThrow } from './parse-or-throw.js'
import { HuntMapSchema, type HuntMap } from './schemas/hunt-map.js'
import { ItemListSchema, type Item } from './schemas/items.js'
import { LootListSchema, type LootTable } from './schemas/loot.js'
import { MoveListSchema, type Move } from './schemas/moves.js'
import { SpeciesListSchema, type Species } from './schemas/species.js'
import { TypeChartSchema, type TypeChart } from './schemas/type-chart.js'

export interface Registry {
  readonly species: ReadonlyMap<string, Species>
  readonly speciesById: ReadonlyMap<number, Species>
  readonly moves: ReadonlyMap<string, Move>
  readonly items: ReadonlyMap<string, Item>
  readonly loot: ReadonlyMap<string, LootTable>
  readonly hunts: ReadonlyMap<string, HuntMap>
  readonly typeChart: TypeChart
}

export interface RawRegistry {
  readonly species: unknown
  readonly moves: unknown
  readonly typeChart: unknown
  readonly items: unknown
  readonly loot: unknown
  readonly hunts: readonly unknown[]
}

function indexBy<T, K>(list: readonly T[], key: (t: T) => K, label: string, problems: string[]): Map<K, T> {
  const map = new Map<K, T>()
  for (const item of list) {
    const k = key(item)
    if (map.has(k)) problems.push(`${label} duplicado: ${String(k)}`)
    map.set(k, item)
  }
  return map
}

function checkReferences(r: Registry, problems: string[]): void {
  for (const s of r.species.values()) {
    for (const l of s.learnset) if (!r.moves.has(l.move)) problems.push(`espécie ${s.name}: golpe ${l.move} não existe em moves`)
    if (s.evolvesTo && !r.species.has(s.evolvesTo.species)) problems.push(`espécie ${s.name}: evolução ${s.evolvesTo.species} não existe`)
  }
  for (const t of r.loot.values()) {
    if (!r.species.has(t.species)) problems.push(`loot: espécie ${t.species} não existe`)
    for (const d of t.drops) if (!r.items.has(d.item)) problems.push(`loot de ${t.species}: item ${d.item} não existe`)
  }
  for (const h of r.hunts.values()) {
    for (const sp of h.spawns) if (!r.species.has(sp.speciesName)) problems.push(`hunt ${h.id}: espécie ${sp.speciesName} não existe`)
  }
}

export function buildRegistry(raw: RawRegistry): Registry {
  const speciesList = parseOrThrow(SpeciesListSchema, raw.species, 'species.json')
  const moveList = parseOrThrow(MoveListSchema, raw.moves, 'moves.json')
  const typeChart = parseOrThrow(TypeChartSchema, raw.typeChart, 'type-chart.json')
  const itemList = parseOrThrow(ItemListSchema, raw.items, 'items.json')
  const lootList = parseOrThrow(LootListSchema, raw.loot, 'loot.json')
  const huntList = raw.hunts.map((h, i) => parseOrThrow(HuntMapSchema, h, `hunts[${i}]`))

  const problems: string[] = []
  const registry: Registry = {
    species: indexBy(speciesList, (s) => s.name, 'nome de espécie', problems),
    speciesById: indexBy(speciesList, (s) => s.id, 'id de espécie', problems),
    moves: indexBy(moveList, (m) => m.name, 'golpe', problems),
    items: indexBy(itemList, (i) => i.id, 'item', problems),
    loot: indexBy(lootList, (l) => l.species, 'loot', problems),
    hunts: indexBy(huntList, (h) => h.id, 'hunt', problems),
    typeChart,
  }
  checkReferences(registry, problems)
  if (problems.length > 0) throw new Error(`registro inconsistente:\n${problems.join('\n')}`)
  return registry
}

let cached: Registry | undefined
export function loadRegistry(): Registry {
  cached ??= buildRegistry(rawData)
  return cached
}
```

Adicionar em `index.ts`: `export { buildRegistry, loadRegistry, type Registry, type RawRegistry } from './registry.js'`.

Se o TypeScript reclamar do `with { type: 'json' }`, confirmar `"module": "NodeNext"` e `"resolveJsonModule": true` no `tsconfig.base.json`; se o Vitest reclamar, atualizar `vitest`/`vite` para a versão mais recente do major 2 com `pnpm up vitest@2 --filter @pokeidle/shared`. Não trocar por `readFileSync`.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck && pnpm --filter @pokeidle/assets-tools test`
Expected: registry verde com dados reais; testes do `tools/assets` continuam verdes (o `map-import` ainda aponta para `data/hunts` por padrão; isso muda na Task 8).

- [ ] **Step 7: Commit**

```bash
git add packages/shared data
git commit -m "feat(shared): dados oficiais gerados, itens e loot autorais, hunts e loadRegistry"
```

---

### Task 5: Fórmulas de stat e XP

**Files:**
- Create: `packages/shared/src/stats.ts`, `packages/shared/src/xp.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/stats.test.ts`, `packages/shared/test/xp.test.ts`

**Interfaces:**
- Consumes: `BaseStats`, `GrowthRate`, `Species` (Task 2).
- Produces:
  - `statAt(base: number, level: number): number` = `floor((2*base + 31) * level / 100) + 5`
  - `hpAt(base: number, level: number): number` = `floor((2*base + 31) * level / 100) + level + 10`
  - `interface Stats { hp, attack, defense, spAttack, spDefense, speed }`; `statsAt(base: BaseStats, level: number): Stats`
  - `xpForLevel(rate: GrowthRate, level: number): number` (total acumulado para atingir `level`; `level 1 → 0`; nunca negativo; inteiro)
  - `levelFromXp(rate: GrowthRate, xp: number): number` (maior `L ≥ 1` com `xpForLevel(L) ≤ xp`; busca binária com teto dinâmico)
  - `xpOnDefeat(defeated: Pick<Species, 'baseExperience'>, defeatedLevel: number): number` = `floor(baseExperience * level / 7)`
  - Todas lançam `RangeError` se `level < 1` ou não inteiro.

- [ ] **Step 1: Testes**

`packages/shared/test/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { hpAt, statAt, statsAt } from '../src/stats.js'

describe('stat e hp', () => {
  it('bate com o oficial no nível 100 com IV máximo (Charizard)', () => {
    expect(hpAt(78, 100)).toBe(297)
    expect(statAt(84, 100)).toBe(204)
    expect(statAt(100, 100)).toBe(236)
  })
  it('continua linear sem teto', () => {
    expect(hpAt(78, 300)).toBe(871)
    expect(statAt(84, 300)).toBe(602)
  })
  it('nível 1 e 5 (Charmander base hp 39, spAttack 60)', () => {
    expect(hpAt(39, 1)).toBe(12)
    expect(statAt(60, 5)).toBe(12)
  })
  it('statsAt mapeia os seis stats', () => {
    const s = statsAt({ hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, 5)
    expect(s).toEqual({ hp: 20, attack: 11, defense: 10, spAttack: 12, spDefense: 11, speed: 13 })
  })
  it('rejeita nível inválido', () => {
    expect(() => statAt(50, 0)).toThrow(RangeError)
    expect(() => hpAt(50, 1.5)).toThrow(RangeError)
  })
})
```

`packages/shared/test/xp.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { GROWTH_RATES } from '../src/index.js'
import { levelFromXp, xpForLevel, xpOnDefeat } from '../src/xp.js'

describe('xpForLevel', () => {
  it('nível 1 é zero em todas as curvas', () => {
    for (const r of GROWTH_RATES) expect(xpForLevel(r, 1)).toBe(0)
  })
  it('valores oficiais no nível 100', () => {
    expect(xpForLevel('fast', 100)).toBe(800_000)
    expect(xpForLevel('medium-fast', 100)).toBe(1_000_000)
    expect(xpForLevel('medium-slow', 100)).toBe(1_059_860)
    expect(xpForLevel('slow', 100)).toBe(1_250_000)
  })
  it('medium-slow nos primeiros níveis nunca é negativo e é monotônica', () => {
    expect(xpForLevel('medium-slow', 2)).toBe(9)
    expect(xpForLevel('medium-slow', 3)).toBe(57)
    for (let l = 2; l <= 600; l++) expect(xpForLevel('medium-slow', l)).toBeGreaterThan(xpForLevel('medium-slow', l - 1))
  })
  it('sem teto', () => {
    expect(xpForLevel('medium-fast', 300)).toBe(27_000_000)
  })
})

describe('levelFromXp', () => {
  it('é a inversa de xpForLevel de 1 a 500 em todas as curvas', () => {
    for (const r of GROWTH_RATES) for (let l = 1; l <= 500; l++) {
      const xp = xpForLevel(r, l)
      expect(levelFromXp(r, xp)).toBe(l)
      if (l > 1) expect(levelFromXp(r, xp - 1)).toBe(l - 1)
    }
  })
  it('xp 0 ou negativo é nível 1', () => {
    expect(levelFromXp('slow', 0)).toBe(1)
    expect(levelFromXp('slow', -5)).toBe(1)
  })
})

describe('xpOnDefeat', () => {
  it('floor(baseExperience * level / 7)', () => {
    expect(xpOnDefeat({ baseExperience: 62 }, 10)).toBe(88)
    expect(xpOnDefeat({ baseExperience: 240 }, 150)).toBe(5142)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- stats xp`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar**

`packages/shared/src/stats.ts`:
```ts
import type { BaseStats } from './schemas/species.js'

const MAX_IV = 31
const STAT_OFFSET = 5
const HP_OFFSET = 10

export interface Stats extends BaseStats {}

export function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) throw new RangeError(`nível inválido: ${level}`)
}

export function statAt(base: number, level: number): number {
  assertLevel(level)
  return Math.floor(((2 * base + MAX_IV) * level) / 100) + STAT_OFFSET
}

export function hpAt(base: number, level: number): number {
  assertLevel(level)
  return Math.floor(((2 * base + MAX_IV) * level) / 100) + level + HP_OFFSET
}

export function statsAt(base: BaseStats, level: number): Stats {
  return {
    hp: hpAt(base.hp, level),
    attack: statAt(base.attack, level),
    defense: statAt(base.defense, level),
    spAttack: statAt(base.spAttack, level),
    spDefense: statAt(base.spDefense, level),
    speed: statAt(base.speed, level),
  }
}
```

`packages/shared/src/xp.ts`:
```ts
import type { GrowthRate, Species } from './schemas/species.js'
import { assertLevel } from './stats.js'

const XP_DIVISOR = 7

const CURVES: Record<GrowthRate, (l: number) => number> = {
  fast: (l) => (4 * l ** 3) / 5,
  'medium-fast': (l) => l ** 3,
  'medium-slow': (l) => (6 * l ** 3) / 5 - 15 * l ** 2 + 100 * l - 140,
  slow: (l) => (5 * l ** 3) / 4,
}

export function xpForLevel(rate: GrowthRate, level: number): number {
  assertLevel(level)
  if (level === 1) return 0
  return Math.max(0, Math.floor(CURVES[rate](level)))
}

export function levelFromXp(rate: GrowthRate, xp: number): number {
  if (xp <= 0) return 1
  let hi = 2
  while (xpForLevel(rate, hi) <= xp) hi *= 2
  let lo = 1
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (xpForLevel(rate, mid) <= xp) lo = mid
    else hi = mid
  }
  return lo
}

export function xpOnDefeat(defeated: Pick<Species, 'baseExperience'>, defeatedLevel: number): number {
  assertLevel(defeatedLevel)
  return Math.floor((defeated.baseExperience * defeatedLevel) / XP_DIVISOR)
}
```

`index.ts`: `export * from './stats.js'` e `export * from './xp.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): fórmulas de stat, HP e curvas de XP sem teto"
```

---

### Task 6: Golpes disponíveis, cooldown e dano

**Files:**
- Create: `packages/shared/src/moves.ts`, `packages/shared/src/damage.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/moves.test.ts`, `packages/shared/test/damage.test.ts`

**Interfaces:**
- Consumes: `Registry`, `Species`, `Move`, `TypeChart`, `TypeName`, `Rng`, `Stats`, `statsAt`, `TICK_MS`.
- Produces:
  - `availableMoves(species: Species, level: number, moves: ReadonlyMap<string, Move>): Move[]` (learnset com `level ≤ L`, sem duplicatas, na ordem do learnset; lança se um golpe do learnset não estiver no mapa).
  - `cooldownTicks(move: Pick<Move, 'power'>): number` = `clamp(round(power / 20), 1, 8) * 5`.
  - `typeMultiplier(chart: TypeChart, moveType: TypeName, defenderTypes: readonly TypeName[]): number` (produto).
  - `interface Combatant { level: number; types: readonly TypeName[]; stats: Stats }`
  - `computeDamage(input: { attacker: Combatant; defender: Combatant; move: Move; chart: TypeChart; rng: Rng }): number` conforme Global Constraints; mínimo 1.
  - `bestMove(candidates: readonly Move[], attacker: Combatant, defender: Combatant, chart: TypeChart): Move | undefined` — maior dano esperado com `rng` fixo em 1,0 (sem aleatório); empate mantém o primeiro.

- [ ] **Step 1: Testes**

`packages/shared/test/moves.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Move, Species } from '../src/index.js'
import { availableMoves, cooldownTicks } from '../src/moves.js'

const moves = new Map<string, Move>([
  ['ember', { name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' }],
  ['scratch', { name: 'scratch', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' }],
  ['flamethrower', { name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' }],
])
const charmander: Species = {
  id: 4, name: 'charmander', types: ['fire'], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
  baseExperience: 62, growthRate: 'medium-slow', captureRate: 45,
  learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }, { move: 'flamethrower', level: 34 }, { move: 'ember', level: 40 }],
}

describe('availableMoves', () => {
  it('filtra pelo nível e remove duplicatas mantendo a ordem', () => {
    expect(availableMoves(charmander, 5, moves).map((m) => m.name)).toEqual(['scratch', 'ember'])
    expect(availableMoves(charmander, 40, moves).map((m) => m.name)).toEqual(['scratch', 'ember', 'flamethrower'])
  })
  it('lança se o learnset referencia golpe desconhecido', () => {
    expect(() => availableMoves({ ...charmander, learnset: [{ move: 'nope', level: 1 }] }, 1, moves)).toThrow(/nope/)
  })
})

describe('cooldownTicks', () => {
  it('poder 40 → 10 ticks, 90 → 25, 110 → 30, 15 → 5 (piso), 250 → 40 (teto)', () => {
    expect(cooldownTicks({ power: 40 })).toBe(10)
    expect(cooldownTicks({ power: 90 })).toBe(25)
    expect(cooldownTicks({ power: 110 })).toBe(30)
    expect(cooldownTicks({ power: 15 })).toBe(5)
    expect(cooldownTicks({ power: 250 })).toBe(40)
  })
})
```

`packages/shared/test/damage.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TYPE_NAMES, createRng, type Move, type TypeChart } from '../src/index.js'
import { bestMove, computeDamage, typeMultiplier, type Combatant } from '../src/damage.js'
import { statsAt } from '../src/stats.js'

const chart = Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))])) as TypeChart
chart.fire.grass = 2; chart.fire.water = 0.5; chart.electric.ground = 0; chart.fire.bug = 2

const ember: Move = { name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' }
const scratch: Move = { name: 'scratch', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' }
const charmander5: Combatant = { level: 5, types: ['fire'], stats: statsAt({ hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, 5) }
const bulbasaur5: Combatant = { level: 5, types: ['grass', 'poison'], stats: statsAt({ hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 }, 5) }
const fixed = (v: number) => ({ next: () => v, int: () => 0 })

describe('typeMultiplier', () => {
  it('multiplica sobre os tipos do defensor', () => {
    expect(typeMultiplier(chart, 'fire', ['grass', 'poison'])).toBe(2)
    expect(typeMultiplier(chart, 'fire', ['grass', 'bug'])).toBe(4)
    expect(typeMultiplier(chart, 'electric', ['ground'])).toBe(0)
  })
})

describe('computeDamage', () => {
  it('Charmander 5 Ember em Bulbasaur 5: bruto 4, x2 tipo, x1,5 STAB → 12 com rng 1,0 e 10 com rng 0', () => {
    expect(computeDamage({ attacker: charmander5, defender: bulbasaur5, move: ember, chart, rng: fixed(1) })).toBe(12)
    expect(computeDamage({ attacker: charmander5, defender: bulbasaur5, move: ember, chart, rng: fixed(0) })).toBe(10)
  })
  it('golpe físico usa attack e defense; sem STAB fica no bruto', () => {
    // scratch: A=11, D=11 → floor(floor(4*40*11/11)/50)+2 = floor(160/50)+2 = 5
    expect(computeDamage({ attacker: charmander5, defender: bulbasaur5, move: scratch, chart, rng: fixed(1) })).toBe(5)
  })
  it('imunidade nunca desce abaixo de 1', () => {
    const thunder: Move = { name: 'thunder-shock', type: 'electric', power: 40, accuracy: 100, damageClass: 'special' }
    expect(computeDamage({ attacker: charmander5, defender: { ...bulbasaur5, types: ['ground'] }, move: thunder, chart, rng: fixed(1) })).toBe(1)
  })
  it('com PRNG seedado é determinístico e fica entre 85% e 100% do máximo', () => {
    const a = createRng(9), b = createRng(9)
    const run = (rng: ReturnType<typeof createRng>) => Array.from({ length: 1000 }, () => computeDamage({ attacker: charmander5, defender: bulbasaur5, move: ember, chart, rng }))
    const xs = run(a)
    expect(xs).toEqual(run(b))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10)
    expect(Math.max(...xs)).toBe(11) // rng.next() < 1, então 12 só sai com rng fixo em 1,0
    expect(new Set(xs).size).toBeGreaterThan(1)
  })
})

describe('bestMove', () => {
  it('escolhe o de maior dano esperado e mantém o primeiro em empate', () => {
    expect(bestMove([scratch, ember], charmander5, bulbasaur5, chart)?.name).toBe('ember')
    expect(bestMove([scratch, { ...scratch, name: 'tackle' }], charmander5, bulbasaur5, chart)?.name).toBe('scratch')
    expect(bestMove([], charmander5, bulbasaur5, chart)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- moves damage`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar**

`packages/shared/src/moves.ts`:
```ts
import type { Move } from './schemas/moves.js'
import type { Species } from './schemas/species.js'

const POWER_PER_SECOND = 20
const MIN_COOLDOWN_S = 1
const MAX_COOLDOWN_S = 8
const TICKS_PER_SECOND = 5

export function availableMoves(species: Species, level: number, moves: ReadonlyMap<string, Move>): Move[] {
  const seen = new Set<string>()
  const result: Move[] = []
  for (const entry of species.learnset) {
    if (entry.level > level || seen.has(entry.move)) continue
    const move = moves.get(entry.move)
    if (!move) throw new Error(`espécie ${species.name}: golpe ${entry.move} não existe no registro`)
    seen.add(entry.move)
    result.push(move)
  }
  return result
}

export function cooldownTicks(move: Pick<Move, 'power'>): number {
  const seconds = Math.min(MAX_COOLDOWN_S, Math.max(MIN_COOLDOWN_S, Math.round(move.power / POWER_PER_SECOND)))
  return seconds * TICKS_PER_SECOND
}
```

`packages/shared/src/damage.ts`:
```ts
import type { Rng } from './rng.js'
import type { Move } from './schemas/moves.js'
import type { TypeChart, TypeName } from './schemas/type-chart.js'
import type { Stats } from './stats.js'

const STAB = 1.5
const RANDOM_MIN = 0.85
const RANDOM_SPAN = 0.15
const MIN_DAMAGE = 1

export interface Combatant {
  readonly level: number
  readonly types: readonly TypeName[]
  readonly stats: Stats
}

export interface DamageInput {
  readonly attacker: Combatant
  readonly defender: Combatant
  readonly move: Move
  readonly chart: TypeChart
  readonly rng: Rng
}

export function typeMultiplier(chart: TypeChart, moveType: TypeName, defenderTypes: readonly TypeName[]): number {
  return defenderTypes.reduce((acc, t) => acc * chart[moveType][t], 1)
}

function baseDamage(attacker: Combatant, defender: Combatant, move: Move): number {
  const [a, d] = move.damageClass === 'physical'
    ? [attacker.stats.attack, defender.stats.defense]
    : [attacker.stats.spAttack, defender.stats.spDefense]
  const levelFactor = Math.floor((2 * attacker.level) / 5 + 2)
  return Math.floor(Math.floor((levelFactor * move.power * a) / d) / 50) + 2
}

function modifiers(attacker: Combatant, defender: Combatant, move: Move, chart: TypeChart): number {
  const stab = attacker.types.includes(move.type) ? STAB : 1
  return typeMultiplier(chart, move.type, defender.types) * stab
}

export function computeDamage({ attacker, defender, move, chart, rng }: DamageInput): number {
  const random = RANDOM_MIN + rng.next() * RANDOM_SPAN
  const total = Math.floor(baseDamage(attacker, defender, move) * modifiers(attacker, defender, move, chart) * random)
  return Math.max(MIN_DAMAGE, total)
}

export function bestMove(candidates: readonly Move[], attacker: Combatant, defender: Combatant, chart: TypeChart): Move | undefined {
  return candidates.reduce<{ move: Move; dmg: number } | undefined>((best, move) => {
    const dmg = Math.floor(baseDamage(attacker, defender, move) * modifiers(attacker, defender, move, chart))
    return best === undefined || dmg > best.dmg ? { move, dmg } : best
  }, undefined)?.move
}
```

`index.ts`: `export * from './moves.js'` e `export * from './damage.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): golpes disponíveis, cooldown e fórmula de dano"
```

---

### Task 7: Captura, evolução e loot

**Files:**
- Create: `packages/shared/src/capture.ts`, `packages/shared/src/evolution.ts`, `packages/shared/src/loot.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/capture.test.ts`, `packages/shared/test/evolution.test.ts`, `packages/shared/test/loot.test.ts`

**Interfaces:**
- Consumes: `Species`, `Item`, `LootTable`, `Registry`, `Rng`.
- Produces:
  - `captureChance(input: { captureRate: number; hpMax: number; hpCurrent: number; ballBonus: number }): number` em `[0, 1]`: `a = floor((3*hpMax − 2*hpCurrent) * captureRate * ballBonus / (3*hpMax))`, `min(1, a / 255)`. Lança `RangeError` se `hpMax < 1` ou `hpCurrent` fora de `[0, hpMax]`.
  - `rollCapture(input, rng: Rng): boolean` = `rng.next() < captureChance(input)`.
  - `nextEvolution(species: Species, level: number, registry: Pick<Registry, 'species'>): Species | undefined` (só se `evolvesTo` e `level ≥ evolvesTo.level`; lança se o alvo não existir no registro).
  - `interface LootResult { gold: number; drops: { item: string; quantity: number }[] }`
  - `DEFAULT_DROP_ITEM = 'potion'`, `DEFAULT_DROP_CHANCE = 0.05`
  - `lootTableFor(species: Species, loot: ReadonlyMap<string, LootTable>): LootTable` (entrada explícita, senão padrão `gold: [floor(be/10), floor(be/5)]`, drop de `potion` a 5 %).
  - `rollLoot(species: Species, loot: ReadonlyMap<string, LootTable>, rng: Rng): LootResult` (ouro via `rng.int(min, max)`; cada drop rola `rng.next() < chance`, quantidade 1).

- [ ] **Step 1: Testes**

`packages/shared/test/capture.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { captureChance, rollCapture } from '../src/capture.js'

describe('captureChance', () => {
  it('Charmander (45) com metade do HP e Poké Bola ≈ 12 %', () => {
    expect(captureChance({ captureRate: 45, hpMax: 100, hpCurrent: 50, ballBonus: 1 })).toBeCloseTo(30 / 255, 6)
  })
  it('Ultra Bola com 1 de HP ≈ 35 %', () => {
    expect(captureChance({ captureRate: 45, hpMax: 100, hpCurrent: 1, ballBonus: 2 })).toBeCloseTo(89 / 255, 6)
  })
  it('captureRate 255 com HP baixo e Ultra Bola satura em 1', () => {
    expect(captureChance({ captureRate: 255, hpMax: 100, hpCurrent: 1, ballBonus: 2 })).toBe(1)
  })
  it('valida HP', () => {
    expect(() => captureChance({ captureRate: 45, hpMax: 0, hpCurrent: 0, ballBonus: 1 })).toThrow(RangeError)
    expect(() => captureChance({ captureRate: 45, hpMax: 10, hpCurrent: 11, ballBonus: 1 })).toThrow(RangeError)
  })
})

describe('rollCapture', () => {
  const input = { captureRate: 45, hpMax: 100, hpCurrent: 50, ballBonus: 1 }
  it('compara o sorteio com a chance', () => {
    expect(rollCapture(input, { next: () => 0.1, int: () => 0 })).toBe(true)
    expect(rollCapture(input, { next: () => 0.2, int: () => 0 })).toBe(false)
  })
})
```

`packages/shared/test/evolution.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Species } from '../src/index.js'
import { nextEvolution } from '../src/evolution.js'

const base = { types: ['fire' as const], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, baseExperience: 62, growthRate: 'medium-slow' as const, captureRate: 45, learnset: [] }
const charmander: Species = { ...base, id: 4, name: 'charmander', evolvesTo: { species: 'charmeleon', level: 16 } }
const charmeleon: Species = { ...base, id: 5, name: 'charmeleon' }
const registry = { species: new Map([['charmander', charmander], ['charmeleon', charmeleon]]) }

describe('nextEvolution', () => {
  it('devolve o alvo a partir do nível de evolução', () => {
    expect(nextEvolution(charmander, 15, registry)).toBeUndefined()
    expect(nextEvolution(charmander, 16, registry)?.name).toBe('charmeleon')
    expect(nextEvolution(charmander, 99, registry)?.name).toBe('charmeleon')
  })
  it('espécie sem evolução devolve undefined', () => {
    expect(nextEvolution(charmeleon, 100, registry)).toBeUndefined()
  })
  it('lança se o alvo não existir no registro', () => {
    expect(() => nextEvolution(charmander, 16, { species: new Map() })).toThrow(/charmeleon/)
  })
})
```

`packages/shared/test/loot.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRng, type LootTable, type Species } from '../src/index.js'
import { lootTableFor, rollLoot } from '../src/loot.js'

const zubat: Species = { id: 41, name: 'zubat', types: ['poison', 'flying'], baseStats: { hp: 40, attack: 45, defense: 35, spAttack: 30, spDefense: 40, speed: 55 }, baseExperience: 49, growthRate: 'medium-fast', captureRate: 255, learnset: [] }
const table: LootTable = { species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.08 }, { item: 'poke-ball', chance: 0.5 }] }
const loot = new Map([['zubat', table]])

describe('lootTableFor', () => {
  it('usa a entrada explícita quando existe', () => {
    expect(lootTableFor(zubat, loot)).toBe(table)
  })
  it('gera padrão a partir do baseExperience quando não existe', () => {
    expect(lootTableFor(zubat, new Map())).toEqual({ species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.05 }] })
  })
})

describe('rollLoot', () => {
  it('ouro dentro da faixa e drops conforme o sorteio', () => {
    const r = rollLoot(zubat, loot, { int: (min, max) => max, next: () => 0.3 })
    expect(r).toEqual({ gold: 9, drops: [{ item: 'poke-ball', quantity: 1 }] })
  })
  it('com PRNG seedado é determinístico e respeita a faixa em mil rolagens', () => {
    const a = createRng(5), b = createRng(5)
    const xs = Array.from({ length: 1000 }, () => rollLoot(zubat, loot, a))
    expect(xs).toEqual(Array.from({ length: 1000 }, () => rollLoot(zubat, loot, b)))
    for (const x of xs) { expect(x.gold).toBeGreaterThanOrEqual(4); expect(x.gold).toBeLessThanOrEqual(9) }
    const balls = xs.filter((x) => x.drops.some((d) => d.item === 'poke-ball')).length
    expect(balls).toBeGreaterThan(400); expect(balls).toBeLessThan(600)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- capture evolution loot`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar**

`packages/shared/src/capture.ts`:
```ts
import type { Rng } from './rng.js'

const CAPTURE_DIVISOR = 255

export interface CaptureInput {
  readonly captureRate: number
  readonly hpMax: number
  readonly hpCurrent: number
  readonly ballBonus: number
}

export function captureChance({ captureRate, hpMax, hpCurrent, ballBonus }: CaptureInput): number {
  if (hpMax < 1) throw new RangeError(`hpMax inválido: ${hpMax}`)
  if (hpCurrent < 0 || hpCurrent > hpMax) throw new RangeError(`hpCurrent ${hpCurrent} fora de [0, ${hpMax}]`)
  const a = Math.floor(((3 * hpMax - 2 * hpCurrent) * captureRate * ballBonus) / (3 * hpMax))
  return Math.min(1, a / CAPTURE_DIVISOR)
}

export function rollCapture(input: CaptureInput, rng: Rng): boolean {
  return rng.next() < captureChance(input)
}
```

`packages/shared/src/evolution.ts`:
```ts
import type { Registry } from './registry.js'
import type { Species } from './schemas/species.js'

export function nextEvolution(species: Species, level: number, registry: Pick<Registry, 'species'>): Species | undefined {
  const evo = species.evolvesTo
  if (!evo || level < evo.level) return undefined
  const target = registry.species.get(evo.species)
  if (!target) throw new Error(`espécie ${species.name}: evolução ${evo.species} não existe no registro`)
  return target
}
```

`packages/shared/src/loot.ts`:
```ts
import type { Rng } from './rng.js'
import type { LootTable } from './schemas/loot.js'
import type { Species } from './schemas/species.js'

export const DEFAULT_DROP_ITEM = 'potion'
export const DEFAULT_DROP_CHANCE = 0.05
const GOLD_MIN_DIVISOR = 10
const GOLD_MAX_DIVISOR = 5

export interface LootResult {
  readonly gold: number
  readonly drops: readonly { readonly item: string; readonly quantity: number }[]
}

export function lootTableFor(species: Species, loot: ReadonlyMap<string, LootTable>): LootTable {
  const explicit = loot.get(species.name)
  if (explicit) return explicit
  const be = species.baseExperience
  return {
    species: species.name,
    gold: [Math.floor(be / GOLD_MIN_DIVISOR), Math.floor(be / GOLD_MAX_DIVISOR)],
    drops: [{ item: DEFAULT_DROP_ITEM, chance: DEFAULT_DROP_CHANCE }],
  }
}

export function rollLoot(species: Species, loot: ReadonlyMap<string, LootTable>, rng: Rng): LootResult {
  const table = lootTableFor(species, loot)
  const gold = rng.int(table.gold[0], table.gold[1])
  const drops = table.drops.filter((d) => rng.next() < d.chance).map((d) => ({ item: d.item, quantity: 1 }))
  return { gold, drops }
}
```

`index.ts`: `export * from './capture.js'`, `export * from './evolution.js'`, `export * from './loot.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): captura, evolução por nível e loot"
```

---

### Task 8: Migrar `tools/assets` para o `shared`, README e cobertura

**Files:**
- Modify: `tools/assets/package.json` (dependência `"@pokeidle/shared": "workspace:*"`), `tools/assets/src/hunt-map.ts` (vira re-export), `tools/assets/src/parse-or-throw.ts` (vira re-export), `tools/assets/src/tiled-import.ts`, `tools/assets/src/cli.ts`, `tools/assets/README.md`
- Create: `packages/shared/README.md`
- Test: `tools/assets/test/tiled-import.test.ts` (ajustes mínimos), `tools/assets/test/cli.test.ts` (novo caso)

**Interfaces:**
- Consumes: `HuntMapSchema`, `parseHuntMap`, `HuntMap`, `HuntSpawn`, `TILE_SIZE`, `parseOrThrow`, `loadRegistry` de `@pokeidle/shared`.
- Produces: `tools/assets` sem cópia própria de schema; `map-import` grava por padrão em `packages/shared/data/hunts` e, sem `--manifest`, valida `speciesName` contra `loadRegistry().species`.

- [ ] **Step 1: Adicionar a dependência e re-exportar**

Em `tools/assets/package.json` adicionar `"@pokeidle/shared": "workspace:*"` em `dependencies` e rodar `pnpm install`.

`tools/assets/src/hunt-map.ts` passa a ter só:
```ts
export { HuntMapSchema, TILE_SIZE, parseHuntMap, type HuntMap, type HuntSpawn } from '@pokeidle/shared'
```
`tools/assets/src/parse-or-throw.ts` passa a ter só:
```ts
export { parseOrThrow } from '@pokeidle/shared'
```

- [ ] **Step 2: Teste do novo padrão de espécies**

Adicionar em `tools/assets/test/tiled-import.test.ts` um caso: `importTiledMap(tiled, tileset, { id, name })` com um spawn `speciesName: 'zubat'` e sem `knownSpecies` continua aceitando (o importador puro não consulta registro). E em `tools/assets/test/cli.test.ts`, no caso de `map-import`, assert que sem `--manifest` um spawn `speciesName: 'mewtwo-x'` é rejeitado com `/espécie desconhecida/` (o CLI usa o registro), e que `--out` omitido grava em `packages/shared/data/hunts` (use `--out` para um temp dir nos outros testes e verifique o default lendo `program.commands` → `.opts()`, ou simplesmente checar a string default da opção via `cmd.options.find(o => o.long === '--out')?.defaultValue`).

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/assets-tools test -- cli tiled-import`
Expected: o novo caso de `cli` falha (default antigo `data/hunts`, sem validação de espécie).

- [ ] **Step 4: Implementar no CLI**

Em `tools/assets/src/cli.ts`: importar `loadRegistry` de `@pokeidle/shared`; em `importOptions(manifestPath)`, quando `manifestPath === undefined` devolver `{ knownSpecies: new Set(loadRegistry().species.keys()) }`; trocar o default de `--out` para `packages/shared/data/hunts`. Atualizar a descrição de `--manifest` para "opcional: usa os nomes do manifest em vez do registro do shared".

- [ ] **Step 5: READMEs**

`packages/shared/README.md` (~60 linhas, português): o que o pacote é; como regenerar dados (`pnpm pokedata sync [--force]`); lista dos arquivos em `data/` e quem os gera; contrato (`loadRegistry`, fórmulas e assinaturas da seção 7 da spec); constantes de fórmula com os valores; como adicionar uma hunt (`data-files.ts`); nota de que `tools/assets` importa daqui.
`tools/assets/README.md`: atualizar o caminho padrão do `map-import`, dizer que `HuntMapSchema` agora vive em `@pokeidle/shared`, e que sem `--manifest` a validação de espécie usa o registro.
Se um hook do repositório bloquear a criação do `.md`, parar e reportar BLOCKED com a mensagem do hook.

- [ ] **Step 6: Rodar tudo e cobertura**

Run: `pnpm test && pnpm --filter @pokeidle/shared test -- --coverage && pnpm --filter @pokeidle/assets-tools typecheck && pnpm --filter @pokeidle/pokedata typecheck && pnpm assets --help | grep -c map-import`
Expected: três pacotes verdes; cobertura de linhas do `shared` ≥ 80 % (anotar o número no relatório); typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add tools/assets packages/shared pnpm-lock.yaml
git commit -m "refactor(assets): usa HuntMapSchema e parseOrThrow do shared; map-import valida espécies pelo registro"
```

---

## Autorrevisão do plano

**Cobertura da spec:** §2 estrutura (T1–T7 criam cada arquivo listado; `species.json` único em vez de pasta, conforme spec corrigida); §3 script (T3, com fixtures em memória; T4 roda contra o PokeAPI real); §4 fórmulas (T5 stat/XP, T6 dano/cooldown/golpes, T7 captura/evolução/loot, todas com os números da spec); §5 dados autorais (T4); §6 migração (T4 move os arquivos, T8 troca os imports e o default do CLI); §7 contrato (T4 registry, `index.ts` acumulado em T1–T7); §8 testes (fixtures sem rede em T3, registro real em T4, tabelas de casos em T5–T7, `tiled-import` verde em T8, cobertura em T8).

**Consistência de tipos:** `Rng { next, int }` (T1) usado em T6 e T7; `parseOrThrow(schema, json, label, hint?)` (T2) usado em T3, T4; `Species`, `Move`, `TypeChart`, `TypeName`, `GROWTH_RATES`, `TYPE_NAMES` (T2) usados em T3–T7; `Registry.species: ReadonlyMap<string, Species>` (T4) usado em T7 (`Pick<Registry,'species'>`) e T8; `Stats`/`statsAt` (T5) usados em T6 (`Combatant.stats`); `assertLevel` (T5) reutilizado em `xp.ts`.

**Decisões registradas:** `species.json` único para import estático; hunts registradas em `data-files.ts` (um import por hunt); precisão de golpe ignorada no MVP; `erratic`/`fluctuating` rejeitadas pelo schema.
