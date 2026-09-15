# Fase 3a: Regras e economia no servidor — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contrato de fio no `shared`, poções em três níveis com dois limiares de HP, quem chega ataca primeiro, mochila de Pokémon no motor, nível do treinador com destraves (vagas e itens) e loja do Centro Pokémon, tudo no servidor e testado.

**Architecture:** Os tipos e schemas do estado, dos eventos e das mensagens saem de `packages/server` para `packages/shared/src/protocol` (o servidor reexporta; o cliente da 3b consome). Regras novas entram no motor puro (`resolveLowHp`, `engagedWildAttack`, `attemptCapture`) com os padrões em `constants.ts`; destraves são dados (`unlocks.json`) com helpers puros no `shared`; a loja é um serviço transacional em `account/shop.ts` com rotas próprias. Nenhuma tela.

**Tech Stack:** TypeScript 5 strict ESM, zod 3, Drizzle 0.45 + Postgres 16 (Compose 5433), Fastify 5, Vitest 2 (server/shared).

**Spec:** `docs/superpowers/specs/2026-09-15-fase-3a-rules-economy-design.md` (design: `docs/design/2026-09-14-pokeidle-gdd.md`)

## Global Constraints

- Regra dura de testes: todo run em PRIMEIRO PLANO, um por vez; os testes de integração compartilham o Postgres de teste (5433) e runs concorrentes se truncam.
- Motor puro e imutável (objetos novos por spread); aleatoriedade só por `deps.rng`; sem `console.log`; imports locais `.js`; funções < 50 linhas; arquivos pequenos.
- Padrões: `POTION_HP_PERCENT_DEFAULT = 50`, `RETURN_HP_PERCENT_DEFAULT = 30` (inalterado), `MAX_TEAM_SIZE = 6` (teto absoluto); `teamSlots` em [1, 6]; percentuais em [0, 100].
- Poção: entre as com quantidade > 0, a mais fraca cujo `ceil(hpMax·healPercent/100) ≥ hpMax − hp`; se nenhuma cobre, a mais forte. Ordem em `resolveLowHp`: `hp% < potionHpPercent` e há poção → poção; senão `hp% < returnHpPercent` → `returning`; senão nada.
- Primeiro golpe: o selvagem só ataca se `s.player.targetWildId === engagedBefore`, onde `engagedBefore` é o alvo que já estava em `fighting` no início do tick.
- Box: `toBox = team.length >= settings.teamSlots`; o capturado vai para `state.box`; evento `captured { toBox: true }` inalterado.
- Snapshots antigos: `box` (padrão `[]`), `potionHpPercent` (50) e `teamSlots` (6) com `.default()` no schema; schema continua `.strict()`.
- Nível do treinador: `levelFromXp(unlocks.growthRate, trainers.xp)`; vagas `teamSlotsFor(level)`; itens `itemUnlockLevel(itemId)`; tudo calculado no servidor (S29).
- Loja: transação com `SELECT trainers FOR UPDATE`; preço do registro; quantidade 1–99; `check (gold >= 0)`; só sem hunt ativa (S30, S31). Códigos novos `locked` 409, `insufficient-gold` 409.
- Dados: `potion` 20 %/100/50, `super-potion` 50 %/400/200, `hyper-potion` 100 %/1500/750; `unlocks.json` como na spec §3.
- Commits convencionais de UMA linha, sem trailers. TDD. Cobertura ≥ 80 % em `packages/server/src` e `packages/shared/src`.

## Estrutura de arquivos

```
packages/shared/
  package.json (+ "./protocol")  data/items.json  data/unlocks.json
  src/protocol/{types,schema,messages,index}.ts   src/schemas/unlocks.ts   src/unlocks.ts
  src/registry.ts (+ unlocks)  src/data-files.ts (+ unlocks)  src/index.ts (+ unlocks)
  test/{protocol,unlocks}.test.ts
packages/server/
  src/engine/{types,constants,create,items,step,combat,intents}.ts
  src/hunt-store/{state-schema,mappers,start,sync}.ts
  src/realtime/{protocol,runner}.ts   src/engine/simulate.ts (Summary reexport)
  src/account/{settings,dto,me,team,shop}.ts   src/http/routes/{shop,trainer,auth,hunts}.ts   src/http/{errors,app}.ts
  src/db/schema.ts   drizzle/0001_*.sql
  test/{protocol-shared,shop,balance}.test.ts + ajustes em engine/step, engine/combat, hunt-store, trainer, errors
```

---

### Task 1: Contrato de fio no `shared` (`protocol/`) e servidor reexportando

**Files:**
- Create: `packages/shared/src/protocol/types.ts`, `src/protocol/schema.ts`, `src/protocol/messages.ts`, `src/protocol/index.ts`, `packages/shared/test/protocol.test.ts`, `packages/server/test/protocol-shared.test.ts`
- Modify: `packages/shared/package.json` (`exports`), `packages/server/src/engine/types.ts`, `src/engine/simulate.ts` (Summary), `src/hunt-store/state-schema.ts`, `src/realtime/protocol.ts`, `src/realtime/runner.ts` (StopReason), `src/account/settings.ts`

**Interfaces:**
- Produces (`@pokeidle/shared/protocol`): tipos `Point`, `PlayerMode`, `BallTier`, `PokemonState`, `WildState`, `CaptureSettings`, `HuntSettings`, `PlayerState`, `Respawn`, `HuntState`, `Event`, `Summary`, `StopReason`, `SessionInfo`, `ServerMessage`, `ClientMessage`, `SettingsPatch`; schemas `HuntStateSchema`, `EventSchema`, `SettingsPatchSchema`, `ClientMessageSchema`. Mesma forma de hoje (campos novos entram na Task 3).

- [ ] **Step 1: Testes**

`packages/shared/test/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ClientMessageSchema, EventSchema, HuntStateSchema, SettingsPatchSchema, type Event, type HuntState } from '../src/protocol/index.js'

const state: HuntState = {
  huntId: 'h', sessionId: 's', tick: 3,
  player: { team: [{ id: 'p1', speciesName: 'charmander', level: 5, xp: 135, hp: 20, hpMax: 20 }], activeIndex: 0, position: { x: 0, y: 0 }, path: [], mode: 'searching', targetWildId: null, healingUntilTick: null, cooldowns: {}, skippedWildIds: [] },
  wilds: [{ id: 1, spawnIndex: 0, speciesName: 'zubat', level: 3, hp: 16, hpMax: 16, position: { x: 3, y: 1 }, cooldowns: {}, captureTried: false }],
  respawns: [{ spawnIndex: 1, atTick: 10 }], nextWildId: 2, trainer: { xp: 0, gold: 0 }, inventory: { potion: 1 },
  settings: { returnHpPercent: 30, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false }, seen: [] },
}

describe('HuntStateSchema', () => {
  it('aceita um estado válido e rejeita campo extra', () => {
    expect(HuntStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(() => HuntStateSchema.parse({ ...state, hack: 1 })).toThrow()
  })
})

describe('EventSchema', () => {
  it('aceita um de cada tipo e rejeita tipo desconhecido', () => {
    const events: Event[] = [
      { type: 'spawned', tick: 0, wildId: 1, speciesName: 'zubat', level: 3, position: { x: 3, y: 1 } },
      { type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: 'attack', tick: 2, attacker: 'player', attackerId: 'p1', targetId: '1', move: 'ember', damage: 9, targetHp: 7 },
      { type: 'wildDefeated', tick: 3, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] },
      { type: 'captured', tick: 4, wildId: 2, speciesName: 'gastly', level: 8, ball: 'poke-ball', toBox: false },
      { type: 'captureFailed', tick: 5, wildId: 2, ball: 'poke-ball' },
      { type: 'pokemonFainted', tick: 6, pokemonId: 'p1' }, { type: 'switched', tick: 6, pokemonId: 'p2' },
      { type: 'levelUp', tick: 7, pokemonId: 'p1', level: 6 }, { type: 'evolved', tick: 7, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' },
      { type: 'itemUsed', tick: 8, itemId: 'potion', pokemonId: 'p1', hp: 9 },
      { type: 'returning', tick: 9 }, { type: 'healed', tick: 10 }, { type: 'stopped', tick: 11, reason: 'intent' }, { type: 'skipped', tick: 12, wildId: 3 },
    ]
    for (const e of events) expect(EventSchema.parse(e), e.type).toEqual(e)
    expect(() => EventSchema.parse({ type: 'hack', tick: 0 })).toThrow()
  })
})

describe('mensagens', () => {
  it('ClientMessageSchema e SettingsPatchSchema são estritos', () => {
    expect(ClientMessageSchema.parse({ t: 'item.use', itemId: 'potion' })).toEqual({ t: 'item.use', itemId: 'potion' })
    expect(() => ClientMessageSchema.parse({ t: 'ping', x: 1 })).toThrow()
    expect(() => SettingsPatchSchema.parse({ returnHpPercent: 101 })).toThrow()
  })
})
```

`packages/server/test/protocol-shared.test.ts` (prova que o motor real produz o que o schema aceita):
```ts
import { EventSchema, HuntStateSchema } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { simulate } from '../src/engine/simulate.js'
import { baseState, miniDeps } from './engine/fixtures/mini.js'

describe('contrato de fio × motor', () => {
  it('todo evento e o estado final de 300 ticks passam pelos schemas do shared', () => {
    const deps = miniDeps(3)
    const r = simulate(baseState({}, deps), 300, deps)
    expect(r.events.length).toBeGreaterThan(50)
    for (const e of r.events) expect(EventSchema.parse(e)).toEqual(e)
    expect(HuntStateSchema.parse(JSON.parse(JSON.stringify(r.state)))).toEqual(r.state)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- protocol` e `pnpm --filter @pokeidle/server test -- protocol-shared` (módulos inexistentes).

- [ ] **Step 3: Implementar o `shared/protocol`**

`packages/shared/package.json`: `"exports": { ".": "./src/index.ts", "./protocol": "./src/protocol/index.ts" }`.

`src/protocol/types.ts`: copiar VERBATIM de `packages/server/src/engine/types.ts` as interfaces `Point`, `PlayerMode`, `BallTier`, `PokemonState`, `WildState`, `CaptureSettings`, `HuntSettings`, `PlayerState`, `Respawn`, `HuntState` e o tipo `Event` (sem `EngineDeps`, `Intent`, `StepResult`, `EngineError`, `IntentResult`, que ficam no motor), e acrescentar:
```ts
export type StopReason = Extract<Event, { type: 'stopped' }>['reason'] | 'corrupt' | 'persist-failed'
export interface Summary {
  readonly ticks: number; readonly defeats: number; readonly captures: number; readonly captureFailures: number
  readonly faints: number; readonly xpTrainer: number; readonly gold: number
  readonly drops: Readonly<Record<string, number>>; readonly levelUps: number; readonly evolutions: number; readonly returns: number
}
export interface SessionInfo { readonly huntId: string; readonly sessionId: string; readonly startedAt: string }
export type ServerMessage =
  | { readonly t: 'hunt.snapshot'; readonly session: SessionInfo; readonly state: HuntState }
  | { readonly t: 'hunt.tick'; readonly tick: number; readonly events: readonly Event[] }
  | { readonly t: 'hunt.stopped'; readonly reason: StopReason; readonly healed: boolean }
  | { readonly t: 'hunt.catchup'; readonly ticksRemaining: number }
  | { readonly t: 'hunt.summary'; readonly summary: Summary }
  | { readonly t: 'hunt.idle' }
  | { readonly t: 'error'; readonly code: string; readonly message: string }
  | { readonly t: 'pong' }
```

`src/protocol/schema.ts`: copiar VERBATIM os schemas de `packages/server/src/hunt-store/state-schema.ts` (`Point`, `Cooldowns`, `PokemonStateSchema`, `WildStateSchema`, `PlayerStateSchema`, `SettingsSchema`, `HuntStateSchema`), exportando `HuntStateSchema` e `PokemonStateSchema`, e acrescentar `EventSchema`:
```ts
const int = z.number().int(); const str = z.string(); const tick = int.min(0)
export const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spawned'), tick, wildId: int, speciesName: str, level: int, position: Point }).strict(),
  z.object({ type: z.literal('moved'), tick, from: Point, to: Point }).strict(),
  z.object({ type: z.literal('attack'), tick, attacker: z.enum(['player', 'wild']), attackerId: str, targetId: str, move: str, damage: int, targetHp: int }).strict(),
  z.object({ type: z.literal('wildDefeated'), tick, wildId: int, speciesName: str, level: int, xpTrainer: int, xpPokemon: int, gold: int, drops: z.array(z.object({ item: str, quantity: int }).strict()) }).strict(),
  z.object({ type: z.literal('captured'), tick, wildId: int, speciesName: str, level: int, ball: str, toBox: z.boolean() }).strict(),
  z.object({ type: z.literal('captureFailed'), tick, wildId: int, ball: str }).strict(),
  z.object({ type: z.literal('pokemonFainted'), tick, pokemonId: str }).strict(),
  z.object({ type: z.literal('switched'), tick, pokemonId: str }).strict(),
  z.object({ type: z.literal('levelUp'), tick, pokemonId: str, level: int }).strict(),
  z.object({ type: z.literal('evolved'), tick, pokemonId: str, from: str, to: str }).strict(),
  z.object({ type: z.literal('itemUsed'), tick, itemId: str, pokemonId: str, hp: int }).strict(),
  z.object({ type: z.literal('returning'), tick }).strict(),
  z.object({ type: z.literal('healed'), tick }).strict(),
  z.object({ type: z.literal('stopped'), tick, reason: z.enum(['team-fainted', 'intent', 'no-route']) }).strict(),
  z.object({ type: z.literal('skipped'), tick, wildId: int }).strict(),
])
```

`src/protocol/messages.ts`: mover `SettingsPatchSchema`/`SettingsPatch` de `packages/server/src/account/settings.ts` e `ClientMessageSchema`/`ClientMessage` de `packages/server/src/realtime/protocol.ts` (mesmo texto). `index.ts` reexporta os três arquivos.

- [ ] **Step 4: Servidor reexportando**

- `src/engine/types.ts`: apagar as interfaces movidas e pôr no topo `export type { Point, PlayerMode, BallTier, PokemonState, WildState, CaptureSettings, HuntSettings, PlayerState, Respawn, HuntState, Event } from '@pokeidle/shared/protocol'`; manter `EngineDeps`, `Intent`, `StepResult`, `EngineError`, `IntentResult` (importar `CaptureSettings`/`HuntState`/`Event` do shared para eles).
- `src/engine/simulate.ts`: `export type { Summary } from '@pokeidle/shared/protocol'` no lugar da interface local.
- `src/realtime/runner.ts`: `export type { StopReason } from '@pokeidle/shared/protocol'` no lugar do tipo local (mantém `StoppedEvent`).
- `src/hunt-store/state-schema.ts`: apagar os schemas locais; `import { HuntStateSchema } from '@pokeidle/shared/protocol'`; manter `CorruptSnapshotError` e `parseHuntState`; reexportar `HuntStateSchema` para quem importa daqui.
- `src/realtime/protocol.ts`: apagar `ClientMessageSchema`/`ClientMessage`/`SessionInfo`/`ServerMessage` locais e reexportar de `@pokeidle/shared/protocol`; manter `ParseResult`/`parseClientMessage`.
- `src/account/settings.ts`: `import { SettingsPatchSchema, type SettingsPatch } from '@pokeidle/shared/protocol'` e reexportar.
- `grep -rn "engine/simulate.js'" packages/server/src | grep Summary` e `grep -rn "StopReason"`: ajuste imports que quebrarem.

- [ ] **Step 5: Rodar tudo**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/shared typecheck && pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`
Expected: shared verde com os novos testes; servidor 200 + 1 verdes (nada muda de forma).

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/server
git commit -m "refactor(shared,server): contrato de fio (estado, eventos, mensagens) em @pokeidle/shared/protocol"
```

---

### Task 2: Dados: poções em três níveis e `unlocks.json` com helpers

**Files:**
- Create: `packages/shared/data/unlocks.json`, `src/schemas/unlocks.ts`, `src/unlocks.ts`, `test/unlocks.test.ts`
- Modify: `packages/shared/data/items.json`, `src/data-files.ts`, `src/registry.ts`, `src/index.ts`, `packages/server/test/engine/fixtures/mini.ts` (raw ganha `unlocks`), qualquer outro `buildRegistry(` (grep)

**Interfaces:**
- Produces: `Unlocks` (tipo), `UnlocksSchema`; `Registry.unlocks: Unlocks`; `RawRegistry.unlocks: unknown`; `trainerLevel(unlocks, xp): number`, `xpToNextLevel(unlocks, xp): number`, `teamSlotsFor(unlocks, level): number`, `itemUnlockLevel(unlocks, itemId): number`, `huntUnlockLevel(unlocks, huntId): number`, `nextUnlock(unlocks, level): { level: number; what: string } | null` (menor destrave com `level > atual`; `what` = "N vagas no time" | nome do item | "hunt <id>").

- [ ] **Step 1: Teste**

`packages/shared/test/unlocks.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { loadRegistry } from '../src/registry.js'
import { UnlocksSchema } from '../src/schemas/unlocks.js'
import { huntUnlockLevel, itemUnlockLevel, nextUnlock, teamSlotsFor, trainerLevel, xpToNextLevel } from '../src/unlocks.js'

const registry = loadRegistry()
const u = registry.unlocks
const items = registry.items

describe('unlocks', () => {
  it('tabela do GDD: xp → nível → vagas', () => {
    const rows: [number, number, number][] = [[0, 1, 3], [1000, 10, 4], [8000, 20, 5], [27000, 30, 6], [64000, 40, 6], [125000, 50, 6]]
    for (const [xp, level, slots] of rows) { expect(trainerLevel(u, xp), `xp ${xp}`).toBe(level); expect(teamSlotsFor(u, level)).toBe(slots) }
    expect(trainerLevel(u, 999)).toBe(9)
    expect(xpToNextLevel(u, 1000)).toBe(331) // 11³ − 1000
  })
  it('itens e hunts', () => {
    expect(itemUnlockLevel(u, 'potion')).toBe(0)
    expect(itemUnlockLevel(u, 'super-potion')).toBe(20)
    expect(itemUnlockLevel(u, 'hyper-potion')).toBe(30)
    expect(itemUnlockLevel(u, 'ultra-ball')).toBe(40)
    expect(huntUnlockLevel(u, 'route-1')).toBe(0)
    expect(huntUnlockLevel(u, 'route-2')).toBe(50)
  })
  it('nextUnlock caminha pela tabela', () => {
    expect(nextUnlock(u, 1, items)).toEqual({ level: 10, what: '4 vagas no time' })
    expect(nextUnlock(u, 10, items)).toEqual({ level: 20, what: 'Super Poção, Great Bola, 5 vagas no time' })
    expect(nextUnlock(u, 30, items)).toEqual({ level: 40, what: 'Ultra Bola' })
    expect(nextUnlock(u, 40, items)).toEqual({ level: 50, what: 'hunt route-2' })
    expect(nextUnlock(u, 50, items)).toBeNull()
  })
  it('schema rejeita item inexistente no registro', () => {
    expect(() => UnlocksSchema.parse({ growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 3 }], items: {}, hunts: {} })).not.toThrow()
    expect(() => UnlocksSchema.parse({ growthRate: 'nope', teamSlots: [], items: {}, hunts: {} })).toThrow()
  })
})
```
`nextUnlock` junta, para o próximo nível com algum destrave, os itens pelo `name` do registro (na ordem de `unlocks.items`), depois as vagas, depois hunts; o teste fixa o texto. Os nomes vêm de `items.json` (`Super Poção`, `Great Bola`, `Hiper Poção`, `Ultra Bola`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- unlocks`

- [ ] **Step 3: Dados e código**

`data/items.json`: `potion` fica `healPercent 20, buyPrice 100, sellPrice 50`; `super-potion` `50, 400, 200`; adicionar `{ "id": "hyper-potion", "name": "Hiper Poção", "kind": "potion", "healPercent": 100, "buyPrice": 1500, "sellPrice": 750 }`; bolas inalteradas.

`data/unlocks.json`: exatamente o JSON da spec §3.

`src/schemas/unlocks.ts`:
```ts
import { z } from 'zod'
import { GROWTH_RATES, kebab } from './species.js'
export const UnlocksSchema = z.object({
  growthRate: z.enum(GROWTH_RATES),
  teamSlots: z.array(z.object({ level: z.number().int().min(1), slots: z.number().int().min(1).max(6) }).strict()).min(1),
  items: z.record(kebab, z.number().int().min(1)),
  hunts: z.record(kebab, z.number().int().min(1)),
}).strict()
export type Unlocks = z.infer<typeof UnlocksSchema>
```
(confira o nome real da constante das curvas em `schemas/species.ts`; a spec 1 a chamou `GROWTH_RATES`.)

`src/unlocks.ts`:
```ts
import type { Unlocks } from './schemas/unlocks.js'
import type { Item } from './schemas/items.js'
import { levelFromXp, xpForLevel } from './xp.js'

export const trainerLevel = (u: Unlocks, xp: number): number => levelFromXp(u.growthRate, xp)
export const xpToNextLevel = (u: Unlocks, xp: number): number => xpForLevel(u.growthRate, trainerLevel(u, xp) + 1) - xp
export const teamSlotsFor = (u: Unlocks, level: number): number =>
  u.teamSlots.filter((s) => s.level <= level).reduce((best, s) => Math.max(best, s.slots), u.teamSlots[0]?.slots ?? 1)
export const itemUnlockLevel = (u: Unlocks, itemId: string): number => u.items[itemId] ?? 0
export const huntUnlockLevel = (u: Unlocks, huntId: string): number => u.hunts[huntId] ?? 0

export function nextUnlock(u: Unlocks, level: number, items: ReadonlyMap<string, Item>): { level: number; what: string } | null {
  const levels = [...u.teamSlots.map((s) => s.level), ...Object.values(u.items), ...Object.values(u.hunts)].filter((l) => l > level)
  if (levels.length === 0) return null
  const next = Math.min(...levels)
  const parts = [
    ...Object.entries(u.items).filter(([, l]) => l === next).map(([id]) => items.get(id)?.name ?? id),
    ...u.teamSlots.filter((s) => s.level === next).map((s) => `${s.slots} vagas no time`),
    ...Object.entries(u.hunts).filter(([, l]) => l === next).map(([id]) => `hunt ${id}`),
  ]
  return { level: next, what: parts.join(', ') }
}
```
`src/data-files.ts`: `import unlocks from '../data/unlocks.json' with { type: 'json' }` e `unlocks` no `rawData`. `src/registry.ts`: `RawRegistry.unlocks: unknown`, `Registry.unlocks: Unlocks`, parse com `UnlocksSchema` (`'unlocks.json'`), `checkReferences`: cada chave de `unlocks.items` deve existir em `items` ("unlocks: item X não existe"). `src/index.ts`: `export * from './schemas/unlocks.js'` e `export * from './unlocks.js'`.

Todo `buildRegistry({...})` fora do `loadRegistry` (grep no repo: `packages/server/test/engine/fixtures/mini.ts`, testes do shared, `tools/`) ganha `unlocks: { growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 6 }], items: {}, hunts: {} }` — a fixture do motor mantém 6 vagas desde o nível 1 para os testes existentes não mudarem.

- [ ] **Step 4: Rodar**

Run: `pnpm test && pnpm -r typecheck` (raiz, um run). Expected: tudo verde (a fixture do motor tem itens próprios; `hyper-potion` entra nela na Task 3).

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/server tools
git commit -m "feat(shared): poções em três níveis e tabela de destraves do treinador"
```

---

### Task 3: Motor: dois limiares, escolha de poção, primeiro golpe, box e vagas

**Files:**
- Modify: `packages/shared/src/protocol/types.ts` e `schema.ts` (campos novos), `packages/server/src/engine/{constants,create,items,step,combat,intents,types}.ts`, `test/engine/{step,combat,intents}.test.ts`, `packages/shared/test/protocol.test.ts`
- Create: `packages/server/test/balance.test.ts`

**Interfaces:**
- Produces: `POTION_HP_PERCENT_DEFAULT = 50`; `HuntSettings` + `potionHpPercent: number`, `teamSlots: number`; `HuntState` + `box: readonly PokemonState[]`; `choosePotion(state, registry, active): Item | null`; `engagedWildAttack(state, deps, engagedBefore: number | null)`; `Intent updateSettings.patch` + `potionHpPercent?`; `defaultSettings()` com os padrões; `createHuntState` com `box: []`.

- [ ] **Step 1: Testes**

Em `packages/shared/test/protocol.test.ts` acrescente ao `describe('HuntStateSchema')`:
```ts
  it('aplica padrões aos campos novos de snapshots antigos', () => {
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>
    const parsed = HuntStateSchema.parse(old)
    expect(parsed.box).toEqual([])
    expect(parsed.settings.potionHpPercent).toBe(50)
    expect(parsed.settings.teamSlots).toBe(6)
  })
```
e mude o `state` do teste para já ter `box: []` e `settings.potionHpPercent: 50, teamSlots: 6` (o `toEqual` do primeiro teste precisa bater).

`packages/server/test/engine/step.test.ts` — substitua o teste "usa a poção mais fraca quando o hp cai abaixo do limite" e acrescente os novos:
```ts
describe('poções e limiares', () => {
  const deps = miniDeps()
  const active = (hp: number) => ({ ...charmander5(), hp, hpMax: 20 }) // hpMax fixo: Poção cura 4, Super 10, Hiper 20
  const at = (hp: number, inventory: Record<string, number>, over: Partial<HuntState['settings']> = {}): HuntState => {
    const s = baseState({}, deps)
    return { ...s, inventory, settings: { ...s.settings, ...over }, player: { ...s.player, mode: 'fighting', team: [active(hp)] } }
  }
  it('choosePotion: a mais fraca que cobre; senão a mais forte; senão null', () => {
    expect(choosePotion(at(17, { potion: 1, 'super-potion': 1 }), deps.registry, active(17))?.id).toBe('potion') // faltam 3
    expect(choosePotion(at(5, { potion: 1, 'super-potion': 1 }), deps.registry, active(5))?.id).toBe('super-potion') // faltam 15: nenhuma cobre
    expect(choosePotion(at(5, { potion: 1, 'super-potion': 1, 'hyper-potion': 1 }), deps.registry, active(5))?.id).toBe('hyper-potion') // a Hiper cobre
    expect(choosePotion(at(5, { potion: 3, 'super-potion': 0 }), deps.registry, active(5))?.id).toBe('potion')
    expect(choosePotion(at(5, {}), deps.registry, active(5))).toBeNull()
  })
  it('abaixo de potionHpPercent com poção usa a poção escolhida', () => {
    const r = resolveConsequences(at(9, { potion: 1, 'super-potion': 1 }), deps) // 45 % < 50; faltam 11: nenhuma cobre → Super
    expect(r.state.player.team[0]!.hp).toBe(19)
    expect(r.state.inventory['super-potion'] ?? 0).toBe(0)
    expect(r.state.inventory['potion']).toBe(1)
    expect(r.events).toEqual([{ type: 'itemUsed', tick: 0, itemId: 'super-potion', pokemonId: 'p1', hp: 19 }])
  })
  it('entre os limiares sem poção não faz nada; abaixo do retorno sem poção volta', () => {
    expect(resolveConsequences(at(9, {}), deps).events).toEqual([]) // 45 %: < 50 mas sem poção; ≥ 30
    const r = resolveConsequences(at(5, {}), deps) // 25 % < 30
    expect(r.state.player.mode).toBe('returning')
    expect(r.events).toEqual([{ type: 'returning', tick: 0 }])
  })
  it('abaixo do retorno COM poção usa poção e não volta', () => {
    const r = resolveConsequences(at(5, { potion: 1 }), deps)
    expect(r.state.player.mode).toBe('fighting')
    expect(r.events[0]?.type).toBe('itemUsed')
  })
  it('potionHpPercent 150 com HP cheio não lança nem muda o estado', () => {
    const s = at(20, { potion: 1 }, { potionHpPercent: 150 })
    const r = resolveConsequences(s, deps)
    expect(r.state.player.team).toEqual(s.player.team)
    expect(r.state.inventory).toEqual(s.inventory)
    expect(r.events).toEqual([])
  })
})

describe('quem chega ataca primeiro', () => {
  it('o selvagem só revida no tick seguinte ao engajamento', () => {
    const deps = miniDeps()
    let s = baseState({}, deps)
    let arrival: ReturnType<typeof step> | null = null
    for (let i = 0; i < 10 && !arrival; i++) { const r = step(s, deps); s = r.state; if (r.state.player.mode === 'fighting') arrival = r }
    expect(arrival).not.toBeNull()
    const wildAttacks = (r: ReturnType<typeof step>) => r.events.filter((e) => e.type === 'attack' && e.attacker === 'wild')
    expect(wildAttacks(arrival!)).toHaveLength(0)
    expect(wildAttacks(step(arrival!.state, deps))).toHaveLength(1)
  })
})
```
Importe `choosePotion` no lugar de `weakestPotion` (que deixa de existir). Remova o teste antigo de `returnHpPercent` 150 se ele testava `weakestPotion`; senão mantenha. O teste "searching → walking → fighting em 4 ticks" continua igual. Testes que contam golpes do zubat podem mudar de número (ele ataca um tick depois): se alguma asserção exata quebrar, corrija o número e diga no relatório. Na fixture `test/engine/fixtures/mini.ts`, acrescente `{ id: 'hyper-potion', name: 'Hiper', kind: 'potion', healPercent: 100, buyPrice: 1500, sellPrice: 750 }` aos itens.

`packages/server/test/engine/combat.test.ts` — substitua o teste "time cheio: captura vai para a box" (usa `MAX_TEAM_SIZE` e 6 membros) por este, reaproveitando os helpers `fighting`/`fixed` do arquivo:
```ts
  it('time cheio pelas vagas do nível: a captura vai para a box e o time fica intacto', () => {
    const deps = { ...miniDeps(), rng: fixed(0) }
    const s = fighting(deps)
    const team = [charmander5(), { ...charmander5(), id: 'p2' }]
    const low = { ...s.wilds[0]!, hp: 4 }
    const full = { ...s, wilds: [low], settings: { ...s.settings, teamSlots: 2 }, player: { ...s.player, team } }
    const r = attemptCapture(full, deps, low, deps.registry.items.get('poke-ball')!)
    expect(r.state.player.team).toHaveLength(2)
    expect(r.state.box).toHaveLength(1)
    expect(r.state.box[0]).toMatchObject({ speciesName: 'zubat', hp: 4 })
    expect(r.state.wilds).toEqual([])
    expect(r.events[0]).toMatchObject({ type: 'captured', toBox: true })
  })
```
(importe `charmander5` da fixture se ainda não estiver importado.)

`packages/server/test/engine/intents.test.ts`, no teste de `updateSettings`: acrescente `expect(applyIntent(s, { type: 'updateSettings', patch: { potionHpPercent: 70 } }, deps)).toMatchObject({ state: { settings: { potionHpPercent: 70 } } })` e `expect(applyIntent(s, { type: 'updateSettings', patch: { potionHpPercent: 101 } }, deps)).toMatchObject({ error: { code: 'invalid-settings' } })`.

`packages/server/test/balance.test.ts` (o balanceamento como teste; registro REAL):
```ts
import { createRng, hpAt, loadRegistry, xpForLevel } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../src/engine/create.js'
import { simulate, summarizeEvents } from '../src/engine/simulate.js'

const registry = loadRegistry()
const hunt = registry.hunts.get('route-1')!
const TICKS = 3000 // 10 minutos a 200 ms

const charmander10 = () => {
  const base = registry.species.get('charmander')!.baseStats.hp
  return { id: 'p1', speciesName: 'charmander', level: 10, xp: xpForLevel('medium-slow', 10), hp: hpAt(base, 10), hpMax: hpAt(base, 10) }
}

describe('balanceamento da Rota 1 (GDD §2 e §6)', () => {
  it.each([42, 9, 7])('Charmander 10 com os padrões, 10 minutos, seed %i: ≥150 derrotas, 0 quedas, ≥3 capturas', (seed) => {
    const deps = { registry, hunt, rng: createRng(seed) }
    const s0 = createHuntState({ hunt, sessionId: 'balance', team: [charmander10()], inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, deps)
    const s = summarizeEvents(simulate(s0, TICKS, deps).events, TICKS)
    expect(s.defeats).toBeGreaterThanOrEqual(150)
    expect(s.faints).toBe(0)
    expect(s.captures).toBeGreaterThanOrEqual(3)
  })
})
```
(confira o campo real do HP base em `SpeciesSchema` de `shared/src/schemas/species.ts`: `baseStats.hp`; e a curva do Charmander, `medium-slow`.) Se uma seed falhar por pouco depois das regras novas (primeiro golpe muda os números), reporte os valores reais; o controlador decide entre trocar a seed e ajustar o limiar.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- step combat intents balance` e `pnpm --filter @pokeidle/shared test -- protocol`.

- [ ] **Step 3: `shared/protocol`**

`types.ts`: `HuntSettings` ganha `readonly potionHpPercent: number; readonly teamSlots: number`; `HuntState` ganha `readonly box: readonly PokemonState[]`. `schema.ts`: `SettingsSchema` ganha `potionHpPercent: z.number().default(50), teamSlots: z.number().int().min(1).max(6).default(6)`; `HuntStateSchema` ganha `box: z.array(PokemonStateSchema).default([])`.

- [ ] **Step 4: Motor**

`constants.ts`: `export const POTION_HP_PERCENT_DEFAULT = 50`.

`create.ts`: `defaultSettings` inclui `potionHpPercent: POTION_HP_PERCENT_DEFAULT, teamSlots: MAX_TEAM_SIZE`; `clampSettings` inclui `potionHpPercent: clampPercent(...)` e `teamSlots: Math.min(MAX_TEAM_SIZE, Math.max(1, Math.round(settings.teamSlots)))`; `initial` ganha `box: []`.

`items.ts` — substitua `weakestPotion` por:
```ts
type Potion = Item & { kind: 'potion' }
const healAmount = (p: Potion, hpMax: number): number => Math.ceil((hpMax * p.healPercent) / 100)

/** A mais fraca que cobre o HP faltante; se nenhuma cobre, a mais forte; sem poção, null. */
export function choosePotion(state: HuntState, registry: Registry, active: PokemonState): Potion | null {
  const owned = [...registry.items.values()].filter((i): i is Potion => i.kind === 'potion' && (state.inventory[i.id] ?? 0) > 0)
  if (owned.length === 0) return null
  const missing = active.hpMax - active.hp
  const sorted = [...owned].sort((a, b) => a.healPercent - b.healPercent)
  return sorted.find((p) => healAmount(p, active.hpMax) >= missing) ?? sorted[sorted.length - 1]!
}
```

`step.ts`:
```ts
function resolveLowHp(state: HuntState, deps: EngineDeps): StepResult {
  const active = state.player.team[state.player.activeIndex]
  const mode = state.player.mode
  if (!active || active.hp <= 0 || !(mode === 'searching' || mode === 'walking' || mode === 'fighting')) return { state, events: [] }
  const hpPercent = (active.hp / active.hpMax) * 100
  if (hpPercent < state.settings.potionHpPercent) {
    const potion = choosePotion(state, deps.registry, active)
    if (potion) { const r = applyPotion(state, deps.registry, potion.id); return 'error' in r ? { state, events: [] } : r }
  }
  if (hpPercent >= state.settings.returnHpPercent) return { state, events: [] }
  return { state: { ...state, player: { ...state.player, mode: 'returning', targetWildId: null, path: [] } }, events: [{ type: 'returning', tick: state.tick }] }
}

/** Só o selvagem já engajado no tick anterior revida: quem chega ataca primeiro (GDD §3.1). */
function engagedWildAttack(state: HuntState, deps: EngineDeps, engagedBefore: number | null): StepResult {
  if (state.player.mode !== 'fighting' || engagedBefore === null || state.player.targetWildId !== engagedBefore) return { state, events: [] }
  const wild = state.wilds.find((w) => w.id === state.player.targetWildId)
  if (!wild || wild.hp <= 0 || !isAdjacent(state.player.position, wild.position)) return { state, events: [] }
  return wildAttack(state, deps, wild)
}

export function step(state: HuntState, deps: EngineDeps): StepResult {
  const respawned = processRespawns(state, deps)
  if (state.player.mode === 'stopped') {
    return { state: { ...respawned.state, tick: respawned.state.tick + 1 }, events: respawned.events }
  }
  const engagedBefore = state.player.mode === 'fighting' ? state.player.targetWildId : null
  const r = chain(chain(chain(respawned, (s) => stepPlayer(s, deps)), (s) => engagedWildAttack(s, deps, engagedBefore)), (s) => resolveConsequences(s, deps))
  return { state: { ...r.state, tick: r.state.tick + 1 }, events: r.events }
}
```
`items.ts` deixa de exportar `weakestPotion`; `step.ts` importa `choosePotion`.

`combat.ts` (`attemptCapture`): `const toBox = state.player.team.length >= state.settings.teamSlots` e no retorno `box: toBox ? [...removed.box, pokemon] : removed.box` (mantendo `team` como está). `MAX_TEAM_SIZE` deixa de ser lido aqui.

`intents.ts` (`updateSettings`): validar `inRange(patch.potionHpPercent)` junto e gravar `potionHpPercent: patch.potionHpPercent ?? state.settings.potionHpPercent`. `types.ts` (`Intent`): `patch: Partial<{ returnHpPercent: number; potionHpPercent: number; capture: Partial<CaptureSettings> }>`.

- [ ] **Step 5: Rodar tudo**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/server test && pnpm -r typecheck`
Expected: verde, incluindo `balance.test.ts` (3 seeds) e `route1.test.ts` (números podem mudar; suas asserções são limiares e continuam valendo — se `defeats ≥ 50` ou `captures ≥ 1` cair, reporte).

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/server
git commit -m "feat(engine): dois limiares de HP com escolha de poção, primeiro golpe de quem chega, box e vagas do time"
```

---

### Task 4: Banco, `hunt-store`, `/me`, time e settings com nível e destraves

**Files:**
- Modify: `packages/server/src/db/schema.ts`, `src/hunt-store/{mappers,start,sync}.ts`, `src/account/{dto,me,team,settings}.ts`, `src/http/routes/{auth,trainer,hunts}.ts`, `test/hunt-store.test.ts`, `test/trainer.test.ts`
- Create: `packages/server/drizzle/0001_*.sql` (gerada), `src/account/progress.ts`

**Interfaces:**
- Produces: coluna `trainers.potion_hp_percent` (padrão 50) e `check (gold >= 0)`; `trainerProgress(registry, trainer): { level; xpToNext; teamSlots; nextUnlock }` (`progress.ts`); `trainerDto(t, extra, progress)`; `trainerView(db, registry, trainer)` em `me.ts` (dto completo, usado por auth/trainer/hunts); `toHuntSettings(trainer, seen, teamSlots)`; `setTeamOrder(db, registry, trainerId, ids, now)`; `syncBox` dentro de `syncWithin`.

- [ ] **Step 1: Testes**

`test/hunt-store.test.ts` — acrescente:
```ts
  it('settings da hunt carregam potionHpPercent e as vagas do nível do treinador', async () => {
    await db.update(trainers).set({ potionHpPercent: 60, xp: 8000 }).where(eq(trainers.id, trainerId)) // nível 20 → 5 vagas
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 1 })
    const active = (await loadActive(db, trainerId))!
    expect(active.state.settings).toMatchObject({ potionHpPercent: 60, teamSlots: 5 })
    expect(active.state.box).toEqual([])
  })
  it('box sincroniza como mochila de Pokémon (team_slot nulo) e é idempotente', async () => {
    await startHunt(db, registry, trainerId, 'route-1', T0, { sessionId: 's', seed: 1 })
    const active = (await loadActive(db, trainerId))!
    const boxed = { id: 's-w99', speciesName: 'zubat', level: 4, xp: 100, hp: 18, hpMax: 18 }
    const state = { ...active.state, box: [boxed] }
    await syncToTables(db, trainerId, state, T0)
    await syncToTables(db, trainerId, state, T0)
    const rows = await db.select().from(pokemon).where(eq(pokemon.id, 's-w99'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ trainerId, speciesName: 'zubat', level: 4, teamSlot: null })
    const team = await db.select().from(pokemon).where(and(eq(pokemon.trainerId, trainerId), isNotNull(pokemon.teamSlot)))
    expect(team).toHaveLength(1) // o inicial continua no time
  })
```

`test/trainer.test.ts` — acrescente:
```ts
describe('nível e destraves', () => {
  it('/me expõe nível, xpToNext, vagas e próximo destrave', async () => {
    await t.db.update(trainers).set({ xp: 1000 }).where(eq(trainers.id, trainerId))
    const me = (await api(t.app, cookie).get('/me')).json() as { trainer: Record<string, unknown> }
    expect(me.trainer).toMatchObject({ level: 10, xpToNext: 331, teamSlots: 4, nextUnlock: { level: 20, what: expect.stringContaining('5 vagas') }, settings: { potionHpPercent: 50 } })
  })
  it('PUT /trainer/team respeita as vagas do nível', async () => {
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    await t.db.insert(pokemon).values([1, 2, 3].map((i) => ({ id: `x-w${i}`, trainerId, speciesName: 'zubat', level: 4, xp: 100, hp: 10, hpMax: 18, teamSlot: null })))
    const ids = (await t.db.select({ id: pokemon.id }).from(pokemon).where(eq(pokemon.trainerId, trainerId))).map((r) => r.id)
    const r = await api(t.app, cookie).put('/trainer/team', { slots: ids }) // 4 no nível 1 (3 vagas)
    expect(r.statusCode).toBe(400)
    expect((r.json() as { error: { message: string } }).error.message).toMatch(/3 vagas/)
    expect((await api(t.app, cookie).put('/trainer/team', { slots: ids.slice(0, 3) })).statusCode).toBe(200)
  })
  it('PATCH settings aceita potionHpPercent', async () => {
    const r = await api(t.app, cookie).patch('/trainer/settings', { potionHpPercent: 65 })
    expect(r.json()).toMatchObject({ settings: { potionHpPercent: 65 } })
    expect((await api(t.app, cookie).patch('/trainer/settings', { potionHpPercent: 101 })).statusCode).toBe(400)
  })
})
```
Ajuste as fixtures existentes de `trainer.test.ts` que montam times de 2–3 Pokémon: no nível 1 há 3 vagas, então times de até 3 continuam válidos; se algum teste antigo monta 4+, dê XP ao treinador no `beforeEach` desse teste (`xp: 27000` → 6 vagas).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- hunt-store trainer`

- [ ] **Step 3: Banco**

`src/db/schema.ts` (`trainers`): `potionHpPercent: integer('potion_hp_percent').notNull().default(50)` e, no terceiro argumento, `check('trainers_gold_check', sql\`${t.gold} >= 0\`)`. Gere: `pnpm --filter @pokeidle/server db:generate` → `drizzle/0001_*.sql`; abra e confira `ALTER TABLE "trainers" ADD COLUMN "potion_hp_percent" integer DEFAULT 50 NOT NULL` e o `CHECK`. Commite `drizzle/` inteira (inclusive `meta/`).

- [ ] **Step 4: `hunt-store`, `account`, rotas**

`src/account/progress.ts`:
```ts
import { nextUnlock, teamSlotsFor, trainerLevel, xpToNextLevel, type Registry } from '@pokeidle/shared'
import type { TrainerRow } from '../db/schema.js'
export interface TrainerProgress { readonly level: number; readonly xpToNext: number; readonly teamSlots: number; readonly nextUnlock: { level: number; what: string } | null }
export function trainerProgress(registry: Registry, trainer: Pick<TrainerRow, 'xp'>): TrainerProgress {
  const level = trainerLevel(registry.unlocks, trainer.xp)
  return { level, xpToNext: xpToNextLevel(registry.unlocks, trainer.xp), teamSlots: teamSlotsFor(registry.unlocks, level), nextUnlock: nextUnlock(registry.unlocks, level, registry.items) }
}
```
`dto.ts`: `settingsDto` inclui `potionHpPercent`; `trainerDto(t, extra, progress: TrainerProgress)` espalha `...progress`. `me.ts`: `trainerView(db, registry, trainer)` = `trainerDto(trainer, await trainerExtra(db, trainer.id), trainerProgress(registry, trainer))`; `getMe(db, registry, auth)`. Substitua todo `trainerDto(x, await trainerExtra(...))` em `routes/auth.ts`, `routes/hunts.ts`, `routes/trainer.ts` por `trainerView(db, registry, x)` (`registry` já está em `RouteDeps`).

`mappers.ts`: `toHuntSettings(trainer, seen, teamSlots)` devolve também `potionHpPercent: trainer.potionHpPercent, teamSlots`. `start.ts`: `const slots = teamSlotsFor(registry.unlocks, trainerLevel(registry.unlocks, trainer.xp))`; `if (teamRows.length > slots) throw new AppError('validation', \`o time tem ${slots} vagas no nível atual\`)`; passa `slots`.

`sync.ts`: 
```ts
async function syncBox(tx: Tx, trainerId: string, state: HuntState, now: Date): Promise<void> {
  for (const p of state.box) {
    await tx.insert(pokemon).values({ id: p.id, trainerId, speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, teamSlot: null, updatedAt: now })
      .onConflictDoUpdate({ target: pokemon.id, set: { speciesName: p.speciesName, level: p.level, xp: p.xp, hp: p.hp, hpMax: p.hpMax, updatedAt: now } })
  }
}
```
chamado em `syncWithin` depois de `syncTeam` (o conflito nunca toca `teamSlot`, então um Pokémon promovido ao time por `PUT /trainer/team` não volta para a mochila). `syncPokedex` já cobre `seen`.

`shared/src/protocol/messages.ts`: `SettingsPatchSchema` ganha `potionHpPercent: percent.optional()` (mesmo validador de `returnHpPercent`). `settings.ts`: `updateSettings` grava `potionHpPercent` quando presente. `team.ts`: `setTeamOrder(db, registry, trainerId, ids, now)` com `const slots = teamSlotsFor(registry.unlocks, trainerLevel(registry.unlocks, trainerRow.xp))` (leia o treinador) e `if (ids.length > slots) throw new AppError('validation', \`o time tem ${slots} vagas no nível ${level}\`)`; `TeamOrderSchema` mantém `max(TEAM_MAX)`. `routes/trainer.ts` passa `registry`.

`applySettings` em `realtime/actions.ts` já repassa o patch inteiro ao intent (`toIntentPatch`): inclua `potionHpPercent` no mapeamento.

- [ ] **Step 5: Rodar tudo**

Run: `pnpm --filter @pokeidle/server test && pnpm -r typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/server
git commit -m "feat(server): nível do treinador com vagas e destraves, potionHpPercent e mochila de Pokémon persistida"
```

---

### Task 5: Loja do Centro Pokémon (`/shop`), códigos novos e README

**Files:**
- Create: `packages/server/src/account/shop.ts`, `src/http/routes/shop.ts`, `test/shop.test.ts`
- Modify: `packages/server/src/http/errors.ts`, `src/http/app.ts` (registrar `shopRoutes`), `test/errors.test.ts`, `packages/server/README.md` (tabela de rotas, `/me`, settings)

**Interfaces:**
- Consumes: `trainerProgress(registry, trainer)` (Task 4), `itemUnlockLevel(unlocks, itemId)` (Task 2), `hasActiveHunt(db, trainerId)` (`account/team.ts`), `parseBody`, `requireAuth`/`authOf`, `RouteDeps { db, now, registry, ... }`.
- Produces: `ErrorCode` + `'locked' | 'insufficient-gold'` (409); `ShopTradeSchema = z.object({ itemId: kebab, quantity: z.number().int().min(1).max(99) }).strict()`; `catalog(db, registry, trainer)`, `buy(db, registry, trainerId, itemId, quantity, now)`, `sell(db, registry, trainerId, itemId, quantity, now)` devolvendo `{ gold, item: { itemId, quantity } }`.

- [ ] **Step 1: Testes**

`test/errors.test.ts`: na tabela esperada acrescente `locked: 409, 'insufficient-gold': 409` (entre `'no-hunt': 409` e `'payload-too-large'`).

`test/shop.test.ts`:
```ts
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { inventory, trainers } from '../src/db/schema.js'
import { truncateAll } from './helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0; ({ cookie, trainerId } = await registerAndLogin(t.app)) })

const setTrainer = (patch: { gold?: number; xp?: number }) => t.db.update(trainers).set(patch).where(eq(trainers.id, trainerId))
const goldOf = async () => (await t.db.select({ gold: trainers.gold }).from(trainers).where(eq(trainers.id, trainerId)))[0]!.gold
const owned = async (itemId: string) => (await t.db.select({ q: inventory.quantity }).from(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, itemId))))[0]?.q ?? 0
type Body = { gold: number; item: { itemId: string; quantity: number } }

describe('GET /shop', () => {
  it('catálogo ordenado por nível e preço, com unlocked por nível e owned', async () => {
    await setTrainer({ gold: 250, xp: 1000 })
    await t.db.insert(inventory).values({ trainerId, itemId: 'potion', quantity: 2 })
    const body = (await api(t.app, cookie).get('/shop')).json() as { level: number; gold: number; items: Record<string, unknown>[] }
    expect(body).toMatchObject({ level: 10, gold: 250 })
    expect(body.items.map((i) => i.itemId)).toEqual(['potion', 'poke-ball', 'super-potion', 'great-ball', 'hyper-potion', 'ultra-ball'])
    expect(body.items[0]).toEqual({ itemId: 'potion', name: 'Poção', kind: 'potion', buyPrice: 100, sellPrice: 50, unlockLevel: 0, unlocked: true, owned: 2 })
    expect(body.items[2]).toMatchObject({ itemId: 'super-potion', unlockLevel: 20, unlocked: false, owned: 0 })
  })
})

describe('POST /shop/buy', () => {
  it('compra debitando o ouro e somando ao inventário', async () => {
    await setTrainer({ gold: 350 })
    const r = await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 3 })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ gold: 50, item: { itemId: 'potion', quantity: 3 } })
    expect(await owned('potion')).toBe(3)
    const again = (await api(t.app, cookie).post('/shop/buy', { itemId: 'poke-ball', quantity: 1 })).json() as { error: { code: string } }
    expect(again.error.code).toBe('insufficient-gold')
    expect(await goldOf()).toBe(50)
  })
  it('locked abaixo do nível; not-found para item inexistente; validation para quantidade 100', async () => {
    await setTrainer({ gold: 100000 })
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'super-potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'locked' } })
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'master-ball', quantity: 1 })).statusCode).toBe(404)
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 100 })).statusCode).toBe(400)
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 1, hack: true })).statusCode).toBe(400)
    await setTrainer({ xp: 8000 })
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'super-potion', quantity: 1 })).statusCode).toBe(200)
  })
  it('recusa com hunt ativa', async () => {
    await setTrainer({ gold: 1000 })
    await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).statusCode).toBe(201)
    expect((await api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'hunt-active' } })
    expect((await api(t.app, cookie).post('/shop/sell', { itemId: 'potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'hunt-active' } })
    await api(t.app, cookie).post('/hunts/stop')
  })
  it('compras concorrentes nunca deixam o ouro negativo', async () => {
    await setTrainer({ gold: 250 })
    const results = await Promise.all(Array.from({ length: 4 }, () => api(t.app, cookie).post('/shop/buy', { itemId: 'potion', quantity: 1 })))
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2)
    expect(await goldOf()).toBe(50)
    expect(await owned('potion')).toBe(2)
  })
  it('a conta B não compra com o ouro de A', async () => {
    await setTrainer({ gold: 1000 })
    const b = await registerAndLogin(t.app, 2)
    expect((await api(t.app, b.cookie).post('/shop/buy', { itemId: 'potion', quantity: 1 })).json()).toMatchObject({ error: { code: 'insufficient-gold' } })
    expect(await goldOf()).toBe(1000)
  })
})

describe('POST /shop/sell', () => {
  it('vende pela metade, decrementa e apaga em zero; além do que tem → validation', async () => {
    await t.db.insert(inventory).values({ trainerId, itemId: 'potion', quantity: 2 })
    const r = await api(t.app, cookie).post('/shop/sell', { itemId: 'potion', quantity: 2 })
    expect(r.json()).toEqual({ gold: 100, item: { itemId: 'potion', quantity: 0 } })
    expect(await t.db.select().from(inventory).where(eq(inventory.trainerId, trainerId))).toEqual([])
    expect((await api(t.app, cookie).post('/shop/sell', { itemId: 'potion', quantity: 1 })).statusCode).toBe(400)
  })
})
```
(`registerAndLogin` recebe `n` para e-mail/nome diferentes; ouro inicial do treinador é 0 — confira em `account/register.ts`; se for outro valor, ajuste os números com `setTrainer`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- shop errors`

- [ ] **Step 3: Implementar**

`src/http/errors.ts`: `ErrorCode` ganha `'locked' | 'insufficient-gold'`; `STATUS_BY_CODE` ganha `locked: 409, 'insufficient-gold': 409`.

`src/account/shop.ts`:
```ts
import { itemUnlockLevel, type Item, type Registry } from '@pokeidle/shared'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbLike } from '../db/client.js'
import { inventory, trainers, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'
import { trainerProgress } from './progress.js'
import { hasActiveHunt } from './team.js'

export const ShopTradeSchema = z.object({ itemId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), quantity: z.number().int().min(1).max(99) }).strict()
export interface TradeResult { readonly gold: number; readonly item: { readonly itemId: string; readonly quantity: number } }

const byLevelThenPrice = (u: Registry['unlocks']) => (a: Item, b: Item) =>
  itemUnlockLevel(u, a.id) - itemUnlockLevel(u, b.id) || a.buyPrice - b.buyPrice

export async function catalog(db: DbLike, registry: Registry, trainer: TrainerRow) {
  const { level } = trainerProgress(registry, trainer)
  const rows = await db.select({ itemId: inventory.itemId, quantity: inventory.quantity }).from(inventory).where(eq(inventory.trainerId, trainer.id))
  const owned = new Map(rows.map((r) => [r.itemId, r.quantity]))
  const items = [...registry.items.values()].sort(byLevelThenPrice(registry.unlocks)).map((i) => {
    const unlockLevel = itemUnlockLevel(registry.unlocks, i.id)
    return { itemId: i.id, name: i.name, kind: i.kind, buyPrice: i.buyPrice, sellPrice: i.sellPrice, unlockLevel, unlocked: level >= unlockLevel, owned: owned.get(i.id) ?? 0 }
  })
  return { level, gold: trainer.gold, items }
}

const itemOrThrow = (registry: Registry, itemId: string): Item => {
  const item = registry.items.get(itemId)
  if (!item) throw new AppError('not-found', 'item não existe')
  return item
}

/** S30: preço do registro, treinador travado com FOR UPDATE, ouro nunca negativo. S31: só sem hunt. */
export async function buy(db: Db, registry: Registry, trainerId: string, itemId: string, quantity: number, now: Date): Promise<TradeResult> {
  const item = itemOrThrow(registry, itemId)
  return db.transaction(async (tx) => {
    if (await hasActiveHunt(tx, trainerId)) throw new AppError('hunt-active', 'pare a hunt antes de usar a loja')
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId)).for('update')
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    const { level } = trainerProgress(registry, trainer)
    const unlockLevel = itemUnlockLevel(registry.unlocks, item.id)
    if (level < unlockLevel) throw new AppError('locked', `${item.name} destrava no nível ${unlockLevel}`)
    const cost = item.buyPrice * quantity
    if (trainer.gold < cost) throw new AppError('insufficient-gold', `faltam ${cost - trainer.gold} de ouro`)
    await tx.update(trainers).set({ gold: trainer.gold - cost, updatedAt: now }).where(eq(trainers.id, trainerId))
    const [row] = await tx.insert(inventory).values({ trainerId, itemId: item.id, quantity, updatedAt: now })
      .onConflictDoUpdate({ target: [inventory.trainerId, inventory.itemId], set: { quantity: sql`${inventory.quantity} + ${quantity}`, updatedAt: now } })
      .returning({ quantity: inventory.quantity })
    return { gold: trainer.gold - cost, item: { itemId: item.id, quantity: row?.quantity ?? quantity } }
  })
}

export async function sell(db: Db, registry: Registry, trainerId: string, itemId: string, quantity: number, now: Date): Promise<TradeResult> {
  const item = itemOrThrow(registry, itemId)
  return db.transaction(async (tx) => {
    if (await hasActiveHunt(tx, trainerId)) throw new AppError('hunt-active', 'pare a hunt antes de usar a loja')
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, trainerId)).for('update')
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    const [owned] = await tx.select({ quantity: inventory.quantity }).from(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, item.id)))
    const have = owned?.quantity ?? 0
    if (have < quantity) throw new AppError('validation', `você tem ${have} de ${item.name}`)
    const gold = trainer.gold + item.sellPrice * quantity
    await tx.update(trainers).set({ gold, updatedAt: now }).where(eq(trainers.id, trainerId))
    const left = have - quantity
    if (left === 0) await tx.delete(inventory).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, item.id)))
    else await tx.update(inventory).set({ quantity: left, updatedAt: now }).where(and(eq(inventory.trainerId, trainerId), eq(inventory.itemId, item.id)))
    return { gold, item: { itemId: item.id, quantity: left } }
  })
}
```
(`trainers.updatedAt`: confira o nome real da coluna de atualização em `db/schema.ts`; se não existir em `trainers`, omita.) `hasActiveHunt` recebe `DbLike`, e `tx` satisfaz `DbLike` (como em `syncWithin`); se o tipo não bater, tipar o parâmetro como `DbLike` já resolve.

`src/http/routes/shop.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify'
import { buy, catalog, sell, ShopTradeSchema } from '../../account/shop.js'
import { authOf, requireAuth } from '../../auth/plugin.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

export const shopRoutes: FastifyPluginAsync<RouteDeps> = async (app, deps) => {
  const { db, now, registry } = deps
  const guard = { preHandler: requireAuth }
  app.get('/shop', guard, async (request) => catalog(db, registry, authOf(request).trainer))
  app.post('/shop/buy', guard, async (request) => {
    const { itemId, quantity } = parseBody(ShopTradeSchema, request.body)
    return buy(db, registry, authOf(request).trainer.id, itemId, quantity, now())
  })
  app.post('/shop/sell', guard, async (request) => {
    const { itemId, quantity } = parseBody(ShopTradeSchema, request.body)
    return sell(db, registry, authOf(request).trainer.id, itemId, quantity, now())
  })
}
```
`src/http/app.ts`: registrar `shopRoutes` ao lado de `trainerRoutes` com as mesmas deps (mesmo escopo de rate limit e Origin: as rotas `POST` passam pelo `checkOrigin` como as outras rotas de estado).

- [ ] **Step 4: README**

`packages/server/README.md`: na tabela de rotas acrescente `| GET /shop | sim | — |`, `| POST /shop/buy | sim | validation, not-found, locked, insufficient-gold, hunt-active |`, `| POST /shop/sell | sim | validation, not-found, hunt-active |`; em `PUT /trainer/team` cite "limitado às vagas do nível (`unlocks.json`)"; um parágrafo curto após a tabela: `GET /me` devolve `level`, `xpToNext`, `teamSlots`, `nextUnlock` e `settings.potionHpPercent`; `PATCH /trainer/settings` aceita `potionHpPercent`; a loja só funciona sem hunt ativa (S31) e roda em transação com `FOR UPDATE` e `check (gold >= 0)` (S30). Na seção do protocolo WebSocket, note que os tipos e schemas agora vivem em `@pokeidle/shared/protocol` (`settings.update` aceita `potionHpPercent`).

- [ ] **Step 5: Rodar tudo com cobertura**

Run: `pnpm --filter @pokeidle/server test -- --coverage && pnpm --filter @pokeidle/shared test -- --coverage && pnpm -r typecheck`
Expected: verde; cobertura ≥ 80 % em `packages/server/src` e `packages/shared/src` (reporte os números).

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): loja do Centro Pokémon com compra e venda transacionais por nível"
```

---

## Self-review (feito ao escrever)

- Spec §2 → Task 1 (+ campos novos na Task 3); §3 → Task 2; §4 → Task 3; §5 → Task 4; §6 → Task 5; §7 S29 (Task 4 `progress.ts`), S30/S31 (Task 5), S32 (Task 3 `.default()`); §8 testes distribuídos (balance na Task 3, hunt-store e REST na Task 4, loja na Task 5, errors na Task 5).
- Nomes cruzados: `choosePotion` (Task 3, `items.ts`), `trainerProgress` (Task 4, `progress.ts`) usado na Task 5, `hasActiveHunt` (existente em `team.ts`), `SettingsPatchSchema` no shared com `potionHpPercent` (Task 4), `teamSlotsFor`/`trainerLevel`/`itemUnlockLevel`/`nextUnlock(u, level, items)` (Task 2).
- A fixture do motor (`mini.ts`) recebe `unlocks` com 6 vagas no nível 1 na Task 2, para os testes de captura existentes não mudarem antes da Task 3.
