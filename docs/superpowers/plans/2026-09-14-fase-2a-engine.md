# Fase 2a: Motor de simulação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `packages/server/src/engine`, o motor puro da hunt: `createHuntState`, `step`, `applyIntent`, `simulate`, com máquina de modos do jogador, A*, combate com cooldown, captura configurável, progressão (XP, nível, evolução, loot) e eventos tipados.

**Architecture:** Redutor puro sobre um `HuntState` imutável e serializável. `step(state, deps)` roda respawns → jogador → selvagem engajado → consequências, e devolve `{ state, events }`. Toda fórmula vem de `@pokeidle/shared`; toda aleatoriedade vem do `Rng` injetado. Módulos pequenos por responsabilidade (`grid`, `spawn`, `combat`, `progression`, `player`, `step`, `intents`, `create`, `simulate`).

**Tech Stack:** TypeScript 5 strict ESM, Vitest 2 + coverage-v8, `@pokeidle/shared` (workspace).

**Spec:** `docs/superpowers/specs/2026-09-14-fase-2a-engine-design.md`

## Global Constraints

- Sem I/O, sem timers, sem classes com estado, sem `Math.random`: aleatoriedade só por `deps.rng`.
- Estado imutável: cada função devolve objetos novos (spread); nunca mutar `state`, `wild`, `team`.
- `TICKS_PER_SECOND = 5`, `HEAL_TICKS = 25`, `RESPAWN_RETRY_TICKS = 5`, `RETURN_HP_PERCENT_DEFAULT = 30`, `CAPTURE_MAX_WILD_HP_DEFAULT = 30`.
- Ordem do tick: respawns → jogador → selvagem engajado → consequências → `tick + 1`.
- Precisão de golpe não é aplicada. Todo golpe começa pronto (`cooldowns` vazio = pronto). `cooldowns[name] = tick + cooldownTicks(move)` após usar; pronto quando `readyAt <= tick`.
- Selvagens não andam; só o selvagem `targetWildId` ataca, e só quando o jogador está em `fighting` e adjacente.
- Captura: uma tentativa por selvagem (`captureTried`), bola consumida mesmo em falha; `ballTier: 'best'` = maior `ballBonus` com quantidade > 0.
- Level up: `hp` sobe pelo mesmo tanto que `hpMax` subiu. Evolução verificada a cada nível ganho.
- Eventos carregam `tick` e são uniões discriminadas por `type`. Erros de intenção são `{ error: { code, message } }`, nunca exceções.
- TypeScript strict ESM, imports locais com `.js`, sem `console.log`. Conventional commits de uma linha, sem trailers.

## Estrutura de arquivos

```
packages/server/
  package.json  tsconfig.json  vitest.config.ts
  src/engine/
    constants.ts   types.ts   grid.ts   spawn.ts   progression.ts   combat.ts
    player.ts      step.ts    intents.ts   create.ts   simulate.ts   index.ts
  test/engine/
    fixtures/mini.ts           # registro mínimo + mapa 5x5 + estado base
    grid.test.ts  spawn.test.ts  progression.test.ts  combat.test.ts
    player.test.ts  step.test.ts  intents.test.ts  simulate.test.ts  route1.test.ts
```

---

### Task 1: Scaffold de `packages/server`, tipos, constantes e `grid.ts`

**Files:**
- Create: `packages/server/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/engine/constants.ts`, `src/engine/types.ts`, `src/engine/grid.ts`, `src/engine/index.ts`
- Modify: `package.json` raiz (script `server:test`)
- Test: `packages/server/test/engine/grid.test.ts`

**Interfaces:**
- Produces (`types.ts`, todos `readonly`): `Point {x,y}`, `PlayerMode`, `PokemonState { id: string; speciesName: string; level: number; xp: number; hp: number; hpMax: number }`, `WildState { id: number; spawnIndex: number; speciesName: string; level: number; hp: number; hpMax: number; position: Point; cooldowns: Record<string, number>; captureTried: boolean }`, `BallTier = 'poke' | 'great' | 'ultra' | 'best'`, `CaptureSettings { ballTier; maxWildHpPercent; allowDuplicates }`, `HuntSettings { returnHpPercent; capture; seen: readonly string[] }`, `PlayerState { team: readonly PokemonState[]; activeIndex; position; path: readonly Point[]; mode; targetWildId: number | null; healingUntilTick: number | null; cooldowns: Record<string, number> }`, `HuntState { huntId; tick; player; wilds: readonly WildState[]; respawns: readonly { spawnIndex; atTick }[]; nextWildId; trainer: { xp; gold }; inventory: Record<string, number>; settings }`, `EngineDeps { registry: Registry; hunt: HuntMap; rng: Rng }`, `Event` (união: `spawned`, `moved`, `attack`, `wildDefeated`, `captured`, `captureFailed`, `pokemonFainted`, `switched`, `levelUp`, `evolved`, `itemUsed`, `returning`, `healed`, `stopped`, `skipped` — payloads na Step 1), `Intent` (`stop` | `useItem {itemId}` | `setActive {pokemonId}` | `updateSettings {patch}`), `StepResult { state; events: readonly Event[] }`, `EngineError { code: string; message: string }`, `IntentResult = StepResult | { error: EngineError }`.
- Produces (`grid.ts`): `manhattan(a, b): number`, `isAdjacent(a, b): boolean`, `inBounds(p, width, height): boolean`, `neighbors(p): Point[]` (4, sem checar limites), `findPath(input: { from: Point; target: Point; isBlocked: (p: Point) => boolean; isGoal: (p: Point) => boolean; width: number; height: number }): Point[] | null` — A* com heurística Manhattan até `target`, custo 1, devolve o caminho SEM a origem e terminando no primeiro tile que satisfaz `isGoal`; `from` nunca é considerado bloqueado; `null` se inalcançável; se `isGoal(from)` devolve `[]`.

- [ ] **Step 1: Scaffold e tipos**

`packages/server/package.json`:
```json
{
  "name": "@pokeidle/server",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@pokeidle/shared": "workspace:*" },
  "devDependencies": { "@types/node": "^22.5.0", "@vitest/coverage-v8": "^2.1.0", "typescript": "^5.5.4", "vitest": "^2.1.0" }
}
```
`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": ".", "noEmit": true }, "include": ["src", "test"] }`.
`vitest.config.ts`: igual ao de `packages/shared`, com `coverage.include: ['src/**']` e `thresholds: { lines: 80 }`.
Raiz: `"server:test": "pnpm --filter @pokeidle/server test"`.

`src/engine/constants.ts`:
```ts
export const TICKS_PER_SECOND = 5
export const HEAL_TICKS = 25
export const RESPAWN_RETRY_TICKS = 5
export const RETURN_HP_PERCENT_DEFAULT = 30
export const CAPTURE_MAX_WILD_HP_DEFAULT = 30
export const MAX_TEAM_SIZE = 6
export const BALL_ITEM_BY_TIER = { poke: 'poke-ball', great: 'great-ball', ultra: 'ultra-ball' } as const
```

`src/engine/types.ts`:
```ts
import type { HuntMap, Registry, Rng } from '@pokeidle/shared'

export interface Point { readonly x: number; readonly y: number }
export type PlayerMode = 'searching' | 'walking' | 'fighting' | 'returning' | 'healing' | 'stopped'
export type BallTier = 'poke' | 'great' | 'ultra' | 'best'

export interface PokemonState {
  readonly id: string; readonly speciesName: string; readonly level: number
  readonly xp: number; readonly hp: number; readonly hpMax: number
}
export interface WildState {
  readonly id: number; readonly spawnIndex: number; readonly speciesName: string; readonly level: number
  readonly hp: number; readonly hpMax: number; readonly position: Point
  readonly cooldowns: Readonly<Record<string, number>>; readonly captureTried: boolean
}
export interface CaptureSettings { readonly ballTier: BallTier; readonly maxWildHpPercent: number; readonly allowDuplicates: boolean }
export interface HuntSettings { readonly returnHpPercent: number; readonly capture: CaptureSettings; readonly seen: readonly string[] }
export interface PlayerState {
  readonly team: readonly PokemonState[]; readonly activeIndex: number
  readonly position: Point; readonly path: readonly Point[]
  readonly mode: PlayerMode; readonly targetWildId: number | null; readonly healingUntilTick: number | null
  readonly cooldowns: Readonly<Record<string, number>>
}
export interface Respawn { readonly spawnIndex: number; readonly atTick: number }
export interface HuntState {
  readonly huntId: string; readonly tick: number
  readonly player: PlayerState
  readonly wilds: readonly WildState[]
  readonly respawns: readonly Respawn[]
  readonly nextWildId: number
  readonly trainer: { readonly xp: number; readonly gold: number }
  readonly inventory: Readonly<Record<string, number>>
  readonly settings: HuntSettings
}
export interface EngineDeps { readonly registry: Registry; readonly hunt: HuntMap; readonly rng: Rng }

export type Event =
  | { type: 'spawned'; tick: number; wildId: number; speciesName: string; level: number; position: Point }
  | { type: 'moved'; tick: number; from: Point; to: Point }
  | { type: 'attack'; tick: number; attacker: 'player' | 'wild'; attackerId: string; targetId: string; move: string; damage: number; targetHp: number }
  | { type: 'wildDefeated'; tick: number; wildId: number; speciesName: string; level: number; xpTrainer: number; xpPokemon: number; gold: number; drops: readonly { item: string; quantity: number }[] }
  | { type: 'captured'; tick: number; wildId: number; speciesName: string; level: number; ball: string; toBox: boolean }
  | { type: 'captureFailed'; tick: number; wildId: number; ball: string }
  | { type: 'pokemonFainted'; tick: number; pokemonId: string }
  | { type: 'switched'; tick: number; pokemonId: string }
  | { type: 'levelUp'; tick: number; pokemonId: string; level: number }
  | { type: 'evolved'; tick: number; pokemonId: string; from: string; to: string }
  | { type: 'itemUsed'; tick: number; itemId: string; pokemonId: string; hp: number }
  | { type: 'returning'; tick: number }
  | { type: 'healed'; tick: number }
  | { type: 'stopped'; tick: number; reason: 'team-fainted' | 'intent' }
  | { type: 'skipped'; tick: number; wildId: number }

export type Intent =
  | { type: 'stop' }
  | { type: 'useItem'; itemId: string }
  | { type: 'setActive'; pokemonId: string }
  | { type: 'updateSettings'; patch: Partial<{ returnHpPercent: number; capture: Partial<CaptureSettings> }> }

export interface StepResult { readonly state: HuntState; readonly events: readonly Event[] }
export interface EngineError { readonly code: string; readonly message: string }
export type IntentResult = StepResult | { readonly error: EngineError }
```

`src/engine/index.ts` por enquanto: `export * from './types.js'`, `export * from './constants.js'`, `export * from './grid.js'`.

- [ ] **Step 2: Teste do grid**

`packages/server/test/engine/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { findPath, isAdjacent, manhattan, neighbors } from '../../src/engine/grid.js'

// mapa 5x5: '#' bloqueia
const rows = ['.....', '.###.', '.....', '.#.#.', '.....']
const blocked = (p: { x: number; y: number }) => rows[p.y]?.[p.x] === '#'
const at = (x: number, y: number) => ({ x, y })

describe('helpers', () => {
  it('manhattan e adjacência', () => {
    expect(manhattan(at(0, 0), at(3, 4))).toBe(7)
    expect(isAdjacent(at(1, 1), at(1, 2))).toBe(true)
    expect(isAdjacent(at(1, 1), at(2, 2))).toBe(false)
    expect(isAdjacent(at(1, 1), at(1, 1))).toBe(false)
  })
  it('neighbors devolve os 4 vizinhos ortogonais', () => {
    expect(neighbors(at(2, 2))).toEqual([at(2, 1), at(3, 2), at(2, 3), at(1, 2)])
  })
})

describe('findPath', () => {
  const base = { isBlocked: blocked, width: 5, height: 5 }
  it('contorna a parede até ficar adjacente ao alvo', () => {
    const target = at(2, 2)
    const path = findPath({ ...base, from: at(0, 0), target, isGoal: (p) => isAdjacent(p, target) })
    expect(path).not.toBeNull()
    expect(path!.at(-1)).toEqual(at(1, 2))
    expect(path).toHaveLength(3) // (0,1) (0,2) (1,2)
    for (const p of path!) expect(blocked(p)).toBe(false)
  })
  it('devolve [] quando a origem já satisfaz o objetivo', () => {
    expect(findPath({ ...base, from: at(1, 2), target: at(2, 2), isGoal: (p) => isAdjacent(p, at(2, 2)) })).toEqual([])
  })
  it('devolve null quando o alvo está cercado', () => {
    const walled = ['.....', '.###.', '.#.#.', '.###.', '.....']
    const b = (p: { x: number; y: number }) => walled[p.y]?.[p.x] === '#'
    expect(findPath({ from: at(0, 0), target: at(2, 2), isBlocked: b, isGoal: (p) => isAdjacent(p, at(2, 2)), width: 5, height: 5 })).toBeNull()
  })
  it('nunca sai do mapa nem entra em bloqueio, e a origem bloqueada não impede sair', () => {
    const path = findPath({ ...base, from: at(1, 1), target: at(4, 4), isBlocked: (p) => blocked(p) || (p.x === 1 && p.y === 1), isGoal: (p) => p.x === 4 && p.y === 4 })
    expect(path).not.toBeNull()
    for (const p of path!) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThan(5); expect(blocked(p)).toBe(false) }
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/raphaelmardine/programacao/Jogos/pokeidle && pnpm install && pnpm --filter @pokeidle/server test`
Expected: FAIL, `grid.js` não encontrado.

- [ ] **Step 4: Implementar `grid.ts`**

```ts
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
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`
Expected: 6 testes passando; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/server
git commit -m "feat(server): scaffold do pacote, tipos do motor e pathfinding A*"
```

---

### Task 2: Fixture mínima, `spawn.ts` e `create.ts`

**Files:**
- Create: `packages/server/test/engine/fixtures/mini.ts`, `src/engine/spawn.ts`, `src/engine/create.ts`
- Modify: `src/engine/index.ts`
- Test: `test/engine/spawn.test.ts`

**Interfaces:**
- Fixture (`mini.ts`): `miniRegistry(): Registry` via `buildRegistry` com espécies `charmander` (fire, medium-slow, be 62, moves ember@1 scratch@1 flamethrower@34, evolvesTo charmeleon@16), `charmeleon` (fire, medium-slow), `zubat` (poison/flying, medium-fast, be 49, captureRate 255, moves leech-life@1), `gastly` (ghost/poison, be 62, moves lick@1), `magnemite` (electric/steel, be 65, moves tackle@1) e golpes `ember 40 fire special`, `scratch 40 normal physical`, `flamethrower 90 fire special`, `leech-life 80 bug physical`, `lick 30 ghost physical`, `tackle 40 normal physical`; tabela de tipos toda 1 exceto `fire→grass 2`, `normal→ghost 0`, `fire→water 0.5`; itens `potion`, `super-potion`, `poke-ball`, `great-ball`, `ultra-ball` como em `packages/shared/data/items.json`; loot `zubat gold [4,9] drops potion 0.08`; `miniHunt(): HuntMap` 5x5, sem bloqueio exceto (2,1), `spawnPoint (0,0)`, `pokecenter (4,4)`, spawns `[{ speciesName:'zubat', minLevel:3, maxLevel:3, x:3, y:1, radius:0, count:1, respawnSeconds:2 }]`; `miniDeps(seed = 1): EngineDeps`; `charmander5(): PokemonState` (`id 'p1'`, level 5, xp `xpForLevel('medium-slow', 5)`, hp = hpMax = `hpAt(39, 5)` = 20); `baseState(over?: Partial<HuntState>): HuntState` = `createHuntState(...)` com o time `[charmander5()]`, inventário `{ potion: 1, 'poke-ball': 2 }`, settings padrão, e `over` aplicado por spread.
- Produces (`spawn.ts`): `blockedAt(hunt, p): boolean`, `occupiedAt(state, p): boolean` (selvagem ou jogador), `isWalkable(state, hunt, p): boolean` (dentro, não bloqueado, não ocupado), `spawnTiles(spawn, hunt): Point[]` (quadrado de raio `radius` em ordem de linha, dentro do mapa, não bloqueados), `spawnWild(state, deps, spawnIndex): StepResult` (nível `rng.int`, posição `rng.int` entre os tiles livres; sem tile → reagenda `tick + RESPAWN_RETRY_TICKS`, sem evento), `processRespawns(state, deps): StepResult` (todos com `atTick <= tick`, em ordem).
- Produces (`create.ts`): `defaultSettings(seen?: readonly string[]): HuntSettings`, `createHuntState(input: { hunt: HuntMap; team: readonly PokemonState[]; inventory: Readonly<Record<string, number>>; settings?: HuntSettings }, deps: EngineDeps): HuntState` — posição no `spawnPoint`, modo `searching`, `respawns` com `count` entradas por spawn em `atTick 0`, e já processadas via `processRespawns`.

- [ ] **Step 1: Escrever a fixture e o teste**

`test/engine/fixtures/mini.ts`:
```ts
import { buildRegistry, createRng, hpAt, xpForLevel, TYPE_NAMES, type HuntMap, type Registry } from '@pokeidle/shared'
import { createHuntState, defaultSettings } from '../../../src/engine/create.js'
import type { EngineDeps, HuntState, PokemonState } from '../../../src/engine/types.js'

const stats = (hp: number, attack: number, defense: number, spAttack: number, spDefense: number, speed: number) => ({ hp, attack, defense, spAttack, spDefense, speed })
const chartRows = Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))])) as Record<string, Record<string, number>>
const typeChart = { ...chartRows, fire: { ...chartRows.fire, grass: 2, water: 0.5 }, normal: { ...chartRows.normal, ghost: 0 } }

export function miniRegistry(): Registry {
  return buildRegistry({
    species: [
      { id: 4, name: 'charmander', types: ['fire'], baseStats: stats(39, 52, 43, 60, 50, 65), baseExperience: 62, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }, { move: 'flamethrower', level: 34 }], evolvesTo: { species: 'charmeleon', level: 16 } },
      { id: 5, name: 'charmeleon', types: ['fire'], baseStats: stats(58, 64, 58, 80, 65, 80), baseExperience: 142, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }] },
      { id: 41, name: 'zubat', types: ['poison', 'flying'], baseStats: stats(40, 45, 35, 30, 40, 55), baseExperience: 49, growthRate: 'medium-fast', captureRate: 255, learnset: [{ move: 'leech-life', level: 1 }] },
      { id: 92, name: 'gastly', types: ['ghost', 'poison'], baseStats: stats(30, 35, 30, 100, 35, 80), baseExperience: 62, growthRate: 'medium-slow', captureRate: 190, learnset: [{ move: 'lick', level: 1 }] },
      { id: 81, name: 'magnemite', types: ['electric', 'steel'], baseStats: stats(25, 35, 70, 95, 55, 45), baseExperience: 65, growthRate: 'medium-fast', captureRate: 190, learnset: [{ move: 'tackle', level: 1 }] },
    ],
    moves: [
      { name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' },
      { name: 'scratch', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' },
      { name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' },
      { name: 'leech-life', type: 'bug', power: 80, accuracy: 100, damageClass: 'physical' },
      { name: 'lick', type: 'ghost', power: 30, accuracy: 100, damageClass: 'physical' },
      { name: 'tackle', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' },
    ],
    typeChart,
    items: [
      { id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: 100, sellPrice: 50 },
      { id: 'super-potion', name: 'Super Poção', kind: 'potion', healPercent: 50, buyPrice: 400, sellPrice: 200 },
      { id: 'poke-ball', name: 'Poké Bola', kind: 'ball', ballBonus: 1, buyPrice: 200, sellPrice: 100 },
      { id: 'great-ball', name: 'Great Bola', kind: 'ball', ballBonus: 1.5, buyPrice: 600, sellPrice: 300 },
      { id: 'ultra-ball', name: 'Ultra Bola', kind: 'ball', ballBonus: 2, buyPrice: 1200, sellPrice: 600 },
    ],
    loot: [{ species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.08 }] }],
    hunts: [miniHunt()],
  })
}

export function miniHunt(): HuntMap {
  const size = 25
  const blocking = Array.from({ length: size }, (_, i) => i === 1 * 5 + 2)
  return {
    id: 'mini', name: 'Mini', width: 5, height: 5, tileSize: 32,
    layers: { ground: Array(size).fill('grass'), detail: Array(size).fill(null), blocking },
    spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 4, y: 4 },
    spawns: [{ speciesName: 'zubat', minLevel: 3, maxLevel: 3, x: 3, y: 1, radius: 0, count: 1, respawnSeconds: 2 }],
  }
}

export const miniDeps = (seed = 1): EngineDeps => ({ registry: miniRegistry(), hunt: miniHunt(), rng: createRng(seed) })

export const charmander5 = (): PokemonState => ({ id: 'p1', speciesName: 'charmander', level: 5, xp: xpForLevel('medium-slow', 5), hp: hpAt(39, 5), hpMax: hpAt(39, 5) })

export function baseState(over: Partial<HuntState> = {}, deps: EngineDeps = miniDeps()): HuntState {
  const state = createHuntState({ hunt: deps.hunt, team: [charmander5()], inventory: { potion: 1, 'poke-ball': 2 }, settings: defaultSettings() }, deps)
  return { ...state, ...over }
}
```

`test/engine/spawn.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { blockedAt, isWalkable, processRespawns, spawnTiles, spawnWild } from '../../src/engine/spawn.js'
import { RESPAWN_RETRY_TICKS } from '../../src/engine/constants.js'
import { baseState, charmander5, miniDeps, miniHunt } from './fixtures/mini.js'

describe('createHuntState', () => {
  it('começa no spawnPoint, searching, com os selvagens já no mapa', () => {
    const s = baseState()
    expect(s.player.position).toEqual({ x: 0, y: 0 })
    expect(s.player.mode).toBe('searching')
    expect(s.wilds).toHaveLength(1)
    expect(s.wilds[0]).toMatchObject({ speciesName: 'zubat', level: 3, position: { x: 3, y: 1 }, captureTried: false })
    expect(s.wilds[0]!.hp).toBe(s.wilds[0]!.hpMax)
    expect(s.respawns).toEqual([])
    expect(s.tick).toBe(0)
    expect(s.settings).toEqual(defaultSettings())
  })
})

describe('spawnTiles / blockedAt / isWalkable', () => {
  it('lista tiles do raio dentro do mapa e não bloqueados', () => {
    const hunt = miniHunt()
    expect(blockedAt(hunt, { x: 2, y: 1 })).toBe(true)
    expect(spawnTiles({ ...hunt.spawns[0]!, x: 1, y: 1, radius: 1 }, hunt).map((p) => `${p.x},${p.y}`)).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '0,2', '1,2', '2,2'])
    const s = baseState()
    expect(isWalkable(s, hunt, { x: 3, y: 1 })).toBe(false) // selvagem
    expect(isWalkable(s, hunt, { x: 0, y: 0 })).toBe(false) // jogador
    expect(isWalkable(s, hunt, { x: 5, y: 0 })).toBe(false) // fora
    expect(isWalkable(s, hunt, { x: 1, y: 0 })).toBe(true)
  })
})

describe('spawnWild / processRespawns', () => {
  it('reagenda quando não há tile livre', () => {
    const deps = miniDeps()
    const s = baseState() // o único tile do spawn (3,1) já está ocupado
    const r = spawnWild(s, deps, 0)
    expect(r.events).toEqual([])
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: RESPAWN_RETRY_TICKS }])
  })
  it('processa só os vencidos, em ordem, e emite spawned', () => {
    const deps = miniDeps()
    const empty = { ...baseState(), wilds: [], respawns: [{ spawnIndex: 0, atTick: 0 }, { spawnIndex: 0, atTick: 10 }] }
    const r = processRespawns(empty, deps)
    expect(r.state.wilds).toHaveLength(1)
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: 10 }])
    expect(r.events).toEqual([{ type: 'spawned', tick: 0, wildId: 2, speciesName: 'zubat', level: 3, position: { x: 3, y: 1 } }])
    expect(r.state.nextWildId).toBe(3)
  })
  it('createHuntState com count 2 gera dois selvagens em tiles distintos quando há espaço', () => {
    const deps = miniDeps()
    const hunt = { ...deps.hunt, spawns: [{ ...deps.hunt.spawns[0]!, radius: 1, count: 2 }] }
    const s = createHuntState({ hunt, team: [charmander5()], inventory: {} }, { ...deps, hunt })
    expect(s.wilds).toHaveLength(2)
    expect(`${s.wilds[0]!.position.x},${s.wilds[0]!.position.y}`).not.toBe(`${s.wilds[1]!.position.x},${s.wilds[1]!.position.y}`)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- spawn`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar `spawn.ts`**

```ts
import { hpAt, type HuntMap, type HuntSpawn } from '@pokeidle/shared'
import { RESPAWN_RETRY_TICKS } from './constants.js'
import { inBounds, samePoint } from './grid.js'
import type { EngineDeps, Event, HuntState, Point, StepResult, WildState } from './types.js'

export const blockedAt = (hunt: HuntMap, p: Point): boolean => hunt.layers.blocking[p.y * hunt.width + p.x] === true
export const occupiedAt = (state: HuntState, p: Point): boolean => samePoint(state.player.position, p) || state.wilds.some((w) => samePoint(w.position, p))
export const isWalkable = (state: HuntState, hunt: HuntMap, p: Point): boolean => inBounds(p, hunt.width, hunt.height) && !blockedAt(hunt, p) && !occupiedAt(state, p)

export function spawnTiles(spawn: HuntSpawn, hunt: HuntMap): Point[] {
  const tiles: Point[] = []
  for (let y = spawn.y - spawn.radius; y <= spawn.y + spawn.radius; y++) {
    for (let x = spawn.x - spawn.radius; x <= spawn.x + spawn.radius; x++) {
      const p = { x, y }
      if (inBounds(p, hunt.width, hunt.height) && !blockedAt(hunt, p)) tiles.push(p)
    }
  }
  return tiles
}

export function spawnWild(state: HuntState, deps: EngineDeps, spawnIndex: number): StepResult {
  const spawn = deps.hunt.spawns[spawnIndex]
  if (!spawn) throw new Error(`spawn ${spawnIndex} não existe na hunt ${deps.hunt.id}`)
  const free = spawnTiles(spawn, deps.hunt).filter((p) => !occupiedAt(state, p))
  if (free.length === 0) {
    return { state: { ...state, respawns: [...state.respawns, { spawnIndex, atTick: state.tick + RESPAWN_RETRY_TICKS }] }, events: [] }
  }
  const species = deps.registry.species.get(spawn.speciesName)
  if (!species) throw new Error(`espécie ${spawn.speciesName} não existe no registro`)
  const level = deps.rng.int(spawn.minLevel, spawn.maxLevel)
  const position = free[deps.rng.int(0, free.length - 1)]!
  const hpMax = hpAt(species.baseStats.hp, level)
  const wild: WildState = { id: state.nextWildId, spawnIndex, speciesName: species.name, level, hp: hpMax, hpMax, position, cooldowns: {}, captureTried: false }
  const event: Event = { type: 'spawned', tick: state.tick, wildId: wild.id, speciesName: wild.speciesName, level, position }
  return { state: { ...state, wilds: [...state.wilds, wild], nextWildId: state.nextWildId + 1 }, events: [event] }
}

export function processRespawns(state: HuntState, deps: EngineDeps): StepResult {
  const due = state.respawns.filter((r) => r.atTick <= state.tick)
  const pending = state.respawns.filter((r) => r.atTick > state.tick)
  return due.reduce<StepResult>(
    (acc, r) => { const next = spawnWild(acc.state, deps, r.spawnIndex); return { state: next.state, events: [...acc.events, ...next.events] } },
    { state: { ...state, respawns: pending }, events: [] },
  )
}
```

- [ ] **Step 4: Implementar `create.ts`**

```ts
import type { HuntMap } from '@pokeidle/shared'
import { CAPTURE_MAX_WILD_HP_DEFAULT, RETURN_HP_PERCENT_DEFAULT } from './constants.js'
import { processRespawns } from './spawn.js'
import type { EngineDeps, HuntSettings, HuntState, PokemonState } from './types.js'

export const defaultSettings = (seen: readonly string[] = []): HuntSettings => ({
  returnHpPercent: RETURN_HP_PERCENT_DEFAULT,
  capture: { ballTier: 'best', maxWildHpPercent: CAPTURE_MAX_WILD_HP_DEFAULT, allowDuplicates: false },
  seen,
})

export interface CreateInput {
  readonly hunt: HuntMap
  readonly team: readonly PokemonState[]
  readonly inventory: Readonly<Record<string, number>>
  readonly settings?: HuntSettings
}

export function createHuntState(input: CreateInput, deps: EngineDeps): HuntState {
  if (input.team.length === 0) throw new Error('time vazio')
  const respawns = input.hunt.spawns.flatMap((s, spawnIndex) => Array.from({ length: s.count }, () => ({ spawnIndex, atTick: 0 })))
  const initial: HuntState = {
    huntId: input.hunt.id, tick: 0,
    player: { team: input.team, activeIndex: 0, position: input.hunt.spawnPoint, path: [], mode: 'searching', targetWildId: null, healingUntilTick: null, cooldowns: {} },
    wilds: [], respawns, nextWildId: 1,
    trainer: { xp: 0, gold: 0 },
    inventory: input.inventory,
    settings: input.settings ?? defaultSettings(),
  }
  return processRespawns(initial, deps).state
}
```

`index.ts` ganha `export * from './spawn.js'` e `export * from './create.js'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): fixture mínima, spawn de selvagens e criação do estado da hunt"
```

---

### Task 3: `progression.ts`: XP, level up, evolução e derrota

**Files:**
- Create: `src/engine/progression.ts`
- Modify: `src/engine/index.ts`
- Test: `test/engine/progression.test.ts`

**Interfaces:**
- Consumes: `hpAt`, `levelFromXp`, `xpForLevel`, `nextEvolution`, `rollLoot`, `xpOnDefeat` do `shared`; `TICKS_PER_SECOND`.
- Produces:
  - `makePokemon(registry, id: string, speciesName: string, level: number): PokemonState` (xp = `xpForLevel`, hp cheio).
  - `gainXp(pokemon, amount, registry, tick): { pokemon: PokemonState; events: Event[] }` — novo nível por `levelFromXp` com a curva da espécie atual; um evento `levelUp` por nível ganho, em ordem; a cada nível ganho, `nextEvolution` → evento `evolved` e troca de espécie; `hpMax` recalculado ao final; `hp += hpMax_novo − hpMax_antigo`.
  - `applyDefeat(state, deps, wild: WildState): StepResult` — `xpOnDefeat` para `trainer.xp` e para o ativo (via `gainXp`), `rollLoot` (ouro e drops no inventário), selvagem removido, respawn `{ spawnIndex, atTick: tick + respawnSeconds * TICKS_PER_SECOND }`, jogador volta a `searching` com `targetWildId: null`, `path: []`. Eventos: `wildDefeated` primeiro, depois os de `gainXp`.

- [ ] **Step 1: Teste**

`test/engine/progression.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { xpForLevel } from '@pokeidle/shared'
import { applyDefeat, gainXp, makePokemon } from '../../src/engine/progression.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

describe('makePokemon', () => {
  it('cria com xp da curva e hp cheio', () => {
    const p = makePokemon(miniDeps().registry, 'x', 'charmander', 5)
    expect(p).toEqual({ id: 'x', speciesName: 'charmander', level: 5, xp: xpForLevel('medium-slow', 5), hp: 20, hpMax: 20 })
  })
})

describe('gainXp', () => {
  const registry = miniDeps().registry
  it('sem subir de nível só soma xp', () => {
    const r = gainXp(charmander5(), 10, registry, 7)
    expect(r.pokemon.level).toBe(5)
    expect(r.pokemon.xp).toBe(xpForLevel('medium-slow', 5) + 10)
    expect(r.events).toEqual([])
  })
  it('sobe vários níveis, evolui no 16 e aumenta o hp pelo delta do hpMax', () => {
    const start = { ...charmander5(), hp: 12 }
    const target = xpForLevel('medium-slow', 16)
    const r = gainXp(start, target - start.xp, registry, 3)
    expect(r.pokemon.level).toBe(16)
    expect(r.pokemon.speciesName).toBe('charmeleon')
    expect(r.events.filter((e) => e.type === 'levelUp')).toHaveLength(11)
    expect(r.events.find((e) => e.type === 'evolved')).toEqual({ type: 'evolved', tick: 3, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' })
    // charmeleon L16: hpAt(58,16) = floor(147*16/100)+16+10 = 23+26 = 49
    expect(r.pokemon.hpMax).toBe(49)
    expect(r.pokemon.hp).toBe(12 + (49 - 20))
  })
})

describe('applyDefeat', () => {
  it('dá xp, ouro e drops, agenda respawn e volta a searching', () => {
    const deps = miniDeps(3)
    const s = { ...baseState({}, deps), tick: 40, player: { ...baseState({}, deps).player, mode: 'fighting' as const, targetWildId: 1, path: [{ x: 1, y: 0 }] } }
    const wild = s.wilds[0]!
    const r = applyDefeat(s, deps, wild)
    expect(r.state.wilds).toEqual([])
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: 40 + 2 * 5 }])
    expect(r.state.trainer.xp).toBe(21) // floor(49*3/7)
    expect(r.state.player.team[0]!.xp).toBe(charmander5().xp + 21)
    expect(r.state.trainer.gold).toBeGreaterThanOrEqual(4)
    expect(r.state.trainer.gold).toBeLessThanOrEqual(9)
    expect(r.state.player).toMatchObject({ mode: 'searching', targetWildId: null, path: [] })
    expect(r.events[0]).toMatchObject({ type: 'wildDefeated', tick: 40, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21 })
  })
  it('drops entram no inventário', () => {
    const deps = { ...miniDeps(), rng: { next: () => 0, int: (min: number) => min } }
    const r = applyDefeat(baseState({}, deps), deps, baseState({}, deps).wilds[0]!)
    expect(r.state.inventory['potion']).toBe(2)
    expect(r.state.trainer.gold).toBe(4)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- progression`

- [ ] **Step 3: Implementar**

```ts
import { hpAt, levelFromXp, nextEvolution, rollLoot, xpForLevel, xpOnDefeat, type Registry, type Species } from '@pokeidle/shared'
import { TICKS_PER_SECOND } from './constants.js'
import type { EngineDeps, Event, HuntState, PokemonState, StepResult, WildState } from './types.js'

function speciesOf(registry: Registry, name: string): Species {
  const s = registry.species.get(name)
  if (!s) throw new Error(`espécie ${name} não existe no registro`)
  return s
}

export function makePokemon(registry: Registry, id: string, speciesName: string, level: number): PokemonState {
  const species = speciesOf(registry, speciesName)
  const hpMax = hpAt(species.baseStats.hp, level)
  return { id, speciesName, level, xp: xpForLevel(species.growthRate, level), hp: hpMax, hpMax }
}

export function gainXp(pokemon: PokemonState, amount: number, registry: Registry, tick: number): { pokemon: PokemonState; events: Event[] } {
  const xp = pokemon.xp + amount
  let species = speciesOf(registry, pokemon.speciesName)
  const newLevel = levelFromXp(species.growthRate, xp)
  const events: Event[] = []
  for (let level = pokemon.level + 1; level <= newLevel; level++) {
    events.push({ type: 'levelUp', tick, pokemonId: pokemon.id, level })
    const evo = nextEvolution(species, level, registry)
    if (evo) { events.push({ type: 'evolved', tick, pokemonId: pokemon.id, from: species.name, to: evo.name }); species = evo }
  }
  const hpMax = hpAt(species.baseStats.hp, newLevel)
  return { pokemon: { ...pokemon, xp, level: newLevel, speciesName: species.name, hpMax, hp: pokemon.hp + (hpMax - pokemon.hpMax) }, events }
}

function addItems(inventory: Readonly<Record<string, number>>, drops: readonly { item: string; quantity: number }[]): Record<string, number> {
  return drops.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.item]: (acc[d.item] ?? 0) + d.quantity }), { ...inventory })
}

export function applyDefeat(state: HuntState, deps: EngineDeps, wild: WildState): StepResult {
  const species = speciesOf(deps.registry, wild.speciesName)
  const xp = xpOnDefeat(species, wild.level)
  const active = state.player.team[state.player.activeIndex]
  if (!active) throw new Error('sem Pokémon ativo')
  const gained = gainXp(active, xp, deps.registry, state.tick)
  const loot = rollLoot(species, deps.registry.loot, deps.rng)
  const spawn = deps.hunt.spawns[wild.spawnIndex]
  if (!spawn) throw new Error(`spawn ${wild.spawnIndex} não existe`)
  const team = state.player.team.map((p, i) => (i === state.player.activeIndex ? gained.pokemon : p))
  const defeated: Event = { type: 'wildDefeated', tick: state.tick, wildId: wild.id, speciesName: wild.speciesName, level: wild.level, xpTrainer: xp, xpPokemon: xp, gold: loot.gold, drops: loot.drops }
  return {
    state: {
      ...state,
      wilds: state.wilds.filter((w) => w.id !== wild.id),
      respawns: [...state.respawns, { spawnIndex: wild.spawnIndex, atTick: state.tick + spawn.respawnSeconds * TICKS_PER_SECOND }],
      trainer: { xp: state.trainer.xp + xp, gold: state.trainer.gold + loot.gold },
      inventory: addItems(state.inventory, loot.drops),
      player: { ...state.player, team, mode: 'searching', targetWildId: null, path: [] },
    },
    events: [defeated, ...gained.events],
  }
}
```

`index.ts`: `export * from './progression.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): progressão: xp, level up, evolução e derrota de selvagem"
```

---

### Task 4: `combat.ts`: ataques, escolha de golpe e captura

**Files:**
- Create: `src/engine/combat.ts`
- Modify: `src/engine/index.ts`
- Test: `test/engine/combat.test.ts`

**Interfaces:**
- Consumes: `statsAt`, `availableMoves`, `cooldownTicks`, `bestMove`, `expectedDamage`, `computeDamage`, `rollCapture`, `xpForLevel`, tipos `Combatant`, `Move`, `Item` do `shared`; `makePokemon`; `TICKS_PER_SECOND`, `BALL_ITEM_BY_TIER`, `MAX_TEAM_SIZE`.
- Produces:
  - `combatantOf(registry, speciesName, level): Combatant`
  - `readyMoves(registry, speciesName, level, cooldowns, tick): Move[]` (`availableMoves` filtrado por `(cooldowns[name] ?? 0) <= tick`).
  - `type AttackOutcome = 'hit' | 'none' | 'immune'`; `interface AttackResult extends StepResult { outcome: AttackOutcome }`.
  - `playerAttack(state, deps, wild): AttackResult` — sem golpe pronto → `none`; `expectedDamage` do melhor golpe 0 → `immune` (sem evento); senão aplica dano ao selvagem (`hp` mínimo 0), registra cooldown, evento `attack` com `attacker 'player'`, `attackerId` = id do ativo, `targetId` = `String(wild.id)`.
  - `wildAttack(state, deps, wild): AttackResult` — simétrico contra o ativo; cooldowns do selvagem.
  - `selectBall(state, registry): Item | null` — tier fixo: item `BALL_ITEM_BY_TIER[tier]` se `inventory > 0`; `best`: entre itens `kind === 'ball'` com quantidade > 0, o de maior `ballBonus`.
  - `captureApplies(state, registry, wild): Item | null` — regras da spec §5, devolve a bola ou `null`.
  - `attemptCapture(state, deps, wild, ball): StepResult` — consome a bola; `rollCapture`; sucesso → Pokémon `{ id: \`wild-${wild.id}\`, speciesName, level, xp: xpForLevel, hp: wild.hp, hpMax }` entra no time se `team.length < MAX_TEAM_SIZE` (senão `toBox: true`, não entra), `seen` ganha a espécie, selvagem removido, respawn agendado, jogador `searching`, evento `captured`; falha → `captureTried: true`, evento `captureFailed`.

- [ ] **Step 1: Teste**

`test/engine/combat.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { attemptCapture, captureApplies, playerAttack, readyMoves, selectBall, wildAttack } from '../../src/engine/combat.js'
import { makePokemon } from '../../src/engine/progression.js'
import { baseState, miniDeps } from './fixtures/mini.js'

const fixed = (v: number) => ({ next: () => v, int: (min: number) => min })
const fighting = (deps = miniDeps()) => { const s = baseState({}, deps); return { ...s, tick: 100, player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, position: { x: 3, y: 0 } } } }

describe('readyMoves', () => {
  it('filtra pelo cooldown', () => {
    const r = miniDeps().registry
    expect(readyMoves(r, 'charmander', 5, {}, 0).map((m) => m.name)).toEqual(['scratch', 'ember'])
    expect(readyMoves(r, 'charmander', 5, { ember: 101 }, 100).map((m) => m.name)).toEqual(['scratch'])
    expect(readyMoves(r, 'charmander', 5, { ember: 100 }, 100).map((m) => m.name)).toEqual(['scratch', 'ember'])
  })
})

describe('playerAttack', () => {
  it('usa o melhor golpe, aplica dano, registra cooldown e emite attack', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = fighting(deps)
    const r = playerAttack(s, deps, s.wilds[0]!)
    expect(r.outcome).toBe('hit')
    expect(r.state.wilds[0]!.hp).toBe(16 - 9) // ember: bruto 6 x STAB 1,5
    expect(r.state.player.cooldowns).toEqual({ ember: 110 })
    expect(r.events).toEqual([{ type: 'attack', tick: 100, attacker: 'player', attackerId: 'p1', targetId: '1', move: 'ember', damage: 9, targetHp: 7 }])
  })
  it('com ember em cooldown usa scratch; sem golpe pronto devolve none', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = fighting(deps)
    const withCd = { ...s, player: { ...s.player, cooldowns: { ember: 110 } } }
    expect(playerAttack(withCd, deps, s.wilds[0]!).events[0]).toMatchObject({ move: 'scratch', damage: 6 })
    const allCd = { ...s, player: { ...s.player, cooldowns: { ember: 110, scratch: 110 } } }
    const none = playerAttack(allCd, deps, s.wilds[0]!)
    expect(none.outcome).toBe('none')
    expect(none.state).toBe(allCd)
  })
  it('alvo imune devolve immune sem evento e sem mudar o estado', () => {
    const deps = miniDeps()
    const s = fighting(deps)
    const magnemite = makePokemon(deps.registry, 'm1', 'magnemite', 5)
    const gastly = { ...s.wilds[0]!, speciesName: 'gastly' }
    const st = { ...s, player: { ...s.player, team: [magnemite] }, wilds: [gastly] }
    const r = playerAttack(st, deps, gastly)
    expect(r.outcome).toBe('immune')
    expect(r.events).toEqual([])
    expect(r.state).toBe(st)
  })
})

describe('wildAttack', () => {
  it('zubat L3 leech-life em charmander L5 tira 5 com rng 1', () => {
    const deps = { ...miniDeps(), rng: fixed(1) }
    const s = fighting(deps)
    const r = wildAttack(s, deps, s.wilds[0]!)
    expect(r.outcome).toBe('hit')
    expect(r.state.player.team[0]!.hp).toBe(20 - 5)
    expect(r.state.wilds[0]!.cooldowns).toEqual({ 'leech-life': 120 })
    expect(r.events[0]).toMatchObject({ attacker: 'wild', attackerId: '1', targetId: 'p1', move: 'leech-life', damage: 5, targetHp: 15 })
  })
})

describe('captura', () => {
  it('selectBall respeita tier fixo e best', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    expect(selectBall(s, deps.registry)?.id).toBe('poke-ball') // best entre {poke-ball: 2}
    expect(selectBall({ ...s, inventory: { 'poke-ball': 1, 'great-ball': 1 } }, deps.registry)?.id).toBe('great-ball')
    const fixedTier = { ...s, settings: { ...s.settings, capture: { ...s.settings.capture, ballTier: 'ultra' as const } } }
    expect(selectBall(fixedTier, deps.registry)).toBeNull()
    expect(selectBall({ ...s, inventory: {} }, deps.registry)).toBeNull()
  })
  it('captureApplies exige hp baixo, espécie nova (ou allowDuplicates), bola e sem tentativa anterior', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const wild = s.wilds[0]!
    expect(captureApplies(s, deps.registry, wild)).toBeNull() // hp cheio
    const low = { ...wild, hp: 4 } // 25 %
    expect(captureApplies(s, deps.registry, low)?.id).toBe('poke-ball')
    expect(captureApplies({ ...s, settings: { ...s.settings, seen: ['zubat'] } }, deps.registry, low)).toBeNull()
    expect(captureApplies({ ...s, settings: { ...s.settings, seen: ['zubat'], capture: { ...s.settings.capture, allowDuplicates: true } } }, deps.registry, low)?.id).toBe('poke-ball')
    expect(captureApplies(s, deps.registry, { ...low, captureTried: true })).toBeNull()
    expect(captureApplies({ ...s, inventory: {} }, deps.registry, low)).toBeNull()
  })
  it('sucesso: consome a bola, entra no time, marca seen, remove e reagenda', () => {
    const deps = { ...miniDeps(), rng: fixed(0) }
    const s = { ...fighting(deps), tick: 50 }
    const low = { ...s.wilds[0]!, hp: 4 }
    const ball = deps.registry.items.get('poke-ball')!
    const r = attemptCapture({ ...s, wilds: [low] }, deps, low, ball)
    expect(r.state.inventory['poke-ball']).toBe(1)
    expect(r.state.player.team).toHaveLength(2)
    expect(r.state.player.team[1]).toMatchObject({ id: 'wild-1', speciesName: 'zubat', level: 3, hp: 4, hpMax: 16 })
    expect(r.state.settings.seen).toEqual(['zubat'])
    expect(r.state.wilds).toEqual([])
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: 60 }])
    expect(r.state.player.mode).toBe('searching')
    expect(r.events).toEqual([{ type: 'captured', tick: 50, wildId: 1, speciesName: 'zubat', level: 3, ball: 'poke-ball', toBox: false }])
  })
  it('falha: consome a bola, marca captureTried e o selvagem fica', () => {
    const deps = { ...miniDeps(), rng: fixed(0.99) }
    const s = fighting(deps)
    const low = { ...s.wilds[0]!, hp: 4 }
    const r = attemptCapture({ ...s, wilds: [low] }, deps, low, deps.registry.items.get('poke-ball')!)
    expect(r.state.inventory['poke-ball']).toBe(1)
    expect(r.state.wilds[0]).toMatchObject({ id: 1, captureTried: true })
    expect(r.state.player.team).toHaveLength(1)
    expect(r.events).toEqual([{ type: 'captureFailed', tick: 100, wildId: 1, ball: 'poke-ball' }])
  })
  it('time cheio: captura vai para a box', () => {
    const deps = { ...miniDeps(), rng: fixed(0) }
    const s = fighting(deps)
    const team = Array.from({ length: 6 }, (_, i) => ({ ...s.player.team[0]!, id: `p${i}` }))
    const low = { ...s.wilds[0]!, hp: 4 }
    const r = attemptCapture({ ...s, wilds: [low], player: { ...s.player, team } }, deps, low, deps.registry.items.get('poke-ball')!)
    expect(r.state.player.team).toHaveLength(6)
    expect(r.events[0]).toMatchObject({ type: 'captured', toBox: true })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- combat`

- [ ] **Step 3: Implementar**

```ts
import { availableMoves, bestMove, computeDamage, cooldownTicks, expectedDamage, rollCapture, statsAt, xpForLevel, type Combatant, type Item, type Move, type Registry } from '@pokeidle/shared'
import { BALL_ITEM_BY_TIER, MAX_TEAM_SIZE, TICKS_PER_SECOND } from './constants.js'
import type { EngineDeps, Event, HuntState, PokemonState, StepResult, WildState } from './types.js'

export type AttackOutcome = 'hit' | 'none' | 'immune'
export interface AttackResult extends StepResult { readonly outcome: AttackOutcome }

function species(registry: Registry, name: string) {
  const s = registry.species.get(name)
  if (!s) throw new Error(`espécie ${name} não existe no registro`)
  return s
}

export function combatantOf(registry: Registry, speciesName: string, level: number): Combatant {
  const s = species(registry, speciesName)
  return { level, types: s.types, stats: statsAt(s.baseStats, level) }
}

export function readyMoves(registry: Registry, speciesName: string, level: number, cooldowns: Readonly<Record<string, number>>, tick: number): Move[] {
  return availableMoves(species(registry, speciesName), level, registry.moves).filter((m) => (cooldowns[m.name] ?? 0) <= tick)
}

interface Strike { readonly move: Move; readonly damage: number }

function strike(deps: EngineDeps, tick: number, attacker: { speciesName: string; level: number; cooldowns: Readonly<Record<string, number>> }, defender: { speciesName: string; level: number }): { outcome: AttackOutcome; strike?: Strike } {
  const ready = readyMoves(deps.registry, attacker.speciesName, attacker.level, attacker.cooldowns, tick)
  if (ready.length === 0) return { outcome: 'none' }
  const atk = combatantOf(deps.registry, attacker.speciesName, attacker.level)
  const def = combatantOf(deps.registry, defender.speciesName, defender.level)
  const move = bestMove(ready, atk, def, deps.registry.typeChart)
  if (!move || expectedDamage(atk, def, move, deps.registry.typeChart) === 0) return { outcome: 'immune' }
  return { outcome: 'hit', strike: { move, damage: computeDamage({ attacker: atk, defender: def, move, chart: deps.registry.typeChart, rng: deps.rng }) } }
}

const activeOf = (state: HuntState): PokemonState => {
  const p = state.player.team[state.player.activeIndex]
  if (!p) throw new Error('sem Pokémon ativo')
  return p
}

export function playerAttack(state: HuntState, deps: EngineDeps, wild: WildState): AttackResult {
  const active = activeOf(state)
  const result = strike(deps, state.tick, { ...active, cooldowns: state.player.cooldowns }, wild)
  if (result.outcome !== 'hit' || !result.strike) return { state, events: [], outcome: result.outcome }
  const { move, damage } = result.strike
  const hp = Math.max(0, wild.hp - damage)
  const event: Event = { type: 'attack', tick: state.tick, attacker: 'player', attackerId: active.id, targetId: String(wild.id), move: move.name, damage, targetHp: hp }
  return {
    state: {
      ...state,
      wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, hp } : w)),
      player: { ...state.player, cooldowns: { ...state.player.cooldowns, [move.name]: state.tick + cooldownTicks(move) } },
    },
    events: [event], outcome: 'hit',
  }
}

export function wildAttack(state: HuntState, deps: EngineDeps, wild: WildState): AttackResult {
  const active = activeOf(state)
  const result = strike(deps, state.tick, wild, active)
  if (result.outcome !== 'hit' || !result.strike) return { state, events: [], outcome: result.outcome }
  const { move, damage } = result.strike
  const hp = Math.max(0, active.hp - damage)
  const team = state.player.team.map((p, i) => (i === state.player.activeIndex ? { ...p, hp } : p))
  const event: Event = { type: 'attack', tick: state.tick, attacker: 'wild', attackerId: String(wild.id), targetId: active.id, move: move.name, damage, targetHp: hp }
  return {
    state: {
      ...state,
      player: { ...state.player, team },
      wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, cooldowns: { ...w.cooldowns, [move.name]: state.tick + cooldownTicks(move) } } : w)),
    },
    events: [event], outcome: 'hit',
  }
}

export function selectBall(state: HuntState, registry: Registry): Item | null {
  const tier = state.settings.capture.ballTier
  const has = (id: string) => (state.inventory[id] ?? 0) > 0
  if (tier !== 'best') { const item = registry.items.get(BALL_ITEM_BY_TIER[tier]); return item && item.kind === 'ball' && has(item.id) ? item : null }
  const balls = [...registry.items.values()].filter((i): i is Item & { kind: 'ball' } => i.kind === 'ball' && has(i.id))
  return balls.reduce<Item | null>((best, i) => (best === null || (best.kind === 'ball' && i.ballBonus > best.ballBonus) ? i : best), null)
}

export function captureApplies(state: HuntState, registry: Registry, wild: WildState): Item | null {
  if (wild.captureTried) return null
  if ((wild.hp / wild.hpMax) * 100 > state.settings.capture.maxWildHpPercent) return null
  if (!state.settings.capture.allowDuplicates && state.settings.seen.includes(wild.speciesName)) return null
  return selectBall(state, registry)
}

export function attemptCapture(state: HuntState, deps: EngineDeps, wild: WildState, ball: Item): StepResult {
  if (ball.kind !== 'ball') throw new Error(`${ball.id} não é uma bola`)
  const s = species(deps.registry, wild.speciesName)
  const inventory = { ...state.inventory, [ball.id]: (state.inventory[ball.id] ?? 0) - 1 }
  const caught = rollCapture({ captureRate: s.captureRate, hpMax: wild.hpMax, hpCurrent: wild.hp, ballBonus: ball.ballBonus }, deps.rng)
  if (!caught) {
    return {
      state: { ...state, inventory, wilds: state.wilds.map((w) => (w.id === wild.id ? { ...w, captureTried: true } : w)) },
      events: [{ type: 'captureFailed', tick: state.tick, wildId: wild.id, ball: ball.id }],
    }
  }
  const spawn = deps.hunt.spawns[wild.spawnIndex]
  if (!spawn) throw new Error(`spawn ${wild.spawnIndex} não existe`)
  const toBox = state.player.team.length >= MAX_TEAM_SIZE
  const pokemon: PokemonState = { id: `wild-${wild.id}`, speciesName: wild.speciesName, level: wild.level, xp: xpForLevel(s.growthRate, wild.level), hp: wild.hp, hpMax: wild.hpMax }
  const seen = state.settings.seen.includes(wild.speciesName) ? state.settings.seen : [...state.settings.seen, wild.speciesName]
  return {
    state: {
      ...state, inventory,
      wilds: state.wilds.filter((w) => w.id !== wild.id),
      respawns: [...state.respawns, { spawnIndex: wild.spawnIndex, atTick: state.tick + spawn.respawnSeconds * TICKS_PER_SECOND }],
      settings: { ...state.settings, seen },
      player: { ...state.player, team: toBox ? state.player.team : [...state.player.team, pokemon], mode: 'searching', targetWildId: null, path: [] },
    },
    events: [{ type: 'captured', tick: state.tick, wildId: wild.id, speciesName: wild.speciesName, level: wild.level, ball: ball.id, toBox }],
  }
}
```

`index.ts`: `export * from './combat.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): combate com cooldown, escolha de golpe e captura configurável"
```

---

### Task 5: `items.ts`, `player.ts` e `step.ts`: modos do jogador e o tick

**Files:**
- Create: `src/engine/items.ts`, `src/engine/player.ts`, `src/engine/step.ts`
- Modify: `src/engine/types.ts` (adicionar `skippedWildIds: readonly number[]` em `PlayerState`), `src/engine/create.ts` (`skippedWildIds: []`), `src/engine/index.ts`
- Test: `test/engine/step.test.ts`

**Interfaces:**
- Consumes: `findPath`, `isAdjacent`, `samePoint`, `isWalkable`, `blockedAt`, `processRespawns`, `playerAttack`, `wildAttack`, `captureApplies`, `attemptCapture`, `applyDefeat`, `HEAL_TICKS`.
- Produces (`items.ts`): `weakestPotion(state, registry): Item | null` (menor `healPercent` com quantidade > 0), `applyPotion(state, registry, itemId): StepResult | { error: EngineError }` (erros: `unknown-item`, `not-a-potion`, `out-of-stock`, `full-hp`; cura `min(hpMax, hp + ceil(hpMax * healPercent / 100))`, consome 1, evento `itemUsed`).
- Produces (`player.ts`): `pickTarget(state, deps): { wildId: number; path: Point[] } | null` (selvagens vivos não em `skippedWildIds`, caminho A* até tile adjacente com `isBlocked = blockedAt || ocupado por outro selvagem`; menor caminho, empate menor id), `stepPlayer(state, deps): StepResult` conforme §3 da spec: `searching` → escolhe alvo (`fighting` se já adjacente, senão `walking`); `walking` → alvo sumiu → `searching`; próximo tile não caminhável → recalcula (sem caminho → `searching`); move 1 tile com evento `moved`; adjacente → `fighting`; `fighting` → alvo sumiu → `searching`; captura aplicável → `attemptCapture`; senão `playerAttack`: `immune` → `skippedWildIds` ganha o id, `searching`, evento `skipped`; `returning` → caminho até o `pokecenter` (objetivo: mesmo tile ou adjacente), 1 tile por tick; chegou → `healing` com `healingUntilTick = tick + HEAL_TICKS`; `healing` → ao vencer o prazo, time com `hp = hpMax`, `searching`, evento `healed`; `stopped` → nada.
- Produces (`step.ts`): `step(state, deps): StepResult` — `processRespawns` → `stepPlayer` → se `fighting` e alvo vivo e adjacente, `wildAttack` → `resolveConsequences` → `tick + 1`. `resolveConsequences(state, deps): StepResult` exportada: (1) cada selvagem com `hp <= 0` → `applyDefeat`; (2) ativo com `hp <= 0` → evento `pokemonFainted`; próximo com `hp > 0` vira ativo com `cooldowns: {}` e evento `switched`, senão `stopped` com evento `stopped { reason: 'team-fainted' }` (`targetWildId: null`, `path: []`); (3) ativo com `hp > 0`, modo `searching | walking | fighting` e `hp / hpMax * 100 < returnHpPercent` → `weakestPotion` → `applyPotion`, senão modo `returning` com `targetWildId: null`, `path: []` e evento `returning`.

- [ ] **Step 1: Teste**

`test/engine/step.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyPotion, weakestPotion } from '../../src/engine/items.js'
import { pickTarget, stepPlayer } from '../../src/engine/player.js'
import { resolveConsequences, step } from '../../src/engine/step.js'
import type { HuntState } from '../../src/engine/types.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

function run(state: HuntState, deps = miniDeps(), ticks = 1) {
  let cur = { state, events: [] as readonly unknown[] }
  for (let i = 0; i < ticks; i++) { const r = step(cur.state, deps); cur = { state: r.state, events: [...cur.events, ...r.events] } }
  return cur
}

describe('pickTarget e caminhada', () => {
  it('escolhe o zubat e traça caminho até ficar adjacente', () => {
    const deps = miniDeps()
    const t = pickTarget(baseState({}, deps), deps)
    expect(t).toEqual({ wildId: 1, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] })
  })
  it('searching → walking → fighting em 4 ticks, com eventos moved', () => {
    const deps = miniDeps()
    const r = run(baseState({}, deps), deps, 4)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.state.player.position).toEqual({ x: 3, y: 0 })
    expect(r.events.filter((e) => (e as { type: string }).type === 'moved')).toHaveLength(3)
    expect(r.state.tick).toBe(4)
  })
  it('sem selvagens fica searching parado', () => {
    const deps = miniDeps()
    const r = stepPlayer({ ...baseState({}, deps), wilds: [] }, deps)
    expect(r.state.player.mode).toBe('searching')
    expect(r.events).toEqual([])
  })
})

describe('combate até a derrota e respawn', () => {
  it('derrota o zubat, agenda respawn e ele volta', () => {
    const deps = miniDeps(1)
    const r = run(baseState({}, deps), deps, 60)
    const defeated = r.events.filter((e) => (e as { type: string }).type === 'wildDefeated')
    expect(defeated.length).toBeGreaterThanOrEqual(1)
    expect(r.events.filter((e) => (e as { type: string }).type === 'spawned').length).toBeGreaterThanOrEqual(1)
    expect(r.state.trainer.xp).toBeGreaterThan(0)
    expect(r.state.player.team[0]!.hp).toBeGreaterThan(0)
  })
  it('é determinístico para a mesma seed', () => {
    const a = run(baseState({}, miniDeps(7)), miniDeps(7), 100)
    const b = run(baseState({}, miniDeps(7)), miniDeps(7), 100)
    expect(a.state).toEqual(b.state)
    expect(a.events).toEqual(b.events)
  })
})

describe('resolveConsequences', () => {
  it('usa a poção mais fraca quando o hp cai abaixo do limite', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const low = { ...s, player: { ...s.player, mode: 'fighting' as const, team: [{ ...charmander5(), hp: 5 }] }, inventory: { potion: 1, 'super-potion': 1 } }
    expect(weakestPotion(low, deps.registry)?.id).toBe('potion')
    const r = resolveConsequences(low, deps)
    expect(r.state.player.team[0]!.hp).toBe(9) // 5 + ceil(20*20/100)
    expect(r.state.inventory['potion']).toBe(0)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.events).toEqual([{ type: 'itemUsed', tick: 0, itemId: 'potion', pokemonId: 'p1', hp: 9 }])
  })
  it('sem poção entra em returning', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const low = { ...s, player: { ...s.player, mode: 'fighting' as const, targetWildId: 1, team: [{ ...charmander5(), hp: 5 }] }, inventory: {} }
    const r = resolveConsequences(low, deps)
    expect(r.state.player).toMatchObject({ mode: 'returning', targetWildId: null, path: [] })
    expect(r.events).toEqual([{ type: 'returning', tick: 0 }])
  })
  it('ativo caído troca para o próximo; time inteiro caído para', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const two = { ...s, player: { ...s.player, mode: 'fighting' as const, cooldowns: { ember: 9 }, team: [{ ...charmander5(), hp: 0 }, { ...charmander5(), id: 'p2' }] } }
    const r = resolveConsequences(two, deps)
    expect(r.state.player.activeIndex).toBe(1)
    expect(r.state.player.cooldowns).toEqual({})
    expect(r.events.map((e) => e.type)).toEqual(['pokemonFainted', 'switched'])
    const one = { ...s, player: { ...s.player, mode: 'fighting' as const, team: [{ ...charmander5(), hp: 0 }] } }
    const r2 = resolveConsequences(one, deps)
    expect(r2.state.player.mode).toBe('stopped')
    expect(r2.events.map((e) => e.type)).toEqual(['pokemonFainted', 'stopped'])
  })
})

describe('returning e healing', () => {
  it('anda até o Centro, cura o time em 25 ticks e volta a searching', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const start = { ...s, wilds: [], player: { ...s.player, mode: 'returning' as const, team: [{ ...charmander5(), hp: 5 }] }, inventory: {} }
    const r = run(start, deps, 8) // (0,0) → adjacente de (4,4) são 7 passos
    expect(r.state.player.mode).toBe('healing')
    expect(r.state.player.healingUntilTick).toBe(r.state.tick - 1 + 25)
    const healed = run(r.state, deps, 26)
    expect(healed.state.player.mode).toBe('searching')
    expect(healed.state.player.team[0]!.hp).toBe(20)
    expect(healed.events.some((e) => (e as { type: string }).type === 'healed')).toBe(true)
  })
})

describe('alvo imune', () => {
  it('pula o selvagem e não fica preso', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    const magnemite = { id: 'm1', speciesName: 'magnemite', level: 5, xp: 0, hp: 30, hpMax: 30 }
    const gastly = { ...s.wilds[0]!, speciesName: 'gastly' }
    const st = { ...s, wilds: [gastly], player: { ...s.player, team: [magnemite] } }
    const r = run(st, deps, 6)
    expect(r.events.some((e) => (e as { type: string }).type === 'skipped')).toBe(true)
    expect(r.state.player.skippedWildIds).toEqual([1])
    expect(r.state.player.mode).toBe('searching')
  })
})

describe('applyPotion', () => {
  it('valida item, estoque e hp cheio', () => {
    const deps = miniDeps()
    const s = baseState({}, deps)
    expect(applyPotion(s, deps.registry, 'nope')).toEqual({ error: { code: 'unknown-item', message: expect.any(String) } })
    expect(applyPotion(s, deps.registry, 'poke-ball')).toMatchObject({ error: { code: 'not-a-potion' } })
    expect(applyPotion({ ...s, inventory: {} }, deps.registry, 'potion')).toMatchObject({ error: { code: 'out-of-stock' } })
    expect(applyPotion(s, deps.registry, 'potion')).toMatchObject({ error: { code: 'full-hp' } })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- step`

- [ ] **Step 3: Tipos e `create.ts`**

Em `types.ts`, `PlayerState` ganha `readonly skippedWildIds: readonly number[]`. Em `create.ts`, o `player` inicial ganha `skippedWildIds: []`.

- [ ] **Step 4: Implementar `items.ts`**

```ts
import type { Item, Registry } from '@pokeidle/shared'
import type { EngineError, HuntState, StepResult } from './types.js'

export function weakestPotion(state: HuntState, registry: Registry): Item | null {
  const potions = [...registry.items.values()].filter((i): i is Item & { kind: 'potion' } => i.kind === 'potion' && (state.inventory[i.id] ?? 0) > 0)
  return potions.reduce<(Item & { kind: 'potion' }) | null>((best, i) => (best === null || i.healPercent < best.healPercent ? i : best), null)
}

const fail = (code: string, message: string): { error: EngineError } => ({ error: { code, message } })

export function applyPotion(state: HuntState, registry: Registry, itemId: string): StepResult | { error: EngineError } {
  const item = registry.items.get(itemId)
  if (!item) return fail('unknown-item', `item ${itemId} não existe`)
  if (item.kind !== 'potion') return fail('not-a-potion', `${itemId} não é poção`)
  if ((state.inventory[itemId] ?? 0) <= 0) return fail('out-of-stock', `sem ${itemId} no inventário`)
  const active = state.player.team[state.player.activeIndex]
  if (!active) return fail('no-active', 'sem Pokémon ativo')
  if (active.hp >= active.hpMax) return fail('full-hp', 'HP já está cheio')
  const hp = Math.min(active.hpMax, active.hp + Math.ceil((active.hpMax * item.healPercent) / 100))
  const team = state.player.team.map((p, i) => (i === state.player.activeIndex ? { ...p, hp } : p))
  return {
    state: { ...state, inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) - 1 }, player: { ...state.player, team } },
    events: [{ type: 'itemUsed', tick: state.tick, itemId, pokemonId: active.id, hp }],
  }
}
```

- [ ] **Step 5: Implementar `player.ts`**

```ts
import { HEAL_TICKS } from './constants.js'
import { attemptCapture, captureApplies, playerAttack } from './combat.js'
import { findPath, isAdjacent, samePoint } from './grid.js'
import { blockedAt, isWalkable } from './spawn.js'
import type { EngineDeps, Event, HuntState, PlayerState, Point, StepResult, WildState } from './types.js'

const withPlayer = (state: HuntState, patch: Partial<PlayerState>): HuntState => ({ ...state, player: { ...state.player, ...patch } })
const idle = (state: HuntState): StepResult => ({ state, events: [] })
const toSearching = (state: HuntState): HuntState => withPlayer(state, { mode: 'searching', targetWildId: null, path: [] })

function pathTo(state: HuntState, deps: EngineDeps, target: Point, isGoal: (p: Point) => boolean, ignoreWildId: number | null): Point[] | null {
  const isBlocked = (p: Point): boolean => blockedAt(deps.hunt, p) || state.wilds.some((w) => w.id !== ignoreWildId && samePoint(w.position, p)) || (ignoreWildId !== null && samePoint(target, p))
  return findPath({ from: state.player.position, target, isBlocked, isGoal, width: deps.hunt.width, height: deps.hunt.height })
}

export function pickTarget(state: HuntState, deps: EngineDeps): { wildId: number; path: Point[] } | null {
  const candidates = state.wilds.filter((w) => w.hp > 0 && !state.player.skippedWildIds.includes(w.id))
  let best: { wildId: number; path: Point[] } | null = null
  for (const w of [...candidates].sort((a, b) => a.id - b.id)) {
    const path = pathTo(state, deps, w.position, (p) => isAdjacent(p, w.position), w.id)
    if (path && (best === null || path.length < best.path.length)) best = { wildId: w.id, path }
  }
  return best
}

const targetOf = (state: HuntState): WildState | undefined => state.wilds.find((w) => w.id === state.player.targetWildId && w.hp > 0)

function searching(state: HuntState, deps: EngineDeps): StepResult {
  const target = pickTarget(state, deps)
  if (!target) return idle(state)
  return idle(withPlayer(state, { targetWildId: target.wildId, path: target.path, mode: target.path.length === 0 ? 'fighting' : 'walking' }))
}

function advance(state: HuntState, next: Point, rest: readonly Point[]): StepResult {
  const from = state.player.position
  const event: Event = { type: 'moved', tick: state.tick, from, to: next }
  return { state: withPlayer(state, { position: next, path: rest }), events: [event] }
}

function walking(state: HuntState, deps: EngineDeps): StepResult {
  const wild = targetOf(state)
  if (!wild) return idle(toSearching(state))
  const [next, ...rest] = state.player.path
  if (!next) return isAdjacent(state.player.position, wild.position) ? idle(withPlayer(state, { mode: 'fighting' })) : idle(toSearching(state))
  if (!isWalkable(state, deps.hunt, next)) {
    const path = pathTo(state, deps, wild.position, (p) => isAdjacent(p, wild.position), wild.id)
    return path === null ? idle(toSearching(state)) : idle(withPlayer(state, { path }))
  }
  const moved = advance(state, next, rest)
  const arrived = isAdjacent(next, wild.position)
  return { state: arrived ? withPlayer(moved.state, { mode: 'fighting', path: [] }) : moved.state, events: moved.events }
}

function fighting(state: HuntState, deps: EngineDeps): StepResult {
  const wild = targetOf(state)
  if (!wild) return idle(toSearching(state))
  if (!isAdjacent(state.player.position, wild.position)) return idle(withPlayer(state, { mode: 'walking', path: [] }))
  const ball = captureApplies(state, deps.registry, wild)
  if (ball) return attemptCapture(state, deps, wild, ball)
  const attack = playerAttack(state, deps, wild)
  if (attack.outcome !== 'immune') return attack
  const skipped: Event = { type: 'skipped', tick: state.tick, wildId: wild.id }
  return { state: toSearching(withPlayer(state, { skippedWildIds: [...state.player.skippedWildIds, wild.id] })), events: [skipped] }
}

function returning(state: HuntState, deps: EngineDeps): StepResult {
  const center = deps.hunt.pokecenter
  const atCenter = (p: Point) => samePoint(p, center) || isAdjacent(p, center)
  if (atCenter(state.player.position)) return idle(withPlayer(state, { mode: 'healing', healingUntilTick: state.tick + HEAL_TICKS, path: [] }))
  const path = state.player.path.length > 0 ? state.player.path : pathTo(state, deps, center, atCenter, null)
  const [next, ...rest] = path ?? []
  if (!next || !isWalkable(state, deps.hunt, next)) return idle(withPlayer(state, { path: [] }))
  return advance(state, next, rest)
}

function healing(state: HuntState): StepResult {
  if (state.player.healingUntilTick === null || state.tick < state.player.healingUntilTick) return idle(state)
  const team = state.player.team.map((p) => ({ ...p, hp: p.hpMax }))
  return { state: withPlayer(state, { team, mode: 'searching', healingUntilTick: null }), events: [{ type: 'healed', tick: state.tick }] }
}

export function stepPlayer(state: HuntState, deps: EngineDeps): StepResult {
  switch (state.player.mode) {
    case 'searching': return searching(state, deps)
    case 'walking': return walking(state, deps)
    case 'fighting': return fighting(state, deps)
    case 'returning': return returning(state, deps)
    case 'healing': return healing(state)
    case 'stopped': return idle(state)
  }
}
```

- [ ] **Step 6: Implementar `step.ts`**

```ts
import { wildAttack } from './combat.js'
import { isAdjacent } from './grid.js'
import { applyPotion, weakestPotion } from './items.js'
import { stepPlayer } from './player.js'
import { applyDefeat } from './progression.js'
import { processRespawns } from './spawn.js'
import type { EngineDeps, Event, HuntState, StepResult } from './types.js'

const chain = (a: StepResult, f: (s: HuntState) => StepResult): StepResult => { const b = f(a.state); return { state: b.state, events: [...a.events, ...b.events] } }

function engagedWildAttack(state: HuntState, deps: EngineDeps): StepResult {
  if (state.player.mode !== 'fighting') return { state, events: [] }
  const wild = state.wilds.find((w) => w.id === state.player.targetWildId)
  if (!wild || wild.hp <= 0 || !isAdjacent(state.player.position, wild.position)) return { state, events: [] }
  return wildAttack(state, deps, wild)
}

function resolveDefeats(state: HuntState, deps: EngineDeps): StepResult {
  return state.wilds.filter((w) => w.hp <= 0).reduce<StepResult>((acc, w) => chain(acc, (s) => applyDefeat(s, deps, w)), { state, events: [] })
}

function resolveFaint(state: HuntState): StepResult {
  const active = state.player.team[state.player.activeIndex]
  if (!active || active.hp > 0) return { state, events: [] }
  const fainted: Event = { type: 'pokemonFainted', tick: state.tick, pokemonId: active.id }
  const next = state.player.team.findIndex((p) => p.hp > 0)
  if (next === -1) {
    return { state: { ...state, player: { ...state.player, mode: 'stopped', targetWildId: null, path: [] } }, events: [fainted, { type: 'stopped', tick: state.tick, reason: 'team-fainted' }] }
  }
  const switched: Event = { type: 'switched', tick: state.tick, pokemonId: state.player.team[next]!.id }
  return { state: { ...state, player: { ...state.player, activeIndex: next, cooldowns: {} } }, events: [fainted, switched] }
}

function resolveLowHp(state: HuntState, deps: EngineDeps): StepResult {
  const active = state.player.team[state.player.activeIndex]
  const mode = state.player.mode
  if (!active || active.hp <= 0 || !(mode === 'searching' || mode === 'walking' || mode === 'fighting')) return { state, events: [] }
  if ((active.hp / active.hpMax) * 100 >= state.settings.returnHpPercent) return { state, events: [] }
  const potion = weakestPotion(state, deps.registry)
  if (potion) { const r = applyPotion(state, deps.registry, potion.id); if ('error' in r) throw new Error(r.error.message); return r }
  return { state: { ...state, player: { ...state.player, mode: 'returning', targetWildId: null, path: [] } }, events: [{ type: 'returning', tick: state.tick }] }
}

export function resolveConsequences(state: HuntState, deps: EngineDeps): StepResult {
  return chain(chain(resolveDefeats(state, deps), resolveFaint), (s) => resolveLowHp(s, deps))
}

export function step(state: HuntState, deps: EngineDeps): StepResult {
  const r = chain(chain(chain(processRespawns(state, deps), (s) => stepPlayer(s, deps)), (s) => engagedWildAttack(s, deps)), (s) => resolveConsequences(s, deps))
  return { state: { ...r.state, tick: r.state.tick + 1 }, events: r.events }
}
```

`index.ts`: `export * from './items.js'`, `export * from './player.js'`, `export * from './step.js'`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`
Se `returning` levar um tick a mais ou a menos que o teste espera, conferir a contagem de passos no mapa 5x5 (o alvo é "no Centro ou adjacente") antes de tocar no código; o teste assume que o jogador para adjacente a (4,4) após 7 movimentos e vira `healing` no 8º tick.

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): máquina de modos do jogador, consequências e o tick da hunt"
```

---

### Task 6: `intents.ts`, `simulate.ts` e `index.ts`

**Files:**
- Create: `src/engine/intents.ts`, `src/engine/simulate.ts`
- Modify: `src/engine/index.ts`
- Test: `test/engine/intents.test.ts`, `test/engine/simulate.test.ts`

**Interfaces:**
- Produces (`intents.ts`): `applyIntent(state, intent, deps): IntentResult` — `stop`: modo `stopped`, `targetWildId: null`, `path: []`, evento `stopped { reason: 'intent' }` (se já `stopped`, erro `already-stopped`); `useItem`: `applyPotion`; `setActive`: erro `unknown-pokemon` se id não está no time, `fainted` se `hp <= 0`, `already-active` se já é o ativo; senão `activeIndex`, `cooldowns: {}`, evento `switched`; `updateSettings`: valida `returnHpPercent` e `capture.maxWildHpPercent` em `[0, 100]` (erro `invalid-settings`), `ballTier` em `poke|great|ultra|best`, e devolve estado com o patch mesclado (sem evento). Estado inalterado em erro.
- Produces (`simulate.ts`): `simulate(state, ticks, deps): StepResult` (laço de `step`, `RangeError` se `ticks < 0`), `interface Summary { ticks; defeats; captures; captureFailures; faints; xpTrainer; gold; drops: Record<string, number>; levelUps; evolutions; returns }`, `summarizeEvents(events, ticks): Summary`.

- [ ] **Step 1: Testes**

`test/engine/intents.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyIntent } from '../../src/engine/intents.js'
import { baseState, charmander5, miniDeps } from './fixtures/mini.js'

describe('applyIntent', () => {
  const deps = miniDeps()
  it('stop para a hunt e é idempotente com erro', () => {
    const s = baseState({}, deps)
    const r = applyIntent(s, { type: 'stop' }, deps)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.state.player.mode).toBe('stopped')
    expect(r.events).toEqual([{ type: 'stopped', tick: 0, reason: 'intent' }])
    expect(applyIntent(r.state, { type: 'stop' }, deps)).toMatchObject({ error: { code: 'already-stopped' } })
  })
  it('useItem delega para applyPotion', () => {
    const s = baseState({}, deps)
    const hurt = { ...s, player: { ...s.player, team: [{ ...charmander5(), hp: 5 }] } }
    const r = applyIntent(hurt, { type: 'useItem', itemId: 'potion' }, deps)
    expect(r).toMatchObject({ state: { inventory: { potion: 0 } } })
    expect(applyIntent(s, { type: 'useItem', itemId: 'potion' }, deps)).toMatchObject({ error: { code: 'full-hp' } })
  })
  it('setActive valida e zera cooldowns', () => {
    const s = baseState({}, deps)
    const two = { ...s, player: { ...s.player, cooldowns: { ember: 5 }, team: [charmander5(), { ...charmander5(), id: 'p2' }, { ...charmander5(), id: 'p3', hp: 0 }] } }
    expect(applyIntent(two, { type: 'setActive', pokemonId: 'zzz' }, deps)).toMatchObject({ error: { code: 'unknown-pokemon' } })
    expect(applyIntent(two, { type: 'setActive', pokemonId: 'p3' }, deps)).toMatchObject({ error: { code: 'fainted' } })
    expect(applyIntent(two, { type: 'setActive', pokemonId: 'p1' }, deps)).toMatchObject({ error: { code: 'already-active' } })
    const r = applyIntent(two, { type: 'setActive', pokemonId: 'p2' }, deps)
    expect(r).toMatchObject({ state: { player: { activeIndex: 1, cooldowns: {} } }, events: [{ type: 'switched', tick: 0, pokemonId: 'p2' }] })
  })
  it('updateSettings mescla e valida faixas', () => {
    const s = baseState({}, deps)
    const r = applyIntent(s, { type: 'updateSettings', patch: { returnHpPercent: 50, capture: { ballTier: 'great' } } }, deps)
    expect(r).toMatchObject({ state: { settings: { returnHpPercent: 50, capture: { ballTier: 'great', maxWildHpPercent: 30, allowDuplicates: false } } }, events: [] })
    expect(applyIntent(s, { type: 'updateSettings', patch: { returnHpPercent: 101 } }, deps)).toMatchObject({ error: { code: 'invalid-settings' } })
    expect(applyIntent(s, { type: 'updateSettings', patch: { capture: { maxWildHpPercent: -1 } } }, deps)).toMatchObject({ error: { code: 'invalid-settings' } })
  })
})
```

`test/engine/simulate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'
import { baseState, miniDeps } from './fixtures/mini.js'

describe('simulate', () => {
  it('avança N ticks e resume os eventos', () => {
    const deps = miniDeps(2)
    const r = simulate(baseState({}, deps), 200, deps)
    expect(r.state.tick).toBe(200)
    const s = summarizeEvents(r.events, 200)
    expect(s.ticks).toBe(200)
    expect(s.defeats).toBeGreaterThanOrEqual(1)
    expect(s.xpTrainer).toBe(r.state.trainer.xp)
    expect(s.gold).toBe(r.state.trainer.gold)
  })
  it('rejeita ticks negativos e aceita zero', () => {
    const deps = miniDeps()
    expect(() => simulate(baseState({}, deps), -1, deps)).toThrow(RangeError)
    expect(simulate(baseState({}, deps), 0, deps).events).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- intents simulate`

- [ ] **Step 3: Implementar**

`src/engine/intents.ts`:
```ts
import { applyPotion } from './items.js'
import type { CaptureSettings, EngineDeps, EngineError, HuntState, Intent, IntentResult } from './types.js'

const fail = (code: string, message: string): { error: EngineError } => ({ error: { code, message } })
const TIERS = ['poke', 'great', 'ultra', 'best'] as const
const inRange = (v: number | undefined): boolean => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 100)

function stop(state: HuntState): IntentResult {
  if (state.player.mode === 'stopped') return fail('already-stopped', 'a hunt já está parada')
  return { state: { ...state, player: { ...state.player, mode: 'stopped', targetWildId: null, path: [] } }, events: [{ type: 'stopped', tick: state.tick, reason: 'intent' }] }
}

function setActive(state: HuntState, pokemonId: string): IntentResult {
  const index = state.player.team.findIndex((p) => p.id === pokemonId)
  if (index === -1) return fail('unknown-pokemon', `${pokemonId} não está no time`)
  if (state.player.team[index]!.hp <= 0) return fail('fainted', `${pokemonId} está sem HP`)
  if (index === state.player.activeIndex) return fail('already-active', `${pokemonId} já é o ativo`)
  return { state: { ...state, player: { ...state.player, activeIndex: index, cooldowns: {} } }, events: [{ type: 'switched', tick: state.tick, pokemonId }] }
}

function updateSettings(state: HuntState, patch: Extract<Intent, { type: 'updateSettings' }>['patch']): IntentResult {
  const capture: CaptureSettings = { ...state.settings.capture, ...(patch.capture ?? {}) }
  if (!inRange(patch.returnHpPercent) || !inRange(capture.maxWildHpPercent) || !TIERS.includes(capture.ballTier)) return fail('invalid-settings', 'percentuais devem estar em [0, 100] e ballTier em poke|great|ultra|best')
  return { state: { ...state, settings: { ...state.settings, returnHpPercent: patch.returnHpPercent ?? state.settings.returnHpPercent, capture } }, events: [] }
}

export function applyIntent(state: HuntState, intent: Intent, deps: EngineDeps): IntentResult {
  switch (intent.type) {
    case 'stop': return stop(state)
    case 'useItem': return applyPotion(state, deps.registry, intent.itemId)
    case 'setActive': return setActive(state, intent.pokemonId)
    case 'updateSettings': return updateSettings(state, intent.patch)
  }
}
```

`src/engine/simulate.ts`:
```ts
import { step } from './step.js'
import type { EngineDeps, Event, HuntState, StepResult } from './types.js'

export function simulate(state: HuntState, ticks: number, deps: EngineDeps): StepResult {
  if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`ticks inválido: ${ticks}`)
  let current: StepResult = { state, events: [] }
  for (let i = 0; i < ticks; i++) {
    const next = step(current.state, deps)
    current = { state: next.state, events: [...current.events, ...next.events] }
  }
  return current
}

export interface Summary {
  readonly ticks: number; readonly defeats: number; readonly captures: number; readonly captureFailures: number
  readonly faints: number; readonly xpTrainer: number; readonly gold: number
  readonly drops: Readonly<Record<string, number>>; readonly levelUps: number; readonly evolutions: number; readonly returns: number
}

export function summarizeEvents(events: readonly Event[], ticks: number): Summary {
  return events.reduce<Summary>((s, e) => {
    switch (e.type) {
      case 'wildDefeated': return { ...s, defeats: s.defeats + 1, xpTrainer: s.xpTrainer + e.xpTrainer, gold: s.gold + e.gold, drops: e.drops.reduce((d, x) => ({ ...d, [x.item]: (d[x.item] ?? 0) + x.quantity }), s.drops) }
      case 'captured': return { ...s, captures: s.captures + 1 }
      case 'captureFailed': return { ...s, captureFailures: s.captureFailures + 1 }
      case 'pokemonFainted': return { ...s, faints: s.faints + 1 }
      case 'levelUp': return { ...s, levelUps: s.levelUps + 1 }
      case 'evolved': return { ...s, evolutions: s.evolutions + 1 }
      case 'returning': return { ...s, returns: s.returns + 1 }
      default: return s
    }
  }, { ticks, defeats: 0, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 0, gold: 0, drops: {}, levelUps: 0, evolutions: 0, returns: 0 })
}
```

`index.ts`: `export * from './intents.js'`, `export * from './simulate.js'`. Conferir que `index.ts` exporta, no total: types, constants, grid, spawn, create, progression, combat, items, player, step, intents, simulate.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): intenções do jogador, simulate e resumo de eventos"
```

---

### Task 7: Cenário na Rota 1 real, invariantes, README e cobertura

**Files:**
- Create: `test/engine/route1.test.ts`, `packages/server/README.md`
- Test: o próprio arquivo

**Interfaces:**
- Consumes: `loadRegistry()` do `shared`, `registry.hunts.get('route-1')`, tudo do `engine`.

- [ ] **Step 1: Teste de cenário**

`test/engine/route1.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createRng, loadRegistry } from '@pokeidle/shared'
import { blockedAt } from '../../src/engine/spawn.js'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { makePokemon } from '../../src/engine/progression.js'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'
import { step } from '../../src/engine/step.js'
import type { EngineDeps, HuntState } from '../../src/engine/types.js'

const registry = loadRegistry()
const hunt = registry.hunts.get('route-1')!
const deps = (seed: number): EngineDeps => ({ registry, hunt, rng: createRng(seed) })
const start = (d: EngineDeps): HuntState => createHuntState({ hunt, team: [makePokemon(registry, 'p1', 'charmander', 5)], inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, d)

function checkInvariants(before: HuntState, after: HuntState): void {
  for (const p of after.player.team) { expect(p.hp).toBeGreaterThanOrEqual(0); expect(p.hp).toBeLessThanOrEqual(p.hpMax); expect(p.xp).toBeGreaterThanOrEqual(before.player.team.find((q) => q.id === p.id)?.xp ?? 0) }
  for (const w of after.wilds) { expect(w.hp).toBeGreaterThanOrEqual(0); expect(w.hp).toBeLessThanOrEqual(w.hpMax); expect(blockedAt(hunt, w.position)).toBe(false) }
  expect(blockedAt(hunt, after.player.position)).toBe(false)
  expect(after.trainer.xp).toBeGreaterThanOrEqual(before.trainer.xp)
  const total = hunt.spawns.reduce((n, s) => n + s.count, 0)
  expect(after.wilds.length + after.respawns.length).toBe(total)
  for (const r of after.respawns) expect(r.atTick).toBeGreaterThan(before.tick)
  expect(after.tick).toBe(before.tick + 1)
}

describe('Rota 1 com o registro real', () => {
  it('3000 ticks mantêm as invariantes e produzem progresso', () => {
    const d = deps(42)
    let state = start(d)
    let defeats = 0, returns = 0, items = 0
    for (let i = 0; i < 3000; i++) {
      const r = step(state, d)
      checkInvariants(state, r.state)
      for (const e of r.events) { if (e.type === 'wildDefeated') defeats++; if (e.type === 'returning') returns++; if (e.type === 'itemUsed') items++ }
      state = r.state
    }
    expect(defeats).toBeGreaterThanOrEqual(5)
    expect(state.trainer.xp).toBeGreaterThan(0)
    expect(state.player.mode).not.toBe('stopped')
    // Charmander 5 apanha do zubat: em 10 minutos ou usou poção ou voltou ao Centro
    expect(returns + items).toBeGreaterThanOrEqual(1)
  })
  it('é determinístico com a mesma seed', () => {
    const a = simulate(start(deps(9)), 3000, deps(9))
    const b = simulate(start(deps(9)), 3000, deps(9))
    expect(a.state).toEqual(b.state)
    expect(summarizeEvents(a.events, 3000)).toEqual(summarizeEvents(b.events, 3000))
  })
  it('captura acontece quando há bola e a espécie é nova', () => {
    const r = simulate(start(deps(3)), 6000, deps(3))
    const s = summarizeEvents(r.events, 6000)
    expect(s.captures + s.captureFailures).toBeGreaterThanOrEqual(1)
    if (s.captures > 0) expect(r.state.player.team.length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Rodar**

Run: `pnpm --filter @pokeidle/server test -- route1`
Expected: passa. Se `defeats < 5` ou `returns + items === 0`, imprimir o resumo (`summarizeEvents`) num teste temporário e reportar DONE_WITH_CONCERNS com os números reais em vez de afrouxar o teste; o controlador decide.

- [ ] **Step 3: README e cobertura**

`packages/server/README.md` (~50 linhas, português): o que é o motor, contrato (`createHuntState`, `step`, `applyIntent`, `simulate`, `summarizeEvents`, `defaultSettings`), ordem do tick, modos, constantes com valores, eventos, o que a fase 2c faz com isso (scheduler a 5 ticks/s, snapshot = o próprio `HuntState`, catch-up = `simulate` com teto de 12 h no servidor), e o que NÃO está no motor (accuracy, shiny, box).

Run: `pnpm test && pnpm --filter @pokeidle/server test -- --coverage && pnpm --filter @pokeidle/server typecheck`
Expected: tudo verde; cobertura de linhas de `src/engine` ≥ 80 % (anotar o número).

- [ ] **Step 4: Commit**

```bash
git add packages/server
git commit -m "test(server): cenário na Rota 1 com invariantes e determinismo; README do motor"
```

---

## Autorrevisão do plano

**Cobertura da spec:** §2 estado (T1 tipos, T5 `skippedWildIds`); §3 tick e ordem (T5 `step`, `resolveConsequences`; captura em `fighting` antes do ataque; ativo caído troca; poção automática; `returning`); §4 A* (T1); §5 captura (T4); §6 intenções e criação (T6, T2); §7 catch-up e resumo (T6); §8 estrutura (todos os arquivos listados têm task); §9 testes (T1–T6 unitários com fixture 5x5, T7 cenário real, determinismo, invariantes, cobertura).

**Consistência:** `StepResult`/`Event`/`Intent` (T1) usados em todas; `processRespawns`/`isWalkable`/`blockedAt` (T2) usados em T5 e T7; `makePokemon`/`applyDefeat` (T3) em T4, T5, T7; `playerAttack`/`wildAttack`/`captureApplies`/`attemptCapture` (T4) em T5; `applyPotion`/`weakestPotion` (T5) em T5 `step` e T6 intents; `step` (T5) em T6 `simulate`; `skippedWildIds` adicionado ao tipo em T5 e ao `create.ts` na mesma task.

**Decisões registradas:** `resolveLowHp` vale também em `walking` (a spec dizia `fighting | searching`; incluir `walking` evita andar até o alvo com HP baixo); o objetivo de `returning` aceita o próprio tile do Centro além dos adjacentes; selvagem engajado não ataca quando já morreu no mesmo tick.
