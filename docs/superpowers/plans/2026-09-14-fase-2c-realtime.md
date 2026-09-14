# Fase 2c: Tempo real — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scheduler em processo a 5 ticks/s para todas as hunts ativas, WebSocket autenticado por cookie enviando os eventos do motor, snapshot a cada 10 s e sync a cada 60 s com `hunt_log`, catch-up em fatias até 12 h e recuperação de sessões no boot.

**Architecture:** Novo módulo `packages/server/src/realtime/` sobre `engine` e `hunt-store`. Um `Runner` imutável por treinador (o `Rng` é o único mutável, encapsulado) guardado num `Map` do scheduler; um único `setInterval(TICK_MS)`; escritas de um treinador serializadas numa cadeia de promessas; catch-up em fatias com `setImmediate`; `actions.ts` como único ponto de entrada compartilhado por REST e WS.

**Tech Stack:** TypeScript 5 strict ESM, Fastify 5.12, `@fastify/websocket` 11.3 (+ `ws` 8 e `@types/ws` 8 nos testes), Drizzle 0.45 + Postgres 16 (Compose, porta 5433), zod 3, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-09-14-fase-2c-realtime-design.md`

## Global Constraints

- `TICK_MS = 200` (do `shared`); `SNAPSHOT_EVERY_TICKS = 50`; `SYNC_EVERY_TICKS = 300`; `CATCHUP_SLICE_TICKS = 2000`; `MAX_CATCHUP_TICKS = 216_000`; `MIN_CATCHUP_TICKS = 5`; `INTENT_MIN_INTERVAL_MS = 200`; `WS_MAX_MESSAGE_BYTES = 4096`; `WS_MAX_INVALID_IN_A_ROW = 3`; `WS_PING_MS = 30_000`; `WS_PONG_TIMEOUT_MS = 60_000`; `WS_SESSION_RECHECK_MS = 300_000`; `TICK_LAG_WARN_MS = 1000`; `PERSIST_MAX_FAILURES = 3`.
- Ordem no tick: `step` → eventos aos sockets (`hunt.tick`) → save/sync encadeados (o tick não espera o banco) → `stopped` ⇒ `finish`. Parada por `team-fainted` cura o time (`hp = hp_max`) no flush final; `intent`, `no-route`, `corrupt`, `persist-failed` não curam. `corrupt` e `persist-failed` não sincronizam.
- Toda escrita de um treinador passa pela cadeia `persistChain` daquele treinador; `finishRunner` bloqueia a linha de `hunt_sessions` com `FOR UPDATE`; o `rngState` gravado é o capturado no momento de enfileirar, nunca lido depois.
- Catch-up: `ticksOwed = min(MAX_CATCHUP_TICKS, floor((now − lastSimulatedAt) / TICK_MS))`; abaixo de `MIN_CATCHUP_TICKS` entra direto; fatias de `CATCHUP_SLICE_TICKS` com `setImmediate` entre elas; `Summary` acumulado por soma, nunca um array de eventos; `stopped` no meio encerra; resultado idêntico a `simulate(N)` com a mesma seed e `rngState`.
- WebSocket: handshake exige `Origin` igual a `APP_ORIGIN` (403) e cookie válido (401), senão nada abre; envelope `{ t, ... }` Zod `.strict()`; mensagem > 4 KB → `error validation`; três inválidas seguidas → close 1008; uma intenção por 200 ms por conexão (`ping` não conta) → excedente `error rate-limited`; ping do servidor a cada 30 s, sem pong em 60 s → close 1001; revalidação da sessão a cada 5 min → close 1008; logout fecha os sockets do token.
- S25: `hunt.snapshot` e `GET /hunts/active` montam o objeto campo a campo (`huntId`, `sessionId`, `startedAt`, `state`); `seed`/`rngState` nunca saem.
- Erros: `AppError` no REST; no WS vira `error { code, message }` só para o socket que enviou. Erro dentro de `step`: log, runner removido da memória sem apagar a sessão, sockets recebem `error internal`. Erro de banco na cadeia: log, contador; três seguidas → `finish` com `persist-failed` (sem sync).
- Sem `console.log`; serviços recebem `db` por parâmetro; imutabilidade fora do `Rng` e dos registros de infraestrutura (`Map`/`Set` do scheduler e dos sockets, documentados como tal). TypeScript strict ESM, imports `.js`. Commits convencionais de UMA linha, sem trailers. TDD; cobertura ≥ 80 % em `packages/server/src` (`main.ts` e `migrate-cli.ts` excluídos).
- Testes de integração contra o Postgres do Compose (`DATABASE_URL_TEST`), `fileParallelism: false`; testes de WebSocket com `app.listen({ port: 0 })` e o cliente `ws`.

## Estrutura de arquivos

```
packages/server/src/realtime/
  constants.ts  runner.ts  catchup.ts  protocol.ts  sockets.ts
  persist.ts  scheduler.ts  actions.ts  ws.ts  boot.ts  index.ts
packages/server/src/http/app.ts        (+ realtime em AppDeps, registra wsRoutes)
packages/server/src/http/security.ts   (+ sameOrigin)
packages/server/src/http/routes/{hunts,trainer,auth}.ts  (via actions / sockets)
packages/server/src/main.ts            (scheduler, recoverSessions, shutdown)
packages/server/src/http/routes/debug.ts + public/debug/{index.html,viewer.js,viewer.css}  (Task 7, atrás de DEBUG_VIEWER)
packages/server/test/helpers/app.ts    (+ scheduler/sockets no TestApp, silentLogger)
packages/server/test/helpers/ws.ts     (cliente ws de teste)
packages/server/test/realtime/{runner,catchup,protocol,sockets,scheduler,actions,ws,boot}.test.ts
```

---

### Task 1: `constants.ts`, `runner.ts`, `catchup.ts` (puros) e dependências

**Files:**
- Create: `packages/server/src/realtime/constants.ts`, `src/realtime/runner.ts`, `src/realtime/catchup.ts`, `src/realtime/index.ts`
- Modify: `packages/server/package.json` (deps `@fastify/websocket`, `ws`; devDeps `@types/ws`)
- Test: `packages/server/test/realtime/runner.test.ts`, `test/realtime/catchup.test.ts`

**Interfaces:**
- Consumes: `step`, `simulate`, `summarizeEvents`, `Summary`, `Event`, `HuntState`, `EngineDeps` (`src/engine`), `ActiveHunt` (`src/hunt-store/snapshot.ts`), `createRng`, `Registry`, `Rng`, `TICK_MS` (`@pokeidle/shared`), fixture `test/engine/fixtures/mini.ts` (`miniRegistry`, `miniHunt`, `miniDeps`, `baseState`, `charmander5`).
- Produces: constantes acima; `LogEntry`, `Runner`, `StopReason`, `StoppedEvent`, `createRunner(trainerId, active: ActiveHunt): Runner`, `engineDeps(runner, registry): EngineDeps`, `logEntriesOf(events, huntId): LogEntry[]`, `tickRunner(runner, deps): TickOutcome` com `TickOutcome { runner; events; stopped: StoppedEvent | null }`, `needsSave(runner)`, `needsSync(runner)`, `markSaved(runner, sync)`, `PersistSnapshot { trainerId; huntId; state; rngState; pendingLog }`, `toPersistSnapshot(runner)`; `ticksOwedSince(last, now)`, `emptySummary()`, `addSummaries(a, b)`, `catchUp(runner, ticks, deps, hooks?): Promise<CatchUpResult>` com `CatchUpHooks { onSlice?(remaining); yieldNow?(): Promise<void>; shouldAbort?(): boolean }` e `CatchUpResult { runner; summary; stopped; ticksDone }`.

- [ ] **Step 1: Dependências**

Em `packages/server/package.json` acrescente em `dependencies`: `"@fastify/websocket": "^11.3.0"`, `"ws": "^8.21.3"`; em `devDependencies`: `"@types/ws": "^8.18.1"`. Rode `pnpm install` na raiz.

- [ ] **Step 2: Testes**

`test/realtime/runner.test.ts`:
```ts
import { createRng } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate.js'
import type { Event } from '../../src/engine/types.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from '../../src/realtime/constants.js'
import { createRunner, engineDeps, logEntriesOf, markSaved, needsSave, needsSync, tickRunner, toPersistSnapshot } from '../../src/realtime/runner.js'
import { baseState, miniDeps, miniRegistry } from '../engine/fixtures/mini.js'

const T0 = new Date('2026-09-14T12:00:00Z')
const activeOf = (seed = 1) => {
  const deps = miniDeps(seed)
  const state = baseState({}, deps)
  return { huntId: state.huntId, sessionId: state.sessionId, state, seed, rngState: deps.rng.state(), startedAt: T0, lastSimulatedAt: T0 }
}

describe('createRunner / engineDeps', () => {
  it('nasce do ActiveHunt com rng retomado do rngState', () => {
    const active = activeOf(7)
    const r = createRunner('t1', active)
    expect(r).toMatchObject({ trainerId: 't1', huntId: active.huntId, sessionId: active.sessionId, seed: 7, pendingLog: [], lastSaveTick: 0, lastSyncTick: 0, catchingUp: false, persistFailures: 0, lastSimulatedAt: T0 })
    expect(r.rng.state()).toBe(active.rngState)
    const deps = engineDeps(r, miniRegistry())
    expect(deps.hunt.id).toBe(active.huntId)
    expect(deps.rng).toBe(r.rng)
  })
  it('engineDeps falha com hunt desconhecida', () => {
    const r = { ...createRunner('t1', activeOf()), huntId: 'nope' }
    expect(() => engineDeps(r, miniRegistry())).toThrow(/nope/)
  })
})

describe('tickRunner', () => {
  it('avança um tick igual ao motor e acumula o log só de derrotas e capturas', () => {
    const active = activeOf(3)
    const r0 = createRunner('t1', active)
    const registry = miniRegistry()
    let r = r0
    const collected: Event[] = []
    for (let i = 0; i < 200; i++) { const o = tickRunner(r, engineDeps(r, registry)); r = o.runner; collected.push(...o.events) }
    const ref = simulate(active.state, 200, { ...miniDeps(3), rng: createRng(3, active.rngState) }) // mesma sequência que o runner retoma
    expect(r.state).toEqual(ref.state)
    expect(collected).toEqual(ref.events)
    const expectedLog = logEntriesOf(ref.events, active.huntId)
    expect(r.pendingLog).toEqual(expectedLog)
    expect(expectedLog.length).toBeGreaterThan(0)
    expect(expectedLog.every((e) => e.huntId === active.huntId)).toBe(true)
    expect(expectedLog.some((e) => !e.captured && e.xpTrainer > 0)).toBe(true)
  })
  it('sinaliza stopped', () => {
    const active = activeOf()
    const fainted = { ...active, state: { ...active.state, player: { ...active.state.player, mode: 'fighting' as const, team: [{ ...active.state.player.team[0]!, hp: 0 }] } } }
    const r = createRunner('t1', fainted)
    const o = tickRunner(r, engineDeps(r, miniRegistry()))
    expect(o.stopped).toMatchObject({ type: 'stopped', reason: 'team-fainted' })
  })
})

describe('logEntriesOf', () => {
  it('mapeia wildDefeated e captured e ignora o resto', () => {
    const events: Event[] = [
      { type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: 'wildDefeated', tick: 2, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] },
      { type: 'captured', tick: 3, wildId: 2, speciesName: 'gastly', level: 8, ball: 'poke-ball', toBox: false },
    ]
    expect(logEntriesOf(events, 'mini')).toEqual([
      { huntId: 'mini', speciesName: 'zubat', level: 3, xpTrainer: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }], captured: false },
      { huntId: 'mini', speciesName: 'gastly', level: 8, xpTrainer: 0, gold: 0, drops: [], captured: true },
    ])
  })
})

describe('save/sync', () => {
  it('needsSave e needsSync por contagem de ticks; markSaved zera o log só no sync', () => {
    const r0 = createRunner('t1', activeOf())
    const at = (tick: number) => ({ ...r0, state: { ...r0.state, tick }, pendingLog: [{ huntId: 'mini', speciesName: 'zubat', level: 3, xpTrainer: 1, gold: 1, drops: [], captured: false }] })
    expect(needsSave(at(SNAPSHOT_EVERY_TICKS - 1))).toBe(false)
    expect(needsSave(at(SNAPSHOT_EVERY_TICKS))).toBe(true)
    expect(needsSync(at(SYNC_EVERY_TICKS - 1))).toBe(false)
    expect(needsSync(at(SYNC_EVERY_TICKS))).toBe(true)
    const saved = markSaved(at(50), false)
    expect(saved).toMatchObject({ lastSaveTick: 50, lastSyncTick: 0 })
    expect(saved.pendingLog).toHaveLength(1)
    const synced = markSaved(at(300), true)
    expect(synced).toMatchObject({ lastSaveTick: 300, lastSyncTick: 300, pendingLog: [] })
  })
  it('toPersistSnapshot captura o rngState no momento', () => {
    const r = createRunner('t1', activeOf(5))
    const snap = toPersistSnapshot(r)
    expect(snap).toEqual({ trainerId: 't1', huntId: r.huntId, state: r.state, rngState: r.rng.state(), pendingLog: [] })
    r.rng.next()
    expect(snap.rngState).not.toBe(r.rng.state())
  })
})
```

`test/realtime/catchup.test.ts`:
```ts
import { createRng, TICK_MS } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'
import { addSummaries, catchUp, emptySummary, ticksOwedSince } from '../../src/realtime/catchup.js'
import { CATCHUP_SLICE_TICKS, MAX_CATCHUP_TICKS } from '../../src/realtime/constants.js'
import { createRunner, engineDeps } from '../../src/realtime/runner.js'
import { baseState, miniDeps, miniRegistry } from '../engine/fixtures/mini.js'

const T0 = new Date('2026-09-14T12:00:00Z')
const activeOf = (seed = 1) => { const deps = miniDeps(seed); const state = baseState({}, deps); return { huntId: state.huntId, sessionId: state.sessionId, state, seed, rngState: deps.rng.state(), startedAt: T0, lastSimulatedAt: T0 } }

describe('ticksOwedSince', () => {
  it('arredonda para baixo, nunca negativo, com teto', () => {
    expect(ticksOwedSince(T0, new Date(T0.getTime() + 999))).toBe(4)
    expect(ticksOwedSince(T0, new Date(T0.getTime() - 5000))).toBe(0)
    expect(ticksOwedSince(T0, new Date(T0.getTime() + 13 * 3600 * 1000))).toBe(MAX_CATCHUP_TICKS)
    expect(ticksOwedSince(T0, new Date(T0.getTime() + 12 * 3600 * 1000))).toBe(MAX_CATCHUP_TICKS)
  })
})

describe('addSummaries', () => {
  it('soma campos e mescla drops', () => {
    const a = { ...emptySummary(), ticks: 1, defeats: 1, gold: 5, drops: { potion: 1 } }
    const b = { ...emptySummary(), ticks: 2, defeats: 2, gold: 7, drops: { potion: 2, 'poke-ball': 1 } }
    expect(addSummaries(a, b)).toEqual({ ...emptySummary(), ticks: 3, defeats: 3, gold: 12, drops: { potion: 3, 'poke-ball': 1 } })
  })
})

describe('catchUp', () => {
  it('em fatias dá o mesmo estado e o mesmo resumo que simulate de uma vez', async () => {
    const active = activeOf(9)
    const r0 = createRunner('t1', active)
    const slices: number[] = []
    const res = await catchUp(r0, 4500, engineDeps(r0, miniRegistry()), { onSlice: (n) => slices.push(n), yieldNow: () => Promise.resolve() })
    const ref = simulate(active.state, 4500, { ...miniDeps(9), rng: createRng(9, active.rngState) })
    expect(res.runner.state).toEqual(ref.state)
    expect(res.summary).toEqual(summarizeEvents(ref.events, 4500))
    expect(res.ticksDone).toBe(4500)
    expect(res.stopped).toBeNull()
    expect(slices).toEqual([2500, 500, 0])
    expect(res.runner.lastSimulatedAt).toEqual(new Date(T0.getTime() + 4500 * TICK_MS))
    expect(res.runner.pendingLog.filter((e) => !e.captured)).toHaveLength(res.summary.defeats)
  })
  it('para no stopped e devolve os ticks feitos', async () => {
    const active = activeOf()
    const fainted = { ...active, state: { ...active.state, player: { ...active.state.player, mode: 'fighting' as const, team: [{ ...active.state.player.team[0]!, hp: 0 }] } } }
    const r0 = createRunner('t1', fainted)
    const res = await catchUp(r0, 1000, engineDeps(r0, miniRegistry()), { yieldNow: () => Promise.resolve() })
    expect(res.stopped).toMatchObject({ reason: 'team-fainted' })
    expect(res.ticksDone).toBe(1)
  })
  it('aborta entre fatias quando shouldAbort diz sim', async () => {
    const r0 = createRunner('t1', activeOf(2))
    let calls = 0
    const res = await catchUp(r0, CATCHUP_SLICE_TICKS * 3, engineDeps(r0, miniRegistry()), { yieldNow: () => Promise.resolve(), shouldAbort: () => ++calls >= 2 })
    expect(res.ticksDone).toBe(CATCHUP_SLICE_TICKS) // shouldAbort é avaliado no início de cada volta: 1ª falso, 2ª verdadeiro
  })
  it('usa setImmediate por padrão sem travar', async () => {
    const r0 = createRunner('t1', activeOf(4))
    let ran = false
    setImmediate(() => { ran = true })
    const res = await catchUp(r0, CATCHUP_SLICE_TICKS + 1, engineDeps(r0, miniRegistry()))
    expect(res.ticksDone).toBe(CATCHUP_SLICE_TICKS + 1)
    expect(ran).toBe(true)
  })
})
```
Sobre o valor `[2500, 500, 0]`: 4500 ticks em fatias de 2000 → restam 2500 após a primeira, 500 após a segunda, 0 após a terceira (fatia de 500).

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- realtime`
Expected: FAIL por módulos inexistentes.

- [ ] **Step 4: Implementar**

`src/realtime/constants.ts`:
```ts
export const SNAPSHOT_EVERY_TICKS = 50
export const SYNC_EVERY_TICKS = 300
export const CATCHUP_SLICE_TICKS = 2000
export const MAX_CATCHUP_TICKS = 216_000
export const MIN_CATCHUP_TICKS = 5
export const INTENT_MIN_INTERVAL_MS = 200
export const WS_MAX_MESSAGE_BYTES = 4096
export const WS_MAX_INVALID_IN_A_ROW = 3
export const WS_PING_MS = 30_000
export const WS_PONG_TIMEOUT_MS = 60_000
export const WS_SESSION_RECHECK_MS = 300_000
export const TICK_LAG_WARN_MS = 1000
export const PERSIST_MAX_FAILURES = 3
```

`src/realtime/runner.ts`:
```ts
import { createRng, type Registry, type Rng } from '@pokeidle/shared'
import { step } from '../engine/step.js'
import type { EngineDeps, Event, HuntState } from '../engine/types.js'
import type { ActiveHunt } from '../hunt-store/snapshot.js'
import { AppError } from '../http/errors.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from './constants.js'

export type StoppedEvent = Extract<Event, { type: 'stopped' }>
export type StopReason = StoppedEvent['reason'] | 'corrupt' | 'persist-failed'

export interface LogEntry {
  readonly huntId: string; readonly speciesName: string; readonly level: number
  readonly xpTrainer: number; readonly gold: number
  readonly drops: readonly { readonly item: string; readonly quantity: number }[]
  readonly captured: boolean
}

/** Registro imutável de uma hunt viva. `rng` é o único mutável, encapsulado no motor. */
export interface Runner {
  readonly trainerId: string; readonly huntId: string; readonly sessionId: string; readonly seed: number
  readonly rng: Rng
  readonly state: HuntState
  readonly pendingLog: readonly LogEntry[]
  readonly lastSaveTick: number; readonly lastSyncTick: number
  readonly catchingUp: boolean
  readonly lastSimulatedAt: Date; readonly startedAt: Date
  readonly persistFailures: number
}

export interface PersistSnapshot { readonly trainerId: string; readonly huntId: string; readonly state: HuntState; readonly rngState: number; readonly pendingLog: readonly LogEntry[] }
export interface TickOutcome { readonly runner: Runner; readonly events: readonly Event[]; readonly stopped: StoppedEvent | null }

export function createRunner(trainerId: string, active: ActiveHunt): Runner {
  return {
    trainerId, huntId: active.huntId, sessionId: active.sessionId, seed: active.seed,
    rng: createRng(active.seed, active.rngState), state: active.state, pendingLog: [],
    lastSaveTick: active.state.tick, lastSyncTick: active.state.tick, catchingUp: false,
    lastSimulatedAt: active.lastSimulatedAt, startedAt: active.startedAt, persistFailures: 0,
  }
}

export function engineDeps(runner: Runner, registry: Registry): EngineDeps {
  const hunt = registry.hunts.get(runner.huntId)
  if (!hunt) throw new AppError('not-found', `hunt ${runner.huntId} não existe`)
  return { registry, hunt, rng: runner.rng }
}

export function logEntriesOf(events: readonly Event[], huntId: string): LogEntry[] {
  return events.flatMap((e) => {
    if (e.type === 'wildDefeated') return [{ huntId, speciesName: e.speciesName, level: e.level, xpTrainer: e.xpTrainer, gold: e.gold, drops: e.drops, captured: false }]
    if (e.type === 'captured') return [{ huntId, speciesName: e.speciesName, level: e.level, xpTrainer: 0, gold: 0, drops: [], captured: true }]
    return []
  })
}

export function tickRunner(runner: Runner, deps: EngineDeps): TickOutcome {
  const result = step(runner.state, deps)
  const stopped = result.events.find((e): e is StoppedEvent => e.type === 'stopped') ?? null
  const next: Runner = { ...runner, state: result.state, pendingLog: [...runner.pendingLog, ...logEntriesOf(result.events, runner.huntId)] }
  return { runner: next, events: result.events, stopped }
}

export const needsSave = (r: Runner): boolean => r.state.tick - r.lastSaveTick >= SNAPSHOT_EVERY_TICKS
export const needsSync = (r: Runner): boolean => r.state.tick - r.lastSyncTick >= SYNC_EVERY_TICKS

export const markSaved = (r: Runner, sync: boolean): Runner =>
  sync ? { ...r, lastSaveTick: r.state.tick, lastSyncTick: r.state.tick, pendingLog: [] } : { ...r, lastSaveTick: r.state.tick }

export const toPersistSnapshot = (r: Runner): PersistSnapshot => ({ trainerId: r.trainerId, huntId: r.huntId, state: r.state, rngState: r.rng.state(), pendingLog: r.pendingLog })
```

`src/realtime/catchup.ts`:
```ts
import { TICK_MS } from '@pokeidle/shared'
import { summarizeEvents, type Summary } from '../engine/simulate.js'
import type { EngineDeps } from '../engine/types.js'
import { CATCHUP_SLICE_TICKS, MAX_CATCHUP_TICKS } from './constants.js'
import { tickRunner, type Runner, type StoppedEvent } from './runner.js'

export interface CatchUpHooks {
  readonly onSlice?: (remaining: number) => void
  readonly yieldNow?: () => Promise<void>
  readonly shouldAbort?: () => boolean
}
export interface CatchUpResult { readonly runner: Runner; readonly summary: Summary; readonly stopped: StoppedEvent | null; readonly ticksDone: number }

export const ticksOwedSince = (last: Date, now: Date): number =>
  Math.min(MAX_CATCHUP_TICKS, Math.max(0, Math.floor((now.getTime() - last.getTime()) / TICK_MS)))

export const emptySummary = (): Summary => ({ ticks: 0, defeats: 0, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 0, gold: 0, drops: {}, levelUps: 0, evolutions: 0, returns: 0 })

export function addSummaries(a: Summary, b: Summary): Summary {
  const drops = Object.entries(b.drops).reduce<Record<string, number>>((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), { ...a.drops })
  return {
    ticks: a.ticks + b.ticks, defeats: a.defeats + b.defeats, captures: a.captures + b.captures, captureFailures: a.captureFailures + b.captureFailures,
    faints: a.faints + b.faints, xpTrainer: a.xpTrainer + b.xpTrainer, gold: a.gold + b.gold, drops,
    levelUps: a.levelUps + b.levelUps, evolutions: a.evolutions + b.evolutions, returns: a.returns + b.returns,
  }
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** Simula `ticks` em fatias, cedendo o event loop entre elas. Nunca guarda a lista de eventos: só o resumo e o log. */
export async function catchUp(runner: Runner, ticks: number, deps: EngineDeps, hooks: CatchUpHooks = {}): Promise<CatchUpResult> {
  const yieldNow = hooks.yieldNow ?? defaultYield
  let current = runner
  let summary = emptySummary()
  let done = 0
  let stopped: StoppedEvent | null = null
  while (done < ticks && stopped === null && !(hooks.shouldAbort?.() ?? false)) {
    const slice = Math.min(CATCHUP_SLICE_TICKS, ticks - done)
    for (let i = 0; i < slice && stopped === null; i++) {
      const outcome = tickRunner(current, deps)
      current = outcome.runner
      summary = addSummaries(summary, summarizeEvents(outcome.events, 1))
      stopped = outcome.stopped
      done++
    }
    hooks.onSlice?.(ticks - done)
    if (done < ticks && stopped === null) await yieldNow()
  }
  const lastSimulatedAt = new Date(runner.lastSimulatedAt.getTime() + done * TICK_MS)
  return { runner: { ...current, lastSimulatedAt }, summary, stopped, ticksDone: done }
}
```
Semântica de `onSlice`: chamado após cada fatia com o restante; para 4500 ticks e fatias de 2000 → `[2500, 500, 0]`. `shouldAbort` é avaliado no início de cada volta do `while`, por isso o teste de abort espera exatamente uma fatia.

`src/realtime/index.ts`: `export * from './constants.js'`, `export * from './runner.js'`, `export * from './catchup.js'` (as demais tasks acrescentam os seus).

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- realtime && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/server pnpm-lock.yaml
git commit -m "feat(server): runner e catch-up em fatias do tempo real"
```

---

### Task 2: `protocol.ts` e `sockets.ts` (puros)

**Files:**
- Create: `src/realtime/protocol.ts`, `src/realtime/sockets.ts`
- Modify: `src/realtime/index.ts`
- Test: `test/realtime/protocol.test.ts`, `test/realtime/sockets.test.ts`

**Interfaces:**
- Consumes: `SettingsPatchSchema`, `SettingsPatch` (`src/account/settings.ts`), `HuntState`, `Event` (`src/engine/types.ts`), `Summary` (`src/engine/simulate.ts`), `StopReason` (Task 1), `WS_MAX_MESSAGE_BYTES`.
- Produces: `ClientMessageSchema`, `ClientMessage`, `ServerMessage` (união por `t`), `parseClientMessage(raw: string | Buffer, maxBytes?): ParseResult` com `ParseResult = { ok: true; message } | { ok: false; reason: string }`; `SocketLike { send(data: string): void; close(code?: number, reason?: string): void; readonly readyState: number }`, `SocketEntry { socket; trainerId; tokenHash }`, `SocketRegistry { add; remove; broadcast(trainerId, msg); send(socket, msg); closeForToken(tokenHash, code, reason); closeAll(code, reason); countFor(trainerId): number; size(): number }`, `createSocketRegistry(): SocketRegistry`, `OPEN = 1`.

- [ ] **Step 1: Testes**

`test/realtime/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { WS_MAX_MESSAGE_BYTES } from '../../src/realtime/constants.js'
import { parseClientMessage } from '../../src/realtime/protocol.js'

describe('parseClientMessage', () => {
  it('aceita cada mensagem válida', () => {
    for (const raw of ['{"t":"hunt.stop"}', '{"t":"item.use","itemId":"potion"}', '{"t":"team.setActive","pokemonId":"st-1"}', '{"t":"settings.update","patch":{"returnHpPercent":40,"capture":{"ballTier":"great"}}}', '{"t":"ping"}']) {
      const r = parseClientMessage(raw)
      expect(r.ok, raw).toBe(true)
    }
    const r = parseClientMessage('{"t":"item.use","itemId":"potion"}')
    if (r.ok) expect(r.message).toEqual({ t: 'item.use', itemId: 'potion' })
  })
  it('rejeita JSON inválido, tipo desconhecido, campo extra, campo faltando e settings fora da faixa', () => {
    for (const raw of ['{', '{"t":"hack"}', '{"t":"ping","x":1}', '{"t":"item.use"}', '{"t":"settings.update","patch":{"returnHpPercent":101}}', '[]', '"ping"']) {
      const r = parseClientMessage(raw)
      expect(r.ok, raw).toBe(false)
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0)
    }
  })
  it('rejeita mensagem acima do limite de bytes (medindo bytes, não chars)', () => {
    const big = JSON.stringify({ t: 'item.use', itemId: 'a'.repeat(WS_MAX_MESSAGE_BYTES) })
    expect(parseClientMessage(big)).toMatchObject({ ok: false, reason: expect.stringMatching(/bytes/) })
    const multibyte = JSON.stringify({ t: 'item.use', itemId: 'é'.repeat(30) })
    expect(parseClientMessage(multibyte, 60)).toMatchObject({ ok: false })
    expect(parseClientMessage(Buffer.from('{"t":"ping"}'))).toMatchObject({ ok: true })
  })
})
```

`test/realtime/sockets.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createSocketRegistry, OPEN, type SocketLike } from '../../src/realtime/sockets.js'

function fakeSocket(): SocketLike & { sent: string[]; closed: { code?: number; reason?: string } | null; readyState: number } {
  const s = { sent: [] as string[], closed: null as { code?: number; reason?: string } | null, readyState: OPEN, send(d: string) { s.sent.push(d) }, close(code?: number, reason?: string) { s.closed = { code, reason }; s.readyState = 3 } }
  return s
}

describe('SocketRegistry', () => {
  it('broadcast só para o treinador; send serializa; remove tira dos dois índices', () => {
    const reg = createSocketRegistry()
    const a1 = fakeSocket(), a2 = fakeSocket(), b = fakeSocket()
    reg.add({ socket: a1, trainerId: 'A', tokenHash: 'ta' })
    reg.add({ socket: a2, trainerId: 'A', tokenHash: 'ta2' })
    reg.add({ socket: b, trainerId: 'B', tokenHash: 'tb' })
    reg.broadcast('A', { t: 'pong' })
    expect(a1.sent).toEqual(['{"t":"pong"}']); expect(a2.sent).toEqual(['{"t":"pong"}']); expect(b.sent).toEqual([])
    expect(reg.countFor('A')).toBe(2); expect(reg.size()).toBe(3)
    reg.remove(a1)
    expect(reg.countFor('A')).toBe(1)
    reg.closeForToken('ta', 1008, 'x')
    expect(a1.closed).toBeNull()
  })
  it('closeForToken fecha só os sockets daquele token; closeAll fecha todos; sockets fechados não recebem', () => {
    const reg = createSocketRegistry()
    const a1 = fakeSocket(), a2 = fakeSocket()
    reg.add({ socket: a1, trainerId: 'A', tokenHash: 'ta' })
    reg.add({ socket: a2, trainerId: 'A', tokenHash: 'ta2' })
    reg.closeForToken('ta', 1008, 'logout')
    expect(a1.closed).toEqual({ code: 1008, reason: 'logout' }); expect(a2.closed).toBeNull()
    reg.broadcast('A', { t: 'hunt.idle' })
    expect(a1.sent).toEqual([]); expect(a2.sent).toEqual(['{"t":"hunt.idle"}'])
    reg.closeAll(1001, 'shutdown')
    expect(a2.closed).toEqual({ code: 1001, reason: 'shutdown' })
    expect(reg.size()).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- protocol sockets`

- [ ] **Step 3: Implementar**

`src/realtime/protocol.ts`:
```ts
import { z } from 'zod'
import { SettingsPatchSchema } from '../account/settings.js'
import type { Summary } from '../engine/simulate.js'
import type { Event, HuntState } from '../engine/types.js'
import { WS_MAX_MESSAGE_BYTES } from './constants.js'
import type { StopReason } from './runner.js'

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hunt.stop') }).strict(),
  z.object({ t: z.literal('item.use'), itemId: z.string().min(1).max(64) }).strict(),
  z.object({ t: z.literal('team.setActive'), pokemonId: z.string().min(1).max(128) }).strict(),
  z.object({ t: z.literal('settings.update'), patch: SettingsPatchSchema }).strict(),
  z.object({ t: z.literal('ping') }).strict(),
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>

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

export type ParseResult = { readonly ok: true; readonly message: ClientMessage } | { readonly ok: false; readonly reason: string }

export function parseClientMessage(raw: string | Buffer, maxBytes: number = WS_MAX_MESSAGE_BYTES): ParseResult {
  const bytes = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(raw, 'utf8')
  if (bytes > maxBytes) return { ok: false, reason: `mensagem com ${bytes} bytes; máximo ${maxBytes} bytes` }
  let json: unknown
  try { json = JSON.parse(raw.toString()) } catch { return { ok: false, reason: 'JSON inválido' } }
  const parsed = ClientMessageSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, reason: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'mensagem inválida'}`.replace(/^: /, '') }
  }
  return { ok: true, message: parsed.data }
}
```

`src/realtime/sockets.ts`:
```ts
import type { ServerMessage } from './protocol.js'

export const OPEN = 1

export interface SocketLike { send(data: string): void; close(code?: number, reason?: string): void; readonly readyState: number }
export interface SocketEntry { readonly socket: SocketLike; readonly trainerId: string; readonly tokenHash: string }

export interface SocketRegistry {
  add(entry: SocketEntry): void
  remove(socket: SocketLike): void
  broadcast(trainerId: string, msg: ServerMessage): void
  send(socket: SocketLike, msg: ServerMessage): void
  closeForToken(tokenHash: string, code: number, reason: string): void
  closeAll(code: number, reason: string): void
  countFor(trainerId: string): number
  size(): number
}

/** Registro de sockets abertos. Infraestrutura mutável (Map/Set) por natureza; nada de estado de jogo aqui. */
export function createSocketRegistry(): SocketRegistry {
  const entries = new Map<SocketLike, SocketEntry>()
  const byTrainer = new Map<string, Set<SocketLike>>()
  const byToken = new Map<string, Set<SocketLike>>()
  const index = (map: Map<string, Set<SocketLike>>, key: string, socket: SocketLike): void => { (map.get(key) ?? map.set(key, new Set()).get(key))!.add(socket) }
  const unindex = (map: Map<string, Set<SocketLike>>, key: string, socket: SocketLike): void => { const set = map.get(key); set?.delete(socket); if (set && set.size === 0) map.delete(key) }
  const send = (socket: SocketLike, msg: ServerMessage): void => { if (socket.readyState === OPEN) socket.send(JSON.stringify(msg)) }
  const remove = (socket: SocketLike): void => {
    const entry = entries.get(socket)
    if (!entry) return
    entries.delete(socket); unindex(byTrainer, entry.trainerId, socket); unindex(byToken, entry.tokenHash, socket)
  }
  const closeSet = (set: Iterable<SocketLike> | undefined, code: number, reason: string): void => { for (const socket of [...(set ?? [])]) { remove(socket); socket.close(code, reason) } }
  return {
    add: (entry) => { entries.set(entry.socket, entry); index(byTrainer, entry.trainerId, entry.socket); index(byToken, entry.tokenHash, entry.socket) },
    remove,
    broadcast: (trainerId, msg) => { for (const socket of byTrainer.get(trainerId) ?? []) send(socket, msg) },
    send,
    closeForToken: (tokenHash, code, reason) => closeSet(byToken.get(tokenHash), code, reason),
    closeAll: (code, reason) => closeSet(entries.keys(), code, reason),
    countFor: (trainerId) => byTrainer.get(trainerId)?.size ?? 0,
    size: () => entries.size,
  }
}
```
`index.ts`: `export * from './protocol.js'`, `export * from './sockets.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- protocol sockets && pnpm --filter @pokeidle/server typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): protocolo do WebSocket e registro de sockets"
```

---

### Task 3: `persist.ts` e `scheduler.ts` (integração com Postgres, `tick()` manual)

**Files:**
- Create: `src/realtime/persist.ts`, `src/realtime/scheduler.ts`
- Modify: `src/realtime/index.ts`, `test/helpers/app.ts` (`silentLogger`)
- Test: `test/realtime/scheduler.test.ts`

**Interfaces:**
- Consumes: Task 1 e 2; `saveSnapshot`, `loadActive`, `syncWithin`, `stopHunt`, `CorruptSnapshotError` (`src/hunt-store`), `applyIntent` (`src/engine/intents.ts`), `huntLog`, `huntSessions`, `pokemon`, `trainers`, `TrainerRow` (`src/db/schema.ts`), `Db`, `Tx` (`src/db/client.ts`), `Intent`, `IntentResult` (`src/engine/types.ts`), `Registry`.
- Produces: `flushRunner(db, snap: PersistSnapshot, now, opts: { sync: boolean }): Promise<void>`; `finishRunner(db, snap, now, opts: { sync: boolean; healTeam: boolean }): Promise<TrainerRow>`; `insertLog(tx, trainerId, entries)`; `SchedulerLogger { info(obj, msg?); warn(obj, msg?); error(obj, msg?) }`; `SchedulerDeps { db; registry; now; sockets; logger; yieldNow? }`; `Scheduler { start(); stop(); tick(): void; attach(trainerId): Promise<void>; detach(trainerId): void; get(trainerId): Runner | undefined; applyIntent(trainerId, intent): IntentResult; finish(trainerId, reason: StopReason): Promise<TrainerRow | null>; flushAll(): Promise<void>; whenIdle(trainerId): Promise<void>; size(): number; isStopping(): boolean }`; `createScheduler(deps): Scheduler`; `silentLogger` no helper de teste.

- [ ] **Step 1: Teste**

Em `test/helpers/app.ts` acrescente:
```ts
export const silentLogger = { info: () => {}, warn: () => {}, error: () => {} }
```

`test/realtime/scheduler.test.ts`:
```ts
import { createRng, loadRegistry, TICK_MS } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chooseStarter } from '../../src/account/starter.js'
import type { Db } from '../../src/db/client.js'
import { huntLog, huntSessions, inventory, pokemon, trainers, users } from '../../src/db/schema.js'
import { simulate } from '../../src/engine/simulate.js'
import { loadActive, startHunt } from '../../src/hunt-store/index.js'
import { SNAPSHOT_EVERY_TICKS, SYNC_EVERY_TICKS } from '../../src/realtime/constants.js'
import { createScheduler, type Scheduler } from '../../src/realtime/scheduler.js'
import { createSocketRegistry, OPEN, type SocketLike } from '../../src/realtime/sockets.js'
import { silentLogger } from '../helpers/app.js'
import { openTestDb, truncateAll } from '../helpers/db.js'

const registry = loadRegistry()
const T0 = new Date('2026-09-14T12:00:00Z')
let db: Db
let close: () => Promise<void>
let trainerId: string
const clock = { now: T0 }
let sockets = createSocketRegistry()
let scheduler: Scheduler

const fakeSocket = () => { const s = { sent: [] as string[], readyState: OPEN, send(d: string) { s.sent.push(d) }, close() { s.readyState = 3 } }; return s as SocketLike & { sent: string[] } }
const msgs = (s: { sent: string[] }) => s.sent.map((x) => JSON.parse(x) as { t: string })
const start = async (seed = 1) => { await startHunt(db, registry, trainerId, 'route-1', clock.now, { seed }); await scheduler.attach(trainerId) }

beforeAll(async () => { ({ db, close } = await openTestDb()) })
afterAll(async () => { await close() })
beforeEach(async () => {
  await truncateAll(db)
  clock.now = T0
  sockets = createSocketRegistry()
  scheduler = createScheduler({ db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })
  const [u] = await db.insert(users).values({ email: 'a@a.com', passwordHash: 'x' }).returning()
  const [t] = await db.insert(trainers).values({ userId: u!.id, name: 'Ash' }).returning()
  trainerId = t!.id
  await db.insert(inventory).values([{ trainerId, itemId: 'poke-ball', quantity: 5 }, { trainerId, itemId: 'potion', quantity: 3 }])
  await chooseStarter(db, registry, trainerId, 'charmander', T0)
  await db.update(pokemon).set({ level: 12, hp: 60, hpMax: 60 })
})

describe('attach / tick / persist', () => {
  it('attach sem atraso cria o runner e manda snapshot; ticks avançam e persistem no ritmo certo', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await start(42)
    expect(scheduler.size()).toBe(1)
    expect(msgs(s).map((m) => m.t)).toEqual(['hunt.snapshot'])
    expect(s.sent[0]).not.toMatch(/seed|rngState/)
    for (let i = 0; i < SNAPSHOT_EVERY_TICKS; i++) { clock.now = new Date(clock.now.getTime() + TICK_MS); scheduler.tick() }
    await scheduler.whenIdle(trainerId)
    const runner = scheduler.get(trainerId)!
    expect(runner.state.tick).toBe(SNAPSHOT_EVERY_TICKS)
    const active = (await loadActive(db, trainerId))!
    expect(active.state.tick).toBe(SNAPSHOT_EVERY_TICKS)
    expect(active.lastSimulatedAt).toEqual(clock.now)
    expect(await db.select().from(huntLog)).toEqual([]) // ainda sem sync
    expect(msgs(s).filter((m) => m.t === 'hunt.tick').length).toBeGreaterThan(0)
    for (let i = SNAPSHOT_EVERY_TICKS; i < SYNC_EVERY_TICKS; i++) { clock.now = new Date(clock.now.getTime() + TICK_MS); scheduler.tick() }
    await scheduler.whenIdle(trainerId)
    const logRows = await db.select().from(huntLog).where(eq(huntLog.trainerId, trainerId))
    expect(logRows.length).toBeGreaterThan(0)
    const [tr] = await db.select().from(trainers).where(eq(trainers.id, trainerId))
    expect(tr!.xp).toBe(scheduler.get(trainerId)!.state.trainer.xp)
    expect(scheduler.get(trainerId)!.pendingLog).toEqual([])
  })
  it('a simulação é igual a simulate() com a mesma seed e rngState', async () => {
    await start(7)
    const before = (await loadActive(db, trainerId))!
    for (let i = 0; i < 400; i++) scheduler.tick()
    const ref = simulate(before.state, 400, { registry, hunt: registry.hunts.get('route-1')!, rng: createRng(before.seed, before.rngState) })
    expect(scheduler.get(trainerId)!.state).toEqual(ref.state)
  })
  it('attach com atraso faz catch-up em fatias, manda catchup/summary/snapshot e persiste com sync', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await startHunt(db, registry, trainerId, 'route-1', T0, { seed: 3 })
    const before = (await loadActive(db, trainerId))!
    clock.now = new Date(T0.getTime() + 10 * 60 * 1000) // 3000 ticks
    await scheduler.attach(trainerId)
    const ref = simulate(before.state, 3000, { registry, hunt: registry.hunts.get('route-1')!, rng: createRng(before.seed, before.rngState) })
    expect(scheduler.get(trainerId)!.state).toEqual(ref.state)
    expect(scheduler.get(trainerId)!.catchingUp).toBe(false)
    const types = msgs(s).map((m) => m.t)
    expect(types.filter((t) => t === 'hunt.catchup').length).toBe(2)
    expect(types.slice(-2)).toEqual(['hunt.summary', 'hunt.snapshot'])
    await scheduler.whenIdle(trainerId)
    expect((await loadActive(db, trainerId))!.state.tick).toBe(3000)
    expect((await db.select().from(huntLog)).length).toBeGreaterThan(0)
  })
  it('attach com sessão inexistente falha com no-hunt; attach de snapshot corrompido finaliza sem sync', async () => {
    await expect(scheduler.attach(trainerId)).rejects.toMatchObject({ code: 'no-hunt' })
    await startHunt(db, registry, trainerId, 'route-1', T0)
    await db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, trainerId))
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await scheduler.attach(trainerId)
    expect(scheduler.size()).toBe(0)
    expect(await db.select().from(huntSessions)).toEqual([])
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'corrupt', healed: false })
  })
})

describe('intents e finish', () => {
  it('applyIntent troca o estado e manda hunt.tick; sem runner devolve erro', async () => {
    expect(scheduler.applyIntent(trainerId, { type: 'stop' })).toMatchObject({ error: { code: 'no-hunt' } })
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await start()
    const before = scheduler.get(trainerId)!
    const r = scheduler.applyIntent(trainerId, { type: 'updateSettings', patch: { returnHpPercent: 55 } })
    expect('error' in r).toBe(false)
    expect(scheduler.get(trainerId)!.state.settings.returnHpPercent).toBe(55)
    expect(scheduler.get(trainerId)!.rng).toBe(before.rng)
    expect(scheduler.applyIntent(trainerId, { type: 'setActive', pokemonId: 'alheio' })).toMatchObject({ error: { code: 'unknown-pokemon' } })
  })
  it('intent stop finaliza: sync, apaga a sessão, manda hunt.stopped sem cura', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await start(5)
    for (let i = 0; i < 100; i++) scheduler.tick()
    const xp = scheduler.get(trainerId)!.state.trainer.xp
    const trainer = await scheduler.finish(trainerId, 'intent')
    expect(trainer?.xp).toBe(xp)
    expect(scheduler.size()).toBe(0)
    expect(await db.select().from(huntSessions)).toEqual([])
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'intent', healed: false })
    expect(await scheduler.finish(trainerId, 'intent')).toBeNull()
  })
  it('team-fainted no tick finaliza com cura do time', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    await db.update(pokemon).set({ level: 1, hp: 1, hpMax: 12 })
    await start(11)
    let guard = 0
    while (scheduler.size() > 0 && guard++ < 3000) scheduler.tick()
    await new Promise((r) => setTimeout(r, 20))
    expect(scheduler.size()).toBe(0)
    expect(msgs(s).at(-1)).toEqual({ t: 'hunt.stopped', reason: 'team-fainted', healed: true })
    const [p] = await db.select().from(pokemon).where(eq(pokemon.trainerId, trainerId))
    expect(p!.hp).toBe(p!.hpMax)
    expect(await db.select().from(huntSessions)).toEqual([])
  })
  it('flushAll grava todos os runners com sync', async () => {
    await start()
    for (let i = 0; i < 10; i++) scheduler.tick()
    await scheduler.flushAll()
    expect((await loadActive(db, trainerId))!.state.tick).toBe(10)
  })
  it('escritas ficam em ordem: um save enfileirado antes do finish chega antes', async () => {
    await start(2)
    for (let i = 0; i < SNAPSHOT_EVERY_TICKS; i++) scheduler.tick() // enfileira um save
    for (let i = 0; i < 20; i++) scheduler.tick()
    const trainer = await scheduler.finish(trainerId, 'intent')
    expect(trainer).not.toBeNull()
    expect(await db.select().from(huntSessions)).toEqual([]) // o save (UPDATE) não ressuscita a linha porque veio antes do DELETE
  })
})
```
Sobre o teste de `team-fainted`: um Charmander nível 1 com 1 HP morre no primeiro golpe recebido; o `while` roda até o runner sumir; `finish` é assíncrono, daí o `setTimeout` curto antes de conferir o banco. Se 3000 ticks não bastarem para morrer (improvável), reporte.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- scheduler`

- [ ] **Step 3: Implementar `persist.ts`**

```ts
import { eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../db/client.js'
import { huntLog, huntSessions, pokemon, trainers, type TrainerRow } from '../db/schema.js'
import { saveSnapshot } from '../hunt-store/snapshot.js'
import { syncWithin } from '../hunt-store/sync.js'
import { AppError } from '../http/errors.js'
import type { LogEntry, PersistSnapshot } from './runner.js'

export async function insertLog(tx: Tx, trainerId: string, entries: readonly LogEntry[]): Promise<void> {
  if (entries.length === 0) return
  await tx.insert(huntLog).values(entries.map((e) => ({ trainerId, huntId: e.huntId, speciesName: e.speciesName, level: e.level, xpTrainer: e.xpTrainer, gold: e.gold, drops: e.drops, captured: e.captured })))
}

/** Snapshot sempre; com `sync`, tabelas + hunt_log na mesma transação. */
export async function flushRunner(db: Db, snap: PersistSnapshot, now: Date, opts: { readonly sync: boolean }): Promise<void> {
  if (!opts.sync) { await saveSnapshot(db, snap.trainerId, snap.state, snap.rngState, now); return }
  await db.transaction(async (tx) => {
    await saveSnapshot(tx, snap.trainerId, snap.state, snap.rngState, now)
    await syncWithin(tx, snap.trainerId, snap.state, now)
    await insertLog(tx, snap.trainerId, snap.pendingLog)
  })
}

/** Encerra a hunt a partir do estado em memória: lock da linha, sync opcional, cura opcional, apaga a sessão. */
export async function finishRunner(db: Db, snap: PersistSnapshot, now: Date, opts: { readonly sync: boolean; readonly healTeam: boolean }): Promise<TrainerRow> {
  return db.transaction(async (tx) => {
    await tx.select({ trainerId: huntSessions.trainerId }).from(huntSessions).where(eq(huntSessions.trainerId, snap.trainerId)).for('update')
    if (opts.sync) { await syncWithin(tx, snap.trainerId, snap.state, now); await insertLog(tx, snap.trainerId, snap.pendingLog) }
    if (opts.healTeam) await tx.update(pokemon).set({ hp: sql`${pokemon.hpMax}`, updatedAt: now }).where(eq(pokemon.trainerId, snap.trainerId))
    await tx.delete(huntSessions).where(eq(huntSessions.trainerId, snap.trainerId))
    const [trainer] = await tx.select().from(trainers).where(eq(trainers.id, snap.trainerId))
    if (!trainer) throw new AppError('not-found', 'treinador não encontrado')
    return trainer
  })
}
```

- [ ] **Step 4: Implementar `scheduler.ts`**

```ts
import { TICK_MS, type Registry } from '@pokeidle/shared'
import type { Db } from '../db/client.js'
import type { TrainerRow } from '../db/schema.js'
import { applyIntent as engineApplyIntent } from '../engine/intents.js'
import type { Intent, IntentResult } from '../engine/types.js'
import { loadActive } from '../hunt-store/snapshot.js'
import { CorruptSnapshotError } from '../hunt-store/state-schema.js'
import { stopHunt } from '../hunt-store/stop.js'
import { AppError } from '../http/errors.js'
import { catchUp, ticksOwedSince } from './catchup.js'
import { MIN_CATCHUP_TICKS, PERSIST_MAX_FAILURES, TICK_LAG_WARN_MS } from './constants.js'
import { finishRunner, flushRunner } from './persist.js'
import type { ServerMessage } from './protocol.js'
import { createRunner, engineDeps, logEntriesOf, markSaved, needsSave, needsSync, tickRunner, toPersistSnapshot, type Runner, type StopReason } from './runner.js'
import type { SocketRegistry } from './sockets.js'

export interface SchedulerLogger { info(obj: object, msg?: string): void; warn(obj: object, msg?: string): void; error(obj: object, msg?: string): void }
export interface SchedulerDeps {
  readonly db: Db; readonly registry: Registry; readonly now: () => Date
  readonly sockets: SocketRegistry; readonly logger: SchedulerLogger
  readonly yieldNow?: () => Promise<void>
}
export interface Scheduler {
  start(): void; stop(): void; isStopping(): boolean
  tick(): void
  attach(trainerId: string): Promise<void>
  detach(trainerId: string): void
  get(trainerId: string): Runner | undefined
  size(): number
  applyIntent(trainerId: string, intent: Intent): IntentResult
  finish(trainerId: string, reason: StopReason): Promise<TrainerRow | null>
  flushAll(): Promise<void>
  whenIdle(trainerId: string): Promise<void>
}

export const snapshotMessage = (r: Runner): ServerMessage => ({
  t: 'hunt.snapshot', session: { huntId: r.huntId, sessionId: r.sessionId, startedAt: r.startedAt.toISOString() }, state: r.state,
})

const healsOn = (reason: StopReason): boolean => reason === 'team-fainted'
const syncsOn = (reason: StopReason): boolean => reason !== 'corrupt' && reason !== 'persist-failed'

/** Um scheduler para todas as hunts vivas. `runners`/`chains` são infraestrutura mutável; cada Runner é imutável e trocado inteiro. */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const runners = new Map<string, Runner>()
  const chains = new Map<string, Promise<void>>()
  let timer: ReturnType<typeof setInterval> | null = null
  let stopping = false
  let lastTickAt: number | null = null

  const enqueue = (trainerId: string, op: () => Promise<void>): Promise<void> => {
    const next = (chains.get(trainerId) ?? Promise.resolve()).then(op).catch((error: unknown) => onPersistError(trainerId, error))
    chains.set(trainerId, next)
    return next
  }

  const onPersistError = (trainerId: string, error: unknown): void => {
    deps.logger.error({ err: error, trainerId }, 'falha ao persistir a hunt')
    const runner = runners.get(trainerId)
    if (!runner) return
    const failures = runner.persistFailures + 1
    runners.set(trainerId, { ...runner, persistFailures: failures })
    if (failures >= PERSIST_MAX_FAILURES) void finish(trainerId, 'persist-failed')
  }

  const persist = (runner: Runner, sync: boolean): Runner => {
    const snap = toPersistSnapshot(runner)
    void enqueue(runner.trainerId, async () => {
      await flushRunner(deps.db, snap, deps.now(), { sync })
      const current = runners.get(runner.trainerId)
      if (current && current.persistFailures > 0) runners.set(runner.trainerId, { ...current, persistFailures: 0 })
    })
    return markSaved(runner, sync)
  }

  const tickOne = (runner: Runner): void => {
    let outcome
    try { outcome = tickRunner(runner, engineDeps(runner, deps.registry)) } catch (error) {
      deps.logger.error({ err: error, trainerId: runner.trainerId }, 'erro no motor; runner removido, sessão preservada')
      runners.delete(runner.trainerId)
      deps.sockets.broadcast(runner.trainerId, { t: 'error', code: 'internal', message: 'erro interno' })
      return
    }
    let next: Runner = { ...outcome.runner, lastSimulatedAt: deps.now() }
    if (outcome.events.length > 0) deps.sockets.broadcast(runner.trainerId, { t: 'hunt.tick', tick: runner.state.tick, events: outcome.events })
    if (outcome.stopped) { runners.set(runner.trainerId, next); void finish(runner.trainerId, outcome.stopped.reason); return }
    if (needsSync(next)) next = persist(next, true)
    else if (needsSave(next)) next = persist(next, false)
    runners.set(runner.trainerId, next)
  }

  const tick = (): void => {
    const startedAt = Date.now()
    if (lastTickAt !== null && startedAt - lastTickAt > TICK_MS + TICK_LAG_WARN_MS) deps.logger.warn({ lagMs: startedAt - lastTickAt, runners: runners.size }, 'tick atrasado')
    lastTickAt = startedAt
    for (const runner of [...runners.values()]) if (!runner.catchingUp) tickOne(runner)
  }

  const finish = async (trainerId: string, reason: StopReason): Promise<TrainerRow | null> => {
    const runner = runners.get(trainerId)
    if (!runner) return null
    runners.delete(trainerId)
    const snap = toPersistSnapshot(runner)
    let trainer: TrainerRow | null = null
    await enqueue(trainerId, async () => { trainer = await finishRunner(deps.db, snap, deps.now(), { sync: syncsOn(reason), healTeam: healsOn(reason) }) })
    deps.sockets.broadcast(trainerId, { t: 'hunt.stopped', reason, healed: healsOn(reason) })
    return trainer
  }

  const attach = async (trainerId: string): Promise<void> => {
    let active
    try { active = await loadActive(deps.db, trainerId) } catch (error) {
      if (!(error instanceof CorruptSnapshotError)) throw error
      deps.logger.error({ err: error, trainerId, issues: error.issues }, 'snapshot corrompido no attach; sessão encerrada sem sync')
      await stopHunt(deps.db, trainerId, deps.now())
      deps.sockets.broadcast(trainerId, { t: 'hunt.stopped', reason: 'corrupt', healed: false })
      return
    }
    if (!active) throw new AppError('no-hunt', 'não há hunt ativa')
    const base = createRunner(trainerId, active)
    const owed = ticksOwedSince(active.lastSimulatedAt, deps.now())
    if (owed < MIN_CATCHUP_TICKS) { runners.set(trainerId, base); deps.sockets.broadcast(trainerId, snapshotMessage(base)); return }
    runners.set(trainerId, { ...base, catchingUp: true })
    deps.sockets.broadcast(trainerId, { t: 'hunt.catchup', ticksRemaining: owed })
    const result = await catchUp(base, owed, engineDeps(base, deps.registry), {
      onSlice: (remaining) => deps.sockets.broadcast(trainerId, { t: 'hunt.catchup', ticksRemaining: remaining }),
      shouldAbort: () => stopping,
      ...(deps.yieldNow && { yieldNow: deps.yieldNow }),
    })
    if (result.stopped) { runners.set(trainerId, result.runner); await finish(trainerId, result.stopped.reason); return }
    const settled = persist({ ...result.runner, catchingUp: false }, true)
    runners.set(trainerId, settled)
    deps.sockets.broadcast(trainerId, { t: 'hunt.summary', summary: result.summary })
    deps.sockets.broadcast(trainerId, snapshotMessage(settled))
  }

  const applyIntent = (trainerId: string, intent: Intent): IntentResult => {
    const runner = runners.get(trainerId)
    if (!runner) return { error: { code: 'no-hunt', message: 'não há hunt ativa' } }
    if (runner.catchingUp) return { error: { code: 'catching-up', message: 'a hunt ainda está recuperando o tempo perdido' } }
    const result = engineApplyIntent(runner.state, intent, engineDeps(runner, deps.registry))
    if ('error' in result) return result
    const next: Runner = { ...runner, state: result.state, pendingLog: [...runner.pendingLog, ...logEntriesOf(result.events, runner.huntId)] }
    runners.set(trainerId, next)
    if (result.events.length > 0) deps.sockets.broadcast(trainerId, { t: 'hunt.tick', tick: runner.state.tick, events: result.events })
    const stopped = result.events.find((e) => e.type === 'stopped')
    if (stopped) void finish(trainerId, 'intent')
    return result
  }

  return {
    start: () => { if (timer) return; timer = setInterval(tick, TICK_MS) },
    stop: () => { stopping = true; if (timer) { clearInterval(timer); timer = null } },
    isStopping: () => stopping,
    tick,
    attach,
    detach: (trainerId) => { runners.delete(trainerId) },
    get: (trainerId) => runners.get(trainerId),
    size: () => runners.size,
    applyIntent,
    finish,
    flushAll: async () => {
      for (const runner of runners.values()) if (!runner.catchingUp) runners.set(runner.trainerId, persist(runner, true))
      await Promise.allSettled([...chains.values()])
    },
    whenIdle: (trainerId) => chains.get(trainerId) ?? Promise.resolve(),
  }
}
```
`index.ts`: `export * from './persist.js'`, `export * from './scheduler.js'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- scheduler && pnpm --filter @pokeidle/server typecheck`
Se o Drizzle rejeitar `.for('update')` sem `select` completo, use `tx.select().from(huntSessions)...for('update')`.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): scheduler de ticks com persistência encadeada, catch-up e finish"
```

---

### Task 4: `actions.ts` e a ligação com o REST (`AppDeps.realtime`, rotas, helpers de teste)

**Files:**
- Create: `src/realtime/actions.ts`
- Modify: `src/http/app.ts` (`AppDeps.realtime`), `src/http/routes/hunts.ts`, `src/http/routes/trainer.ts` (PATCH settings), `src/http/routes/auth.ts` (logout fecha sockets), `src/http/security.ts` (`sameOrigin`), `src/realtime/index.ts`, `test/helpers/app.ts`
- Test: `test/realtime/actions.test.ts`, `test/hunts.test.ts` (ajustes), `test/security.test.ts` (`sameOrigin`)

**Interfaces:**
- Consumes: Task 3 (`Scheduler`, `snapshotMessage`), Task 2 (`SocketRegistry`), `startHunt`, `stopHunt`, `loadActive`, `updateSettings`, `SettingsPatch`, `hashToken`, `SESSION_COOKIE`, `Registry`.
- Produces: `RealtimeDeps { db; registry; now; scheduler; sockets }`; `SessionView { huntId; sessionId; startedAt: Date; state: HuntState }`; `startAndAttach(d, trainerId, huntId): Promise<{ huntId; sessionId; startedAt }>`; `stopViaScheduler(d, trainerId): Promise<TrainerRow>`; `applySettings(d, trainerId, patch): Promise<TrainerRow>`; `useItem(d, trainerId, itemId): IntentResult`; `setActive(d, trainerId, pokemonId): IntentResult`; `activeView(d, trainerId): Promise<SessionView | null>`; `sameOrigin(request, appOrigin): boolean` em `security.ts`; `AppDeps.realtime: { scheduler: Scheduler; sockets: SocketRegistry }` (obrigatório); `RouteDeps` ganha `realtime`; `TestApp` ganha `scheduler` e `sockets`.

- [ ] **Step 1: Testes**

Em `test/security.test.ts` acrescente:
```ts
import { sameOrigin } from '../src/http/security.js'
describe('sameOrigin', () => {
  it('compara origem completa, aceita Referer, rejeita ausência e lixo, independe do método', () => {
    expect(sameOrigin(req('GET', { origin: APP }), APP)).toBe(true)
    expect(sameOrigin(req('GET', {}), APP)).toBe(false)
    expect(sameOrigin(req('GET', { origin: 'http://localhost:3001' }), APP)).toBe(false)
    expect(sameOrigin(req('GET', { referer: `${APP}/app` }), APP)).toBe(true)
    expect(sameOrigin(req('GET', { referer: 'lixo' }), APP)).toBe(false)
  })
})
```

`test/realtime/actions.test.ts`:
```ts
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon, trainers } from '../../src/db/schema.js'
import { activeView, applySettings, setActive, startAndAttach, stopViaScheduler, useItem } from '../../src/realtime/actions.js'
import { truncateAll } from '../helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from '../helpers/app.js'

let t: TestApp
let cookie: string
let trainerId: string
const deps = () => ({ db: t.db, registry: t.registry, now: () => t.clock.now, scheduler: t.scheduler, sockets: t.sockets })
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => {
  await truncateAll(t.db); t.clock.now = T0
  ;({ cookie, trainerId } = await registerAndLogin(t.app))
  await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
  await t.db.update(pokemon).set({ level: 12, hp: 60, hpMax: 60 })
})

describe('actions', () => {
  it('startAndAttach cria sessão e runner; activeView lê do runner; stopViaScheduler finaliza', async () => {
    const s = await startAndAttach(deps(), trainerId, 'route-1')
    expect(s).toMatchObject({ huntId: 'route-1', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), startedAt: T0 })
    expect(t.scheduler.get(trainerId)).toBeDefined()
    t.scheduler.tick()
    const view = await activeView(deps(), trainerId)
    expect(view?.state.tick).toBe(1)
    expect(JSON.stringify(view)).not.toMatch(/seed|rngState/)
    const trainer = await stopViaScheduler(deps(), trainerId)
    expect(trainer.id).toBe(trainerId)
    expect(t.scheduler.get(trainerId)).toBeUndefined()
    expect(await t.db.select().from(huntSessions)).toEqual([])
    await expect(stopViaScheduler(deps(), trainerId)).rejects.toMatchObject({ code: 'no-hunt' })
  })
  it('stopViaScheduler cai no banco quando a sessão existe sem runner (órfã)', async () => {
    await startAndAttach(deps(), trainerId, 'route-1')
    t.scheduler.detach(trainerId)
    const trainer = await stopViaScheduler(deps(), trainerId)
    expect(trainer.id).toBe(trainerId)
    expect(await t.db.select().from(huntSessions)).toEqual([])
  })
  it('applySettings grava no banco e no runner quando há hunt', async () => {
    await applySettings(deps(), trainerId, { returnHpPercent: 45 })
    expect((await t.db.select().from(trainers).where(eq(trainers.id, trainerId)))[0]!.returnHpPercent).toBe(45)
    await startAndAttach(deps(), trainerId, 'route-1')
    await applySettings(deps(), trainerId, { capture: { ballTier: 'poke' } })
    expect(t.scheduler.get(trainerId)!.state.settings.capture.ballTier).toBe('poke')
    expect((await t.db.select().from(trainers).where(eq(trainers.id, trainerId)))[0]!.ballTier).toBe('poke')
  })
  it('useItem e setActive delegam ao motor com erros tipados', async () => {
    expect(useItem(deps(), trainerId, 'potion')).toMatchObject({ error: { code: 'no-hunt' } })
    await startAndAttach(deps(), trainerId, 'route-1')
    expect(useItem(deps(), trainerId, 'potion')).toMatchObject({ error: { code: 'full-hp' } })
    expect(setActive(deps(), trainerId, 'x')).toMatchObject({ error: { code: 'unknown-pokemon' } })
  })
})

describe('REST sobre o scheduler', () => {
  it('start → runner; active vem do runner; stop finaliza; logout fecha sockets do token', async () => {
    expect((await api(t.app, cookie).post('/hunts/route-1/start')).statusCode).toBe(201)
    expect(t.scheduler.get(trainerId)).toBeDefined()
    t.scheduler.tick(); t.scheduler.tick()
    expect((await api(t.app, cookie).get('/hunts/active')).json()).toMatchObject({ session: { state: { tick: 2 } } })
    const patch = await api(t.app, cookie).patch('/trainer/settings', { returnHpPercent: 60 })
    expect(patch.statusCode).toBe(200)
    expect(t.scheduler.get(trainerId)!.state.settings.returnHpPercent).toBe(60)
    expect((await api(t.app, cookie).post('/hunts/stop')).json()).toMatchObject({ trainer: { activeHuntId: null } })
    expect(t.scheduler.get(trainerId)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- actions security`

- [ ] **Step 3: Implementar**

`src/http/security.ts` — extraia a comparação de origem:
```ts
export function sameOrigin(request: FastifyRequest, appOrigin: string): boolean {
  const origin = originOf(request.headers.origin) ?? originOf(request.headers.referer)
  return origin !== null && origin === new URL(appOrigin).origin
}
export function checkOrigin(request: FastifyRequest, appOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return true
  return sameOrigin(request, appOrigin)
}
```

`src/realtime/actions.ts`:
```ts
import type { Registry } from '@pokeidle/shared'
import { updateSettings, type SettingsPatch } from '../account/settings.js'
import type { Db } from '../db/client.js'
import type { TrainerRow } from '../db/schema.js'
import type { HuntState, IntentResult } from '../engine/types.js'
import { loadActive } from '../hunt-store/snapshot.js'
import { startHunt } from '../hunt-store/start.js'
import { stopHunt } from '../hunt-store/stop.js'
import type { Scheduler } from './scheduler.js'
import type { SocketRegistry } from './sockets.js'

export interface RealtimeDeps { readonly db: Db; readonly registry: Registry; readonly now: () => Date; readonly scheduler: Scheduler; readonly sockets: SocketRegistry }
export interface SessionView { readonly huntId: string; readonly sessionId: string; readonly startedAt: Date; readonly state: HuntState }

export async function startAndAttach(d: RealtimeDeps, trainerId: string, huntId: string): Promise<{ huntId: string; sessionId: string; startedAt: Date }> {
  const row = await startHunt(d.db, d.registry, trainerId, huntId, d.now())
  await d.scheduler.attach(trainerId)
  return { huntId: row.huntId, sessionId: row.sessionId, startedAt: row.startedAt }
}

export async function stopViaScheduler(d: RealtimeDeps, trainerId: string): Promise<TrainerRow> {
  const finished = await d.scheduler.finish(trainerId, 'intent')
  return finished ?? stopHunt(d.db, trainerId, d.now())
}

export async function applySettings(d: RealtimeDeps, trainerId: string, patch: SettingsPatch): Promise<TrainerRow> {
  const row = await updateSettings(d.db, trainerId, patch, d.now())
  if (d.scheduler.get(trainerId)) d.scheduler.applyIntent(trainerId, { type: 'updateSettings', patch })
  return row
}

export const useItem = (d: RealtimeDeps, trainerId: string, itemId: string): IntentResult => d.scheduler.applyIntent(trainerId, { type: 'useItem', itemId })
export const setActive = (d: RealtimeDeps, trainerId: string, pokemonId: string): IntentResult => d.scheduler.applyIntent(trainerId, { type: 'setActive', pokemonId })

/** S25: monta campo a campo; nunca devolve seed/rngState. */
export async function activeView(d: RealtimeDeps, trainerId: string): Promise<SessionView | null> {
  const runner = d.scheduler.get(trainerId)
  if (runner) return { huntId: runner.huntId, sessionId: runner.sessionId, startedAt: runner.startedAt, state: runner.state }
  const active = await loadActive(d.db, trainerId)
  return active ? { huntId: active.huntId, sessionId: active.sessionId, startedAt: active.startedAt, state: active.state } : null
}
```

`src/http/app.ts`: `AppDeps` ganha `readonly realtime: { readonly scheduler: Scheduler; readonly sockets: SocketRegistry }`; `RouteDeps` (em `routes/auth.ts`) ganha `readonly realtime: AppDeps['realtime']` e `readonly registry: Registry`; `buildApp` cria `const registry = loadRegistry()` uma vez e passa `{ db, config, now, realtime: deps.realtime, registry }` às três rotas. `routes/trainer.ts` e `routes/hunts.ts` deixam de chamar `loadRegistry()` e usam `registry` de `RouteDeps`.

`routes/hunts.ts`:
```ts
const rt = (d: RouteDeps): RealtimeDeps => ({ db: d.db, registry: d.registry, now: d.now, scheduler: d.realtime.scheduler, sockets: d.realtime.sockets })
// start:
const session = await startAndAttach(rt(deps), authOf(request).trainer.id, id)
return reply.status(201).send({ session })
// stop:
const trainer = await stopViaScheduler(rt(deps), authOf(request).trainer.id)
return { trainer: trainerDto(trainer, await trainerExtra(db, trainer.id)) }
// active:
const view = await activeView(rt(deps), authOf(request).trainer.id)
return { session: view }
```
`routes/trainer.ts` PATCH: `const row = await applySettings(rt(deps), authOf(request).trainer.id, patch); return { settings: settingsDto(row) }`.
`routes/auth.ts` logout: antes de `logout(db, token)`: `if (token) realtime.sockets.closeForToken(hashToken(token), 1008, 'logout')`.

`test/helpers/app.ts`: `TestApp` ganha `registry: Registry`, `scheduler: Scheduler`, `sockets: SocketRegistry`; `testApp()` cria `sockets = createSocketRegistry()`, `registry = loadRegistry()`, `scheduler = createScheduler({ db, registry, now: () => clock.now, sockets, logger: silentLogger, yieldNow: () => Promise.resolve() })` e passa `realtime: { scheduler, sockets }` a `buildApp`; `close` chama `scheduler.stop()` antes de fechar o app. `freshApp` cria o seu próprio par.

- [ ] **Step 4: Rodar tudo e ver passar**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`
Os testes de `hunts.test.ts` continuam válidos (start agora também cria o runner; stop finaliza pelo scheduler; a conta B sem runner cai no `stopHunt` do banco → `no-hunt`).

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): ações compartilhadas do tempo real e REST sobre o scheduler"
```

---

### Task 5: `ws.ts` — a rota WebSocket com testes reais

**Files:**
- Create: `src/realtime/ws.ts`, `test/helpers/ws.ts`
- Modify: `src/http/app.ts` (registrar `wsRoutes`), `src/realtime/index.ts`
- Test: `test/realtime/ws.test.ts`

**Interfaces:**
- Consumes: Task 4 (`RealtimeDeps`, ações, `sameOrigin`), Task 2 (`parseClientMessage`, `SocketRegistry`, `ServerMessage`), Task 3 (`snapshotMessage`), `requireAuth`, `authOf`, `SESSION_COOKIE`, `hashToken`, `resolveSession`, `errorBody`, `@fastify/websocket`.
- Produces: `WsOptions { pingMs; pongTimeoutMs; sessionRecheckMs; maxInvalidInARow; intentMinIntervalMs }` (padrões das constantes), `wsRoutes: FastifyPluginAsync<RouteDeps & { ws?: Partial<WsOptions> }>`; `AppDeps.wsOptions?: Partial<WsOptions>`; helper de teste `connectWs(app, cookie, opts?): Promise<WsClient>` com `WsClient { send(obj); next(): Promise<any>; nextOf(t): Promise<any>; closed(): Promise<{ code; reason }>; close(); raw: WebSocket }` e `listen(app): Promise<string>` (URL `ws://127.0.0.1:port`).

- [ ] **Step 1: Helper e teste**

`test/helpers/ws.ts`:
```ts
import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { ORIGIN } from './app.js'

export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('sem porta')
  return `ws://127.0.0.1:${address.port}`
}

export interface WsClient {
  readonly raw: WebSocket
  send(obj: unknown): void
  next(timeoutMs?: number): Promise<Record<string, unknown>>
  nextOf(t: string, timeoutMs?: number): Promise<Record<string, unknown>>
  closed(): Promise<{ code: number; reason: string }>
  close(): void
}

export function connectWs(base: string, cookie?: string, headers: Record<string, string> = { origin: ORIGIN }): Promise<{ client: WsClient } | { rejected: number }> {
  return new Promise((resolve) => {
    const raw = new WebSocket(`${base}/ws`, { headers: { ...headers, ...(cookie && { cookie }) } })
    const queue: Record<string, unknown>[] = []
    const waiters: ((m: Record<string, unknown>) => void)[] = []
    const closedP = new Promise<{ code: number; reason: string }>((r) => raw.on('close', (code, reason) => r({ code, reason: reason.toString() })))
    raw.on('message', (data) => { const m = JSON.parse(data.toString()) as Record<string, unknown>; const w = waiters.shift(); if (w) w(m); else queue.push(m) })
    raw.on('unexpected-response', (_req, res) => resolve({ rejected: res.statusCode ?? 0 }))
    raw.on('open', () => resolve({ client: {
      raw,
      send: (obj) => raw.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
      next: (timeoutMs = 2000) => new Promise((res, rej) => { const q = queue.shift(); if (q) return res(q); const timer = setTimeout(() => rej(new Error('timeout esperando mensagem')), timeoutMs); waiters.push((m) => { clearTimeout(timer); res(m) }) }),
      nextOf: async function nextOf(t, timeoutMs = 2000) { for (;;) { const m = await this.next(timeoutMs); if (m['t'] === t) return m } },
      closed: () => closedP,
      close: () => raw.close(),
    } }))
  })
}
```

`test/realtime/ws.test.ts`:
```ts
import { hashToken } from '../../src/auth/session.js'
import { sessions } from '../../src/db/schema.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { pokemon } from '../../src/db/schema.js'
import { WS_MAX_MESSAGE_BYTES } from '../../src/realtime/constants.js'
import { truncateAll } from '../helpers/db.js'
import { api, registerAndLogin, T0, testApp, type TestApp } from '../helpers/app.js'
import { connectWs, listen } from '../helpers/ws.js'

let t: TestApp
let base: string
let cookie: string
let trainerId: string
beforeAll(async () => { t = await testApp({ ws: { pingMs: 100, pongTimeoutMs: 150, sessionRecheckMs: 100 } }); base = await listen(t.app) })
afterAll(async () => { await t.close() })
beforeEach(async () => {
  await truncateAll(t.db); t.clock.now = T0
  ;({ cookie, trainerId } = await registerAndLogin(t.app))
  await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
  await t.db.update(pokemon).set({ level: 12, hp: 60, hpMax: 60 })
})
const open = async (c = cookie) => { const r = await connectWs(base, c); if (!('client' in r)) throw new Error(`rejeitado ${r.rejected}`); return r.client }

describe('handshake', () => {
  it('sem cookie → 401; Origin errado → 403; ok → hunt.idle', async () => {
    expect(await connectWs(base)).toEqual({ rejected: 401 })
    expect(await connectWs(base, cookie, { origin: 'http://evil.test' })).toEqual({ rejected: 403 })
    expect(await connectWs(base, cookie, {})).toEqual({ rejected: 403 })
    const c = await open()
    expect(await c.next()).toEqual({ t: 'hunt.idle' })
    expect(t.sockets.countFor(trainerId)).toBe(1)
    c.close(); await c.closed()
    expect(t.sockets.countFor(trainerId)).toBe(0)
  })
})

describe('hunt pelo socket', () => {
  it('start por REST manda snapshot; ticks chegam; intents funcionam; stop manda hunt.stopped', async () => {
    const c = await open()
    await c.next() // idle
    await api(t.app, cookie).post('/hunts/route-1/start')
    const snap = await c.nextOf('hunt.snapshot')
    expect(JSON.stringify(snap)).not.toMatch(/seed|rngState/)
    expect(snap['session']).toMatchObject({ huntId: 'route-1', startedAt: T0.toISOString() })
    t.scheduler.tick()
    const tick = await c.nextOf('hunt.tick')
    expect(tick['tick']).toBe(0)
    expect(Array.isArray(tick['events'])).toBe(true)
    c.send({ t: 'ping' }); expect(await c.nextOf('pong')).toEqual({ t: 'pong' })
    c.send({ t: 'item.use', itemId: 'potion' })
    expect(await c.nextOf('error')).toMatchObject({ t: 'error', code: 'full-hp' })
    t.clock.now = new Date(t.clock.now.getTime() + 250)
    c.send({ t: 'team.setActive', pokemonId: 'alheio' })
    expect(await c.nextOf('error')).toMatchObject({ code: 'unknown-pokemon' })
    t.clock.now = new Date(t.clock.now.getTime() + 250)
    c.send({ t: 'settings.update', patch: { returnHpPercent: 70 } })
    await new Promise((r) => setTimeout(r, 50))
    expect(t.scheduler.get(trainerId)!.state.settings.returnHpPercent).toBe(70)
    t.clock.now = new Date(t.clock.now.getTime() + 250)
    c.send({ t: 'hunt.stop' })
    expect(await c.nextOf('hunt.stopped')).toEqual({ t: 'hunt.stopped', reason: 'intent', healed: false })
    expect(t.scheduler.get(trainerId)).toBeUndefined()
    c.close()
  })
  it('dois sockets do mesmo treinador recebem o mesmo tick', async () => {
    const a = await open(); const b = await open()
    await a.next(); await b.next()
    await api(t.app, cookie).post('/hunts/route-1/start')
    await a.nextOf('hunt.snapshot'); await b.nextOf('hunt.snapshot')
    t.scheduler.tick()
    expect(await a.nextOf('hunt.tick')).toEqual(await b.nextOf('hunt.tick'))
    a.close(); b.close()
  })
})

describe('abuso', () => {
  it('rate limit: 2ª intenção em 200 ms → rate-limited; ping não conta', async () => {
    const c = await open(); await c.next()
    c.send({ t: 'item.use', itemId: 'potion' }); await c.nextOf('error') // no-hunt
    c.send({ t: 'ping' }); await c.nextOf('pong')
    c.send({ t: 'item.use', itemId: 'potion' })
    expect(await c.nextOf('error')).toMatchObject({ code: 'rate-limited' })
    c.close()
  })
  it('mensagem inválida → validation; três seguidas → fechado 1008; mensagem grande → validation', async () => {
    const c = await open(); await c.next()
    c.send('{"t":"item.use","itemId":"' + 'a'.repeat(WS_MAX_MESSAGE_BYTES) + '"}')
    expect(await c.nextOf('error')).toMatchObject({ code: 'validation', message: expect.stringMatching(/bytes/) })
    c.send('{'); await c.nextOf('error')
    c.send({ t: 'hack' }); await c.nextOf('error')
    expect(await c.closed()).toMatchObject({ code: 1008 })
  })
  it('logout fecha o socket com 1008; sessão apagada fecha na revalidação', async () => {
    const c = await open(); await c.next()
    await api(t.app, cookie).post('/auth/logout')
    expect(await c.closed()).toMatchObject({ code: 1008, reason: 'logout' })
    const { cookie: c2 } = await registerAndLogin(t.app, 2)
    const d = await open(c2); await d.next()
    await t.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(c2.slice('sid='.length))))
    expect(await d.closed()).toMatchObject({ code: 1008 })
  })
  it('sem pong o servidor fecha com 1001', async () => {
    const c = await open(); await c.next()
    c.raw.pong = () => {} // cliente mudo
    expect(await c.closed()).toMatchObject({ code: 1001 })
  })
})
```
`testApp` passa a aceitar `opts?: { ws?: Partial<WsOptions> }` e repassa como `wsOptions` a `buildApp`. Sobre o teste de pong: o cliente `ws` responde pong automaticamente; sobrescrever `raw.pong` com uma função vazia o silencia.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- ws`

- [ ] **Step 3: Implementar `ws.ts`**

```ts
import websocket from '@fastify/websocket'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { SESSION_COOKIE } from '../auth/cookie.js'
import { authOf, requireAuth } from '../auth/plugin.js'
import { hashToken, resolveSession } from '../auth/session.js'
import { AppError, errorBody } from '../http/errors.js'
import type { RouteDeps } from '../http/routes/auth.js'
import { sameOrigin } from '../http/security.js'
import { applySettings, setActive, stopViaScheduler, useItem, type RealtimeDeps } from './actions.js'
import { INTENT_MIN_INTERVAL_MS, WS_MAX_INVALID_IN_A_ROW, WS_PING_MS, WS_PONG_TIMEOUT_MS, WS_SESSION_RECHECK_MS } from './constants.js'
import { parseClientMessage, type ClientMessage, type ServerMessage } from './protocol.js'
import { snapshotMessage } from './scheduler.js'

export interface WsOptions { readonly pingMs: number; readonly pongTimeoutMs: number; readonly sessionRecheckMs: number; readonly maxInvalidInARow: number; readonly intentMinIntervalMs: number }
const DEFAULT_WS: WsOptions = { pingMs: WS_PING_MS, pongTimeoutMs: WS_PONG_TIMEOUT_MS, sessionRecheckMs: WS_SESSION_RECHECK_MS, maxInvalidInARow: WS_MAX_INVALID_IN_A_ROW, intentMinIntervalMs: INTENT_MIN_INTERVAL_MS }
const HARD_MAX_PAYLOAD = 64 * 1024 // o ws corta acima disto com 1009; o limite de 4 KB é aplicado em parseClientMessage com error validation

const errorMessage = (code: string, message: string): ServerMessage => ({ t: 'error', code, message })
const errorOf = (error: unknown): ServerMessage => error instanceof AppError ? errorMessage(error.code, error.message) : errorMessage('internal', 'erro interno')

interface Conn { readonly socket: WebSocket; readonly trainerId: string; readonly token: string; readonly rt: RealtimeDeps; readonly opts: WsOptions; readonly log: { error(obj: object, msg?: string): void } }

async function dispatch(conn: Conn, msg: ClientMessage): Promise<void> {
  const { rt, trainerId } = conn
  const send = (m: ServerMessage) => rt.sockets.send(conn.socket, m)
  try {
    switch (msg.t) {
      case 'ping': return send({ t: 'pong' })
      case 'hunt.stop': await stopViaScheduler(rt, trainerId); return
      case 'item.use': { const r = useItem(rt, trainerId, msg.itemId); if ('error' in r) send(errorMessage(r.error.code, r.error.message)); return }
      case 'team.setActive': { const r = setActive(rt, trainerId, msg.pokemonId); if ('error' in r) send(errorMessage(r.error.code, r.error.message)); return }
      case 'settings.update': await applySettings(rt, trainerId, msg.patch); return
    }
  } catch (error) {
    if (!(error instanceof AppError)) conn.log.error({ err: error, trainerId }, 'erro ao tratar mensagem do socket')
    send(errorOf(error))
  }
}

function handleConnection(conn: Conn): void {
  const { socket, rt, opts, trainerId } = conn
  const tokenHash = hashToken(conn.token)
  rt.sockets.add({ socket, trainerId, tokenHash })
  const runner = rt.scheduler.get(trainerId)
  rt.sockets.send(socket, runner ? (runner.catchingUp ? { t: 'hunt.catchup', ticksRemaining: -1 } : snapshotMessage(runner)) : { t: 'hunt.idle' })

  let lastIntentAt = Number.NEGATIVE_INFINITY
  let invalidInARow = 0
  let pongPending = false
  socket.on('pong', () => { pongPending = false })
  const pingTimer = setInterval(() => {
    if (pongPending) { socket.close(1001, 'sem pong'); return }
    pongPending = true; socket.ping()
    setTimeout(() => { if (pongPending && socket.readyState === socket.OPEN) socket.close(1001, 'sem pong') }, opts.pongTimeoutMs).unref()
  }, opts.pingMs)
  const recheckTimer = setInterval(() => { void resolveSession(rt.db, conn.token, rt.now()).then((s) => { if (!s) socket.close(1008, 'sessão encerrada') }) }, opts.sessionRecheckMs)

  socket.on('message', (data) => {
    const parsed = parseClientMessage(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
    if (!parsed.ok) {
      invalidInARow++
      rt.sockets.send(socket, errorMessage('validation', parsed.reason))
      if (invalidInARow >= opts.maxInvalidInARow) socket.close(1008, 'mensagens inválidas')
      return
    }
    invalidInARow = 0
    if (parsed.message.t !== 'ping') {
      const now = rt.now().getTime()
      if (now - lastIntentAt < opts.intentMinIntervalMs) { rt.sockets.send(socket, errorMessage('rate-limited', 'uma intenção a cada 200 ms')); return }
      lastIntentAt = now
    }
    void dispatch(conn, parsed.message)
  })
  socket.on('close', () => { clearInterval(pingTimer); clearInterval(recheckTimer); rt.sockets.remove(socket) })
  socket.on('error', () => { socket.close() })
}

export const wsRoutes: FastifyPluginAsync<RouteDeps & { readonly ws?: Partial<WsOptions> }> = async (app, deps) => {
  const opts: WsOptions = { ...DEFAULT_WS, ...deps.ws }
  const rt: RealtimeDeps = { db: deps.db, registry: deps.registry, now: deps.now, scheduler: deps.realtime.scheduler, sockets: deps.realtime.sockets }
  await app.register(websocket, { options: { maxPayload: HARD_MAX_PAYLOAD } })
  const originGuard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!sameOrigin(request, deps.config.APP_ORIGIN)) await reply.status(403).send(errorBody('forbidden', 'origem não permitida'))
  }
  app.get('/ws', { websocket: true, onRequest: originGuard, preHandler: requireAuth }, (socket, request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) { socket.close(1008, 'sem sessão'); return }
    handleConnection({ socket, trainerId: authOf(request).trainer.id, token, rt, opts, log: request.log })
  })
}
```
Em `app.ts`: `AppDeps.wsOptions?: Partial<WsOptions>`; registre `wsRoutes` depois de `huntRoutes` com `{ ...routeDeps, ...(deps.wsOptions && { ws: deps.wsOptions }) }`. Se `requireAuth` lançar e o upgrade ainda assim acontecer (comportamento a confirmar no `@fastify/websocket` 11), troque por um `preHandler` que responde `reply.status(401).send(errorBody('unauthorized', 'faça login'))` explicitamente; o teste de 401 decide. Se `socket.OPEN` não existir no tipo, use `socket.readyState === 1`.
`index.ts`: `export * from './actions.js'`, `export * from './ws.js'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokeidle/server test -- ws actions && pnpm --filter @pokeidle/server typecheck`
Rode `ws.test.ts` três vezes seguidas para conferir estabilidade (timers curtos).

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): rota WebSocket com cookie, origin, rate limit e ping/pong"
```

---

### Task 6: `boot.ts`, `main.ts`, README e cobertura

**Files:**
- Create: `src/realtime/boot.ts`, `packages/server/scripts/ws-smoke.ts`
- Modify: `src/main.ts`, `src/realtime/index.ts`, `packages/server/README.md`, `packages/server/package.json` (script `smoke:ws`)
- Test: `test/realtime/boot.test.ts`

**Interfaces:**
- Consumes: Task 3 (`Scheduler`), Task 2 (`SocketRegistry`), `huntSessions`, `stopHunt`, `loadActive`.
- Produces: `recoverSessions(scheduler, db, now, logger): Promise<{ recovered: number; failed: number }>`; `createShutdown({ app, scheduler, sockets, close, logger }): () => Promise<void>` (idempotente).

- [ ] **Step 1: Teste**

`test/realtime/boot.test.ts`:
```ts
import { createRng, loadRegistry } from '@pokeidle/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { huntSessions, pokemon } from '../../src/db/schema.js'
import { simulate } from '../../src/engine/simulate.js'
import { loadActive, startHunt } from '../../src/hunt-store/index.js'
import { createShutdown, recoverSessions } from '../../src/realtime/boot.js'
import { truncateAll } from '../helpers/db.js'
import { api, registerAndLogin, silentLogger, T0, testApp, type TestApp } from '../helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })
beforeEach(async () => { await truncateAll(t.db); t.clock.now = T0 })

async function trainerWithHunt(n: number, seed: number) {
  const { cookie, trainerId } = await registerAndLogin(t.app, n)
  await api(t.app, cookie).post('/trainer/starter', { species: 'charmander' })
  await t.db.update(pokemon).set({ level: 12, hp: 60, hpMax: 60 }).where(eq(pokemon.trainerId, trainerId))
  await startHunt(t.db, loadRegistry(), trainerId, 'route-1', T0, { seed })
  return trainerId
}

describe('recoverSessions', () => {
  it('recria os runners, faz catch-up determinístico e pula sessão corrompida', async () => {
    const a = await trainerWithHunt(1, 1)
    const b = await trainerWithHunt(2, 2)
    const c = await trainerWithHunt(3, 3)
    await t.db.update(huntSessions).set({ state: { lixo: 1 } }).where(eq(huntSessions.trainerId, c))
    const beforeA = (await loadActive(t.db, a))!
    t.clock.now = new Date(T0.getTime() + 2 * 60 * 1000) // 600 ticks
    const res = await recoverSessions(t.scheduler, t.db, () => t.clock.now, silentLogger)
    expect(res).toEqual({ recovered: 2, failed: 1 })
    const ref = simulate(beforeA.state, 600, { registry: loadRegistry(), hunt: loadRegistry().hunts.get('route-1')!, rng: createRng(beforeA.seed, beforeA.rngState) })
    expect(t.scheduler.get(a)!.state).toEqual(ref.state)
    expect(t.scheduler.get(b)).toBeDefined()
    expect(t.scheduler.get(c)).toBeUndefined()
    expect(await loadActive(t.db, c)).toBeNull()
  })
})

describe('shutdown', () => {
  it('para o timer, flush com sync, fecha sockets; é idempotente', async () => {
    const a = await trainerWithHunt(1, 4)
    await t.scheduler.attach(a)
    for (let i = 0; i < 30; i++) t.scheduler.tick()
    let closed = 0
    const shutdown = createShutdown({ app: { close: async () => {} }, scheduler: t.scheduler, sockets: t.sockets, close: async () => { closed++ }, logger: silentLogger })
    await shutdown(); await shutdown()
    expect(closed).toBe(1)
    expect(t.scheduler.isStopping()).toBe(true)
    expect((await loadActive(t.db, a))!.state.tick).toBe(30)
  })
})
```
Atenção: este arquivo deixa o scheduler do `TestApp` em `stopping`; por isso o `describe('shutdown')` fica por último e nenhum teste depois dele usa `attach` com catch-up.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- boot`

- [ ] **Step 3: Implementar**

`src/realtime/boot.ts`:
```ts
import { asc } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { huntSessions } from '../db/schema.js'
import type { Scheduler, SchedulerLogger } from './scheduler.js'
import type { SocketRegistry } from './sockets.js'

export async function recoverSessions(scheduler: Scheduler, db: Db, now: () => Date, logger: SchedulerLogger): Promise<{ recovered: number; failed: number }> {
  const rows = await db.select({ trainerId: huntSessions.trainerId }).from(huntSessions).orderBy(asc(huntSessions.lastSimulatedAt))
  let recovered = 0, failed = 0
  for (const { trainerId } of rows) {
    try {
      await scheduler.attach(trainerId)
      if (scheduler.get(trainerId)) recovered++; else failed++
    } catch (error) {
      failed++
      logger.error({ err: error, trainerId }, 'falha ao recuperar a sessão no boot')
    }
  }
  logger.info({ recovered, failed, at: now().toISOString() }, 'sessões recuperadas')
  return { recovered, failed }
}

export interface ShutdownDeps { readonly app: { close(): Promise<void> }; readonly scheduler: Scheduler; readonly sockets: SocketRegistry; readonly close: () => Promise<void>; readonly logger: SchedulerLogger }

/** Idempotente: a segunda chamada devolve a mesma promessa. */
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let running: Promise<void> | null = null
  return () => {
    if (running) return running
    running = (async () => {
      deps.scheduler.stop()
      await deps.scheduler.flushAll()
      deps.sockets.closeAll(1001, 'servidor encerrando')
      await deps.app.close()
      await deps.close()
      deps.logger.info({}, 'servidor encerrado')
    })()
    return running
  }
}
```
(`attach` de snapshot corrompido não lança: finaliza e não deixa runner; por isso o `if (scheduler.get(trainerId))` conta como `failed`.)

`src/main.ts` (versão final; o scheduler precisa de um logger antes de o app existir, por isso o pino é criado primeiro e entregue ao Fastify por `loggerInstance`):
```ts
import 'dotenv/config'
import { loadRegistry } from '@pokeidle/shared'
import pino from 'pino'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { buildApp } from './http/app.js'
import { REDACT_PATHS } from './http/security.js'
import { createShutdown, recoverSessions } from './realtime/boot.js'
import { createScheduler } from './realtime/scheduler.js'
import { createSocketRegistry } from './realtime/sockets.js'

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL, redact: [...REDACT_PATHS] })
const { db, close } = createDb(config.DATABASE_URL)
await runMigrations(db)
const now = (): Date => new Date()
const sockets = createSocketRegistry()
const scheduler = createScheduler({ db, registry: loadRegistry(), now, sockets, logger })
const app = await buildApp({ db, config, now, realtime: { scheduler, sockets }, loggerInstance: logger })

const shutdown = createShutdown({ app, scheduler, sockets, close, logger })
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)))
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)))

await app.listen({ port: config.PORT, host: '0.0.0.0' })
scheduler.start()
await recoverSessions(scheduler, db, now, logger)
```
`pino` sai de `devDependencies` e entra em `dependencies` com a mesma versão já fixada (`^10.3.1`, a mesma que o Fastify 5.12 resolve). `loggerInstance` existe em Fastify 5.12 (`fastify.d.ts`). `buildApp` aceita `loggerInstance?: FastifyBaseLogger` e, quando presente, passa `loggerInstance` ao `Fastify()` em vez de `logger: { level, redact }`. `index.ts`: `export * from './boot.js'`.

`packages/server/scripts/ws-smoke.ts` (script manual, não testado): registra um usuário aleatório via `fetch` em `http://localhost:3000`, escolhe o inicial, inicia a Rota 1, abre o WS com o cookie e imprime os 20 primeiros `hunt.tick` (usa `process.stdout.write`, não `console.log`). Script `"smoke:ws": "tsx scripts/ws-smoke.ts"`.

- [ ] **Step 4: README**

Seção "Tempo real (fase 2c)" em `packages/server/README.md` (~50 linhas): como conectar (`/ws`, cookie, Origin), tabela das mensagens nos dois sentidos, ritmo (tick 200 ms, snapshot 10 s, sync 60 s, catch-up 12 h em fatias), o que acontece em `stopped` (cura em `team-fainted`), limites de abuso (S21–S28), atraso possível de 60 s nas rotas REST de inventário/time durante a hunt, boot e shutdown, `smoke:ws`.

- [ ] **Step 5: Rodar tudo e cobertura**

Run: `pnpm test && pnpm -r typecheck && pnpm --filter @pokeidle/server test -- --coverage`
Expected: verde; cobertura ≥ 80 % (anotar). Smoke: `pnpm --filter @pokeidle/server start` num terminal, `pnpm --filter @pokeidle/server smoke:ws` noutro; colar as primeiras linhas no relatório; Ctrl+C no servidor deve logar "servidor encerrado".

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): recuperação de sessões no boot, shutdown com flush e README do tempo real"
```

---

## Autorrevisão do plano

**Cobertura da spec:** §2 módulos (T1 constants/runner/catchup, T2 protocol/sockets, T3 persist/scheduler, T4 actions + wiring, T5 ws, T6 boot); §3 tick/intenções/persistência (T3 `tickOne`, `persist`, `finish`, `applyIntent`; T4 REST via actions; cura em `team-fainted` em `finishRunner`); §4 protocolo (T2 schemas, T5 handshake/abuso/ping/revalidação/logout); §5 catch-up e boot (T1 `catchUp`, T3 `attach`, T6 `recoverSessions`/`createShutdown`); §6 S21–S28 (T5 testes de handshake/validação/rate limit/ids alheios/S25; T3 cadeia e `FOR UPDATE`; T3 `insertLog`; T5 logout e revalidação); §7 erros (T3 erro no motor remove runner e preserva sessão; contador de falhas de persistência → `persist-failed`); §8 testes (unitários T1/T2, integração T3/T4/T6, WS real T5, cobertura T6).

**Placeholders:** nenhum "TBD/TODO"; os dois pontos marcados "a confirmar" (upgrade abortado por `throw` em `requireAuth`; `.for('update')` com select parcial) trazem a alternativa concreta.

**Consistência de tipos:** `Runner`/`PersistSnapshot`/`StopReason` (T1) usados em T3/T4/T5; `ServerMessage` (T2) usado por `snapshotMessage` (T3), `sockets` (T2), `ws` (T5); `Scheduler` (T3) consumido por `actions` (T4), `ws` (T5), `boot` (T6); `RealtimeDeps` (T4) usado em T5; `RouteDeps` ganha `realtime` e `registry` em T4 e é o tipo de `wsRoutes` em T5; `TestApp` ganha `scheduler`/`sockets`/`registry` em T4 e `testApp(opts)` ganha `ws` em T5; `silentLogger` criado em T3 e usado em T3/T4/T6; `sameOrigin` criado em T4 e usado em T5; `applyIntent` do scheduler devolve `IntentResult` com códigos `no-hunt`/`catching-up` além dos do motor.

**Decisões registradas:** `hunt.catchup { ticksRemaining: -1 }` ao conectar durante um catch-up (o valor exato só o laço sabe); `HARD_MAX_PAYLOAD` de 64 KB no `ws` e 4 KB por `parseClientMessage` (para o erro ser `validation` e não um close 1009); `pino` vira dependência de produção para o scheduler ter logger antes do app (`loggerInstance`); `attach` aguarda o catch-up (boot recupera em série, mais antigas primeiro).

---

### Task 7: Visualizador de depuração (`/debug`)

Pedido do usuário em 2026-09-14: uma página descartável para ver a hunt acontecer antes do cliente da fase 3. Não é o cliente; é uma ferramenta de validação. Fica atrás de `DEBUG_VIEWER=true`.

**Files:**
- Create: `packages/server/public/debug/index.html`, `public/debug/viewer.css`, `public/debug/viewer.js`, `src/http/routes/debug.ts`
- Modify: `src/config.ts` (`DEBUG_VIEWER`, `ASSETS_DIR`), `src/http/app.ts` (registrar `debugRoutes` quando `DEBUG_VIEWER`), `.env.example`, `packages/server/README.md`
- Test: `test/debug.test.ts`, `test/config.test.ts` (dois casos)

**Interfaces:**
- Consumes: `RouteDeps` (Task 4: `registry`), `loadConfig`, `errorBody`, `freshApp(t, extraRoutes?, configOverrides?)` do helper.
- Produces: `Config.DEBUG_VIEWER: boolean` (padrão `false`), `Config.ASSETS_DIR: string` (padrão `<packages/server>/../../assets/atlas`); `debugRoutes: FastifyPluginAsync<RouteDeps>` com `GET /debug/` (HTML), `GET /debug/viewer.js`, `GET /debug/viewer.css`, `GET /debug/map/:id` (HuntMap JSON do registro; 404 se não existe), `GET /debug/atlas/:file` com `file` numa allowlist fixa (`tiles.png`, `tiles.json`, `pokemon.png`, `pokemon.json`) lido de `ASSETS_DIR` (404 se o arquivo não existe); `DEBUG_ALLOWED_ATLAS` exportado.

- [ ] **Step 1: Testes**

Em `test/config.test.ts`, no teste "aplica os padrões", acrescente ao objeto esperado `DEBUG_VIEWER: false` e `ASSETS_DIR: expect.stringMatching(/assets[\/\\]atlas$/)`; e um caso: `loadConfig({ ...base, DEBUG_VIEWER: 'true', ASSETS_DIR: '/tmp/x' })` → `{ DEBUG_VIEWER: true, ASSETS_DIR: '/tmp/x' }`.

`test/debug.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api, freshApp, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let on: FastifyInstance
let off: FastifyInstance
let assetsDir: string
beforeAll(async () => {
  t = await testApp()
  assetsDir = await mkdtemp(path.join(tmpdir(), 'pokeidle-atlas-'))
  await writeFile(path.join(assetsDir, 'tiles.json'), JSON.stringify({ frames: { grass: { frame: { x: 0, y: 0, w: 32, h: 32 } } }, meta: { image: 'tiles.png' } }))
  await writeFile(path.join(assetsDir, 'secret.txt'), 'x')
  on = await freshApp(t, undefined, { DEBUG_VIEWER: 'true', ASSETS_DIR: assetsDir })
  off = await freshApp(t, undefined, { DEBUG_VIEWER: 'false' })
})
afterAll(async () => { await on.close(); await off.close(); await t.close() })

describe('DEBUG_VIEWER desligado', () => {
  it('nenhuma rota /debug existe', async () => {
    for (const url of ['/debug/', '/debug/viewer.js', '/debug/map/route-1', '/debug/atlas/tiles.json']) expect((await api(off).get(url)).statusCode, url).toBe(404)
  })
})

describe('DEBUG_VIEWER ligado', () => {
  it('serve a página, o script e o css com os tipos certos e o CSP do helmet', async () => {
    const html = await api(on).get('/debug/')
    expect(html.statusCode).toBe(200)
    expect(String(html.headers['content-type'])).toMatch(/text\/html/)
    expect(html.body).toContain('<canvas')
    expect(html.body).toContain('viewer.js')
    expect(String(html.headers['content-security-policy'])).toContain("default-src 'self'")
    const js = await api(on).get('/debug/viewer.js')
    expect(js.statusCode).toBe(200)
    expect(String(js.headers['content-type'])).toMatch(/javascript/)
    expect(String((await api(on).get('/debug/viewer.css')).headers['content-type'])).toMatch(/text\/css/)
  })
  it('mapa do registro e 404 para desconhecido', async () => {
    const r = await api(on).get('/debug/map/route-1')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ id: 'route-1', width: 40, height: 30, tileSize: 32 })
    expect((await api(on).get('/debug/map/nope')).statusCode).toBe(404)
  })
  it('atlas só da allowlist e só o que existe; sem path traversal', async () => {
    const ok = await api(on).get('/debug/atlas/tiles.json')
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ frames: { grass: expect.anything() } })
    expect((await api(on).get('/debug/atlas/tiles.png')).statusCode).toBe(404) // não existe no dir de teste
    expect((await api(on).get('/debug/atlas/secret.txt')).statusCode).toBe(404)
    expect((await api(on).get('/debug/atlas/..%2Fsecret.txt')).statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- debug config`

- [ ] **Step 3: Config e rotas**

`src/config.ts`: acrescente ao schema `DEBUG_VIEWER: bool.default('false')` e `ASSETS_DIR: z.string().min(1).default(DEFAULT_ASSETS_DIR)` com
```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const DEFAULT_ASSETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/atlas')
```
(`src/config.ts` → `packages/server/src` → três níveis acima é a raiz do repo.)

`src/http/routes/debug.ts`:
```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { errorBody } from '../errors.js'
import { parseBody } from '../validate.js'
import type { RouteDeps } from './auth.js'

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/debug')
export const DEBUG_ALLOWED_ATLAS: Readonly<Record<string, string>> = { 'tiles.png': 'image/png', 'tiles.json': 'application/json', 'pokemon.png': 'image/png', 'pokemon.json': 'application/json' }
const PAGE_FILES: Readonly<Record<string, string>> = { 'index.html': 'text/html; charset=utf-8', 'viewer.js': 'application/javascript; charset=utf-8', 'viewer.css': 'text/css; charset=utf-8' }
const MapParams = z.object({ id: z.string().min(1).max(64) }).strict()
const AtlasParams = z.object({ file: z.string().min(1).max(64) }).strict()

async function fileOr404(filePath: string): Promise<Buffer | null> {
  try { return await readFile(filePath) } catch { return null }
}

/** Ferramenta de depuração (DEBUG_VIEWER=true): página estática + dados públicos do jogo. Nunca expõe estado de jogador. */
export const debugRoutes: FastifyPluginAsync<RouteDeps> = async (app, { registry, config }) => {
  const servePage = (name: string) => async (_request: unknown, reply: import('fastify').FastifyReply) => {
    const body = await fileOr404(path.join(PUBLIC_DIR, name))
    if (!body) return reply.status(404).send(errorBody('not-found', 'arquivo não encontrado'))
    return reply.type(PAGE_FILES[name]!).send(body)
  }
  app.get('/debug/', servePage('index.html'))
  app.get('/debug/viewer.js', servePage('viewer.js'))
  app.get('/debug/viewer.css', servePage('viewer.css'))

  app.get('/debug/map/:id', async (request, reply) => {
    const { id } = parseBody(MapParams, request.params)
    const hunt = registry.hunts.get(id)
    if (!hunt) return reply.status(404).send(errorBody('not-found', `hunt ${id} não existe`))
    return hunt
  })

  app.get('/debug/atlas/:file', async (request, reply) => {
    const { file } = parseBody(AtlasParams, request.params)
    const type = DEBUG_ALLOWED_ATLAS[file]
    if (!type) return reply.status(404).send(errorBody('not-found', 'arquivo não permitido'))
    const body = await fileOr404(path.join(config.ASSETS_DIR, file))
    if (!body) return reply.status(404).send(errorBody('not-found', 'atlas não encontrado; gere com pnpm assets build'))
    return reply.type(type).send(body)
  })
}
```
Em `app.ts`: `if (config.DEBUG_VIEWER) await app.register(debugRoutes, routeDeps)` depois das rotas de hunt. `.env.example`: `DEBUG_VIEWER=true` e `# ASSETS_DIR=` comentado. Troque o `import('fastify').FastifyReply` inline por `import type { FastifyReply } from 'fastify'` no topo.

- [ ] **Step 4: Página**

`public/debug/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Pokeidle — visualizador de hunt</title>
  <link rel="stylesheet" href="/debug/viewer.css" />
</head>
<body>
  <header>
    <form id="auth">
      <input id="email" type="email" placeholder="e-mail" required />
      <input id="password" type="password" placeholder="senha (8+)" required />
      <input id="name" placeholder="nome (só p/ registrar)" />
      <button type="button" id="register">Registrar</button>
      <button type="submit" id="login">Entrar</button>
      <button type="button" id="logout">Sair</button>
    </form>
    <div id="controls">
      <select id="starter"><option value="charmander">Charmander</option><option value="bulbasaur">Bulbasaur</option><option value="squirtle">Squirtle</option></select>
      <button type="button" id="choose">Escolher inicial</button>
      <button type="button" id="start">Iniciar Rota 1</button>
      <button type="button" id="stop">Parar</button>
      <label><input type="checkbox" id="showBlocking" /> bloqueio</label>
      <span id="status">desconectado</span>
    </div>
  </header>
  <main>
    <canvas id="map" width="1280" height="960"></canvas>
    <aside>
      <h2>Treinador</h2>
      <pre id="trainer">—</pre>
      <h2>Eventos</h2>
      <ol id="log"></ol>
    </aside>
  </main>
  <script src="/debug/viewer.js"></script>
</body>
</html>
```

`public/debug/viewer.css`:
```css
body { margin: 0; font: 13px/1.4 system-ui, sans-serif; background: #1b1b1b; color: #eee; }
header { display: flex; gap: 16px; flex-wrap: wrap; padding: 8px 12px; background: #262626; align-items: center; }
form, #controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
input, select, button { font: inherit; padding: 4px 8px; background: #333; color: #eee; border: 1px solid #555; border-radius: 4px; }
button { cursor: pointer; } button:hover { background: #444; }
#status { margin-left: 8px; color: #9fd; }
main { display: grid; grid-template-columns: 1fr 320px; gap: 12px; padding: 12px; }
canvas { width: 100%; max-width: 960px; image-rendering: pixelated; background: #000; border: 1px solid #444; }
aside { min-width: 0; } pre { white-space: pre-wrap; background: #111; padding: 8px; border-radius: 4px; }
#log { max-height: 640px; overflow: auto; padding-left: 24px; margin: 0; font-family: ui-monospace, monospace; font-size: 12px; }
#log li.attack { color: #f9a; } #log li.wildDefeated { color: #9f9; } #log li.captured { color: #9cf; } #log li.stopped { color: #fc6; }
```

`public/debug/viewer.js` (JS puro, sem build; tudo o que o servidor manda é reproduzido do estado + eventos):
```js
const TILE = 32
const $ = (id) => document.getElementById(id)
const state = { map: null, atlas: null, atlasImg: null, snapshot: null, wilds: new Map(), player: null, targetWildId: null, flashes: [], ws: null }

const api = async (method, url, body) => {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const json = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ? `${json.error.code}: ${json.error.message}` : `${res.status}`)
  return json
}
const setStatus = (text) => { $('status').textContent = text }
const log = (cls, text) => {
  const li = document.createElement('li'); li.className = cls; li.textContent = text
  const ol = $('log'); ol.prepend(li); while (ol.children.length > 200) ol.lastChild.remove()
}

async function loadMap(huntId) {
  if (state.map?.id === huntId) return
  state.map = await api('GET', `/debug/map/${huntId}`)
  state.atlas = await api('GET', '/debug/atlas/tiles.json')
  state.atlasImg = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = '/debug/atlas/tiles.png' })
  const canvas = $('map'); canvas.width = state.map.width * TILE; canvas.height = state.map.height * TILE
}

function applySnapshot(msg) {
  state.snapshot = msg
  state.wilds = new Map(msg.state.wilds.map((w) => [w.id, w]))
  const p = msg.state.player
  state.player = { position: p.position, mode: p.mode, team: p.team, activeIndex: p.activeIndex }
  state.targetWildId = p.targetWildId
  $('trainer').textContent = JSON.stringify({ xp: msg.state.trainer.xp, gold: msg.state.trainer.gold, inventory: msg.state.inventory, team: p.team.map((m) => `${m.speciesName} L${m.level} ${m.hp}/${m.hpMax}`), mode: p.mode }, null, 1)
}

function applyEvent(e) {
  const p = state.player
  switch (e.type) {
    case 'moved': p.position = e.to; break
    case 'spawned': state.wilds.set(e.wildId, { id: e.wildId, speciesName: e.speciesName, level: e.level, position: e.position, hp: null, hpMax: null }); break
    case 'attack': {
      if (e.attacker === 'player') { const w = state.wilds.get(Number(e.targetId)); if (w) { w.hp = e.targetHp; state.targetWildId = w.id } }
      else { const m = p.team.find((x) => x.id === e.targetId); if (m) m.hp = e.targetHp; state.targetWildId = Number(e.attackerId) }
      state.flashes.push({ at: e.attacker === 'player' ? state.wilds.get(Number(e.targetId))?.position : p.position, until: performance.now() + 250 })
      break
    }
    case 'wildDefeated': case 'captured': case 'skipped': if (e.type !== 'skipped') state.wilds.delete(e.wildId); if (state.targetWildId === e.wildId) state.targetWildId = null; break
    case 'itemUsed': { const m = p.team.find((x) => x.id === e.pokemonId); if (m) m.hp = e.hp; break }
    case 'switched': p.activeIndex = p.team.findIndex((x) => x.id === e.pokemonId); break
    case 'healed': p.team.forEach((m) => { m.hp = m.hpMax }); p.mode = 'searching'; break
    case 'returning': p.mode = 'returning'; state.targetWildId = null; break
    case 'levelUp': { const m = p.team.find((x) => x.id === e.pokemonId); if (m) m.level = e.level; break }
    case 'evolved': { const m = p.team.find((x) => x.id === e.pokemonId); if (m) m.speciesName = e.to; break }
    case 'stopped': p.mode = 'stopped'; break
  }
}

function draw() {
  const canvas = $('map'), ctx = canvas.getContext('2d')
  if (!state.map || !state.atlasImg) { requestAnimationFrame(draw); return }
  const { map, atlas } = state
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const blit = (name, x, y) => { const f = atlas.frames[name]; if (!f) return; ctx.drawImage(state.atlasImg, f.frame.x, f.frame.y, f.frame.w, f.frame.h, x * TILE, y * TILE, TILE, TILE) }
  for (let i = 0; i < map.width * map.height; i++) {
    const x = i % map.width, y = Math.floor(i / map.width)
    if (map.layers.ground[i]) blit(map.layers.ground[i], x, y)
    if (map.layers.detail[i]) blit(map.layers.detail[i], x, y)
    if ($('showBlocking').checked && map.layers.blocking[i]) { ctx.fillStyle = 'rgba(255,0,0,.35)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE) }
  }
  ctx.fillStyle = 'rgba(80,160,255,.6)'; ctx.fillRect(map.pokecenter.x * TILE, map.pokecenter.y * TILE, TILE, TILE)
  ctx.font = '11px monospace'
  const bar = (x, y, hp, hpMax, color) => { if (hp == null || !hpMax) return; ctx.fillStyle = '#000'; ctx.fillRect(x * TILE, y * TILE - 6, TILE, 4); ctx.fillStyle = color; ctx.fillRect(x * TILE, y * TILE - 6, TILE * Math.max(0, hp / hpMax), 4) }
  for (const w of state.wilds.values()) {
    ctx.fillStyle = w.id === state.targetWildId ? '#ff4' : '#f66'
    ctx.beginPath(); ctx.arc(w.position.x * TILE + 16, w.position.y * TILE + 16, 10, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(`${w.speciesName} L${w.level}`, w.position.x * TILE - 4, w.position.y * TILE + 30)
    bar(w.position.x, w.position.y, w.hp, w.hpMax, '#f66')
  }
  if (state.player) {
    const p = state.player, m = p.team[p.activeIndex]
    ctx.fillStyle = p.mode === 'fighting' ? '#f90' : p.mode === 'returning' ? '#9cf' : p.mode === 'healing' ? '#6f6' : '#fff'
    ctx.fillRect(p.position.x * TILE + 6, p.position.y * TILE + 6, 20, 20)
    ctx.fillStyle = '#fff'; ctx.fillText(`${m.speciesName} ${p.mode}`, p.position.x * TILE - 8, p.position.y * TILE - 8)
    bar(p.position.x, p.position.y, m.hp, m.hpMax, '#6f6')
  }
  const now = performance.now()
  state.flashes = state.flashes.filter((f) => f.until > now && f.at)
  for (const f of state.flashes) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 3; ctx.strokeRect(f.at.x * TILE, f.at.y * TILE, TILE, TILE) }
  requestAnimationFrame(draw)
}

function connect() {
  if (state.ws) state.ws.close()
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
  state.ws = ws
  ws.onopen = () => setStatus('conectado')
  ws.onclose = (e) => setStatus(`fechado ${e.code} ${e.reason}`)
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data)
    switch (msg.t) {
      case 'hunt.idle': setStatus('sem hunt'); break
      case 'hunt.catchup': setStatus(`catch-up: ${msg.ticksRemaining} ticks restantes`); break
      case 'hunt.summary': log('stopped', `resumo do catch-up: ${JSON.stringify(msg.summary)}`); break
      case 'hunt.snapshot': await loadMap(msg.session.huntId); applySnapshot(msg); setStatus(`hunt ${msg.session.huntId} tick ${msg.state.tick}`); break
      case 'hunt.tick': for (const e of msg.events) { applyEvent(e); if (e.type !== 'moved') log(e.type, `#${e.tick} ${JSON.stringify(e)}`) } break
      case 'hunt.stopped': log('stopped', `hunt parada: ${msg.reason}${msg.healed ? ' (time curado)' : ''}`); setStatus(`parada: ${msg.reason}`); break
      case 'error': log('attack', `erro: ${msg.code} ${msg.message}`); break
    }
  }
}

const send = (obj) => state.ws?.readyState === 1 && state.ws.send(JSON.stringify(obj))
const creds = () => ({ email: $('email').value, password: $('password').value })
$('auth').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('POST', '/auth/login', creds()); setStatus('logado'); connect() } catch (err) { setStatus(String(err.message)) } })
$('register').addEventListener('click', async () => { try { await api('POST', '/auth/register', { ...creds(), name: $('name').value }); setStatus('registrado'); connect() } catch (err) { setStatus(String(err.message)) } })
$('logout').addEventListener('click', async () => { await api('POST', '/auth/logout'); state.ws?.close(); setStatus('saiu') })
$('choose').addEventListener('click', async () => { try { const r = await api('POST', '/trainer/starter', { species: $('starter').value }); log('captured', `inicial: ${r.pokemon.speciesName} L${r.pokemon.level}`) } catch (err) { setStatus(String(err.message)) } })
$('start').addEventListener('click', async () => { try { await api('POST', '/hunts/route-1/start') } catch (err) { setStatus(String(err.message)) } })
$('stop').addEventListener('click', () => send({ t: 'hunt.stop' }))
requestAnimationFrame(draw)
```
Regras: sem bibliotecas, sem inline script/style (CSP), os `fetch` são same-origin (o navegador manda `Origin`, então o check S11 passa). O `id` dos selvagens vem como número no snapshot e como string em `attackerId`/`targetId` dos eventos `attack` (o motor usa `String(wild.id)` lá): por isso o `Number(...)`. Confira em `src/engine/combat.ts` como `attackerId`/`targetId` são preenchidos e ajuste se for diferente.

- [ ] **Step 5: README e verificação**

README: subseção "Visualizador de depuração" (DEBUG_VIEWER, `pnpm assets build` para gerar `assets/atlas` se ainda não existir, abrir `http://localhost:3000/debug/`, registrar, inicial, iniciar, o que cada cor significa; não é o cliente da fase 3).
Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`. Smoke manual (obrigatório, com evidência no relatório): subir o servidor com `DEBUG_VIEWER=true`, abrir a página, registrar, escolher inicial, iniciar a Rota 1, ver o marcador andar e o log receber `attack`/`wildDefeated`; tirar um screenshot e salvar em `.superpowers/sdd/2026-09-14-fase-2c-realtime/debug-viewer.png` (fora do repo). Se o atlas não existir em `assets/atlas`, gere com o comando do README de `tools/assets` (`pnpm assets build --extracted assets/extracted-otp2019 ...`, ver `tools/assets/README.md`) e diga no relatório.

- [ ] **Step 6: Commit**

```bash
git add packages/server .env.example
git commit -m "feat(server): visualizador de depuração da hunt em /debug"
```

## Adendo à autorrevisão (Task 7)

Cobre o pedido do usuário de validar visualmente a hunt antes da fase 3. Consome só dados públicos (mapa, atlas) e as rotas já existentes; não cria estado nem contorna auth (a página usa o cookie como qualquer cliente). Estrutura de arquivos ganha `public/debug/*` e `routes/debug.ts`; `Config` ganha `DEBUG_VIEWER`/`ASSETS_DIR`; `app.ts` registra sob a flag. Tipos: `RouteDeps.registry` (Task 4) é o que `debugRoutes` lê.
