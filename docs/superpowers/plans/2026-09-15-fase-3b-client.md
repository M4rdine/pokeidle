# Fase 3b: Cliente web (PixiJS) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O jogo jogável no navegador: entrar, escolher o inicial, iniciar a Rota 1 e ver a hunt no mapa com sprites, HUD, log, mochila, time, configurações, Pokédex e loja, tudo espelhado do que o servidor manda pelo WebSocket.

**Architecture:** Novo pacote `packages/client` (Vite 8 + PixiJS 8, sem framework): um store imutável por fatia (`session`, `hunt`, `log`), um espelho puro do estado da hunt (`state/hunt-view.ts`) que aplica os eventos do servidor, uma cena Pixi alimentada por um `reconcile` puro (ops por entidade) com interpolação por tick, e HUD/telas/modais em HTML puro. O servidor ganha `serverTime` nas mensagens, `GET /hunts/:id/map`, `@fastify/static` para o build e para o atlas, e a correção do `detach` durante catch-up.

**Tech Stack:** TypeScript 5 strict, Vite 8.3, PixiJS 8.20, Vitest 5 + happy-dom 20 (só no client), @playwright/test 1.63 (smoke), @fastify/static 10.1, zod 3 via `@pokeidle/shared`.

**Spec:** `docs/superpowers/specs/2026-09-14-fase-3-client-design.md` (com §10, adendo do GDD `docs/design/2026-09-14-pokeidle-gdd.md` §4–§5)

## Global Constraints

- Regra dura de testes: todo run em PRIMEIRO PLANO, um por vez, sem watch, sem monitor, sem `git stash`. Os testes de integração do servidor compartilham o Postgres de teste (5433). A smoke E2E do cliente sobe o servidor de verdade e NUNCA roda junto com a suíte do servidor.
- Dependências: `ui → state → api`; `scene → state`. `scene/reconcile.ts`, `scene/interpolate.ts`, `scene/camera.ts` e `state/*` são puros (sem Pixi, sem DOM). Só `scene/app.ts`, `scene/map-layer.ts`, `scene/sprites.ts`, `scene/effects.ts` importam `pixi.js`. Só `ui/*` e `main.ts` tocam o DOM. Nenhuma fórmula reimplementada: `hpAt`, `xpForLevel`, `levelFromXp`, `availableMoves`, `cooldownTicks`, `expectedDamage`, `typeMultiplier`, `teamSlotsFor`, `nextUnlock` vêm de `@pokeidle/shared`; tipos e schemas do fio vêm de `@pokeidle/shared/protocol`.
- Nunca `console.*` no cliente: avisos vão para o painel de log interno (`state/log.ts`, kind `alert`). Sem `<script>`/`<style>` inline (CSP `default-src 'self'`); CSS em `src/styles/*.css` importado pelo `main.ts`.
- Protocolo: `hunt.snapshot` e `hunt.tick` ganham `serverTime: number` (ms desde a época, `now()` do servidor). Fila de intenções do cliente: no máximo 1 mensagem (exceto `ping`) a cada `INTENT_MIN_INTERVAL_MS = 200`; reconexão com backoff exponencial `1000 → 30000` ms com jitter ±20 %.
- Cena: `TILE_SIZE = 32` (shared), tween de posição de `TICK_MS = 200` ms, âncora do sprite no pé `(0.5, 1)`, `zIndex = y`, câmera lerp `0.15` por frame com clamp nas bordas, zoom 1x/2x (`+`/`-`), `image-rendering: pixelated`, `resolution = devicePixelRatio`. Efeitos (GDD §4): lunge 8 px / 150 ms; flash branco 100 ms; número de dano sobe 24 px em 600 ms (laranja e maior se `typeMultiplier > 1`, cinza se `< 1`); tremor de 2 px no ativo ao receber golpe; fade 300 ms em derrota/captura; brilho branco 400 ms na captura; anel dourado 600 ms no level up; fade branco na evolução; "+XP" amarelo flutuante; brilho verde em `itemUsed`/`healed`.
- Interface: desktop ≥ 1024 px; painéis escuros com borda de 2 px e cantos retos; cor por tipo nos rótulos; numerais tabulares; log com 200 linhas e filtro "só combate"; `Esc` fecha modal; botões que mandam intenção ficam desabilitados 200 ms. Dicas de primeira vez em `localStorage` (`pokeidle.tip.<chave>`). Toast "Compre bolas no Centro" uma vez por sessão quando o total de bolas ≤ 1.
- Servidor: `/` serve `packages/client/dist` só se a pasta existir (senão 404 como hoje); `index.html` com `Cache-Control: no-cache`; chunks com hash (Vite `assetsDir: 'app'`, servidos em `/app/*`) com `public, max-age=31536000, immutable`; `/assets/atlas/:file` só os 4 arquivos do atlas (`pokemon.png`, `pokemon.json`, `tiles.png`, `tiles.json`) de `ASSETS_DIR`. CSP: `default-src 'self'; img-src 'self' data: blob:`. Dev: Vite em 5173 com proxy para 3000 e `APP_ORIGIN=http://localhost:5173` no servidor.
- Vite: `moduleResolution: bundler`, imports locais com `.js` (Vite e TS resolvem para `.ts`), JSON do `shared` com `with { type: 'json' }` (Vite 8 aceita).
- Cobertura ≥ 80 % em `packages/client/src` excluindo `scene/app.ts`, `scene/map-layer.ts`, `scene/sprites.ts`, `scene/effects.ts`, `main.ts`. Servidor continua ≥ 80 %.
- Commits convencionais de UMA linha, sem trailers. TDD.

## Estrutura de arquivos

```
packages/shared/src/protocol/{types,messages}.ts      (+ serverTime, ServerMessageSchema)
packages/server/src/
  config.ts (+ CLIENT_DIST)  http/atlas-files.ts  http/static.ts  http/app.ts  http/routes/{hunts,debug}.ts
  realtime/{scheduler,ws}.ts (serverTime, detach guard)   scripts/record-route1.ts
packages/client/
  package.json  tsconfig.json  index.html  vite.config.ts  vitest.config.ts  playwright.config.ts
  src/main.ts  src/config.ts
  src/api/{http,dto,ws}.ts
  src/state/{store,hunt-view,log,session,progress,tips}.ts
  src/scene/{reconcile,interpolate,camera,atlas,app,map-layer,sprites,effects}.ts
  src/ui/{dom,toast,overlay,sprite-css}.ts  src/ui/screens/{auth,starter,hunts,game}.ts
  src/ui/hud/{top-bar,active-pokemon,moves,log,team-strip}.ts  src/ui/modals/{modal,bag,team,settings,pokedex,shop}.ts
  src/styles/{tokens,layout,hud,modals}.css
  test/**  test/fixtures/route1-300.json  e2e/smoke.spec.ts
```

---

### Task 1: Servidor: `serverTime`, `ServerMessageSchema`, `GET /hunts/:id/map` e `detach` durante catch-up

**Files:**
- Modify: `packages/shared/src/protocol/types.ts`, `packages/shared/src/protocol/messages.ts`, `packages/shared/test/protocol.test.ts`, `packages/server/src/realtime/scheduler.ts`, `packages/server/src/realtime/ws.ts`, `packages/server/src/http/routes/hunts.ts`, `packages/server/test/realtime/ws.test.ts`, `packages/server/test/realtime/scheduler.test.ts`, `packages/server/test/hunts.test.ts`

**Interfaces:**
- Produces (`@pokeidle/shared/protocol`): `ServerMessage` com `serverTime: number` em `hunt.snapshot` e `hunt.tick`; `SessionInfoSchema`, `SummarySchema`, `StopReasonSchema`, `ServerMessageSchema` (união discriminada por `t`, `.strict()`); `snapshotMessage(runner, now: Date)` no servidor; `GET /hunts/:id/map` → `HuntMap` (200) ou `not-found` (404).

- [ ] **Step 1: Testes**

`packages/shared/test/protocol.test.ts`, acrescente:
```ts
import { ServerMessageSchema, type ServerMessage } from '../src/protocol/index.js'

describe('ServerMessageSchema', () => {
  it('aceita cada tipo de mensagem do servidor e rejeita campo extra ou tipo desconhecido', () => {
    const session = { huntId: 'route-1', sessionId: 's', startedAt: '2026-09-14T12:00:00.000Z' }
    const summary = { ticks: 10, defeats: 1, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 21, gold: 5, drops: { potion: 1 }, levelUps: 0, evolutions: 0, returns: 0 }
    const msgs: ServerMessage[] = [
      { t: 'hunt.snapshot', session, state, serverTime: 1_000 },
      { t: 'hunt.tick', tick: 4, events: [{ type: 'moved', tick: 3, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }], serverTime: 1_200 },
      { t: 'hunt.stopped', reason: 'team-fainted', healed: true },
      { t: 'hunt.catchup', ticksRemaining: 250 },
      { t: 'hunt.summary', summary },
      { t: 'hunt.idle' },
      { t: 'error', code: 'no-hunt', message: 'não há hunt ativa' },
      { t: 'pong' },
    ]
    for (const m of msgs) expect(ServerMessageSchema.parse(m), m.t).toEqual(m)
    expect(() => ServerMessageSchema.parse({ t: 'pong', x: 1 })).toThrow()
    expect(() => ServerMessageSchema.parse({ t: 'hunt.tick', tick: 1, events: [] })).toThrow() // sem serverTime
    expect(() => ServerMessageSchema.parse({ t: 'nope' })).toThrow()
  })
})
```
(`state` é o fixture já existente no arquivo; ele precisa de `box: []`, `potionHpPercent`, `teamSlots`, já presentes.)

`packages/server/test/realtime/ws.test.ts`: no teste que recebe `hunt.snapshot` e depois `hunt.tick` (por volta das linhas 169–175), acrescente `expect(snap['serverTime']).toBe(T0.getTime())` e `expect(tick['serverTime']).toBe(t.clock.now.getTime())` (o relógio do teste avança entre snapshot e tick? veja como o teste avança `t.clock.now`; se não avança, `T0.getTime()` nos dois).

`packages/server/test/hunts.test.ts`, acrescente:
```ts
describe('GET /hunts/:id/map', () => {
  it('devolve o HuntMap completo do registro; 404 para id desconhecido; exige sessão', async () => {
    const r = await api(t.app, cookie).get('/hunts/route-1/map')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ id: 'route-1', width: 40, height: 30, tileSize: 32, spawnPoint: expect.any(Object), pokecenter: expect.any(Object) })
    expect((r.json() as { layers: { ground: unknown[] } }).layers.ground).toHaveLength(1200)
    expect((await api(t.app, cookie).get('/hunts/nope/map')).statusCode).toBe(404)
    expect((await api(t.app).get('/hunts/route-1/map')).statusCode).toBe(401)
  })
})
```

`packages/server/test/realtime/scheduler.test.ts`, no `describe` de catch-up (perto de "attach: catch-up abortado por stop()"):
```ts
  it('detach durante o catch-up: nenhuma fatia posterior ressuscita o runner nem transmite summary/snapshot', async () => {
    const s = fakeSocket(); sockets.add({ socket: s, trainerId, tokenHash: 'tk' })
    let detached = false
    const s2: Scheduler = createScheduler({
      db, registry, now: () => clock.now, sockets, logger: silentLogger,
      yieldNow: async () => { if (!detached) { detached = true; s2.detach(trainerId) } },
    })
    await startHunt(db, registry, trainerId, 'route-1', clock.now, { seed: 42 })
    clock.now = new Date(T0.getTime() + 10 * 60 * 1000) // 3000 ticks: várias fatias
    await s2.attach(trainerId)
    expect(s2.get(trainerId)).toBeUndefined()
    const types = msgs(s).map((m) => m.t)
    expect(types).not.toContain('hunt.summary')
    expect(types).not.toContain('hunt.snapshot')
    expect(types.filter((x) => x === 'hunt.catchup').length).toBeLessThanOrEqual(2) // o inicial do attach + no máximo a fatia já em voo
    const active = await loadActive(db, trainerId)
    expect(active?.state.tick).toBe(0) // quem fez detach assumiu a sessão: nada foi persistido por esta geração
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/shared test -- protocol`, depois `pnpm --filter @pokeidle/server test -- hunts` (um por vez).

- [ ] **Step 3: `shared/protocol`**

`types.ts`: em `ServerMessage`, `hunt.snapshot` ganha `readonly serverTime: number` e `hunt.tick` ganha `readonly serverTime: number`.

`messages.ts`, acrescente (importando `HuntStateSchema` e `EventSchema` de `./schema.js`):
```ts
export const SessionInfoSchema = z.object({ huntId: z.string(), sessionId: z.string(), startedAt: z.string() }).strict()
export const StopReasonSchema = z.enum(['team-fainted', 'intent', 'no-route', 'corrupt', 'persist-failed'])
const count = z.number().int().min(0)
export const SummarySchema = z.object({ ticks: count, defeats: count, captures: count, captureFailures: count, faints: count, xpTrainer: count, gold: count, drops: z.record(z.string(), count), levelUps: count, evolutions: count, returns: count }).strict()
export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hunt.snapshot'), session: SessionInfoSchema, state: HuntStateSchema, serverTime: z.number() }).strict(),
  z.object({ t: z.literal('hunt.tick'), tick: z.number().int().min(0), events: z.array(EventSchema), serverTime: z.number() }).strict(),
  z.object({ t: z.literal('hunt.stopped'), reason: StopReasonSchema, healed: z.boolean() }).strict(),
  z.object({ t: z.literal('hunt.catchup'), ticksRemaining: z.number().int().min(0) }).strict(),
  z.object({ t: z.literal('hunt.summary'), summary: SummarySchema }).strict(),
  z.object({ t: z.literal('hunt.idle') }).strict(),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string() }).strict(),
  z.object({ t: z.literal('pong') }).strict(),
])
```
Atenção: `HuntStateSchema` tem `.default()` em três campos, então `z.infer` dele difere de `HuntState` (opcionais na entrada). O tipo `ServerMessage` continua sendo o de `types.ts` (não `z.infer`); no cliente, `ServerMessageSchema.parse(x)` devolve o output com os defaults aplicados, compatível com `ServerMessage`. Se o TS reclamar na atribuição, tipar o retorno do parse com `as ServerMessage` UMA vez no `api/ws.ts` (documentado lá), nunca no shared.

- [ ] **Step 4: Servidor**

`realtime/scheduler.ts`: `export const snapshotMessage = (r: Runner, now: Date): ServerMessage => ({ t: 'hunt.snapshot', session: {...}, state: r.state, serverTime: now.getTime() })`; nas chamadas internas passe `deps.now()`. Os dois broadcasts de `hunt.tick` (tick normal e `applyIntent`) ganham `serverTime: deps.now().getTime()`. `realtime/ws.ts`: `snapshotMessage(runner, rt.now())`.

Correção do catch-up em `runCatchUp`: no `onSlice`, o `broadcast` de `hunt.catchup` também fica dentro do `if (isCurrent())`; no ramo `if (result.stopped)`, a primeira linha passa a ser `if (!isCurrent()) return // detach/finish assumiu a sessão durante o catch-up` antes de `runners.set`. Ajuste o comentário.

`routes/hunts.ts`:
```ts
  app.get('/hunts/:id/map', guard, async (request, reply) => {
    const { id } = parseBody(HuntParams, request.params)
    const hunt = registry.hunts.get(id)
    if (!hunt) return reply.status(404).send(errorBody('not-found', `hunt ${id} não existe`))
    return hunt
  })
```
(importe `errorBody` de `../errors.js`.)

- [ ] **Step 5: Rodar tudo**

Run: `pnpm --filter @pokeidle/shared test && pnpm --filter @pokeidle/server test && pnpm -r typecheck` (um por vez). Expected: verde (server 226 + 3 novos).

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/server
git commit -m "feat(server,shared): serverTime nas mensagens, ServerMessageSchema, GET /hunts/:id/map e guarda de detach no catch-up"
```

---

### Task 2: Servidor: build estático, atlas público, CSP, scripts e docs

**Files:**
- Create: `packages/server/src/http/atlas-files.ts`, `packages/server/src/http/static.ts`, `packages/server/test/static.test.ts`
- Modify: `packages/server/src/config.ts`, `packages/server/src/http/app.ts`, `packages/server/src/http/routes/debug.ts`, `packages/server/package.json` (`@fastify/static`), `package.json` (raiz, scripts), `.env.example`, `packages/server/README.md`

**Interfaces:**
- Produces: `config.CLIENT_DIST` (padrão `<repo>/packages/client/dist`); `ATLAS_FILES: Readonly<Record<string, string>>` (nome → content-type) em `http/atlas-files.ts`; `registerStatic(app, config)` em `http/static.ts` que (a) serve `/assets/atlas/:file` da allowlist a partir de `ASSETS_DIR` (sempre) e (b) registra `@fastify/static` em `/` com `root: CLIENT_DIST` só se a pasta existir; CSP com `img-src 'self' data: blob:`.

- [ ] **Step 1: Testes**

`packages/server/test/static.test.ts`:
```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api, freshApp, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })

describe('atlas público', () => {
  it('serve os 4 arquivos do atlas com o content-type certo e 404 para o resto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    await writeFile(join(dir, 'tiles.json'), '{"frames":{}}')
    const app = await freshApp(t, undefined, { ASSETS_DIR: dir })
    const ok = await api(app).get('/assets/atlas/tiles.json')
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toMatch(/application\/json/)
    expect((await api(app).get('/assets/atlas/pokemon.png')).statusCode).toBe(404) // permitido mas ausente
    expect((await api(app).get('/assets/atlas/..%2Fsecret.json')).statusCode).toBe(404)
    expect((await api(app).get('/assets/atlas/tiles.tsj')).statusCode).toBe(404) // fora da allowlist
    await app.close()
  })
})

describe('build do cliente', () => {
  it('sem a pasta dist, / responde 404 JSON como hoje', async () => {
    const app = await freshApp(t, undefined, { CLIENT_DIST: join(tmpdir(), 'pokeidle-nao-existe') })
    const r = await api(app).get('/')
    expect(r.statusCode).toBe(404)
    expect(r.json()).toEqual({ error: { code: 'not-found', message: 'rota não encontrada' } })
    await app.close()
  })
  it('com dist, serve index.html sem cache e chunks de /app com cache imutável; arquivo desconhecido → 404 JSON', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'pokeidle-dist-'))
    await mkdir(join(dist, 'app'))
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Pokeidle</title>')
    await writeFile(join(dist, 'app', 'main-abc123.js'), 'export {}')
    const app = await freshApp(t, undefined, { CLIENT_DIST: dist })
    const index = await api(app).get('/')
    expect(index.statusCode).toBe(200)
    expect(index.headers['content-type']).toMatch(/text\/html/)
    expect(index.headers['cache-control']).toBe('no-cache')
    const chunk = await api(app).get('/app/main-abc123.js')
    expect(chunk.statusCode).toBe(200)
    expect(chunk.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect((await api(app).get('/nope.html')).json()).toMatchObject({ error: { code: 'not-found' } })
    expect(index.headers['content-security-policy']).toMatch(/img-src 'self' data: blob:/)
    await app.close()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/server test -- static`

- [ ] **Step 3: Implementar**

`pnpm --filter @pokeidle/server add @fastify/static@^10.1.3`.

`config.ts`: `const DEFAULT_CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')` e `CLIENT_DIST: z.string().min(1).default(DEFAULT_CLIENT_DIST)` ao lado de `ASSETS_DIR`.

`http/atlas-files.ts`:
```ts
/** Os únicos arquivos do atlas servidos ao navegador (allowlist: nada de listar ASSETS_DIR). */
export const ATLAS_FILES: Readonly<Record<string, string>> = { 'tiles.png': 'image/png', 'tiles.json': 'application/json', 'pokemon.png': 'image/png', 'pokemon.json': 'application/json' }
```
`routes/debug.ts`: apague `DEBUG_ALLOWED_ATLAS` e importe `ATLAS_FILES`.

`http/static.ts`:
```ts
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Config } from '../config.js'
import { ATLAS_FILES } from './atlas-files.js'
import { errorBody } from './errors.js'
import { parseBody } from './validate.js'

const AtlasParams = z.object({ file: z.string().min(1).max(64) }).strict()
const IMMUTABLE = 'public, max-age=31536000, immutable'

async function fileOr404(filePath: string): Promise<Buffer | null> {
  try { return await readFile(filePath) } catch { return null }
}

/** Atlas público (sempre) e o build do cliente (só se `CLIENT_DIST` existir: sem build, `/` continua 404). */
export async function registerStatic(app: FastifyInstance, config: Config): Promise<void> {
  app.get('/assets/atlas/:file', async (request, reply) => {
    const { file } = parseBody(AtlasParams, request.params)
    const type = ATLAS_FILES[file]
    if (!type) return reply.status(404).send(errorBody('not-found', 'arquivo não permitido'))
    const body = await fileOr404(path.join(config.ASSETS_DIR, file))
    if (!body) return reply.status(404).send(errorBody('not-found', 'atlas não encontrado; gere com pnpm assets build'))
    return reply.header('cache-control', 'public, max-age=3600').type(type).send(body)
  })
  if (!existsSync(config.CLIENT_DIST)) return
  await app.register(fastifyStatic, {
    root: config.CLIENT_DIST, prefix: '/', index: ['index.html'], wildcard: false, serveDotFiles: false, cacheControl: false,
    setHeaders: (res, filePath) => { res.setHeader('cache-control', filePath.includes(`${path.sep}app${path.sep}`) ? IMMUTABLE : 'no-cache') },
  })
}
```
`wildcard: false`: o plugin registra uma rota por arquivo existente no boot (glob), então arquivo desconhecido cai no nosso `setNotFoundHandler` (JSON) e não num 404 do plugin. Confira na doc do `@fastify/static` 10 os nomes `wildcard`, `index`, `serveDotFiles`, `cacheControl`, `setHeaders` (use o Context7 se tiver dúvida).

`http/app.ts`: `contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'] } }`; depois de registrar as rotas de negócio e antes de `wsRoutes`, `await registerStatic(app, config)`.

`package.json` (raiz), scripts: `"client:dev": "pnpm --filter @pokeidle/client dev"`, `"client:build": "pnpm --filter @pokeidle/client build"`, `"client:test": "pnpm --filter @pokeidle/client test"`, `"client:e2e": "pnpm --filter @pokeidle/client e2e"` (o pacote nasce na Task 3; os scripts já podem existir).

`.env.example`: depois de `APP_ORIGIN`, comentário: `# Em dev com o Vite (pnpm client:dev, porta 5173) use APP_ORIGIN=http://localhost:5173: o navegador manda Origin 5173 e o servidor recusa outra origem (S11).` e no fim `# Build do cliente servido em / (padrão: <repo>/packages/client/dist; sem a pasta, / é 404).\n# CLIENT_DIST=`.

`packages/server/README.md`: seção "Cliente" curta: ordem `pnpm client:build` → `pnpm --filter @pokeidle/server start` abre `http://localhost:3000/`; em dev `pnpm client:dev` (Vite 5173 + proxy) com `APP_ORIGIN=http://localhost:5173`; `/assets/atlas/*` público (allowlist); `GET /hunts/:id/map`; `serverTime` nas mensagens. Tabela de rotas ganha `GET /hunts/:id/map | sim | not-found`.

- [ ] **Step 4: Rodar tudo**

Run: `pnpm --filter @pokeidle/server test && pnpm --filter @pokeidle/server typecheck`. Expected: verde (o teste do debug viewer continua passando com `ATLAS_FILES`).

- [ ] **Step 5: Commit**

```bash
git add package.json .env.example packages/server pnpm-lock.yaml
git commit -m "feat(server): build do cliente e atlas servidos pelo Fastify, CSP com img-src data/blob, scripts do cliente"
```

---

### Task 3: Pacote `packages/client`: Vite, Vitest, `config`, `api/http`, `api/dto`, `state/store`

**Files:**
- Create: `packages/client/package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `vitest.config.ts`, `src/main.ts` (placeholder mínimo que a Task 8 substitui), `src/config.ts`, `src/api/http.ts`, `src/api/dto.ts`, `src/state/store.ts`, `test/store.test.ts`, `test/api/http.test.ts`, `test/api/dto.test.ts`, `src/styles/tokens.css`
- Modify: `.gitignore` (`packages/client/dist`, `packages/client/coverage`, `packages/client/test-results`, `packages/client/playwright-report`)

**Interfaces:**
- Produces: `createStore<T>(initial): Store<T>` com `get(): T`, `set(next: T): void`, `update(fn: (s: T) => T): void`, `subscribe<S>(selector: (s: T) => S, fn: (value: S, prev: S | undefined) => void, opts?: { immediate?: boolean; equals?: (a: S, b: S) => boolean }): () => void` (dispara só quando a fatia muda por `Object.is`, `immediate` padrão `true`); `ApiError extends Error { code: string; status: number }`; `http.get<T>(url, schema)`, `http.post<T>(url, body, schema)`, `http.put`, `http.patch` (JSON same-origin, `credentials: 'same-origin'`, cabeçalho `content-type`; resposta validada pelo schema zod; erro `{ error: { code, message } }` → `ApiError`; 401 → `onUnauthorized()` injetado); schemas `MeSchema`, `PokemonDtoSchema`, `TeamSchema`, `InventorySchema`, `PokedexSchema`, `HuntsSchema`, `ShopSchema`, `SessionDtoSchema`, `StartHuntSchema`, `ActiveHuntSchema`, `TradeSchema` e tipos `Me`, `PokemonDto`, `HuntSummary`, `ShopItem` em `api/dto.ts`.

- [ ] **Step 1: Scaffolding**

`packages/client/package.json`:
```json
{
  "name": "@pokeidle/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": { "@pokeidle/shared": "workspace:*", "pixi.js": "^8.20.1", "zod": "^3.23.8" },
  "devDependencies": {
    "@playwright/test": "^1.63.0", "@vitest/coverage-v8": "^5.0.1", "happy-dom": "^20.14.5",
    "typescript": "^5.5.4", "vite": "^8.3.0", "vitest": "^5.0.1"
  }
}
```
`tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"], "noEmit": true, "rootDir": "." },
  "include": ["src", "test", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```
`index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pokeidle</title>
    <link rel="icon" href="data:," />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```
`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
const target = 'http://localhost:3000'
export default defineConfig({
  build: { assetsDir: 'app', sourcemap: false, target: 'es2022' },
  server: {
    port: 5173, strictPort: true,
    proxy: {
      '/auth': target, '/me': target, '/trainer': target, '/hunts': target, '/shop': target, '/assets/atlas': target,
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'happy-dom', include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/scene/app.ts', 'src/scene/map-layer.ts', 'src/scene/sprites.ts', 'src/scene/effects.ts', 'src/main.ts'], thresholds: { lines: 80, statements: 80, branches: 70 } },
  },
})
```
`src/config.ts`:
```ts
export { TICK_MS, TILE_SIZE } from '@pokeidle/shared'
export const ATLAS_URL = { pokemon: '/assets/atlas/pokemon.json', tiles: '/assets/atlas/tiles.json' } as const
export const WS_PATH = '/ws'
export const LOG_MAX_LINES = 200
export const INTENT_MIN_INTERVAL_MS = 200
export const BACKOFF_MIN_MS = 1000
export const BACKOFF_MAX_MS = 30000
export const TIP_PREFIX = 'pokeidle.tip.'
```
`src/main.ts` provisório: `import './styles/tokens.css'; document.querySelector('#app')!.textContent = 'Pokeidle'` (a Task 8 substitui). `src/styles/tokens.css`: variáveis `--bg`, `--panel`, `--border`, `--text`, `--muted`, `--accent`, `--danger`, `--ok`, `--space-1..4`, `--border-w: 2px`, e uma cor por tipo (`--type-fire: #f08030`, `--type-water: #6890f0`, `--type-grass: #78c850`, `--type-electric: #f8d030`, `--type-normal: #a8a878`, `--type-poison: #a040a0`, `--type-ground: #e0c068`, `--type-flying: #a890f0`, `--type-psychic: #f85888`, `--type-bug: #a8b820`, `--type-rock: #b8a038`, `--type-ghost: #705898`, `--type-ice: #98d8d8`, `--type-dragon: #7038f8`, `--type-fighting: #c03028`, `--type-dark: #705848`, `--type-steel: #b8b8d0`, `--type-fairy: #ee99ac`), `font-variant-numeric: tabular-nums` no `body`, `image-rendering: pixelated` em `canvas`.

Instale: `pnpm install` na raiz (o workspace liga `@pokeidle/shared`). Verifique que `pnpm --filter @pokeidle/client build` funciona com o `main.ts` provisório importando `loadRegistry` de `@pokeidle/shared` (prova dos imports JSON com `with { type: 'json' }` e dos `.js` → `.ts` no Vite): adicione temporariamente `import { loadRegistry } from '@pokeidle/shared'; loadRegistry()` e depois deixe (o `main.ts` real vai usar).

- [ ] **Step 2: Testes**

`test/store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../src/state/store.js'

describe('createStore', () => {
  it('set troca o objeto inteiro e update deriva do atual', () => {
    const s = createStore({ a: 1, b: 'x' })
    s.set({ a: 2, b: 'x' })
    s.update((v) => ({ ...v, b: 'y' }))
    expect(s.get()).toEqual({ a: 2, b: 'y' })
  })
  it('subscribe dispara imediatamente e depois só quando a fatia muda', () => {
    const s = createStore({ a: 1, b: 'x' })
    const fn = vi.fn()
    const off = s.subscribe((v) => v.a, fn)
    expect(fn).toHaveBeenCalledWith(1, undefined)
    s.update((v) => ({ ...v, b: 'y' })) // a não mudou
    expect(fn).toHaveBeenCalledTimes(1)
    s.update((v) => ({ ...v, a: 2 }))
    expect(fn).toHaveBeenLastCalledWith(2, 1)
    off()
    s.update((v) => ({ ...v, a: 3 }))
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('immediate: false não dispara na assinatura; equals customizado compara fatias compostas', () => {
    const s = createStore({ list: [1, 2] })
    const fn = vi.fn()
    s.subscribe((v) => v.list, fn, { immediate: false, equals: (a, b) => a.length === b.length })
    s.update(() => ({ list: [3, 4] }))
    expect(fn).not.toHaveBeenCalled()
    s.update(() => ({ list: [3] }))
    expect(fn).toHaveBeenCalledWith([3], [1, 2])
  })
})
```
`test/api/http.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, createHttp } from '../../src/api/http.js'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('http', () => {
  it('GET valida a resposta com o schema e manda credenciais same-origin', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true }))
    const http = createHttp({ fetch: fetchMock, onUnauthorized: () => {} })
    await expect(http.get('/me', z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/me', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }))
  })
  it('POST manda JSON; erro do servidor vira ApiError com code e status; 401 chama onUnauthorized', async () => {
    const onUnauthorized = vi.fn()
    const http = createHttp({ fetch: vi.fn(async () => json(409, { error: { code: 'hunt-active', message: 'pare a hunt' } })), onUnauthorized })
    const err = await http.post('/shop/buy', { itemId: 'potion', quantity: 1 }, z.unknown()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'hunt-active', status: 409, message: 'pare a hunt' })
    const http401 = createHttp({ fetch: vi.fn(async () => json(401, { error: { code: 'unauthorized', message: 'x' } })), onUnauthorized })
    await expect(http401.get('/me', z.unknown())).rejects.toMatchObject({ code: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
  it('resposta fora do schema vira ApiError bad-response; falha de rede vira ApiError network', async () => {
    const http = createHttp({ fetch: vi.fn(async () => json(200, { nope: 1 })), onUnauthorized: () => {} })
    await expect(http.get('/me', z.object({ ok: z.boolean() }))).rejects.toMatchObject({ code: 'bad-response' })
    const down = createHttp({ fetch: vi.fn(async () => { throw new TypeError('failed') }), onUnauthorized: () => {} })
    await expect(down.get('/me', z.unknown())).rejects.toMatchObject({ code: 'network' })
  })
})
```
`test/api/dto.test.ts`: um caso que faz `MeSchema.parse` de um objeto igual ao que `GET /me` devolve hoje (`{ user: { id, email, role }, trainer: { id, name, xp, gold, settings: { returnHpPercent, potionHpPercent, capture: { ballTier, maxWildHpPercent, allowDuplicates } }, hasStarter, activeHuntId, level, xpToNext, teamSlots, nextUnlock } }`, com `nextUnlock` `{ level, what }` ou `null`) e um que rejeita `trainer.level` ausente; e `ShopSchema.parse({ level: 1, gold: 0, items: [{ itemId: 'potion', name: 'Poção', kind: 'potion', buyPrice: 100, sellPrice: 50, unlockLevel: 0, unlocked: true, owned: 2 }] })`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test`

- [ ] **Step 4: Implementar**

`src/state/store.ts`:
```ts
export interface SubscribeOptions<S> { readonly immediate?: boolean; readonly equals?: (a: S, b: S) => boolean }
export interface Store<T> {
  get(): T
  set(next: T): void
  update(fn: (current: T) => T): void
  subscribe<S>(selector: (state: T) => S, fn: (value: S, prev: S | undefined) => void, opts?: SubscribeOptions<S>): () => void
}

/** Store imutável: `set`/`update` trocam o objeto inteiro; cada assinante vê só a fatia do seu selector. */
export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<(next: T, prev: T) => void>()
  const set = (next: T): void => {
    const prev = state
    state = next
    for (const l of [...listeners]) l(next, prev)
  }
  return {
    get: () => state,
    set,
    update: (fn) => set(fn(state)),
    subscribe: (selector, fn, opts = {}) => {
      const equals = opts.equals ?? Object.is
      let last = selector(state)
      if (opts.immediate ?? true) fn(last, undefined)
      const listener = (next: T): void => {
        const value = selector(next)
        if (equals(value, last)) return
        const prev = last
        last = value
        fn(value, prev)
      }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
```
`src/api/http.ts`:
```ts
import type { ZodType } from 'zod'

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = 'ApiError' }
}
export interface HttpDeps { readonly fetch: typeof globalThis.fetch; readonly onUnauthorized: () => void }
export interface Http {
  get<T>(url: string, schema: ZodType<T>): Promise<T>
  post<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T>
  put<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T>
  patch<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T>
}
const ErrorBody = (x: unknown): { code: string; message: string } | null => {
  const e = (x as { error?: { code?: unknown; message?: unknown } } | null)?.error
  return e && typeof e.code === 'string' && typeof e.message === 'string' ? { code: e.code, message: e.message } : null
}

export function createHttp(deps: HttpDeps): Http {
  const call = async <T>(method: string, url: string, body: unknown, schema: ZodType<T>): Promise<T> => {
    let res: Response
    try {
      res = await deps.fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    } catch { throw new ApiError('network', 0, 'sem conexão com o servidor') }
    const json: unknown = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 401) deps.onUnauthorized()
      const e = ErrorBody(json)
      throw new ApiError(e?.code ?? 'internal', res.status, e?.message ?? `erro ${res.status}`)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new ApiError('bad-response', res.status, 'resposta inesperada do servidor')
    return parsed.data
  }
  return {
    get: (url, schema) => call('GET', url, undefined, schema),
    post: (url, body, schema) => call('POST', url, body, schema),
    put: (url, body, schema) => call('PUT', url, body, schema),
    patch: (url, body, schema) => call('PATCH', url, body, schema),
  }
}
```
`src/api/dto.ts` (schemas espelhando os DTOs do servidor; datas como string ISO):
```ts
import { HuntStateSchema } from '@pokeidle/shared/protocol'
import { z } from 'zod'

export const SettingsSchema = z.object({ returnHpPercent: z.number(), potionHpPercent: z.number(), capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']), maxWildHpPercent: z.number(), allowDuplicates: z.boolean() }) })
export const TrainerSchema = z.object({
  id: z.string(), name: z.string(), xp: z.number(), gold: z.number(), settings: SettingsSchema, hasStarter: z.boolean(), activeHuntId: z.string().nullable(),
  level: z.number(), xpToNext: z.number(), teamSlots: z.number(), nextUnlock: z.object({ level: z.number(), what: z.string() }).nullable(),
})
export const MeSchema = z.object({ user: z.object({ id: z.string(), email: z.string(), role: z.string() }), trainer: TrainerSchema })
export const PokemonDtoSchema = z.object({ id: z.string(), speciesName: z.string(), level: z.number(), xp: z.number(), hp: z.number(), hpMax: z.number(), teamSlot: z.number().nullable() })
export const TeamSchema = z.object({ team: z.array(PokemonDtoSchema), box: z.array(PokemonDtoSchema) })
export const InventorySchema = z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.number() })) })
export const PokedexSchema = z.object({ entries: z.array(z.object({ speciesName: z.string(), seenAt: z.string(), caughtAt: z.string().nullable() })) })
export const HuntSummarySchema = z.object({ id: z.string(), name: z.string(), width: z.number(), height: z.number(), minLevel: z.number(), maxLevel: z.number() })
export const HuntsSchema = z.object({ hunts: z.array(HuntSummarySchema) })
export const ShopItemSchema = z.object({ itemId: z.string(), name: z.string(), kind: z.enum(['potion', 'ball']), buyPrice: z.number(), sellPrice: z.number(), unlockLevel: z.number(), unlocked: z.boolean(), owned: z.number() })
export const ShopSchema = z.object({ level: z.number(), gold: z.number(), items: z.array(ShopItemSchema) })
export const TradeSchema = z.object({ gold: z.number(), item: z.object({ itemId: z.string(), quantity: z.number() }) })
export const SessionDtoSchema = z.object({ huntId: z.string(), sessionId: z.string(), startedAt: z.string(), state: HuntStateSchema })
export const StartHuntSchema = z.object({ session: SessionDtoSchema })
export const ActiveHuntSchema = z.object({ session: SessionDtoSchema.nullable() })
export const StarterResponseSchema = z.object({ pokemon: PokemonDtoSchema })
export const SettingsResponseSchema = z.object({ settings: SettingsSchema })
export const StopResponseSchema = z.object({ trainer: TrainerSchema })

export type Me = z.infer<typeof MeSchema>
export type Trainer = z.infer<typeof TrainerSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type PokemonDto = z.infer<typeof PokemonDtoSchema>
export type HuntSummary = z.infer<typeof HuntSummarySchema>
export type ShopItem = z.infer<typeof ShopItemSchema>
export type PokedexEntry = z.infer<typeof PokedexSchema>['entries'][number]
```
(o servidor serializa `Date` como ISO string no JSON; `seenAt`/`caughtAt` chegam como string.)

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck && pnpm --filter @pokeidle/client build`. Expected: verde; `dist/index.html` e `dist/app/*.js` gerados. Depois `pnpm -r test` (a raiz agora inclui o client) — um run só.

- [ ] **Step 6: Commit**

```bash
git add .gitignore packages/client pnpm-lock.yaml
git commit -m "feat(client): pacote Vite/PixiJS com store imutável, cliente HTTP validado por schema e DTOs"
```

---

### Task 4: `state/hunt-view.ts`: espelho puro do estado da hunt + gravação de 300 ticks

**Files:**
- Create: `packages/client/src/state/hunt-view.ts`, `packages/client/test/hunt-view.test.ts`, `packages/server/scripts/record-route1.ts`, `packages/client/test/fixtures/route1-300.json` (gerado e commitado)
- Modify: `packages/server/package.json` (script `record:route1`)

**Interfaces:**
- Produces: `Phase = 'idle' | 'catching-up' | 'active' | 'stopped'`; `HuntView { session, state, serverTime, tick, phase, catchup: { remaining } | null, lastSummary, stoppedInfo: { reason, healed } | null, derived: { cooldownUntil: Record<string, number>; targetWildId: number | null } }`; `emptyHuntView()`; `applyServerMessage(view, msg, registry): HuntView`; `applySnapshot(view, msg): HuntView`; `applyEvent(view, event, registry): HuntView`; `activePokemon(view): PokemonState | null`. Desvio da spec §4: `derived.wildHpMax` não existe porque `WildState` já traz `hpMax`.
- Fixture `route1-300.json`: `{ snapshot: ServerMessage(hunt.snapshot), ticks: ServerMessage(hunt.tick)[], final: HuntState }`.

- [ ] **Step 1: Gravação (servidor)**

`packages/server/scripts/record-route1.ts`:
```ts
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRng, hpAt, loadRegistry, TICK_MS, xpForLevel } from '@pokeidle/shared'
import { createHuntState, defaultSettings } from '../src/engine/create.js'
import { step } from '../src/engine/step.js'

const registry = loadRegistry()
const hunt = registry.hunts.get('route-1')!
const base = registry.species.get('charmander')!.baseStats.hp
const team = [{ id: 'p1', speciesName: 'charmander', level: 10, xp: xpForLevel('medium-slow', 10), hp: hpAt(base, 10), hpMax: hpAt(base, 10) }]
const deps = { registry, hunt, rng: createRng(42) }
const T0 = Date.UTC(2026, 8, 14, 12, 0, 0)
let state = createHuntState({ hunt, sessionId: 'rec', team, inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, deps)
const session = { huntId: 'route-1', sessionId: 'rec', startedAt: new Date(T0).toISOString() }
const snapshot = { t: 'hunt.snapshot', session, state, serverTime: T0 }
const ticks = []
for (let i = 0; i < 300; i++) {
  const r = step(state, deps)
  state = r.state
  if (r.events.length > 0) ticks.push({ t: 'hunt.tick', tick: state.tick, events: r.events, serverTime: T0 + state.tick * TICK_MS })
}
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/test/fixtures/route1-300.json')
await writeFile(out, JSON.stringify({ snapshot, ticks, final: state }, null, 1))
process.stdout.write(`${out}: ${ticks.length} ticks com eventos, tick final ${state.tick}\n`)
```
`packages/server/package.json` script: `"record:route1": "tsx scripts/record-route1.ts"`. Rode `pnpm --filter @pokeidle/server record:route1` e commite o JSON (≈ 300 ticks; se passar de 1 MB, reduza para 200 ticks e ajuste o nome). Se `scripts/` não estiver no `include` do tsconfig do servidor, o `tsx` roda mesmo assim; não é preciso incluir.

- [ ] **Step 2: Testes**

`packages/client/test/hunt-view.test.ts`:
```ts
import { hpAt, loadRegistry, cooldownTicks } from '@pokeidle/shared'
import type { Event, HuntState, ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { activePokemon, applyEvent, applyServerMessage, applySnapshot, emptyHuntView, type HuntView } from '../src/state/hunt-view.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const rec = fixture as unknown as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }>; ticks: Extract<ServerMessage, { t: 'hunt.tick' }>[]; final: HuntState }
const base = (): HuntView => applySnapshot(emptyHuntView(), rec.snapshot)
const ev = (e: Event, v: HuntView = base()) => applyEvent(v, e, registry)
const wildId = rec.snapshot.state.wilds[0]!.id
const zubat = registry.species.get(rec.snapshot.state.wilds[0]!.speciesName)!

describe('applySnapshot', () => {
  it('substitui o estado inteiro, deriva cooldowns e alvo, fase active', () => {
    const v = base()
    expect(v.state).toEqual(rec.snapshot.state)
    expect(v.session).toEqual(rec.snapshot.session)
    expect(v).toMatchObject({ phase: 'active', tick: 0, serverTime: rec.snapshot.serverTime, catchup: null, derived: { cooldownUntil: {}, targetWildId: null } })
    expect(activePokemon(v)?.speciesName).toBe('charmander')
  })
})

describe('applyEvent (tabela da spec §4)', () => {
  it('spawned cria o selvagem com hp = hpMax = hpAt', () => {
    const v = ev({ type: 'spawned', tick: 1, wildId: 99, speciesName: 'zubat', level: 5, position: { x: 2, y: 2 } })
    const hpMax = hpAt(zubat.baseStats.hp, 5)
    expect(v.state!.wilds.find((w) => w.id === 99)).toMatchObject({ speciesName: 'zubat', level: 5, hp: hpMax, hpMax, position: { x: 2, y: 2 } })
  })
  it('moved muda a posição e o modo', () => {
    const v = ev({ type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } })
    expect(v.state!.player).toMatchObject({ position: { x: 1, y: 0 }, mode: 'walking' })
  })
  it('attack do jogador: hp do selvagem, alvo, cooldown do golpe, modo fighting', () => {
    const v = ev({ type: 'attack', tick: 7, attacker: 'player', attackerId: 'p1', targetId: String(wildId), move: 'ember', damage: 9, targetHp: 7 })
    expect(v.state!.wilds.find((w) => w.id === wildId)!.hp).toBe(7)
    expect(v.derived).toEqual({ cooldownUntil: { ember: 7 + cooldownTicks(registry.moves.get('ember')!) }, targetWildId: wildId })
    expect(v.state!.player.mode).toBe('fighting')
  })
  it('attack do selvagem: hp do Pokémon alvo', () => {
    const v = ev({ type: 'attack', tick: 8, attacker: 'wild', attackerId: String(wildId), targetId: 'p1', move: 'tackle', damage: 4, targetHp: 20 })
    expect(activePokemon(v)!.hp).toBe(20)
  })
  it('wildDefeated remove o selvagem, soma xp/ouro/drops e xp do ativo, limpa o alvo', () => {
    const before = base()
    const v = ev({ type: 'wildDefeated', tick: 9, wildId, speciesName: 'zubat', level: 3, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] }, { ...before, derived: { ...before.derived, targetWildId: wildId } })
    expect(v.state!.wilds.some((w) => w.id === wildId)).toBe(false)
    expect(v.state!.trainer).toEqual({ xp: 21, gold: 5 })
    expect(v.state!.inventory['potion']).toBe(before.state!.inventory['potion']! + 1)
    expect(activePokemon(v)!.xp).toBe(activePokemon(before)!.xp + 21)
    expect(v.derived.targetWildId).toBeNull()
  })
  it('captured: bola −1, remove o selvagem, Pokémon novo no time (ou na box com toBox) e seen', () => {
    const wild = rec.snapshot.state.wilds[0]!
    const v = ev({ type: 'captured', tick: 9, wildId, speciesName: wild.speciesName, level: wild.level, ball: 'poke-ball', toBox: false })
    expect(v.state!.inventory['poke-ball']).toBe(4)
    expect(v.state!.wilds.some((w) => w.id === wildId)).toBe(false)
    expect(v.state!.player.team.at(-1)).toMatchObject({ id: `rec-w${wildId}`, speciesName: wild.speciesName, level: wild.level, hp: wild.hp, hpMax: wild.hpMax })
    expect(v.state!.settings.seen).toContain(wild.speciesName)
    const boxed = ev({ type: 'captured', tick: 9, wildId, speciesName: wild.speciesName, level: wild.level, ball: 'poke-ball', toBox: true })
    expect(boxed.state!.player.team).toHaveLength(1)
    expect(boxed.state!.box).toHaveLength(1)
  })
  it('captureFailed só gasta a bola', () => {
    const v = ev({ type: 'captureFailed', tick: 9, wildId, ball: 'poke-ball' })
    expect(v.state!.inventory['poke-ball']).toBe(4)
    expect(v.state!.wilds).toHaveLength(rec.snapshot.state.wilds.length)
  })
  it('pokemonFainted, switched, levelUp, evolved, itemUsed', () => {
    const two = { ...base(), state: { ...base().state!, player: { ...base().state!.player, team: [...base().state!.player.team, { id: 'p2', speciesName: 'bulbasaur', level: 10, xp: 1000, hp: 30, hpMax: 30 }] } } }
    const fainted = ev({ type: 'pokemonFainted', tick: 1, pokemonId: 'p1' }, two)
    expect(fainted.state!.player.team[0]!.hp).toBe(0)
    const switched = ev({ type: 'switched', tick: 1, pokemonId: 'p2' }, { ...fainted, derived: { cooldownUntil: { ember: 50 }, targetWildId: null } })
    expect(switched.state!.player.activeIndex).toBe(1)
    expect(switched.derived.cooldownUntil).toEqual({})
    const p1 = activePokemon(base())!
    const up = ev({ type: 'levelUp', tick: 1, pokemonId: 'p1', level: p1.level + 1 })
    const hpMax = hpAt(registry.species.get('charmander')!.baseStats.hp, p1.level + 1)
    expect(activePokemon(up)).toMatchObject({ level: p1.level + 1, hpMax, hp: p1.hp + (hpMax - p1.hpMax) })
    const evo = ev({ type: 'evolved', tick: 1, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' })
    expect(activePokemon(evo)!.speciesName).toBe('charmeleon')
    expect(activePokemon(evo)!.hpMax).toBe(hpAt(registry.species.get('charmeleon')!.baseStats.hp, p1.level))
    const used = ev({ type: 'itemUsed', tick: 1, itemId: 'potion', pokemonId: 'p1', hp: 18 })
    expect(activePokemon(used)!.hp).toBe(18)
    expect(used.state!.inventory['potion']).toBe(2)
  })
  it('returning, healed, stopped, skipped', () => {
    const ret = ev({ type: 'returning', tick: 1 }, { ...base(), derived: { cooldownUntil: {}, targetWildId: wildId } })
    expect(ret.state!.player.mode).toBe('returning')
    expect(ret.derived.targetWildId).toBeNull()
    const hurt = { ...ret, state: { ...ret.state!, player: { ...ret.state!.player, team: [{ ...ret.state!.player.team[0]!, hp: 3 }] } }, derived: { cooldownUntil: { ember: 9 }, targetWildId: null } }
    const healed = ev({ type: 'healed', tick: 30 }, hurt)
    expect(healed.state!.player.team[0]!.hp).toBe(healed.state!.player.team[0]!.hpMax)
    expect(healed.state!.player.mode).toBe('searching')
    expect(healed.derived.cooldownUntil).toEqual({})
    const stopped = ev({ type: 'stopped', tick: 31, reason: 'team-fainted' })
    expect(stopped).toMatchObject({ phase: 'stopped', stoppedInfo: { reason: 'team-fainted', healed: false } })
    expect(stopped.state!.player.mode).toBe('stopped')
    expect(ev({ type: 'skipped', tick: 1, wildId }, { ...base(), derived: { cooldownUntil: {}, targetWildId: wildId } }).derived.targetWildId).toBeNull()
  })
  it('evento sem estado (tick antes do snapshot) é ignorado', () => {
    expect(applyEvent(emptyHuntView(), { type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, registry)).toEqual(emptyHuntView())
  })
})

describe('applyServerMessage', () => {
  it('tick aplica eventos e avança tick/serverTime; catchup, summary, stopped, idle mudam a fase', () => {
    let v = base()
    v = applyServerMessage(v, rec.ticks[0]!, registry)
    expect(v.tick).toBe(rec.ticks[0]!.tick)
    expect(v.serverTime).toBe(rec.ticks[0]!.serverTime)
    expect(applyServerMessage(v, { t: 'hunt.catchup', ticksRemaining: 500 }, registry)).toMatchObject({ phase: 'catching-up', catchup: { remaining: 500 } })
    const summary = { ticks: 1, defeats: 0, captures: 0, captureFailures: 0, faints: 0, xpTrainer: 0, gold: 0, drops: {}, levelUps: 0, evolutions: 0, returns: 0 }
    expect(applyServerMessage(v, { t: 'hunt.summary', summary }, registry).lastSummary).toEqual(summary)
    expect(applyServerMessage(v, { t: 'hunt.stopped', reason: 'intent', healed: false }, registry)).toMatchObject({ phase: 'stopped', stoppedInfo: { reason: 'intent', healed: false } })
    const idle = applyServerMessage(v, { t: 'hunt.idle' }, registry)
    expect(idle).toMatchObject({ phase: 'idle', state: null, session: null })
    expect(applyServerMessage(v, { t: 'pong' }, registry)).toBe(v)
  })
  it('replay da gravação: o espelho bate com o estado final do motor', () => {
    const v = rec.ticks.reduce((acc, m) => applyServerMessage(acc, m, registry), base())
    const project = (s: HuntState) => ({
      trainer: s.trainer, inventory: s.inventory, box: s.box, team: s.player.team, activeIndex: s.player.activeIndex, position: s.player.position,
      wilds: s.wilds.map((w) => ({ id: w.id, speciesName: w.speciesName, level: w.level, hp: w.hp, hpMax: w.hpMax, position: w.position })), seen: s.settings.seen,
    })
    expect(project(v.state!)).toEqual(project(rec.final))
    expect(v.tick).toBe(rec.final.tick)
  })
})
```
Se o replay falhar em `inventory` por chaves com quantidade 0 (o motor mantém `0`, o espelho também deve manter `0` em vez de apagar), corrija o espelho. Se falhar em `team[].xp`, o motor dá `xpPokemon` ao ativo no `wildDefeated` — o espelho faz o mesmo. Se falhar em `wilds[].hp` por um selvagem que existia no snapshot e foi trocado por respawn (mesmo id nunca se repete: `nextWildId` cresce), verifique `spawned` → id novo.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test -- hunt-view`

- [ ] **Step 4: Implementar**

`src/state/hunt-view.ts`:
```ts
import { cooldownTicks, hpAt, STRUGGLE, xpForLevel, type Registry } from '@pokeidle/shared'
import type { Event, HuntState, PokemonState, ServerMessage, SessionInfo, StopReason, Summary, WildState } from '@pokeidle/shared/protocol'

export type Phase = 'idle' | 'catching-up' | 'active' | 'stopped'
export interface Derived { readonly cooldownUntil: Readonly<Record<string, number>>; readonly targetWildId: number | null }
export interface HuntView {
  readonly session: SessionInfo | null; readonly state: HuntState | null; readonly serverTime: number; readonly tick: number
  readonly phase: Phase; readonly catchup: { readonly remaining: number } | null; readonly lastSummary: Summary | null
  readonly stoppedInfo: { readonly reason: StopReason; readonly healed: boolean } | null; readonly derived: Derived
}
type Snapshot = Extract<ServerMessage, { t: 'hunt.snapshot' }>
type Player = HuntState['player']

export const emptyHuntView = (): HuntView => ({ session: null, state: null, serverTime: 0, tick: 0, phase: 'idle', catchup: null, lastSummary: null, stoppedInfo: null, derived: { cooldownUntil: {}, targetWildId: null } })

export const activePokemon = (view: HuntView): PokemonState | null => view.state?.player.team[view.state.player.activeIndex] ?? null

const withState = (view: HuntView, state: HuntState): HuntView => ({ ...view, state })
const withPlayer = (view: HuntView, patch: Partial<Player>): HuntView => withState(view, { ...view.state!, player: { ...view.state!.player, ...patch } })
const withDerived = (view: HuntView, patch: Partial<Derived>): HuntView => ({ ...view, derived: { ...view.derived, ...patch } })
const mapTeam = (view: HuntView, id: string, fn: (p: PokemonState) => PokemonState): HuntView => withPlayer(view, { team: view.state!.player.team.map((p) => (p.id === id ? fn(p) : p)) })
const mapWild = (view: HuntView, id: number, fn: (w: WildState) => WildState): HuntView => withState(view, { ...view.state!, wilds: view.state!.wilds.map((w) => (w.id === id ? fn(w) : w)) })
const removeWild = (view: HuntView, id: number): HuntView => withState(view, { ...view.state!, wilds: view.state!.wilds.filter((w) => w.id !== id) })
const addItem = (view: HuntView, itemId: string, delta: number): HuntView => withState(view, { ...view.state!, inventory: { ...view.state!.inventory, [itemId]: (view.state!.inventory[itemId] ?? 0) + delta } })
const clearTarget = (view: HuntView): HuntView => withDerived(withPlayer(view, { targetWildId: null }), { targetWildId: null })
const baseHp = (registry: Registry, speciesName: string): number => registry.species.get(speciesName)?.baseStats.hp ?? 1
const growthOf = (registry: Registry, speciesName: string) => registry.species.get(speciesName)?.growthRate ?? 'medium-fast'

export function applySnapshot(view: HuntView, msg: Snapshot): HuntView {
  const s = msg.state
  return { ...view, session: msg.session, state: s, serverTime: msg.serverTime, tick: s.tick, phase: s.player.mode === 'stopped' ? 'stopped' : 'active', catchup: null, derived: { cooldownUntil: { ...s.player.cooldowns }, targetWildId: s.player.targetWildId } }
}

function rescale(p: PokemonState, hpMax: number): PokemonState { return { ...p, hpMax, hp: Math.max(0, Math.min(hpMax, p.hp + (hpMax - p.hpMax))) } }

function capture(view: HuntView, e: Extract<Event, { type: 'captured' }>, registry: Registry): HuntView {
  const s = view.state!
  const wild = s.wilds.find((w) => w.id === e.wildId)
  const hpMax = wild?.hpMax ?? hpAt(baseHp(registry, e.speciesName), e.level)
  const caught: PokemonState = { id: `${s.sessionId}-w${e.wildId}`, speciesName: e.speciesName, level: e.level, xp: xpForLevel(growthOf(registry, e.speciesName), e.level), hp: wild?.hp ?? hpMax, hpMax }
  const seen = s.settings.seen.includes(e.speciesName) ? s.settings.seen : [...s.settings.seen, e.speciesName]
  const next = removeWild(addItem(view, e.ball, -1), e.wildId)
  const st = next.state!
  const placed = e.toBox ? { ...st, box: [...st.box, caught] } : { ...st, player: { ...st.player, team: [...st.player.team, caught] } }
  return clearTarget(withState(next, { ...placed, settings: { ...placed.settings, seen } }))
}

/** Uma linha por tipo de evento (spec §4). Puro: devolve um view novo. */
export function applyEvent(view: HuntView, e: Event, registry: Registry): HuntView {
  if (!view.state) return view
  const s = view.state
  switch (e.type) {
    case 'spawned': {
      const hpMax = hpAt(baseHp(registry, e.speciesName), e.level)
      return withState(view, { ...s, wilds: [...s.wilds, { id: e.wildId, spawnIndex: -1, speciesName: e.speciesName, level: e.level, hp: hpMax, hpMax, position: e.position, cooldowns: {}, captureTried: false }] })
    }
    case 'moved': return withPlayer(view, { position: e.to, mode: 'walking' })
    case 'attack': {
      if (e.attacker === 'wild') return mapTeam(view, e.targetId, (p) => ({ ...p, hp: e.targetHp }))
      const wildId = Number(e.targetId)
      const move = registry.moves.get(e.move) ?? STRUGGLE
      const hit = withPlayer(mapWild(view, wildId, (w) => ({ ...w, hp: e.targetHp })), { mode: 'fighting', targetWildId: wildId })
      return withDerived(hit, { targetWildId: wildId, cooldownUntil: { ...view.derived.cooldownUntil, [e.move]: e.tick + cooldownTicks(move) } })
    }
    case 'wildDefeated': {
      const active = activePokemon(view)
      const rewarded = withState(view, { ...s, trainer: { xp: s.trainer.xp + e.xpTrainer, gold: s.trainer.gold + e.gold } })
      const dropped = e.drops.reduce((v, d) => addItem(v, d.item, d.quantity), rewarded)
      const xped = active ? mapTeam(dropped, active.id, (p) => ({ ...p, xp: p.xp + e.xpPokemon })) : dropped
      return clearTarget(removeWild(xped, e.wildId))
    }
    case 'captured': return capture(view, e, registry)
    case 'captureFailed': return addItem(view, e.ball, -1)
    case 'pokemonFainted': return mapTeam(view, e.pokemonId, (p) => ({ ...p, hp: 0 }))
    case 'switched': return withDerived(withPlayer(view, { activeIndex: Math.max(0, s.player.team.findIndex((p) => p.id === e.pokemonId)) }), { cooldownUntil: {} })
    case 'levelUp': return mapTeam(view, e.pokemonId, (p) => rescale({ ...p, level: e.level }, hpAt(baseHp(registry, p.speciesName), e.level)))
    case 'evolved': return mapTeam(view, e.pokemonId, (p) => rescale({ ...p, speciesName: e.to }, hpAt(baseHp(registry, e.to), p.level)))
    case 'itemUsed': return addItem(mapTeam(view, e.pokemonId, (p) => ({ ...p, hp: e.hp })), e.itemId, -1)
    case 'returning': return clearTarget(withPlayer(view, { mode: 'returning' }))
    case 'healed': return withDerived(withPlayer(view, { mode: 'searching', team: s.player.team.map((p) => ({ ...p, hp: p.hpMax })) }), { cooldownUntil: {} })
    case 'stopped': return { ...clearTarget(withPlayer(view, { mode: 'stopped' })), phase: 'stopped', stoppedInfo: { reason: e.reason, healed: false } }
    case 'skipped': return clearTarget(view)
  }
}

export function applyServerMessage(view: HuntView, msg: ServerMessage, registry: Registry): HuntView {
  switch (msg.t) {
    case 'hunt.snapshot': return applySnapshot(view, msg)
    case 'hunt.tick': return msg.events.reduce((v, e) => applyEvent(v, e, registry), { ...view, tick: msg.tick, serverTime: msg.serverTime })
    case 'hunt.catchup': return { ...view, phase: 'catching-up', catchup: { remaining: msg.ticksRemaining } }
    case 'hunt.summary': return { ...view, lastSummary: msg.summary }
    case 'hunt.stopped': return { ...view, phase: 'stopped', catchup: null, stoppedInfo: { reason: msg.reason, healed: msg.healed } }
    case 'hunt.idle': return { ...emptyHuntView(), lastSummary: view.lastSummary, stoppedInfo: view.stoppedInfo }
    case 'error': case 'pong': return view
  }
}
```
(`STRUGGLE` é exportado pelo shared; `hunt.stopped` chega depois do evento `stopped` do tick e traz `healed` verdadeiro quando o servidor curou o time.) Se `hunt-view.ts` passar de ~150 linhas, mova `capture` e os helpers `with*`/`map*` para `state/hunt-view-helpers.ts`.

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck`. Expected: verde, inclusive o replay.

- [ ] **Step 6: Commit**

```bash
git add packages/client packages/server/scripts packages/server/package.json
git commit -m "feat(client): espelho puro da hunt (applyEvent/applySnapshot) validado contra 300 ticks gravados do motor"
```

---

### Task 5: `state/log.ts`, `state/session.ts`, `state/progress.ts`, `api/ws.ts`

**Files:**
- Create: `packages/client/src/state/log.ts`, `src/state/session.ts`, `src/state/progress.ts`, `src/api/ws.ts`, `test/log.test.ts`, `test/session.test.ts`, `test/progress.test.ts`, `test/api/ws.test.ts`

**Interfaces:**
- Produces: `LogLine { tick: number; kind: 'combat' | 'reward' | 'info' | 'alert'; text: string }`; `formatEvent(e, ctx: { registry: Registry; state: HuntState | null }): LogLine | null`; `displayName(kebab: string): string` ("charmander" → "Charmander", "leech-life" → "Leech Life"); `stopReasonText(reason: StopReason, healed: boolean): string`; `appendLog(lines, line, max = LOG_MAX_LINES)`.
- `Screen = 'loading' | 'auth' | 'starter' | 'hunts' | 'game'`; `screenFor(me: Me | null): Screen`; `SessionState { screen; me: Me | null; hunts: HuntSummary[]; socket: SocketStatus; error: string | null }`; `initialSession()`; `withMe(session, me)`.
- `trainerProgress(registry, xp): { level; xpInto; xpSpan; next: { level; what } | null }` (barra: `xpInto / xpSpan`); `unlockedBetween(registry, fromLevel, toLevel): string[]` (textos "Destravou: …").
- `createHuntSocket(deps): HuntSocket { connect(); send(m: ClientMessage); close() }` com `SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'`, deps injetáveis: `makeSocket(url): WebSocketLike`, `now()`, `setTimeout`, `clearTimeout`, `random()`, `onMessage(ServerMessage)`, `onStatus`, `onInvalid(reason)`; `WebSocketLike { send(data: string); close(); onopen/onmessage/onclose/onerror (setters) }`.

- [ ] **Step 1: Testes**

`test/log.test.ts`:
```ts
import { loadRegistry } from '@pokeidle/shared'
import type { HuntState } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { appendLog, displayName, formatEvent, stopReasonText } from '../src/state/log.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const state = (fixture as { snapshot: { state: HuntState } }).snapshot.state
const wild = state.wilds[0]!
const ctx = { registry, state }
const text = (e: Parameters<typeof formatEvent>[0]) => formatEvent(e, ctx)?.text

describe('formatEvent', () => {
  it('uma linha por tipo, em português, com nomes legíveis', () => {
    expect(displayName('leech-life')).toBe('Leech Life')
    expect(text({ type: 'attack', tick: 1, attacker: 'player', attackerId: 'p1', targetId: String(wild.id), move: 'ember', damage: 9, targetHp: 7 })).toBe(`Charmander usou Ember em ${displayName(wild.speciesName)}: 9 de dano`)
    expect(text({ type: 'attack', tick: 1, attacker: 'wild', attackerId: String(wild.id), targetId: 'p1', move: 'tackle', damage: 4, targetHp: 20 })).toBe(`${displayName(wild.speciesName)} usou Tackle em Charmander: 4 de dano`)
    expect(text({ type: 'wildDefeated', tick: 1, wildId: wild.id, speciesName: 'zubat', level: 4, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] })).toBe('Zubat L4 derrotado: +21 XP, +5 ouro, Poção ×1')
    expect(text({ type: 'captured', tick: 1, wildId: wild.id, speciesName: 'gastly', level: 9, ball: 'poke-ball', toBox: false })).toBe('Capturou Gastly L9!')
    expect(text({ type: 'captured', tick: 1, wildId: wild.id, speciesName: 'gastly', level: 9, ball: 'poke-ball', toBox: true })).toBe('Capturou Gastly L9! Foi para a mochila de Pokémon')
    expect(text({ type: 'captureFailed', tick: 1, wildId: wild.id, ball: 'poke-ball' })).toBe('A Poké Bola falhou')
    expect(text({ type: 'levelUp', tick: 1, pokemonId: 'p1', level: 13 })).toBe('Charmander subiu para o nível 13')
    expect(text({ type: 'evolved', tick: 1, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' })).toBe('Charmander evoluiu para Charmeleon')
    expect(text({ type: 'itemUsed', tick: 1, itemId: 'potion', pokemonId: 'p1', hp: 18 })).toBe('Usou Poção: HP 18')
    expect(text({ type: 'returning', tick: 1 })).toBe('HP baixo, voltando ao Centro')
    expect(text({ type: 'healed', tick: 1 })).toBe('Time curado')
    expect(text({ type: 'stopped', tick: 1, reason: 'team-fainted' })).toBe('Hunt parada: time caído')
    expect(text({ type: 'pokemonFainted', tick: 1, pokemonId: 'p1' })).toBe('Charmander desmaiou')
    expect(text({ type: 'switched', tick: 1, pokemonId: 'p1' })).toBe('Charmander entrou em campo')
    expect(text({ type: 'skipped', tick: 1, wildId: wild.id })).toBe(`Pulou ${displayName(wild.speciesName)}: nenhum golpe faz efeito`)
    expect(formatEvent({ type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, ctx)).toBeNull()
    expect(formatEvent({ type: 'spawned', tick: 1, wildId: 9, speciesName: 'zubat', level: 3, position: { x: 0, y: 0 } }, ctx)).toBeNull()
  })
  it('classifica: attack é combat, recompensas são reward, stopped é alert', () => {
    expect(formatEvent({ type: 'attack', tick: 1, attacker: 'player', attackerId: 'p1', targetId: String(wild.id), move: 'ember', damage: 9, targetHp: 7 }, ctx)?.kind).toBe('combat')
    expect(formatEvent({ type: 'wildDefeated', tick: 1, wildId: wild.id, speciesName: 'zubat', level: 4, xpTrainer: 1, xpPokemon: 1, gold: 1, drops: [] }, ctx)?.kind).toBe('reward')
    expect(formatEvent({ type: 'stopped', tick: 1, reason: 'no-route' }, ctx)?.kind).toBe('alert')
  })
  it('stopReasonText e appendLog (limite de 200)', () => {
    expect(stopReasonText('team-fainted', true)).toBe('Time caído. Time curado no Centro')
    expect(stopReasonText('intent', false)).toBe('Parada por você')
    expect(stopReasonText('persist-failed', false)).toBe('Erro ao salvar; tente de novo')
    const lines = Array.from({ length: 200 }, (_, i) => ({ tick: i, kind: 'info' as const, text: String(i) }))
    const next = appendLog(lines, { tick: 200, kind: 'info', text: 'novo' })
    expect(next).toHaveLength(200)
    expect(next.at(-1)?.text).toBe('novo')
    expect(next[0]?.text).toBe('1')
  })
})
```
`test/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Me } from '../src/api/dto.js'
import { initialSession, screenFor, withMe } from '../src/state/session.js'

const me = (patch: Partial<Me['trainer']>): Me => ({ user: { id: 'u', email: 'a@a.com', role: 'player' }, trainer: { id: 't', name: 'Ash', xp: 0, gold: 0, settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } }, hasStarter: false, activeHuntId: null, level: 1, xpToNext: 8, teamSlots: 3, nextUnlock: { level: 10, what: '4 vagas no time' }, ...patch } })

describe('screenFor', () => {
  it('sem sessão → auth; sem inicial → starter; sem hunt → hunts; com hunt → game', () => {
    expect(screenFor(null)).toBe('auth')
    expect(screenFor(me({}))).toBe('starter')
    expect(screenFor(me({ hasStarter: true }))).toBe('hunts')
    expect(screenFor(me({ hasStarter: true, activeHuntId: 'route-1' }))).toBe('game')
  })
  it('initialSession começa em loading e withMe deriva a tela', () => {
    expect(initialSession().screen).toBe('loading')
    expect(withMe(initialSession(), me({ hasStarter: true })).screen).toBe('hunts')
    expect(withMe(initialSession(), null).screen).toBe('auth')
  })
})
```
`test/progress.test.ts`:
```ts
import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { trainerProgress, unlockedBetween } from '../src/state/progress.js'

const registry = loadRegistry()
describe('progress', () => {
  it('nível, barra e próximo destrave a partir do xp', () => {
    expect(trainerProgress(registry, 0)).toEqual({ level: 1, xpInto: 0, xpSpan: 8, next: { level: 10, what: '4 vagas no time' } }) // medium-fast: L1 = 0, L2 = 8 (n³)
    expect(trainerProgress(registry, 1000)).toMatchObject({ level: 10, xpInto: 0, xpSpan: 331 })
    expect(trainerProgress(registry, 125000).next).toBeNull()
  })
  it('unlockedBetween lista o que destravou entre dois níveis', () => {
    expect(unlockedBetween(registry, 9, 10)).toEqual(['4 vagas no time'])
    expect(unlockedBetween(registry, 19, 20)).toEqual(['Super Poção, Great Bola, 5 vagas no time'])
    expect(unlockedBetween(registry, 10, 10)).toEqual([])
  })
})
```
(`xpForLevel('medium-fast', 1)` é 0 e `xpForLevel(2)` é 8; `xpInto` é clampado em 0.)

`test/api/ws.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createHuntSocket, type WebSocketLike } from '../../src/api/ws.js'
import { BACKOFF_MIN_MS, INTENT_MIN_INTERVAL_MS } from '../../src/config.js'

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = []
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) { FakeSocket.all.push(this) }
  send(data: string): void { this.sent.push(data) }
  close(): void { this.onclose?.() }
  open(): void { this.onopen?.() }
  receive(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

function harness() {
  FakeSocket.all = []
  let now = 0
  const timers: { at: number; fn: () => void; id: number }[] = []
  let nextId = 1
  const onMessage = vi.fn(); const onStatus = vi.fn(); const onInvalid = vi.fn()
  const ws = createHuntSocket({
    url: '/ws', makeSocket: (url) => new FakeSocket(url), now: () => now, random: () => 0.5,
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1) },
    onMessage, onStatus, onInvalid,
  })
  const advance = (ms: number) => { now += ms; for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn() } }
  return { ws, advance, onMessage, onStatus, onInvalid, sockets: FakeSocket.all }
}

describe('createHuntSocket', () => {
  it('conecta, valida mensagens com o schema e ignora as inválidas com aviso', () => {
    const h = harness()
    h.ws.connect()
    const s = h.sockets[0]!
    expect(h.onStatus).toHaveBeenLastCalledWith('connecting')
    s.open()
    expect(h.onStatus).toHaveBeenLastCalledWith('open')
    s.receive({ t: 'hunt.idle' })
    expect(h.onMessage).toHaveBeenCalledWith({ t: 'hunt.idle' })
    s.receive({ t: 'nope' })
    s.onmessage?.({ data: '{not json' })
    expect(h.onInvalid).toHaveBeenCalledTimes(2)
    expect(h.onMessage).toHaveBeenCalledTimes(1)
  })
  it('fila: no máximo uma intenção a cada 200 ms; ping passa direto; nada é enviado antes de abrir', () => {
    const h = harness()
    h.ws.connect()
    h.ws.send({ t: 'item.use', itemId: 'potion' })
    const s = h.sockets[0]!
    expect(s.sent).toEqual([])
    s.open()
    expect(s.sent).toEqual([JSON.stringify({ t: 'item.use', itemId: 'potion' })])
    h.ws.send({ t: 'hunt.stop' })
    h.ws.send({ t: 'ping' })
    expect(s.sent).toHaveLength(2) // o ping saiu; hunt.stop espera
    expect(JSON.parse(s.sent[1]!)).toEqual({ t: 'ping' })
    h.advance(INTENT_MIN_INTERVAL_MS)
    expect(JSON.parse(s.sent[2]!)).toEqual({ t: 'hunt.stop' })
  })
  it('reconecta com backoff exponencial 1 s → 30 s com jitter e reseta ao abrir; close() não reconecta', () => {
    const h = harness()
    h.ws.connect()
    h.sockets[0]!.open()
    h.sockets[0]!.close()
    expect(h.onStatus).toHaveBeenLastCalledWith('reconnecting')
    h.advance(BACKOFF_MIN_MS - 1)
    expect(h.sockets).toHaveLength(1)
    h.advance(1)
    expect(h.sockets).toHaveLength(2)
    h.sockets[1]!.close()
    h.advance(2 * BACKOFF_MIN_MS)
    expect(h.sockets).toHaveLength(3)
    for (let i = 3; i < 10; i++) { h.sockets[i - 1]!.close(); h.advance(30_000) }
    expect(h.sockets).toHaveLength(10) // teto de 30 s: cada avanço de 30 s reconecta exatamente uma vez
    h.sockets[9]!.open()
    h.sockets[9]!.close()
    h.advance(BACKOFF_MIN_MS)
    expect(h.sockets).toHaveLength(11) // reset após abrir
    h.ws.close()
    h.sockets[10]!.close()
    h.advance(60_000)
    expect(h.sockets).toHaveLength(11)
    expect(h.onStatus).toHaveBeenLastCalledWith('closed')
  })
})
```
(com `random: () => 0.5` o jitter é 0: `delay × (0.8 + 0.4 × random)`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test`

- [ ] **Step 3: Implementar**

`src/state/log.ts`:
```ts
import type { Registry } from '@pokeidle/shared'
import type { Event, HuntState, StopReason } from '@pokeidle/shared/protocol'
import { LOG_MAX_LINES } from '../config.js'

export type LogKind = 'combat' | 'reward' | 'info' | 'alert'
export interface LogLine { readonly tick: number; readonly kind: LogKind; readonly text: string }
export interface LogContext { readonly registry: Registry; readonly state: HuntState | null }

export const displayName = (kebab: string): string => kebab.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const STOP_TEXT: Record<StopReason, string> = { 'team-fainted': 'Time caído', intent: 'Parada por você', 'no-route': 'Sem caminho até o Centro', corrupt: 'Sessão corrompida', 'persist-failed': 'Erro ao salvar; tente de novo' }
export const stopReasonText = (reason: StopReason, healed: boolean): string => healed ? `${STOP_TEXT[reason]}. Time curado no Centro` : STOP_TEXT[reason]
const itemName = (ctx: LogContext, id: string): string => ctx.registry.items.get(id)?.name ?? displayName(id)
const pokemonName = (ctx: LogContext, id: string): string => { const p = ctx.state?.player.team.find((x) => x.id === id) ?? ctx.state?.box.find((x) => x.id === id); return p ? displayName(p.speciesName) : 'Pokémon' }
const wildName = (ctx: LogContext, id: string): string => { const w = ctx.state?.wilds.find((x) => String(x.id) === id); return w ? displayName(w.speciesName) : 'Selvagem' }
const line = (tick: number, kind: LogKind, text: string): LogLine => ({ tick, kind, text })

/** Uma linha por evento relevante; `moved` e `spawned` não geram linha (ruído). */
export function formatEvent(e: Event, ctx: LogContext): LogLine | null {
  switch (e.type) {
    case 'attack': return e.attacker === 'player'
      ? line(e.tick, 'combat', `${pokemonName(ctx, e.attackerId)} usou ${displayName(e.move)} em ${wildName(ctx, e.targetId)}: ${e.damage} de dano`)
      : line(e.tick, 'combat', `${wildName(ctx, e.attackerId)} usou ${displayName(e.move)} em ${pokemonName(ctx, e.targetId)}: ${e.damage} de dano`)
    case 'wildDefeated': {
      const drops = e.drops.map((d) => `${itemName(ctx, d.item)} ×${d.quantity}`)
      return line(e.tick, 'reward', [`${displayName(e.speciesName)} L${e.level} derrotado: +${e.xpTrainer} XP`, `+${e.gold} ouro`, ...drops].join(', '))
    }
    case 'captured': return line(e.tick, 'reward', `Capturou ${displayName(e.speciesName)} L${e.level}!${e.toBox ? ' Foi para a mochila de Pokémon' : ''}`)
    case 'captureFailed': return line(e.tick, 'info', `A ${itemName(ctx, e.ball)} falhou`)
    case 'levelUp': return line(e.tick, 'reward', `${pokemonName(ctx, e.pokemonId)} subiu para o nível ${e.level}`)
    case 'evolved': return line(e.tick, 'reward', `${displayName(e.from)} evoluiu para ${displayName(e.to)}`)
    case 'itemUsed': return line(e.tick, 'info', `Usou ${itemName(ctx, e.itemId)}: HP ${e.hp}`)
    case 'returning': return line(e.tick, 'info', 'HP baixo, voltando ao Centro')
    case 'healed': return line(e.tick, 'info', 'Time curado')
    case 'stopped': return line(e.tick, 'alert', `Hunt parada: ${STOP_TEXT[e.reason].toLowerCase()}`)
    case 'pokemonFainted': return line(e.tick, 'alert', `${pokemonName(ctx, e.pokemonId)} desmaiou`)
    case 'switched': return line(e.tick, 'info', `${pokemonName(ctx, e.pokemonId)} entrou em campo`)
    case 'skipped': return line(e.tick, 'info', `Pulou ${wildName(ctx, String(e.wildId))}: nenhum golpe faz efeito`)
    case 'moved': case 'spawned': return null
  }
}
export const appendLog = (lines: readonly LogLine[], next: LogLine, max = LOG_MAX_LINES): readonly LogLine[] => [...lines, next].slice(-max)
```
(`STOP_TEXT['team-fainted'].toLowerCase()` dá "time caído" — o teste espera exatamente "Hunt parada: time caído".) Atenção: `pokemonName` deve olhar o `state` ANTES do evento ser aplicado quando o nome muda (`evolved` usa `e.from`, não o estado).

`src/state/session.ts`:
```ts
import type { HuntSummary, Me } from '../api/dto.js'
export type Screen = 'loading' | 'auth' | 'starter' | 'hunts' | 'game'
export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'
export interface SessionState { readonly screen: Screen; readonly me: Me | null; readonly hunts: readonly HuntSummary[]; readonly socket: SocketStatus; readonly error: string | null }
export const screenFor = (me: Me | null): Screen => !me ? 'auth' : !me.trainer.hasStarter ? 'starter' : me.trainer.activeHuntId ? 'game' : 'hunts'
export const initialSession = (): SessionState => ({ screen: 'loading', me: null, hunts: [], socket: 'closed', error: null })
export const withMe = (s: SessionState, me: Me | null): SessionState => ({ ...s, me, screen: screenFor(me) })
```
`src/state/progress.ts`:
```ts
import { nextUnlock, trainerLevel, xpForLevel, type Registry } from '@pokeidle/shared'
export interface TrainerProgressView { readonly level: number; readonly xpInto: number; readonly xpSpan: number; readonly next: { level: number; what: string } | null }
export function trainerProgress(registry: Registry, xp: number): TrainerProgressView {
  const u = registry.unlocks
  const level = trainerLevel(u, xp)
  const floor = xpForLevel(u.growthRate, level)
  return { level, xpInto: Math.max(0, xp - floor), xpSpan: xpForLevel(u.growthRate, level + 1) - floor, next: nextUnlock(u, level, registry.items) }
}
/** Textos dos destraves alcançados ao subir de `from` para `to` (para o toast "Destravou: …"). */
export function unlockedBetween(registry: Registry, from: number, to: number): string[] {
  const out: string[] = []
  let level = from
  while (level < to) { const n = nextUnlock(registry.unlocks, level, registry.items); if (!n || n.level > to) break; out.push(n.what); level = n.level }
  return out
}
```
`src/api/ws.ts`:
```ts
import { ServerMessageSchema, type ClientMessage, type ServerMessage } from '@pokeidle/shared/protocol'
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, INTENT_MIN_INTERVAL_MS } from '../config.js'
import type { SocketStatus } from '../state/session.js'

export interface WebSocketLike {
  send(data: string): void; close(): void
  onopen: (() => void) | null; onmessage: ((ev: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null
}
export interface HuntSocketDeps {
  readonly url: string; readonly makeSocket: (url: string) => WebSocketLike; readonly now: () => number; readonly random: () => number
  readonly setTimeout: (fn: () => void, ms: number) => unknown; readonly clearTimeout: (handle: unknown) => void
  readonly onMessage: (m: ServerMessage) => void; readonly onStatus: (s: SocketStatus) => void; readonly onInvalid: (reason: string) => void
}
export interface HuntSocket { connect(): void; send(m: ClientMessage): void; close(): void }

/** Uma conexão por aba: fila de intenções (1 a cada 200 ms, ping fora da fila), backoff 1 s → 30 s com jitter ±20 %. */
export function createHuntSocket(d: HuntSocketDeps): HuntSocket {
  let socket: WebSocketLike | null = null
  let open = false
  let closedByUs = false
  let attempts = 0
  let lastSentAt = -Infinity
  let queue: ClientMessage[] = []
  let flushTimer: unknown = null
  let reconnectTimer: unknown = null

  const flush = (): void => {
    flushTimer = null
    if (!open || !socket) return
    const next = queue[0]
    if (!next) return
    const wait = lastSentAt + INTENT_MIN_INTERVAL_MS - d.now()
    if (wait > 0) { flushTimer = d.setTimeout(flush, wait); return }
    queue = queue.slice(1)
    lastSentAt = d.now()
    socket.send(JSON.stringify(next))
    if (queue.length > 0) flushTimer = d.setTimeout(flush, INTENT_MIN_INTERVAL_MS)
  }
  const scheduleReconnect = (): void => {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempts)
    attempts++
    const delay = Math.round(base * (0.8 + 0.4 * d.random()))
    d.onStatus('reconnecting')
    reconnectTimer = d.setTimeout(connect, delay)
  }
  const handleMessage = (raw: unknown): void => {
    let json: unknown
    try { json = JSON.parse(String(raw)) } catch { d.onInvalid('mensagem não é JSON'); return }
    const parsed = ServerMessageSchema.safeParse(json)
    if (!parsed.success) { d.onInvalid(`mensagem fora do protocolo: ${parsed.error.issues[0]?.message ?? '?'}`); return }
    d.onMessage(parsed.data as ServerMessage) // o schema aplica os defaults do HuntState; a forma é a de ServerMessage
  }
  function connect(): void {
    reconnectTimer = null
    closedByUs = false
    d.onStatus('connecting')
    const s = d.makeSocket(d.url)
    socket = s
    s.onopen = () => { open = true; attempts = 0; d.onStatus('open'); flush() }
    s.onmessage = (ev) => handleMessage(ev.data)
    s.onerror = () => {}
    s.onclose = () => {
      open = false
      if (socket !== s) return
      socket = null
      if (closedByUs) { d.onStatus('closed'); return }
      scheduleReconnect()
    }
  }
  return {
    connect,
    send: (m) => {
      if (m.t === 'ping') { if (open && socket) socket.send(JSON.stringify(m)); return }
      queue = [...queue, m]
      if (flushTimer === null) flush()
    },
    close: () => {
      closedByUs = true
      if (reconnectTimer !== null) { d.clearTimeout(reconnectTimer); reconnectTimer = null }
      if (flushTimer !== null) { d.clearTimeout(flushTimer); flushTimer = null }
      socket?.close()
    },
  }
}
```
O `send` antes de abrir enfileira e o `onopen` chama `flush()`; `flush` com `queue.length > 0` agenda o próximo — no teste, `hunt.stop` só sai depois de `advance(200)`. Confira o teste "fila" passo a passo com esta implementação e ajuste o timer se o `item.use` inicial e o `hunt.stop` não respeitarem exatamente 200 ms.

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): log em português, fluxo de telas, progresso do treinador e socket com fila e backoff"
```

---

### Task 6: Cena pura: `reconcile`, `interpolate`, `camera`

**Files:**
- Create: `packages/client/src/scene/reconcile.ts`, `src/scene/interpolate.ts`, `src/scene/camera.ts`, `test/scene/reconcile.test.ts`, `test/scene/interpolate.test.ts`, `test/scene/camera.test.ts`

**Interfaces:**
- Produces: `Direction = 'north' | 'south' | 'east' | 'west'`; `Entity { id: string; kind: 'player' | 'wild'; speciesName: string; level: number; x: number; y: number; hp: number; hpMax: number; targeted: boolean; fainted: boolean }`; `entitiesOf(view: HuntView): Readonly<Record<string, Entity>>` (`player` e `wild:<id>`; o jogador usa o Pokémon ativo; selvagens com hp 0 ficam `fainted`); `reconcile(prev, next): Op[]` com `Op = { op: 'create'; entity } | { op: 'update'; entity; prev: Entity } | { op: 'remove'; id: string }` (ordem: removes, creates, updates; `update` só quando algum campo mudou).
- `Tween { from: Point; to: Point; startMs: number; durationMs: number }`; `createTween(from, to, startMs, durationMs = TICK_MS)`; `positionAt(tween, nowMs): Point` (lerp com clamp); `retarget(tween, to, nowMs)` (salta ao `to` anterior e começa de lá); `directionOf(from, to): Direction` (maior delta ganha; empate → `south`; sem delta → `south`); `isDone(tween, nowMs)`.
- `Camera { x: number; y: number }` (canto superior esquerdo em px do mundo); `cameraStep(cam, targetPx: Point, viewport: { w; h }, world: { w; h }, zoom: number, lerp = 0.15): Camera` (alvo centrado; lerp; clamp `[0, world − viewport/zoom]`; mundo menor que a janela → centralizado, sem lerp).

- [ ] **Step 1: Testes**

`test/scene/reconcile.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { HuntState, ServerMessage } from '@pokeidle/shared/protocol'
import { applySnapshot, emptyHuntView } from '../../src/state/hunt-view.js'
import { entitiesOf, reconcile, type Entity } from '../../src/scene/reconcile.js'
import fixture from '../fixtures/route1-300.json' with { type: 'json' }

const snap = (fixture as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }> }).snapshot
const view = applySnapshot(emptyHuntView(), snap)
const e = (patch: Partial<Entity>): Entity => ({ id: 'player', kind: 'player', speciesName: 'charmander', level: 10, x: 0, y: 0, hp: 10, hpMax: 10, targeted: false, fainted: false, ...patch })

describe('entitiesOf', () => {
  it('mapeia o ativo em player e cada selvagem em wild:<id>, marcando o alvo', () => {
    const ents = entitiesOf({ ...view, derived: { ...view.derived, targetWildId: snap.state.wilds[0]!.id } })
    expect(ents['player']).toMatchObject({ kind: 'player', speciesName: 'charmander', x: snap.state.player.position.x, y: snap.state.player.position.y })
    expect(Object.keys(ents)).toHaveLength(1 + snap.state.wilds.length)
    expect(ents[`wild:${snap.state.wilds[0]!.id}`]).toMatchObject({ kind: 'wild', targeted: true, level: snap.state.wilds[0]!.level })
    expect(entitiesOf(emptyHuntView())).toEqual({})
  })
})
describe('reconcile', () => {
  it('gera remove, create e update por id, e nada quando nada mudou', () => {
    const prev = { player: e({}), 'wild:1': e({ id: 'wild:1', kind: 'wild', x: 3 }) }
    const next = { player: e({ x: 1 }), 'wild:2': e({ id: 'wild:2', kind: 'wild', x: 5 }) }
    expect(reconcile(prev, next)).toEqual([
      { op: 'remove', id: 'wild:1' },
      { op: 'create', entity: next['wild:2'] },
      { op: 'update', entity: next['player'], prev: prev['player'] },
    ])
    expect(reconcile(prev, { ...prev })).toEqual([])
    const sameValues = { player: e({}), 'wild:1': e({ id: 'wild:1', kind: 'wild', x: 3 }) }
    expect(reconcile(prev, sameValues)).toEqual([]) // igualdade por valor, não por referência
  })
})
```
`test/scene/interpolate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createTween, directionOf, isDone, positionAt, retarget } from '../../src/scene/interpolate.js'

describe('tween entre tiles', () => {
  const tw = createTween({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 200)
  it('t = 0, 100, 200 ms e além', () => {
    expect(positionAt(tw, 1000)).toEqual({ x: 0, y: 0 })
    expect(positionAt(tw, 1100)).toEqual({ x: 0.5, y: 0 })
    expect(positionAt(tw, 1200)).toEqual({ x: 1, y: 0 })
    expect(positionAt(tw, 1500)).toEqual({ x: 1, y: 0 })
    expect(isDone(tw, 1199)).toBe(false)
    expect(isDone(tw, 1200)).toBe(true)
  })
  it('alvo novo no meio salta ao alvo anterior e recomeça (o servidor prevalece)', () => {
    const next = retarget(tw, { x: 1, y: 1 }, 1100)
    expect(next).toEqual({ from: { x: 1, y: 0 }, to: { x: 1, y: 1 }, startMs: 1100, durationMs: 200 })
    expect(positionAt(next, 1100)).toEqual({ x: 1, y: 0 })
  })
  it('direção pelo delta', () => {
    expect(directionOf({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe('east')
    expect(directionOf({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe('west')
    expect(directionOf({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe('north')
    expect(directionOf({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe('south')
    expect(directionOf({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe('south')
  })
})
```
`test/scene/camera.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cameraStep } from '../../src/scene/camera.js'

describe('cameraStep', () => {
  const world = { w: 1280, h: 960 }
  const viewport = { w: 800, h: 600 }
  it('aproxima 15 % do alvo centrado por frame', () => {
    const cam = cameraStep({ x: 0, y: 0 }, { x: 640, y: 480 }, viewport, world, 1)
    expect(cam).toEqual({ x: 0.15 * (640 - 400), y: 0.15 * (480 - 300) })
  })
  it('clamp nas bordas e mundo menor que a janela centralizado (com zoom)', () => {
    expect(cameraStep({ x: 1000, y: 1000 }, { x: 5000, y: 5000 }, viewport, world, 1)).toEqual({ x: 1280 - 800, y: 960 - 600 })
    expect(cameraStep({ x: -50, y: -50 }, { x: 0, y: 0 }, viewport, world, 1)).toEqual({ x: 0, y: 0 })
    expect(cameraStep({ x: 0, y: 0 }, { x: 10, y: 10 }, viewport, { w: 400, h: 300 }, 1)).toEqual({ x: -200, y: -150 })
    expect(cameraStep({ x: 700, y: 500 }, { x: 5000, y: 5000 }, viewport, world, 2)).toEqual({ x: 1280 - 400, y: 960 - 300 }) // com zoom 2x a janela cobre metade do mundo
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test -- scene`

- [ ] **Step 3: Implementar**

`src/scene/reconcile.ts`:
```ts
import { activePokemon, type HuntView } from '../state/hunt-view.js'

export interface Entity { readonly id: string; readonly kind: 'player' | 'wild'; readonly speciesName: string; readonly level: number; readonly x: number; readonly y: number; readonly hp: number; readonly hpMax: number; readonly targeted: boolean; readonly fainted: boolean }
export type Entities = Readonly<Record<string, Entity>>
export type Op = { readonly op: 'create'; readonly entity: Entity } | { readonly op: 'update'; readonly entity: Entity; readonly prev: Entity } | { readonly op: 'remove'; readonly id: string }

export function entitiesOf(view: HuntView): Entities {
  const s = view.state
  const active = activePokemon(view)
  if (!s || !active) return {}
  const player: Entity = { id: 'player', kind: 'player', speciesName: active.speciesName, level: active.level, x: s.player.position.x, y: s.player.position.y, hp: active.hp, hpMax: active.hpMax, targeted: false, fainted: active.hp <= 0 }
  const wilds = s.wilds.map((w): Entity => ({ id: `wild:${w.id}`, kind: 'wild', speciesName: w.speciesName, level: w.level, x: w.position.x, y: w.position.y, hp: w.hp, hpMax: w.hpMax, targeted: w.id === view.derived.targetWildId, fainted: w.hp <= 0 }))
  return Object.fromEntries([player, ...wilds].map((e) => [e.id, e]))
}
const same = (a: Entity, b: Entity): boolean => (Object.keys(a) as (keyof Entity)[]).every((k) => a[k] === b[k])

export function reconcile(prev: Entities, next: Entities): Op[] {
  const removes: Op[] = Object.keys(prev).filter((id) => !(id in next)).map((id) => ({ op: 'remove', id }))
  const creates: Op[] = Object.values(next).filter((e) => !(e.id in prev)).map((entity) => ({ op: 'create', entity }))
  const updates: Op[] = Object.values(next).filter((e) => e.id in prev && !same(prev[e.id]!, e)).map((entity) => ({ op: 'update', entity, prev: prev[entity.id]! }))
  return [...removes, ...creates, ...updates]
}
```
`src/scene/interpolate.ts`:
```ts
import { TICK_MS } from '../config.js'
export interface Point { readonly x: number; readonly y: number }
export type Direction = 'north' | 'south' | 'east' | 'west'
export interface Tween { readonly from: Point; readonly to: Point; readonly startMs: number; readonly durationMs: number }
export const createTween = (from: Point, to: Point, startMs: number, durationMs = TICK_MS): Tween => ({ from, to, startMs, durationMs })
export function positionAt(t: Tween, nowMs: number): Point {
  const k = t.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (nowMs - t.startMs) / t.durationMs))
  return { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k }
}
export const isDone = (t: Tween, nowMs: number): boolean => nowMs - t.startMs >= t.durationMs
/** Alvo novo antes do fim: salta ao alvo anterior e recomeça (o servidor prevalece). */
export const retarget = (t: Tween, to: Point, nowMs: number): Tween => ({ from: t.to, to, startMs: nowMs, durationMs: t.durationMs })
export function directionOf(from: Point, to: Point): Direction {
  const dx = to.x - from.x, dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west'
  if (dy < 0) return 'north'
  return 'south'
}
```
`src/scene/camera.ts`:
```ts
import type { Point } from './interpolate.js'
export interface Camera { readonly x: number; readonly y: number }
export interface Size { readonly w: number; readonly h: number }
const axis = (cam: number, target: number, view: number, world: number, lerp: number): number => {
  if (world <= view) return (world - view) / 2
  const wanted = Math.min(world - view, Math.max(0, target - view / 2))
  return Math.min(world - view, Math.max(0, cam + (wanted - cam) * lerp))
}
/** `cam` em px do mundo (canto superior esquerdo da janela). O lerp é sobre o alvo já clampado. */
export function cameraStep(cam: Camera, target: Point, viewport: Size, world: Size, zoom: number, lerp = 0.15): Camera {
  const view = { w: viewport.w / zoom, h: viewport.h / zoom }
  return { x: axis(cam.x, target.x, view.w, world.w, lerp), y: axis(cam.y, target.y, view.h, world.h, lerp) }
}
```
Confira o primeiro teste da câmera com esta fórmula: alvo (640, 480), janela 800×600 → wanted = (240, 180) (dentro do clamp), cam = 0.15 × wanted. Ok.

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): reconcile de entidades, tween entre tiles e câmera, todos puros"
```

---

### Task 7: Cena PixiJS: atlas, mapa, sprites, efeitos e o adaptador `scene/app.ts`

**Files:**
- Create: `packages/client/src/scene/atlas.ts`, `src/scene/app.ts`, `src/scene/map-layer.ts`, `src/scene/sprites.ts`, `src/scene/effects.ts`, `test/scene/atlas.test.ts`

**Interfaces:**
- Consumes: `entitiesOf`, `reconcile`, `Op` (Task 6); `createTween`, `positionAt`, `retarget`, `directionOf`, `isDone`; `cameraStep`; `HuntView`, `activePokemon`; `Event` (shared); `typeMultiplier`, `TILE_SIZE`, `TICK_MS`, `Registry`.
- Produces: `loadAtlas(fetchFn): Promise<AtlasData>` com `AtlasData { pokemon: SpritesheetJson; tiles: SpritesheetJson }` e `frameOf(atlas, species, direction, phase): FrameRect | null` (puro, testado); `createScene(parent: HTMLElement, deps: { atlas: AtlasData; map: HuntMap; registry: Registry; now: () => number }): Promise<Scene>`; `Scene { applyView(view: HuntView): void; onEvent(event: Event, view: HuntView): void; setZoom(z: 1 | 2): void; zoom(): 1 | 2; resize(): void; destroy(): void }`. `applyView` faz `reconcile(prevEntities, entitiesOf(view))` e aplica as ops (create → sprite, update → tween/HP/facing, remove → fade 300 ms). `onEvent` dispara efeitos.

- [ ] **Step 1: Teste do atlas (puro)**

`test/scene/atlas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { frameOf, loadAtlas, type SpritesheetJson } from '../../src/scene/atlas.js'

const sheet: SpritesheetJson = {
  frames: { 'charmander/walk_south_0': { frame: { x: 64, y: 0, w: 32, h: 32 } }, 'charmander/walk_south_1': { frame: { x: 96, y: 0, w: 32, h: 32 } } },
  animations: { 'charmander/walk_south': ['charmander/walk_south_0', 'charmander/walk_south_1'] },
  meta: { image: 'pokemon.png', size: { w: 128, h: 32 }, scale: '1' },
}
describe('atlas', () => {
  it('frameOf devolve o retângulo do frame pedido ou null', () => {
    expect(frameOf({ pokemon: sheet, tiles: sheet }, 'charmander', 'south', 1)).toEqual({ x: 96, y: 0, w: 32, h: 32 })
    expect(frameOf({ pokemon: sheet, tiles: sheet }, 'mewtwo', 'south', 0)).toBeNull()
  })
  it('loadAtlas busca os dois JSONs e falha com mensagem clara quando o atlas não existe', async () => {
    const ok = async (url: string) => new Response(JSON.stringify(sheet), { status: 200, headers: { 'content-type': 'application/json' } })
    const atlas = await loadAtlas(ok as typeof fetch)
    expect(atlas.pokemon.animations['charmander/walk_south']).toHaveLength(2)
    const missing = async () => new Response('{}', { status: 404 })
    await expect(loadAtlas(missing as typeof fetch)).rejects.toThrow(/atlas/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test -- atlas`

- [ ] **Step 3: Implementar**

`src/scene/atlas.ts` (puro, sem Pixi):
```ts
import { ATLAS_URL } from '../config.js'
import type { Direction } from './interpolate.js'
export interface FrameRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface SpritesheetJson { readonly frames: Readonly<Record<string, { readonly frame: FrameRect }>>; readonly animations: Readonly<Record<string, readonly string[]>>; readonly meta: { readonly image: string; readonly size: { readonly w: number; readonly h: number }; readonly scale: string } }
export interface AtlasData { readonly pokemon: SpritesheetJson; readonly tiles: SpritesheetJson }
export const animationKey = (species: string, direction: Direction): string => `${species}/walk_${direction}`
export function frameOf(atlas: AtlasData, species: string, direction: Direction, phase: number): FrameRect | null {
  const names = atlas.pokemon.animations[animationKey(species, direction)]
  const name = names?.[phase % (names.length || 1)]
  return name ? atlas.pokemon.frames[name]?.frame ?? null : null
}
async function fetchJson(fetchFn: typeof fetch, url: string): Promise<SpritesheetJson> {
  const res = await fetchFn(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`atlas não encontrado em ${url}; gere com pnpm assets build`)
  return (await res.json()) as SpritesheetJson
}
export async function loadAtlas(fetchFn: typeof fetch = fetch): Promise<AtlasData> {
  const [pokemon, tiles] = await Promise.all([fetchJson(fetchFn, ATLAS_URL.pokemon), fetchJson(fetchFn, ATLAS_URL.tiles)])
  return { pokemon, tiles }
}
```
`src/scene/sprites.ts` (Pixi):
```ts
import { AnimatedSprite, Assets, Container, Graphics, Spritesheet, Text, Texture } from 'pixi.js'
import type { AtlasData } from './atlas.js'
import { animationKey } from './atlas.js'
import type { Direction } from './interpolate.js'

export interface Sheets { readonly pokemon: Spritesheet; readonly tiles: Spritesheet }
/** Carrega as duas imagens e parseia os spritesheets a partir do JSON já baixado (`loadAtlas`). */
export async function loadSheets(atlas: AtlasData): Promise<Sheets> {
  const [pokemonTex, tilesTex] = await Promise.all([Assets.load<Texture>('/assets/atlas/pokemon.png'), Assets.load<Texture>('/assets/atlas/tiles.png')])
  const pokemon = new Spritesheet(pokemonTex, atlas.pokemon as never)
  const tiles = new Spritesheet(tilesTex, atlas.tiles as never)
  await Promise.all([pokemon.parse(), tiles.parse()])
  return { pokemon, tiles }
}
export interface EntitySprite { readonly root: Container; readonly body: AnimatedSprite | Graphics; setDirection(d: Direction): void; setMoving(moving: boolean): void; readonly hasFrames: boolean }
/** AnimatedSprite com `walk_<direção>`, âncora no pé; espécie sem frames → marcador colorido com rótulo (nunca quebra). */
export function makeEntitySprite(sheets: Sheets, species: string, label: string): EntitySprite {
  const root = new Container()
  const first = sheets.pokemon.animations[animationKey(species, 'south')]
  if (first && first.length > 0) {
    const body = new AnimatedSprite(first)
    body.anchor.set(0.5, 1); body.animationSpeed = 0.15; body.gotoAndStop(0)
    root.addChild(body)
    let current: Direction = 'south'
    return {
      root, body, hasFrames: true,
      setDirection: (d) => { if (d === current) return; current = d; const frames = sheets.pokemon.animations[animationKey(species, d)]; if (frames) { const playing = body.playing; body.textures = frames; playing ? body.play() : body.gotoAndStop(0) } },
      setMoving: (moving) => { if (moving && !body.playing) body.play(); if (!moving && body.playing) body.gotoAndStop(0) },
    }
  }
  const marker = new Graphics().rect(-12, -28, 24, 28).fill(0xaa44aa).stroke({ width: 2, color: 0xffffff })
  const text = new Text({ text: label, style: { fontSize: 10, fill: 0xffffff } })
  text.anchor.set(0.5, 1); text.y = -30
  root.addChild(marker, text)
  return { root, body: marker, hasFrames: false, setDirection: () => {}, setMoving: () => {} }
}
```
`src/scene/map-layer.ts`:
```ts
import type { HuntMap } from '@pokeidle/shared'
import { Container, Sprite, type Renderer, type Texture } from 'pixi.js'
import { TILE_SIZE } from '../config.js'
import type { Sheets } from './sprites.js'
/** Desenha ground e detail uma vez numa textura só (width×32 × height×32). Tile sem frame no atlas fica vazio. */
export function buildMapSprite(renderer: Renderer, map: HuntMap, sheets: Sheets): Sprite {
  const layer = new Container()
  const draw = (names: readonly (string | null)[]): void => {
    names.forEach((name, i) => {
      const tex: Texture | undefined = name ? sheets.tiles.textures[name] : undefined
      if (!tex) return
      const s = new Sprite(tex); s.x = (i % map.width) * TILE_SIZE; s.y = Math.floor(i / map.width) * TILE_SIZE
      layer.addChild(s)
    })
  }
  draw(map.layers.ground); draw(map.layers.detail)
  const texture = renderer.generateTexture({ target: layer, frame: { x: 0, y: 0, width: map.width * TILE_SIZE, height: map.height * TILE_SIZE } as never })
  layer.destroy({ children: true })
  return new Sprite(texture)
}
```
(confira na doc do PixiJS 8 a assinatura de `renderer.generateTexture` — objeto `{ target, frame }` com `Rectangle`; use `new Rectangle(0, 0, w, h)` importado de `pixi.js` em vez do cast.)

`src/scene/effects.ts` (cada efeito registra um updater no ticker e se remove ao terminar):
```ts
import { Container, Graphics, Text, type Ticker } from 'pixi.js'
export type Updater = (dtMs: number) => boolean // devolve false quando termina
export function createEffectRunner(ticker: Ticker): { add(u: Updater): void; destroy(): void } {
  let updaters: Updater[] = []
  const tick = (t: Ticker): void => { const dt = t.deltaMS; updaters = updaters.filter((u) => u(dt)) }
  ticker.add(tick)
  return { add: (u) => { updaters = [...updaters, u] }, destroy: () => { ticker.remove(tick); updaters = [] } }
}
const over = (ms: number, fn: (k: number) => void, done?: () => void): Updater => { let t = 0; return (dt) => { t += dt; const k = Math.min(1, t / ms); fn(k); if (k >= 1) { done?.(); return false } return true } }
/** Avança 8 px na direção (dx, dy) e volta, em 150 ms. */
export const lunge = (target: Container, dx: number, dy: number): Updater => { const x0 = target.x, y0 = target.y; return over(150, (k) => { const a = Math.sin(k * Math.PI) * 8; target.x = x0 + dx * a; target.y = y0 + dy * a }, () => { target.x = x0; target.y = y0 }) }
export const flash = (target: Container, color = 0xffffff, ms = 100): Updater => { const t = target.tint; target.tint = color; return over(ms, () => {}, () => { target.tint = t }) }
export const shake = (target: Container, px = 2, ms = 120): Updater => { const x0 = target.x; return over(ms, (k) => { target.x = x0 + (k < 1 ? (Math.round(k * 6) % 2 === 0 ? px : -px) : 0) }, () => { target.x = x0 }) }
export const fadeOut = (target: Container, ms = 300, done?: () => void): Updater => over(ms, (k) => { target.alpha = 1 - k }, done)
/** Texto flutuante: sobe 24 px e some em 600 ms. */
export function floatingText(layer: Container, x: number, y: number, text: string, color: number, size = 12): Updater {
  const t = new Text({ text, style: { fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } })
  t.anchor.set(0.5, 1); t.x = x; t.y = y; layer.addChild(t)
  return over(600, (k) => { t.y = y - 24 * k; t.alpha = 1 - k * k }, () => { t.destroy() })
}
/** Anel dourado (level up) ou brilho circular colorido (captura, poção, cura). */
export function ring(layer: Container, x: number, y: number, color: number, ms = 600, radius = 20): Updater {
  const g = new Graphics(); layer.addChild(g)
  return over(ms, (k) => { g.clear().circle(x, y - 12, radius * (0.5 + k)).stroke({ width: 3, color, alpha: 1 - k }) }, () => { g.destroy() })
}
```
`src/scene/app.ts` (o único que junta tudo; não coberto por unitários):
```ts
import { typeMultiplier, type HuntMap, type Registry } from '@pokeidle/shared'
import type { Event } from '@pokeidle/shared/protocol'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { TICK_MS, TILE_SIZE } from '../config.js'
import { activePokemon, type HuntView } from '../state/hunt-view.js'
import type { AtlasData } from './atlas.js'
import { cameraStep, type Camera } from './camera.js'
import { createEffectRunner, fadeOut, flash, floatingText, lunge, ring, shake } from './effects.js'
import { createTween, directionOf, isDone, positionAt, retarget, type Tween } from './interpolate.js'
import { buildMapSprite } from './map-layer.js'
import { entitiesOf, reconcile, type Entities, type Entity, type Op } from './reconcile.js'
import { loadSheets, makeEntitySprite, type EntitySprite } from './sprites.js'

export interface SceneDeps { readonly atlas: AtlasData; readonly map: HuntMap; readonly registry: Registry; readonly now: () => number }
export interface Scene { applyView(view: HuntView): void; onEvent(event: Event, view: HuntView): void; setZoom(z: 1 | 2): void; zoom(): 1 | 2; resize(): void; destroy(): void }
interface Live { readonly sprite: EntitySprite; readonly overlay: Container; readonly hpBar: Graphics; readonly label: Text; tween: Tween; entity: Entity }

const px = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2
const COLORS = { player: 0x44dd66, wild: 0xdd4444, target: 0xffcc00 }

export async function createScene(parent: HTMLElement, deps: SceneDeps): Promise<Scene> {
  const app = new Application()
  await app.init({ background: 0x101418, resizeTo: parent, resolution: window.devicePixelRatio || 1, autoDensity: true, antialias: false })
  app.canvas.style.imageRendering = 'pixelated'
  parent.appendChild(app.canvas)
  const sheets = await loadSheets(deps.atlas)
  const world = new Container()
  const mapLayer = buildMapSprite(app.renderer, deps.map, sheets)
  const entities = new Container(); entities.sortableChildren = true
  const overlay = new Container()
  world.addChild(mapLayer, entities, overlay)
  app.stage.addChild(world)
  const effects = createEffectRunner(app.ticker)
  const live = new Map<string, Live>()
  let prev: Entities = {}
  let cam: Camera = { x: 0, y: 0 }
  let zoom: 1 | 2 = 1
  const worldSize = { w: deps.map.width * TILE_SIZE, h: deps.map.height * TILE_SIZE }

  const drawHp = (l: Live): void => {
    const k = l.entity.hpMax > 0 ? Math.max(0, l.entity.hp / l.entity.hpMax) : 0
    l.hpBar.clear().rect(-16, -40, 32, 4).fill(0x000000).rect(-16, -40, 32 * k, 4).fill(k > 0.5 ? 0x44dd66 : k > 0.25 ? 0xffcc00 : 0xdd4444)
    l.label.style.fill = l.entity.targeted ? COLORS.target : 0xffffff
  }
  const create = (e: Entity): void => {
    const sprite = makeEntitySprite(sheets, e.speciesName, e.speciesName)
    const label = new Text({ text: `${e.speciesName} L${e.level}`, style: { fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 2 } } })
    label.anchor.set(0.5, 1); label.y = -42
    const hpBar = new Graphics()
    const ov = new Container(); ov.addChild(hpBar, label)
    entities.addChild(sprite.root); overlay.addChild(ov)
    const l: Live = { sprite, overlay: ov, hpBar, label, tween: createTween({ x: e.x, y: e.y }, { x: e.x, y: e.y }, deps.now(), 0), entity: e }
    live.set(e.id, l); drawHp(l)
  }
  const update = (e: Entity, before: Entity): void => {
    const l = live.get(e.id); if (!l) return create(e)
    if (e.x !== before.x || e.y !== before.y) {
      l.tween = isDone(l.tween, deps.now()) ? createTween({ x: before.x, y: before.y }, { x: e.x, y: e.y }, deps.now(), TICK_MS) : retarget(l.tween, { x: e.x, y: e.y }, deps.now())
      l.sprite.setDirection(directionOf({ x: before.x, y: before.y }, { x: e.x, y: e.y }))
    }
    if (e.speciesName !== before.speciesName || e.level !== before.level) l.label.text = `${e.speciesName} L${e.level}`
    l.entity = e; drawHp(l)
  }
  const remove = (id: string): void => {
    const l = live.get(id); if (!l) return
    live.delete(id)
    effects.add(fadeOut(l.sprite.root, 300, () => { l.sprite.root.destroy({ children: true }); l.overlay.destroy({ children: true }) }))
  }
  const apply = (op: Op): void => { if (op.op === 'create') create(op.entity); else if (op.op === 'update') update(op.entity, op.prev); else remove(op.id) }

  app.ticker.add(() => {
    const now = deps.now()
    for (const l of live.values()) {
      const p = positionAt(l.tween, now)
      l.sprite.root.x = px(p.x); l.sprite.root.y = px(p.y) + TILE_SIZE / 2; l.sprite.root.zIndex = l.sprite.root.y
      l.overlay.x = l.sprite.root.x; l.overlay.y = l.sprite.root.y
      l.sprite.setMoving(!isDone(l.tween, now))
    }
    const player = live.get('player')
    const target = player ? { x: player.sprite.root.x, y: player.sprite.root.y } : { x: worldSize.w / 2, y: worldSize.h / 2 }
    cam = cameraStep(cam, target, { w: app.screen.width, h: app.screen.height }, worldSize, zoom)
    world.scale.set(zoom); world.x = -cam.x * zoom; world.y = -cam.y * zoom
  })

  const spriteOf = (id: string) => live.get(id)?.sprite.root
  const onEvent = (e: Event, view: HuntView): void => {
    const player = spriteOf('player')
    switch (e.type) {
      case 'attack': {
        const attacker = e.attacker === 'player' ? player : spriteOf(`wild:${e.attackerId}`)
        const target = e.attacker === 'player' ? spriteOf(`wild:${e.targetId}`) : player
        if (!attacker || !target) return
        const dx = Math.sign(target.x - attacker.x), dy = Math.sign(target.y - attacker.y)
        effects.add(lunge(attacker, dx, dy)); effects.add(flash(target))
        if (e.attacker === 'wild') effects.add(shake(target))
        const move = deps.registry.moves.get(e.move)
        const defender = e.attacker === 'player' ? view.state?.wilds.find((w) => String(w.id) === e.targetId) : activePokemon(view)
        const types = defender ? deps.registry.species.get(defender.speciesName)?.types ?? [] : []
        const mult = move && types.length > 0 ? typeMultiplier(deps.registry.typeChart, move.type, types) : 1
        effects.add(floatingText(overlay, target.x, target.y - 36, String(e.damage), mult > 1 ? 0xff8800 : mult < 1 ? 0x999999 : 0xffffff, mult > 1 ? 16 : 12))
        return
      }
      case 'wildDefeated': { const t = spriteOf(`wild:${e.wildId}`); if (t && player) effects.add(floatingText(overlay, player.x, player.y - 40, `+${e.xpPokemon} XP`, 0xffdd44)); return }
      case 'captured': { const t = spriteOf(`wild:${e.wildId}`); if (t) effects.add(ring(overlay, t.x, t.y, 0xffffff, 400)); return }
      case 'captureFailed': { const t = spriteOf(`wild:${e.wildId}`); if (t) effects.add(floatingText(overlay, t.x, t.y - 30, '○', 0xffffff, 14)); return }
      case 'levelUp': if (player) effects.add(ring(overlay, player.x, player.y, 0xffcc00, 600)); return
      case 'evolved': if (player) effects.add(flash(player, 0xffffff, 400)); return
      case 'itemUsed': if (player) effects.add(ring(overlay, player.x, player.y, 0x44dd66, 300, 12)); return
      case 'healed': if (player) effects.add(ring(overlay, player.x, player.y, 0x44dd66, 500)); return
      default: return
    }
  }
  return {
    applyView: (view) => { const next = entitiesOf(view); for (const op of reconcile(prev, next)) apply(op); prev = next },
    onEvent, setZoom: (z) => { zoom = z }, zoom: () => zoom, resize: () => app.resize(),
    destroy: () => { effects.destroy(); app.destroy(true, { children: true }); live.clear(); prev = {} },
  }
}
```
Notas para quem implementa: (1) esta task não tem teste unitário de Pixi (cobertura exclui `app/map-layer/sprites/effects`); verifique o build (`pnpm --filter @pokeidle/client build`) e o typecheck; a smoke E2E da Task 11 cobre a cena rodando. (2) Ajuste nomes de API do PixiJS 8 pela doc (`Application.init`, `Spritesheet.parse`, `Graphics.rect().fill()`, `Text({ text, style })`, `renderer.generateTexture`) usando o Context7 se algo não compilar. (3) Mantenha `app.ts` abaixo de 200 linhas: se crescer, mova `onEvent` para `scene/event-effects.ts`.

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck && pnpm --filter @pokeidle/client build`

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): cena PixiJS com mapa em textura única, sprites do atlas, tween por tick, câmera e efeitos"
```

---

### Task 8: UI base (`dom`, `toast`, `overlay`, `modal`, `sprite-css`), telas Auth, Inicial e Hunts, e `main.ts`

**Files:**
- Create: `packages/client/src/ui/dom.ts`, `src/ui/toast.ts`, `src/ui/overlay.ts`, `src/ui/sprite-css.ts`, `src/ui/modals/modal.ts`, `src/ui/screens/auth.ts`, `src/ui/screens/starter.ts`, `src/ui/screens/hunts.ts`, `src/app-context.ts`, `src/styles/layout.css`, `src/styles/modals.css`, `test/ui/dom.test.ts`, `test/ui/toast.test.ts`, `test/ui/sprite-css.test.ts`, `test/ui/screens/auth.test.ts`, `test/ui/screens/starter.test.ts`, `test/ui/screens/hunts.test.ts`
- Modify: `src/main.ts` (boot real)

**Interfaces:**
- Produces: `el(tag, attrs?: Record<string, string | boolean | ((ev: Event) => void)>, ...children: (Node | string | null)[]): HTMLElement` (atributos `onclick`/`onsubmit`/`oninput` viram listeners; `class`, `type`, `disabled` etc. viram atributos; `disabled: false` não escreve); `clear(node)`; `mount(root, node)`; `typeBadge(type: string): HTMLElement` (`<span class="type type-fire">fire</span>`); `createToasts(root): { show(text: string, kind?: 'info' | 'error' | 'big'): void }` (some em 4 s; `big` 8 s; máximo 4 na tela); `showOverlay(root, content: HTMLElement): () => void`; `openModal(root, title, content, onClose?): { close(): void }` (`Esc` e o botão fecham; um modal por vez); `spriteStyle(atlas, species): string` (`background-image:url(/assets/atlas/pokemon.png);background-position:-Xpx -Ypx;width:Wpx;height:Hpx` para o frame `walk_south_0`, ou string vazia).
- `AppContext { http: Http; registry: Registry; session: Store<SessionState>; hunt: Store<HuntView>; log: Store<readonly LogLine[]>; toasts: { show }; atlas: AtlasData; storage: Pick<Storage, 'getItem' | 'setItem'>; now: () => number; go(): Promise<void> }` em `src/app-context.ts` (só tipos e `createContext(overrides)` para testes); `go()` refaz `GET /me`, atualiza `session` e o `main` troca de tela.
- Telas: `mountAuth(root, ctx): () => void`, `mountStarter(root, ctx)`, `mountHunts(root, ctx)`; cada uma devolve `unmount`.

- [ ] **Step 1: Testes**

`test/ui/dom.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { el, typeBadge } from '../../src/ui/dom.js'
describe('el', () => {
  it('cria elementos com atributos, listeners e filhos', () => {
    const onclick = vi.fn()
    const node = el('button', { class: 'x', type: 'button', disabled: false, onclick }, 'Ok', null, el('b', {}, '!'))
    expect(node.outerHTML).toBe('<button class="x" type="button">Ok<b>!</b></button>')
    node.click()
    expect(onclick).toHaveBeenCalledTimes(1)
    expect(el('input', { disabled: true }).hasAttribute('disabled')).toBe(true)
    expect(typeBadge('fire').outerHTML).toBe('<span class="type type-fire">fire</span>')
  })
})
```
`test/ui/toast.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createToasts } from '../../src/ui/toast.js'
describe('toasts', () => {
  it('mostra, limita a 4 e some depois do tempo', () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    const t = createToasts(root)
    for (let i = 0; i < 5; i++) t.show(`m${i}`)
    expect(root.querySelectorAll('.toast')).toHaveLength(4)
    expect(root.textContent).not.toContain('m0')
    vi.advanceTimersByTime(4000)
    expect(root.querySelectorAll('.toast')).toHaveLength(0)
    t.show('erro', 'error')
    expect(root.querySelector('.toast-error')).not.toBeNull()
    vi.useRealTimers()
  })
})
```
`test/ui/sprite-css.test.ts`: com o mesmo `sheet` do teste do atlas, `expect(spriteStyle(atlas, 'charmander')).toBe('background-image:url(/assets/atlas/pokemon.png);background-position:-64px 0px;width:32px;height:32px')` e `''` para espécie desconhecida.

`test/ui/screens/auth.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createContext } from '../../../src/app-context.js'
import { mountAuth } from '../../../src/ui/screens/auth.js'

describe('tela de auth', () => {
  it('entrar manda POST /auth/login e chama go(); erro do servidor vira texto', async () => {
    const post = vi.fn(async () => ({}))
    const go = vi.fn(async () => {})
    const ctx = createContext({ http: { post } as never, go })
    const root = document.createElement('div')
    mountAuth(root, ctx)
    ;(root.querySelector('input[name=email]') as HTMLInputElement).value = 'ash@test.dev'
    ;(root.querySelector('input[name=password]') as HTMLInputElement).value = 'senha-forte-123'
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'ash@test.dev', password: 'senha-forte-123' }, expect.any(z.ZodType))
    expect(go).toHaveBeenCalled()
  })
  it('aba registrar mostra o campo nome e manda POST /auth/register; erro aparece na tela', async () => {
    const post = vi.fn(async () => { throw Object.assign(new Error('e-mail já usado'), { code: 'email-taken' }) })
    const ctx = createContext({ http: { post } as never })
    const root = document.createElement('div')
    mountAuth(root, ctx)
    ;(root.querySelector('[data-tab=register]') as HTMLButtonElement).click()
    expect(root.querySelector('input[name=name]')).not.toBeNull()
    ;(root.querySelector('input[name=email]') as HTMLInputElement).value = 'a@a.com'
    ;(root.querySelector('input[name=password]') as HTMLInputElement).value = 'senha-forte-123'
    ;(root.querySelector('input[name=name]') as HTMLInputElement).value = 'Ash'
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(post).toHaveBeenCalledWith('/auth/register', { email: 'a@a.com', password: 'senha-forte-123', name: 'Ash' }, expect.anything())
    expect(root.querySelector('.form-error')?.textContent).toBe('e-mail já usado')
  })
})
```
`test/ui/screens/starter.test.ts`: renderiza três cartões (`.starter-card`) com `data-species` charmander/bulbasaur/squirtle, cada um com badges de tipo vindas do registro (`fire`, `grass`/`poison`, `water`) e "Nível 10"; clicar em "Escolher" do charmander chama `http.post('/trainer/starter', { species: 'charmander' }, …)` e `go()`.

`test/ui/screens/hunts.test.ts`: com `session.hunts = [{ id: 'route-1', name: 'Rota 1', width: 40, height: 30, minLevel: 2, maxLevel: 12 }]` e `me.trainer.level = 1`, renderiza o cartão "Rota 1 · níveis 2–12" com botão "Iniciar" e, abaixo, `route-2` como bloqueada ("Rota 2 · nível 50") sem botão; clicar em Iniciar chama `http.post('/hunts/route-1/start', {}, …)` e `go()`; os atalhos `[data-open=team|bag|settings|pokedex|shop]` existem (os modais são da Task 10; aqui só disparam `ctx.openModal?.(name)` se existir).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test -- ui`

- [ ] **Step 3: Implementar**

`src/ui/dom.ts`:
```ts
type Attr = string | boolean | ((ev: Event) => void)
export function el(tag: string, attrs: Record<string, Attr> = {}, ...children: (Node | string | null)[]): HTMLElement {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') node.addEventListener(k.slice(2), v)
    else if (v === true) node.setAttribute(k, '')
    else if (v !== false) node.setAttribute(k, v)
  }
  for (const c of children) if (c !== null) node.append(c)
  return node
}
export const clear = (node: Element): void => { while (node.firstChild) node.firstChild.remove() }
export const mount = (root: Element, node: Node): void => { clear(root); root.append(node) }
export const typeBadge = (type: string): HTMLElement => el('span', { class: `type type-${type}` }, type)
export const pct = (a: number, b: number): number => (b <= 0 ? 0 : Math.round((100 * a) / b))
```
`src/ui/toast.ts`: `createToasts(root)` cria `div.toasts`; `show(text, kind = 'info')` cria `div.toast.toast-<kind>`, remove o mais antigo se já houver 4, agenda `setTimeout(remove, kind === 'big' ? 8000 : 4000)`.

`src/ui/overlay.ts`: `showOverlay(root, content)` adiciona `div.overlay` com o conteúdo e devolve `() => overlay.remove()`.

`src/ui/modals/modal.ts`: `openModal(root, title, content, onClose?)`: fecha o anterior (`root.querySelector('.modal-backdrop')?.remove()`), cria `div.modal-backdrop > div.modal > header(h2 + button.modal-close "×") + div.modal-body(content)`; listener de `keydown` `Escape` no `document` removido ao fechar; devolve `{ close }`.

`src/ui/sprite-css.ts`: `spriteStyle(atlas, species)` usa `frameOf(atlas, species, 'south', 0)`.

`src/app-context.ts`:
```ts
import { loadRegistry, type Registry } from '@pokeidle/shared'
import type { Http } from './api/http.js'
import type { AtlasData } from './scene/atlas.js'
import { emptyHuntView, type HuntView } from './state/hunt-view.js'
import type { LogLine } from './state/log.js'
import { initialSession, type SessionState } from './state/session.js'
import { createStore, type Store } from './state/store.js'

export type ModalName = 'bag' | 'team' | 'settings' | 'pokedex' | 'shop'
export interface AppContext {
  readonly http: Http; readonly registry: Registry; readonly session: Store<SessionState>; readonly hunt: Store<HuntView>; readonly log: Store<readonly LogLine[]>
  readonly toasts: { show(text: string, kind?: 'info' | 'error' | 'big'): void }; readonly atlas: AtlasData
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>; readonly now: () => number
  readonly go: () => Promise<void>; readonly openModal?: (name: ModalName) => void; readonly sendIntent?: (m: import('@pokeidle/shared/protocol').ClientMessage) => void
}
const emptyAtlas: AtlasData = { pokemon: { frames: {}, animations: {}, meta: { image: '', size: { w: 0, h: 0 }, scale: '1' } }, tiles: { frames: {}, animations: {}, meta: { image: '', size: { w: 0, h: 0 }, scale: '1' } } }
const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) } } }
/** Contexto com padrões inertes; os testes sobrescrevem só o que usam. */
export function createContext(over: Partial<AppContext> = {}): AppContext {
  return {
    http: { get: async () => { throw new Error('sem http') }, post: async () => { throw new Error('sem http') }, put: async () => { throw new Error('sem http') }, patch: async () => { throw new Error('sem http') } },
    registry: loadRegistry(), session: createStore(initialSession()), hunt: createStore(emptyHuntView()), log: createStore<readonly LogLine[]>([]),
    toasts: { show: () => {} }, atlas: emptyAtlas, storage: memoryStorage(), now: () => Date.now(), go: async () => {}, ...over,
  }
}
```
`src/ui/screens/auth.ts`: duas abas (`button[data-tab=login|register]`), um `form` com `input[name=email]`, `input[name=password]` e, na aba registrar, `input[name=name]`; no submit `ev.preventDefault()`, monta o corpo (`{ email, password }` ou `{ email, password, name }`), `await ctx.http.post(url, body, z.unknown())`, depois `await ctx.go()`; erro (`ApiError` ou qualquer `Error`) → `p.form-error` com `err.message`; botão desabilitado enquanto envia.

`src/ui/screens/starter.ts`: `STARTERS = ['charmander', 'bulbasaur', 'squirtle']`; cartão por espécie: `div.starter-card[data-species]` com `div.sprite` (`style = spriteStyle(ctx.atlas, species)`, classe `walking` para animar por CSS com `steps()` sobre os frames: opcional), nome (`displayName`), badges dos `registry.species.get(species).types`, "Nível 10", botão "Escolher" → `POST /trainer/starter { species }` (`StarterResponseSchema`) → `ctx.go()`; erro → toast.

`src/ui/screens/hunts.ts`: cabeçalho com nome/nível/ouro do treinador (`session.me`); cartões de `session.hunts` ("Rota 1 · níveis 2–12", botão Iniciar → `POST /hunts/:id/start` com `StartHuntSchema` → `ctx.go()`); depois, para cada `[id, level]` de `Object.entries(registry.unlocks.hunts)` que não está em `session.hunts`: cartão `.hunt-locked` "Rota 2 · nível 50" (nome: `displayName(id)` com `route` → "Rota": use um mapa `{ 'route-2': 'Rota 2' }` em `config.ts`, `HUNT_NAMES`); barra de atalhos com `button[data-open=team|bag|settings|pokedex|shop]` → `ctx.openModal?.(name)`.

`src/main.ts`:
```ts
import './styles/tokens.css'; import './styles/layout.css'; import './styles/hud.css'; import './styles/modals.css'
import { loadRegistry } from '@pokeidle/shared'
import { createContext, type AppContext } from './app-context.js'
import { ActiveHuntSchema, HuntsSchema, MeSchema } from './api/dto.js'
import { ApiError, createHttp } from './api/http.js'
import { loadAtlas } from './scene/atlas.js'
import { createStore } from './state/store.js'
import { initialSession, withMe } from './state/session.js'
import { emptyHuntView } from './state/hunt-view.js'
import { createToasts } from './ui/toast.js'
import { mount } from './ui/dom.js'
import { mountAuth } from './ui/screens/auth.js'
import { mountStarter } from './ui/screens/starter.js'
import { mountHunts } from './ui/screens/hunts.js'
import { mountGame } from './ui/screens/game.js' // Task 9

const root = document.querySelector<HTMLElement>('#app')!
const toasts = createToasts(document.body)
let unmount: (() => void) | null = null
let ctx: AppContext

async function refreshMe(): Promise<void> {
  try {
    const me = await ctx.http.get('/me', MeSchema)
    const hunts = me.trainer.hasStarter ? (await ctx.http.get('/hunts', HuntsSchema)).hunts : []
    ctx.session.set({ ...withMe(ctx.session.get(), me), hunts, error: null })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { ctx.session.set(withMe(ctx.session.get(), null)); return }
    ctx.session.update((s) => ({ ...s, error: e instanceof Error ? e.message : 'erro' }))
  }
}
function render(): void {
  unmount?.(); unmount = null
  const screen = ctx.session.get().screen
  if (screen === 'auth') unmount = mountAuth(root, ctx)
  else if (screen === 'starter') unmount = mountStarter(root, ctx)
  else if (screen === 'hunts') unmount = mountHunts(root, ctx)
  else if (screen === 'game') unmount = mountGame(root, ctx)
  else mount(root, document.createTextNode('Carregando…'))
}
async function boot(): Promise<void> {
  const http = createHttp({ fetch: (...a) => fetch(...a), onUnauthorized: () => {} })
  const atlas = await loadAtlas().catch(() => { toasts.show('Atlas não encontrado: rode pnpm assets build', 'error'); return null })
  ctx = createContext({ http, registry: loadRegistry(), session: createStore(initialSession()), hunt: createStore(emptyHuntView()), toasts, storage: localStorage, now: () => Date.now(), go: refreshMe, ...(atlas && { atlas }) })
  ctx.session.subscribe((s) => s.screen, () => render())
  await refreshMe()
}
void boot()
```
(na Task 9 o `main` ganha o socket e `openModal`/`sendIntent`; até lá `mountGame` pode ser um stub que mostra "Hunt em andamento" com botão Parar via `POST /hunts/stop` — deixe esse stub em `ui/screens/game.ts` nesta task para o build passar.)

CSS: `layout.css` (grade da tela do jogo: `grid-template-columns: 280px 1fr 200px; grid-template-rows: 48px 1fr 160px`, painéis `.panel { background: var(--panel); border: var(--border-w) solid var(--border) }`, `.overlay`, `.toasts`), `modals.css` (`.modal-backdrop` fixo, `.modal` 560 px, cantos retos).

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck && pnpm --filter @pokeidle/client build`

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): base de UI em HTML puro, telas de auth, inicial e hunts, boot por GET /me"
```

---

### Task 9: Tela do jogo: HUD, log, sobreposições e a ligação socket → stores → cena

**Files:**
- Create: `packages/client/src/ui/screens/game.ts` (substitui o stub), `src/ui/hud/top-bar.ts`, `src/ui/hud/active-pokemon.ts`, `src/ui/hud/moves.ts`, `src/ui/hud/log.ts`, `src/ui/hud/team-strip.ts`, `src/ui/hud/overlays.ts`, `src/game-loop.ts`, `src/styles/hud.css`, `test/ui/hud/top-bar.test.ts`, `test/ui/hud/active-pokemon.test.ts`, `test/ui/hud/moves.test.ts`, `test/ui/hud/log.test.ts`, `test/ui/hud/team-strip.test.ts`, `test/ui/hud/overlays.test.ts`, `test/game-loop.test.ts`
- Modify: `src/main.ts`, `src/app-context.ts` (se precisar de campos), `src/api/ws.ts` (não: só é usado)

**Interfaces:**
- Consumes: `createHuntSocket` (Task 5), `applyServerMessage`, `formatEvent`, `appendLog`, `trainerProgress`, `unlockedBetween`, `createScene` (Task 7), `entitiesOf`, `Store`.
- Produces: `createGameLoop(ctx, deps: { makeSocket: (url: string) => WebSocketLike; setTimeout; clearTimeout; random }): GameLoop` em `src/game-loop.ts` com `GameLoop { start(): void; stop(): void; send(m: ClientMessage): void; onEvent(fn: (e: Event, view: HuntView) => void): () => void }` — puro em relação ao DOM: ao receber uma mensagem, atualiza `ctx.hunt` (`applyServerMessage`), acrescenta ao `ctx.log` as linhas de `formatEvent` (contexto = estado ANTES do evento), chama os listeners `onEvent` por evento, e em `hunt.stopped`/`hunt.idle` chama `ctx.go()`; mensagem inválida → linha `alert` no log; `error` do servidor → `toasts.show(message, 'error')`; status do socket → `session.socket`; subida de nível do treinador → `toasts.show('Destravou: …', 'big')` (via `unlockedBetween`).
- HUD (cada `mountX(root, ctx): () => void` assina o store e devolve `unmount`): `mountTopBar` (nome, nível + barra de XP + "próximo: …", ouro, hunt, tick, conexão `[data-conn=open|reconnecting|catching-up|closed]`, botões Parar (`hunt.stop` via socket) e Sair (`POST /auth/logout` → `go()`)); `mountActivePokemon` (sprite CSS, nome, nível, barra de HP `[data-hp]`, XP até o próximo nível com `xpForLevel(growthRate)`); `mountMoves` (`availableMoves(species, level, registry.moves)`: nome, tipo, poder, arco de cooldown `[data-cd]` com fração `max(0, cooldownUntil − tick) / cooldownTicks(move)`); `mountLog` (últimas 200 linhas, `checkbox[name=combat-only]` filtra `kind === 'combat'`; auto-scroll); `mountTeamStrip` (6 slots: `.slot` com sprite, HP em miniatura, `.slot-active`, `.slot-empty`, `.slot-locked` acima de `teamSlots`; clique → `team.setActive`); `mountOverlays` (catch-up com `<progress>` e "N ticks restantes"; resumo do catch-up em toast `big`; hunt parada: `stopReasonText` + botão "Iniciar de novo" (`POST /hunts/:id/start`) e "Voltar" (`go()`)).
- `mountGame(root, ctx)`: monta a grade (top, esquerda: ativo + golpes, centro: `div#scene`, direita: time, rodapé: log), cria a cena com `createScene` (mapa via `GET /hunts/:id/map` com `HuntMapSchema`), assina `ctx.hunt` (`scene.applyView`), registra `onEvent` no loop para os efeitos, teclas `+`/`-` (zoom), e desmonta tudo no `unmount`.

- [ ] **Step 1: Testes**

`test/game-loop.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { createContext } from '../src/app-context.js'
import { createGameLoop } from '../src/game-loop.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const rec = fixture as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }>; ticks: Extract<ServerMessage, { t: 'hunt.tick' }>[] }
class FakeSocket { static last: FakeSocket; sent: string[] = []; onopen: (() => void) | null = null; onmessage: ((ev: { data: unknown }) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null; constructor() { FakeSocket.last = this } send(d: string) { this.sent.push(d) } close() { this.onclose?.() } push(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }) } }

function harness() {
  const show = vi.fn(); const go = vi.fn(async () => {})
  const ctx = createContext({ toasts: { show }, go })
  const loop = createGameLoop(ctx, { makeSocket: () => new FakeSocket(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as number), random: () => 0.5 })
  loop.start(); FakeSocket.last.onopen?.()
  return { ctx, loop, show, go, socket: FakeSocket.last }
}
describe('game loop', () => {
  it('snapshot e ticks alimentam hunt e log; listeners recebem cada evento com o view já aplicado', () => {
    const h = harness()
    const seen = vi.fn(); h.loop.onEvent(seen)
    h.socket.push(rec.snapshot)
    expect(h.ctx.hunt.get().phase).toBe('active')
    expect(h.ctx.session.get().socket).toBe('open')
    const firstWithAttack = rec.ticks.find((t) => t.events.some((e) => e.type === 'attack'))!
    h.socket.push(firstWithAttack)
    expect(h.ctx.hunt.get().tick).toBe(firstWithAttack.tick)
    expect(h.ctx.log.get().some((l) => l.kind === 'combat')).toBe(true)
    expect(seen).toHaveBeenCalledTimes(firstWithAttack.events.length)
  })
  it('mensagem inválida vira alerta no log; error do servidor vira toast; stopped/idle chamam go()', () => {
    const h = harness()
    h.socket.onmessage?.({ data: 'nada' })
    expect(h.ctx.log.get().at(-1)?.kind).toBe('alert')
    h.socket.push({ t: 'error', code: 'no-hunt', message: 'não há hunt ativa' })
    expect(h.show).toHaveBeenCalledWith('não há hunt ativa', 'error')
    h.socket.push({ t: 'hunt.stopped', reason: 'intent', healed: false })
    h.socket.push({ t: 'hunt.idle' })
    expect(h.go).toHaveBeenCalledTimes(2)
  })
  it('subida de nível do treinador mostra o toast de destrave', () => {
    const h = harness()
    h.socket.push({ ...rec.snapshot, state: { ...rec.snapshot.state, trainer: { xp: 990, gold: 0 } } })
    h.socket.push({ t: 'hunt.tick', tick: 1, serverTime: 0, events: [{ type: 'wildDefeated', tick: 0, wildId: rec.snapshot.state.wilds[0]!.id, speciesName: 'zubat', level: 3, xpTrainer: 20, xpPokemon: 20, gold: 1, drops: [] }] })
    expect(h.show).toHaveBeenCalledWith('Destravou: 4 vagas no time', 'big')
  })
  it('send enfileira no socket; stop fecha', () => {
    const h = harness()
    h.loop.send({ t: 'hunt.stop' })
    expect(h.socket.sent).toContain(JSON.stringify({ t: 'hunt.stop' }))
    h.loop.stop()
    expect(h.ctx.session.get().socket).toBe('closed')
  })
})
```
Testes dos módulos de HUD (um arquivo cada, happy-dom; use `createContext` e o fixture `route1-300.json` para popular `ctx.hunt` com `applySnapshot`):
- `top-bar.test.ts`: renderiza nome/nível/ouro; `[data-conn]` acompanha `session.socket` e vira `catching-up` quando `hunt.phase === 'catching-up'`; "Parar" chama `ctx.sendIntent({ t: 'hunt.stop' })` e fica desabilitado 200 ms (`vi.useFakeTimers`); "Sair" chama `http.post('/auth/logout', {}, …)` e `go()`; o texto "próximo: 4 vagas no time no nível 10" aparece para xp 0.
- `active-pokemon.test.ts`: nome "Charmander", "L10", `[data-hp]` com `value`/`max` iguais ao hp/hpMax; ao aplicar um `attack` do selvagem no store, a barra atualiza sem remontar (mesmo nó).
- `moves.test.ts`: lista `availableMoves` do Charmander L10 (nomes legíveis, tipo, poder); com `derived.cooldownUntil = { ember: tick + cooldownTicks(ember) }`, `[data-cd]` do Ember é `1`; após um tick com `tick` maior, cai.
- `log.test.ts`: mostra as linhas do `ctx.log`; o filtro "só combate" esconde `reward`/`info`; nunca mais que 200 `li`.
- `team-strip.test.ts`: 6 `.slot`: 1 com Pokémon (`.slot-active`), `teamSlots − 1` vazios, o resto `.slot-locked` ("Nível 10"); clique num slot com Pokémon chama `ctx.sendIntent({ t: 'team.setActive', pokemonId })`.
- `overlays.test.ts`: `phase: 'catching-up'` com `catchup.remaining = 500` mostra `progress` e "500 ticks restantes"; `lastSummary` novo dispara `toasts.show(/derrotas/, 'big')` uma vez; `phase: 'stopped'` com `stoppedInfo { reason: 'team-fainted', healed: true }` mostra "Time caído. Time curado no Centro" e "Iniciar de novo" chama `http.post('/hunts/route-1/start', …)`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test -- hud game-loop`

- [ ] **Step 3: Implementar**

`src/game-loop.ts`:
```ts
import type { ClientMessage, Event, ServerMessage } from '@pokeidle/shared/protocol'
import type { AppContext } from './app-context.js'
import { createHuntSocket, type WebSocketLike } from './api/ws.js'
import { WS_PATH } from './config.js'
import { applyEvent, applyServerMessage, type HuntView } from './state/hunt-view.js'
import { appendLog, formatEvent } from './state/log.js'
import { trainerProgress, unlockedBetween } from './state/progress.js'

export interface GameLoopDeps { readonly makeSocket: (url: string) => WebSocketLike; readonly setTimeout: (fn: () => void, ms: number) => unknown; readonly clearTimeout: (h: unknown) => void; readonly random: () => number }
export interface GameLoop { start(): void; stop(): void; send(m: ClientMessage): void; onEvent(fn: (e: Event, view: HuntView) => void): () => void }
const wsUrl = (): string => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`

export function createGameLoop(ctx: AppContext, deps: GameLoopDeps): GameLoop {
  const listeners = new Set<(e: Event, view: HuntView) => void>()
  const alert = (text: string): void => ctx.log.update((l) => appendLog(l, { tick: ctx.hunt.get().tick, kind: 'alert', text }))
  const applyTick = (msg: Extract<ServerMessage, { t: 'hunt.tick' }>): void => {
    let view: HuntView = { ...ctx.hunt.get(), tick: msg.tick, serverTime: msg.serverTime }
    for (const e of msg.events) {
      const line = formatEvent(e, { registry: ctx.registry, state: view.state })
      const before = view.state ? trainerProgress(ctx.registry, view.state.trainer.xp).level : 0
      view = applyEvent(view, e, ctx.registry)
      if (line) ctx.log.update((l) => appendLog(l, line))
      const after = view.state ? trainerProgress(ctx.registry, view.state.trainer.xp).level : 0
      for (const what of unlockedBetween(ctx.registry, before, after)) ctx.toasts.show(`Destravou: ${what}`, 'big')
      for (const fn of listeners) fn(e, view)
    }
    ctx.hunt.set(view)
  }
  const onMessage = (msg: ServerMessage): void => {
    if (msg.t === 'hunt.tick') return applyTick(msg)
    if (msg.t === 'error') { ctx.toasts.show(msg.message, 'error'); return }
    ctx.hunt.set(applyServerMessage(ctx.hunt.get(), msg, ctx.registry))
    if (msg.t === 'hunt.stopped' || msg.t === 'hunt.idle') void ctx.go()
  }
  const socket = createHuntSocket({ url: typeof location === 'undefined' ? WS_PATH : wsUrl(), makeSocket: deps.makeSocket, now: ctx.now, random: deps.random, setTimeout: deps.setTimeout, clearTimeout: deps.clearTimeout, onMessage, onStatus: (s) => ctx.session.update((v) => ({ ...v, socket: s })), onInvalid: (reason) => alert(`Mensagem ignorada: ${reason}`) })
  return { start: () => socket.connect(), stop: () => socket.close(), send: (m) => socket.send(m), onEvent: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } } }
}
```
(`applyTick` refaz o que `applyServerMessage` faz para `hunt.tick`, mas evento a evento, para ter o estado ANTES de cada um para o log e para os listeners; mantenha os dois coerentes.)

HUD: cada módulo exporta `mountX(root: HTMLElement, ctx: AppContext): () => void`; cria os nós uma vez com `el`, assina `ctx.hunt`/`ctx.session` com selectors estreitos (`(v) => v.state?.trainer.xp`, `(v) => activePokemon(v)`, `(v) => v.derived.cooldownUntil`, `(v) => v.tick`) e atualiza `textContent`/atributos no lugar (nunca remonta a árvore inteira por tick); devolve `() => { off1(); off2(); … }`. Botões de intenção: `disabled = true` + `setTimeout(() => (disabled = false), INTENT_MIN_INTERVAL_MS)`. `mountOverlays` guarda a referência do último `lastSummary` mostrado para não repetir o toast; o texto do resumo: `"Catch-up: ${s.ticks} ticks, ${s.defeats} derrotas, ${s.captures} capturas, +${s.xpTrainer} XP, +${s.gold} ouro"`.

`mountGame(root, ctx)`: monta a grade; `createGameLoop` é criado e iniciado pelo `main.ts` (uma vez, fora da tela, para sobreviver a remontagens) e exposto no contexto como `ctx.sendIntent = loop.send`; a tela recebe o loop por `ctx.loop` (acrescente `readonly loop?: GameLoop` ao `AppContext`). A cena: `const map = await ctx.http.get(`/hunts/${huntId}/map`, HuntMapSchema)` (o `huntId` vem de `session.me.trainer.activeHuntId`), `const scene = await createScene(sceneRoot, { atlas: ctx.atlas, map, registry: ctx.registry, now: ctx.now })`, `offView = ctx.hunt.subscribe((v) => v, (v) => scene.applyView(v))`, `offEv = ctx.loop.onEvent((e, v) => scene.onEvent(e, v))`, teclado `+`/`-` → `scene.setZoom`. Se a criação da cena falhar (sem WebGL, sem atlas), mostra um `div.scene-error` com a mensagem e o HUD continua funcionando (o log e o time bastam para jogar). `unmount`: `offView(); offEv(); scene.destroy()`.

`main.ts`: depois de `refreshMe()` inicial, cria `loop = createGameLoop(ctx, { makeSocket: (url) => new WebSocket(url) as unknown as WebSocketLike, setTimeout, clearTimeout, random: Math.random })` e `ctx = { ...ctx, loop, sendIntent: loop.send }` (ou `createContext` com esses campos); `loop.start()` quando `screen === 'game'` e `loop.stop()` ao sair para `auth` (o socket fica aberto em `hunts` para receber `hunt.idle`/`hunt.snapshot` ao iniciar — mais simples: iniciar o loop quando `me` existe e parar no logout).

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @pokeidle/client test && pnpm --filter @pokeidle/client typecheck && pnpm --filter @pokeidle/client build`

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): tela do jogo com HUD, log, sobreposições e o loop socket → stores → cena"
```

---

### Task 10: Modais (Mochila, Time, Configurações, Pokédex, Loja), dicas de primeira vez e aviso de bolas

**Files:**
- Create: `packages/client/src/ui/modals/bag.ts`, `src/ui/modals/team.ts`, `src/ui/modals/settings.ts`, `src/ui/modals/pokedex.ts`, `src/ui/modals/shop.ts`, `src/state/tips.ts`, `src/ui/tips.ts`, `test/tips.test.ts`, `test/ui/modals/bag.test.ts`, `test/ui/modals/team.test.ts`, `test/ui/modals/settings.test.ts`, `test/ui/modals/pokedex.test.ts`, `test/ui/modals/shop.test.ts`
- Modify: `src/main.ts` (`openModal`), `src/ui/hud/top-bar.ts` (botões dos modais + contador da Pokédex da hunt), `src/game-loop.ts` (hook das dicas e do aviso de bolas)

**Interfaces:**
- Produces: `openBag(ctx)`, `openTeam(ctx)`, `openSettings(ctx)`, `openPokedex(ctx)`, `openShop(ctx)` (cada uma monta em `document.body` via `openModal` e devolve `{ close }`); `tipFor(e: Event, view: HuntView, registry): { key: string; text: string } | null` (puro) e `ballWarning(view: HuntView, registry): boolean` (total de bolas ≤ 1) em `state/tips.ts`; `createTipShower(ctx): (e: Event, view: HuntView) => void` em `ui/tips.ts` (mostra cada dica uma vez por `storage`, chave `pokeidle.tip.<key>`; aviso de bolas uma vez por sessão); `huntPokedexCount(view, entries, map): { n: number; m: number }` (m = espécies distintas de `map.spawns`; n = as capturadas: `entries` com `caughtAt` ∪ `state.settings.seen`) em `state/tips.ts` também (é derivação pura de HUD).

- [ ] **Step 1: Testes**

`test/tips.test.ts`:
```ts
import { loadRegistry } from '@pokeidle/shared'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { applySnapshot, emptyHuntView } from '../src/state/hunt-view.js'
import { ballWarning, huntPokedexCount, tipFor } from '../src/state/tips.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const view = applySnapshot(emptyHuntView(), (fixture as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }> }).snapshot)
describe('dicas de primeira vez (GDD §4)', () => {
  it('uma chave por evento relevante e null para o resto', () => {
    expect(tipFor({ type: 'wildDefeated', tick: 1, wildId: 1, speciesName: 'zubat', level: 3, xpTrainer: 1, xpPokemon: 1, gold: 1, drops: [] }, view, registry)).toEqual({ key: 'first-defeat', text: 'Seu Pokémon caça sozinho. Você pode fechar a aba.' })
    expect(tipFor({ type: 'captured', tick: 1, wildId: 1, speciesName: 'zubat', level: 3, ball: 'poke-ball', toBox: false }, view, registry)?.key).toBe('first-capture')
    expect(tipFor({ type: 'captured', tick: 1, wildId: 1, speciesName: 'zubat', level: 3, ball: 'poke-ball', toBox: false }, view, registry)?.text).toBe(`Capturou! O time tem ${view.state!.settings.teamSlots} vagas; veja em Time.`)
    expect(tipFor({ type: 'itemUsed', tick: 1, itemId: 'potion', pokemonId: 'p1', hp: 9 }, view, registry)?.key).toBe('first-potion')
    expect(tipFor({ type: 'healed', tick: 1 }, view, registry)?.key).toBe('first-return')
    expect(tipFor({ type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, view, registry)).toBeNull()
  })
  it('ballWarning quando o total de bolas ≤ 1; huntPokedexCount conta espécies da hunt', () => {
    expect(ballWarning(view, registry)).toBe(false) // 5 poké bolas
    expect(ballWarning({ ...view, state: { ...view.state!, inventory: { 'poke-ball': 1 } } }, registry)).toBe(true)
    const map = registry.hunts.get('route-1')!
    expect(huntPokedexCount(view, [{ speciesName: 'zubat', seenAt: 'x', caughtAt: 'y' }, { speciesName: 'pikachu', seenAt: 'x', caughtAt: 'y' }], map)).toEqual({ n: map.spawns.some((s) => s.speciesName === 'zubat') ? 1 : 0, m: new Set(map.spawns.map((s) => s.speciesName)).size })
  })
})
```
Testes dos modais (happy-dom, `createContext` com `http` mockado por `vi.fn`):
- `bag.test.ts`: com hunt ativa, lista `view.state.inventory` (nome do registro + quantidade) e "Usar" nas poções chama `ctx.sendIntent({ t: 'item.use', itemId: 'potion' })`; "Usar" desabilitado quando o ativo está com HP cheio; sem hunt, busca `GET /trainer/inventory` e não mostra "Usar".
- `team.test.ts`: `GET /trainer/team` → lista time e mochila de Pokémon, "vagas: 1/3"; setas ↑/↓ e "Guardar"/"Colocar no time" chamam `PUT /trainer/team { slots: [...] }` com a ordem nova; com hunt ativa os controles ficam desabilitados e há o aviso "pare a hunt para mexer no time"; "Colocar no time" desabilitado quando o time já tem `teamSlots`.
- `settings.test.ts`: campos `returnHpPercent`, `potionHpPercent`, `ballTier`, `maxWildHpPercent`, `allowDuplicates` preenchidos de `session.me.trainer.settings`; salvar chama SEMPRE `PATCH /trainer/settings` com o patch (`SettingsResponseSchema`) e depois `go()`; nada pelo socket (o servidor já repassa ao runner em `applySettings`). Erro 400 → texto no modal.
- `pokedex.test.ts`: `GET /trainer/pokedex` → uma linha por espécie do registro (42), com classe `.seen`/`.caught`/`.unknown`, sprite CSS para vistas/capturadas e "???" para as outras; cabeçalho "Capturados: n · Vistos: v".
- `shop.test.ts`: `GET /shop` → itens com preço, "nível N" nos bloqueados (`.locked`), quantidade (`input[type=number]` 1–99), Comprar chama `POST /shop/buy { itemId, quantity }` e atualiza ouro/owned (novo `GET /shop` e `go()`); Vender chama `POST /shop/sell`; com hunt ativa o modal mostra "pare a hunt para usar a loja" e desabilita tudo; `insufficient-gold` → texto no modal.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokeidle/client test -- modals tips`

- [ ] **Step 3: Implementar**

`src/state/tips.ts`:
```ts
import type { Registry, HuntMap } from '@pokeidle/shared'
import type { Event } from '@pokeidle/shared/protocol'
import type { PokedexEntry } from '../api/dto.js'
import type { HuntView } from '../state/hunt-view.js'

export interface Tip { readonly key: string; readonly text: string }
export function tipFor(e: Event, view: HuntView, _registry: Registry): Tip | null {
  switch (e.type) {
    case 'wildDefeated': return { key: 'first-defeat', text: 'Seu Pokémon caça sozinho. Você pode fechar a aba.' }
    case 'captured': return { key: 'first-capture', text: `Capturou! O time tem ${view.state?.settings.teamSlots ?? 6} vagas; veja em Time.` }
    case 'itemUsed': return { key: 'first-potion', text: 'Usou uma Poção. Ajuste em Configurações quando usar e quando voltar ao Centro.' }
    case 'healed': return { key: 'first-return', text: 'Voltou ao Centro e curou o time. Ajuste o limiar em Configurações.' }
    default: return null
  }
}
export const ballWarning = (view: HuntView, registry: Registry): boolean => {
  const inv = view.state?.inventory ?? {}
  return Object.entries(inv).filter(([id]) => registry.items.get(id)?.kind === 'ball').reduce((n, [, q]) => n + q, 0) <= 1
}
export function huntPokedexCount(view: HuntView, entries: readonly PokedexEntry[], map: HuntMap): { n: number; m: number } {
  const species = new Set(map.spawns.map((s) => s.speciesName))
  const caught = new Set([...entries.filter((e) => e.caughtAt !== null).map((e) => e.speciesName), ...(view.state?.settings.seen ?? [])])
  return { n: [...species].filter((s) => caught.has(s)).length, m: species.size }
}
```
`src/ui/tips.ts`: `createTipShower(ctx)` devolve `(e, view) => { const tip = tipFor(e, view, ctx.registry); if (tip && ctx.storage.getItem(TIP_PREFIX + tip.key) === null) { ctx.storage.setItem(TIP_PREFIX + tip.key, '1'); ctx.toasts.show(tip.text, 'big') } if (!warned && (e.type === 'captured' || e.type === 'captureFailed') && ballWarning(view, ctx.registry)) { warned = true; ctx.toasts.show('Compre bolas no Centro', 'info') } }`; registrado em `main.ts` via `loop.onEvent(createTipShower(ctx))`.

Modais: cada `openX(ctx)` chama `openModal(document.body, título, content)`; dados por `ctx.http` com os schemas de `api/dto.ts`; enquanto carrega, "Carregando…"; erros `ApiError` → `p.form-error`. `openTeam` calcula a ordem nova de forma imutável (`swap(ids, i, j)`, `without(ids, id)`, `[...ids, id]`) e envia `PUT /trainer/team { slots }` com `TeamSchema`; a Loja usa `ShopSchema`/`TradeSchema` e após cada trade refaz `GET /shop` e `ctx.go()` (ouro no `/me`); a Pokédex usa `registry.species` ordenado por `id` e `spriteStyle`. `main.ts`: `openModal: (name) => ({ bag: openBag, team: openTeam, settings: openSettings, pokedex: openPokedex, shop: openShop })[name](ctx)`. `top-bar.ts` ganha os cinco botões `[data-open]` e o contador "Rota 1: n/m" (com `entries` de `GET /trainer/pokedex` carregadas uma vez ao montar e `view.state.settings.seen` ao vivo).

- [ ] **Step 4: Rodar com cobertura**

Run: `pnpm --filter @pokeidle/client test -- --coverage && pnpm --filter @pokeidle/client typecheck && pnpm --filter @pokeidle/client build`. Expected: verde e cobertura ≥ 80 % (linhas) fora das exclusões; reporte os números.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): modais de mochila, time, configurações, Pokédex e loja, dicas de primeira vez e aviso de bolas"
```

---

### Task 11: Smoke E2E com Playwright, scripts, README e verificação manual

**Files:**
- Create: `packages/client/playwright.config.ts`, `packages/client/e2e/smoke.spec.ts`, `packages/client/README.md`
- Modify: `packages/server/README.md` (seção Cliente já criada na Task 2: acrescente a smoke), `package.json` raiz (`client:e2e` já existe), `.gitignore` (`packages/client/playwright-report`, `test-results` já na Task 3)

**Interfaces:**
- Consumes: servidor real (Compose em 5433, `DATABASE_URL_TEST`), `pnpm client:build`, o atlas em `assets/atlas`.
- Produces: `pnpm client:e2e` que builda o cliente, sobe o servidor em 3100 com o banco de teste e roda a smoke: registrar, escolher inicial, iniciar a Rota 1, esperar "derrotado" no log, abrir a mochila, parar a hunt, abrir a loja e comprar uma Poção.

- [ ] **Step 1: Playwright**

`pnpm --filter @pokeidle/client exec playwright install chromium` (uma vez, local).

`packages/client/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'
const PORT = 3100
export default defineConfig({
  testDir: 'e2e', timeout: 180_000, retries: 0, workers: 1, reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 }, video: 'retain-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm --filter @pokeidle/client build && pnpm --filter @pokeidle/server start`,
    url: `http://localhost:${PORT}/`, reuseExistingServer: false, timeout: 120_000, cwd: '../..',
    env: { PORT: String(PORT), APP_ORIGIN: `http://localhost:${PORT}`, DATABASE_URL: process.env['DATABASE_URL_TEST'] ?? 'postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test', LOG_LEVEL: 'warn' },
  },
})
```
(o `start` do servidor lê `.env` via dotenv só se existir em `packages/server`; as variáveis do `env` acima têm prioridade porque `dotenv` não sobrescreve variáveis já definidas. `cwd: '../..'` = raiz do repo para o `pnpm --filter` funcionar.)

`packages/client/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('registrar → inicial → Rota 1 → derrota → mochila → parar → loja → comprar Poção', async ({ page }) => {
  const email = `smoke-${Date.now()}@test.dev`
  await page.goto('/')
  await page.getByRole('button', { name: 'Registrar' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByLabel('Nome').fill('Smoke')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  await expect(page.getByText('Escolha seu inicial')).toBeVisible()
  await page.locator('.starter-card[data-species=charmander]').getByRole('button', { name: 'Escolher' }).click()

  await expect(page.getByRole('heading', { name: 'Hunts' })).toBeVisible()
  await page.getByRole('button', { name: 'Iniciar' }).first().click()

  await expect(page.locator('#scene canvas')).toBeVisible()
  await expect(page.locator('.log li', { hasText: 'derrotado' }).first()).toBeVisible({ timeout: 90_000 })

  await page.getByRole('button', { name: 'Mochila' }).click()
  await expect(page.locator('.modal', { hasText: 'Poção' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal')).toHaveCount(0)

  // ouro suficiente para uma Poção (100): espera o contador da barra superior
  await expect(async () => { expect(Number(await page.locator('[data-gold]').textContent())).toBeGreaterThanOrEqual(100) }).toPass({ timeout: 120_000 })
  await page.getByRole('button', { name: 'Parar' }).click()
  await expect(page.getByRole('heading', { name: 'Hunts' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Loja' }).click()
  const potion = page.locator('.shop-item', { hasText: 'Poção' }).first()
  const ownedBefore = Number(await potion.locator('[data-owned]').textContent())
  await potion.getByRole('button', { name: 'Comprar' }).click()
  await expect(potion.locator('[data-owned]')).toHaveText(String(ownedBefore + 1))
})
```
Os nomes acessíveis usados aqui (botões "Registrar", "Criar conta", "Escolher", "Iniciar", "Mochila", "Parar", "Loja", "Comprar"; labels "E-mail", "Senha", "Nome"; heading "Hunts"; texto "Escolha seu inicial"; `[data-gold]`, `[data-owned]`, `.log li`, `.shop-item`, `#scene canvas`) são o contrato com as Tasks 8–10: se algum nome divergir, ajuste a TELA para bater com a smoke (não o contrário), a não ser que o nome da smoke esteja claramente errado.

- [ ] **Step 2: Rodar a smoke**

Pré-requisitos: `colima status` (Docker), `pnpm db:up`, atlas em `assets/atlas` (`pnpm assets build --extracted assets/extracted-otp2019` se faltar), nenhum vitest rodando. Run: `pnpm client:e2e`. Expected: 1 passed. Se falhar por tempo (poucas derrotas), aumente o timeout da linha "derrotado" e reporte quanto demorou; se falhar por seletor, corrija a tela.

- [ ] **Step 3: Docs**

`packages/client/README.md`: o que é, `pnpm client:dev` (Vite 5173 + proxy; `APP_ORIGIN=http://localhost:5173` no servidor), `pnpm client:build` → servido pelo Fastify em `/`, `pnpm client:test` (Vitest 5 + happy-dom, cobertura e exclusões), `pnpm client:e2e` (pré-requisitos, porta 3100, banco de teste, "nunca junto com `pnpm server:test`"), mapa das pastas (`api`, `state`, `scene`, `ui`) e a regra de dependência, contrato do atlas (`/assets/atlas/*`), atalhos (`+`/`-`, `Esc`). `packages/server/README.md`: na seção Cliente, um parágrafo sobre a smoke.

- [ ] **Step 4: Verificação manual (relate no relatório)**

`pnpm client:build && pnpm --filter @pokeidle/server start` com `.env` normal, abra `http://localhost:3000/`, jogue 2 minutos: mapa e sprites aparecem, o Charmander anda e ataca, números de dano sobem, HP e cooldown mudam, log rola, modais abrem, `+`/`-` dá zoom, fechar e reabrir a aba reconecta com `hunt.snapshot`. Anote qualquer coisa estranha como "concern".

- [ ] **Step 5: Commit**

```bash
git add packages/client packages/server/README.md package.json .gitignore
git commit -m "test(client): smoke E2E com Playwright e README do cliente"
```

---

## Self-review (feito ao escrever)

- Spec §2 (pacote, ferramentas, estrutura) → Task 3 (+ `scene/atlas.ts`, `app-context.ts`, `game-loop.ts`, `state/progress.ts`, `state/tips.ts`, `ui/tips.ts`, `ui/sprite-css.ts`, `ui/hud/overlays.ts` como acréscimos à lista da spec). §3 (contrato, `serverTime`, `GET /hunts/:id/map`, catch-up) → Task 1; o nome dos arquivos do protocolo já é `types/schema/messages` (spec corrigida na 3a). §4 (`HuntView`, tabela de eventos, `ws`) → Tasks 4 e 5 (desvio: `derived.wildHpMax` removido, `WildState.hpMax` basta). §5 (cena) → Tasks 6 e 7. §6 (interface, fluxo, jogo, modais, log) → Tasks 8, 9, 10. §7 (servidor: static, CSP, scripts, `.env.example`) → Task 2. §8 (testes) → em cada task; gravação `route1-300.json` na Task 4; smoke na Task 11; cobertura na Task 10. §10 (GDD: `potionHpPercent`, `box`, nível do treinador, efeitos, barra superior, contador da Pokédex, loja, mochila de Pokémon, "usar poção abaixo de X %", dicas, "compre bolas", hunts bloqueadas) → Tasks 4, 7, 9, 10, 8.
- Nomes cruzados conferidos: `createHuntSocket`/`WebSocketLike` (5 → 9), `applyServerMessage`/`applyEvent`/`activePokemon`/`emptyHuntView` (4 → 6, 9, 10), `entitiesOf`/`reconcile` (6 → 7), `createTween`/`retarget`/`positionAt`/`isDone`/`directionOf` (6 → 7), `cameraStep` (6 → 7), `loadAtlas`/`frameOf`/`AtlasData` (7 → 8 `spriteStyle`, `main`), `createScene`/`Scene` (7 → 9), `createContext`/`AppContext` (8 → 9, 10), `createGameLoop` (9 → main, 10), `formatEvent`/`appendLog`/`stopReasonText` (5 → 9), `trainerProgress`/`unlockedBetween` (5 → 9), `tipFor`/`ballWarning`/`huntPokedexCount` (10), `openModal` (8 → 10), `ATLAS_FILES`/`registerStatic` (2), `ServerMessageSchema` (1 → 5).
- Decisão registrada: Configurações salva só por `PATCH /trainer/settings` (o servidor repassa ao runner em `applySettings`); o intent `settings.update` do socket fica sem uso no cliente por enquanto.
