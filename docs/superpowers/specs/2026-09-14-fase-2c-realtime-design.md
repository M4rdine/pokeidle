# Fase 2c: Tempo real — WebSocket, scheduler, persistência e catch-up — Design

Data: 2026-09-14. Spec pai: `docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md` (§6 loop,
§7 protocolo, §8 segurança). Motor: `2026-09-14-fase-2a-engine-design.md`. Conta e
persistência: `2026-09-14-fase-2b-account-persistence-design.md` (§6 contrato para a 2c, §9 S1–S20).

## 1. Objetivo

Fazer a hunt acontecer de verdade: um scheduler em processo avança todas as hunts ativas a
5 ticks/s, envia os eventos aos clientes por WebSocket, persiste snapshot a cada 10 s e
tabelas a cada 60 s, recompõe o tempo perdido (aba fechada, reinício do servidor) até 12 h
com o mesmo motor e a mesma seed, e recupera todas as sessões no boot.

Decisões desta fase (respostas do usuário em 2026-09-14):

- Protocolo: eventos do motor a cada tick + snapshot completo ao conectar, ao reconectar e a
  cada 10 s (mais rápido no servidor, menos banda, menor superfície que deltas ou snapshot
  por tick).
- Catch-up: simular tick a tick em fatias, sem materializar eventos, teto de 12 h.
- Abordagem A: um scheduler em processo com um único timer de 200 ms para todas as sessões;
  `@fastify/websocket` com cookie no handshake.

## 2. Arquitetura e módulos

`packages/server/src/realtime/`:

| Arquivo | Responsabilidade |
|---|---|
| `constants.ts` | `SNAPSHOT_EVERY_TICKS = 50`, `SYNC_EVERY_TICKS = 300`, `CATCHUP_SLICE_TICKS = 2000`, `MAX_CATCHUP_TICKS = 216_000`, `MIN_CATCHUP_TICKS = 5`, `INTENT_MIN_INTERVAL_MS = 200`, `WS_MAX_MESSAGE_BYTES = 4096`, `WS_MAX_INVALID_IN_A_ROW = 3`, `WS_PING_MS = 30_000`, `WS_PONG_TIMEOUT_MS = 60_000`, `WS_SESSION_RECHECK_MS = 300_000`, `TICK_LAG_WARN_MS = 1000`. `TICK_MS` vem do `shared`. |
| `runner.ts` | `Runner` (registro imutável): `trainerId`, `huntId`, `sessionId`, `seed`, `rng: Rng` (o único mutável, encapsulado), `state: HuntState`, `pendingLog: readonly LogEntry[]`, `lastSaveTick`, `lastSyncTick`, `catchingUp: boolean`, `lastSimulatedAt: Date`. Funções: `createRunner(active: ActiveHunt, registry)`, `tickRunner(runner, deps, now): { runner; events; stopped: Event | null }`, `logEntriesOf(events, huntId): LogEntry[]` (só `wildDefeated` e `captured`), `needsSave(runner)`, `needsSync(runner)`. |
| `persist.ts` | `flushRunner(db, runner, now, { sync }): Promise<Runner>` — `saveSnapshot(state, rng.state(), now)` sempre; com `sync`, transação com `syncWithin` + `INSERT hunt_log` (lote de `pendingLog`) e `pendingLog` zerado. `finishRunner(db, runner, now, { healTeam })`: transação com `loadActive(tx, id, { forUpdate: true })` (existência), `syncWithin`, `INSERT hunt_log`, cura opcional (`UPDATE pokemon SET hp = hp_max WHERE trainer_id`), `DELETE hunt_sessions`. Toda escrita de um runner é encadeada em `persistChain` (mapa `trainerId → Promise<void>` no scheduler), nunca em paralelo para o mesmo treinador. |
| `catchup.ts` | `catchUp(runner, ticksOwed, deps, hooks: { onSlice(remaining), yield: () => Promise<void> }): Promise<{ runner; summary: Summary; stopped: Event \| null }>` — fatias de `CATCHUP_SLICE_TICKS`, `Summary` dobrado incrementalmente (mesmos campos de `summarizeEvents`), `pendingLog` acumulado, parada imediata em `stopped`. `ticksOwedSince(lastSimulatedAt, now)` = `min(floor((now − last) / TICK_MS), MAX_CATCHUP_TICKS)`. |
| `sockets.ts` | Registro `trainerId → Set<Socket>` e `tokenHash → Set<Socket>`; `broadcast(trainerId, msg)`, `send(socket, msg)`, `closeForToken(tokenHash, code)`, `closeAll(code)`. |
| `protocol.ts` | Zod `.strict()` de `ClientMessage` e tipos de `ServerMessage` (§4); `parseClientMessage(raw: string): ClientMessage \| { error }`. |
| `ws.ts` | Rota `GET /ws` (`@fastify/websocket`): Origin check e `requireAuth` no handshake; loop de mensagens com rate limit, contador de inválidas, ping/pong, revalidação de sessão; despacho para `actions`. |
| `actions.ts` | Compartilhado por REST e WS: `startAndAttach(deps, trainerId, huntId)`, `stopViaScheduler(deps, trainerId)` (fallback `stopHunt` do banco se não há runner), `applySettings(deps, trainerId, patch)` (banco + intent se há runner), `useItem(deps, trainerId, itemId)`, `setActive(deps, trainerId, pokemonId)`, `activeView(deps, trainerId)` (runner se existe, senão banco). |
| `scheduler.ts` | `createScheduler({ db, registry, now, logger, sockets }): Scheduler` com `start()`, `stop()`, `tick(): Promise<void>` (um tick de todos os runners; exposto para testes), `attach(trainerId): Promise<void>` (carrega `loadActive`, cria runner, decide catch-up), `detach(trainerId)`, `applyIntent(trainerId, intent): IntentResult`, `finish(trainerId, reason)`, `get(trainerId): Runner \| undefined`, `flushAll(): Promise<void>`. Um `setInterval(TICK_MS)`; mede lag e loga aviso acima de `TICK_LAG_WARN_MS`. |
| `boot.ts` | `recoverSessions(scheduler, db, now)`: lê `hunt_sessions` por `last_simulated_at` asc e faz `attach` de cada; snapshot corrompido → `finish` sem sync + log. `installShutdown(app, scheduler, close)`: SIGINT/SIGTERM → `scheduler.stop()` → `flushAll` → `closeAll(1001)` → `app.close()` → pool. |

Regra de dependência: `http → actions → scheduler → persist | catchup → hunt-store | engine`;
`ws → actions`; `engine` e `hunt-store` não importam `realtime`. `buildApp` recebe
`scheduler` e `sockets` em `AppDeps`; `main.ts` cria ambos, chama `listen`, depois
`recoverSessions`.

## 3. O tick, intenções e persistência

A cada 200 ms, para cada runner com `catchingUp: false`:

1. `tickRunner` → `step(state, deps)`; `pendingLog` += `logEntriesOf(events)`; sockets do
   treinador recebem `hunt.tick { tick, events }` (só se houver eventos).
2. `needsSave` (`tick − lastSaveTick ≥ 50`) → `flushRunner({ sync: false })`; `needsSync`
   (`tick − lastSyncTick ≥ 300`) → `flushRunner({ sync: true })`. Ambos encadeados em
   `persistChain`; o tick não espera o banco.
3. Evento `stopped` (`team-fainted`, `no-route`) → `finish(trainerId, reason)`: encadeia
   `finishRunner` com `healTeam = reason === 'team-fainted'`, envia `hunt.stopped { reason }`,
   remove o runner. **Decisão de produto:** ao parar por time caído, o time volta com HP cheio
   nas tabelas (o jogador "voltou ao Centro"); sem isso `POST /hunts/:id/start` recusaria para
   sempre. `no-route` não cura.

Intenções (`stop`, `useItem`, `setActive`, `updateSettings`) passam por
`scheduler.applyIntent`: roda `applyIntent` do motor no estado atual; sucesso → estado
trocado e os eventos vão no próximo `hunt.tick` imediato (mesmo `tick`); erro → `error` só
para quem pediu, estado inalterado. `stop` por intenção segue o caminho de `finish` com
`reason: 'intent'` e sem cura. `updateSettings` grava também em `trainers`
(`actions.applySettings`, usado por `PATCH /trainer/settings` e por `settings.update`).

REST: `POST /hunts/:id/start` → `startHunt` + `attach` (sem catch-up, `lastSimulatedAt = now`).
`POST /hunts/stop` → `stopViaScheduler`. `GET /hunts/active` → `activeView` (estado do runner
quando existe). `PUT /trainer/team` segue recusando com `hunt-active`. `GET /trainer/inventory`,
`/me` e `/trainer/team` podem atrasar até 60 s em relação ao estado da hunt (documentado).

Lag: se um tick começa mais de `TICK_LAG_WARN_MS` depois do esperado, aviso no log com o
número de runners; sem compensação. O relógio de parede do save (`now()`) é a verdade para
`last_simulated_at`.

## 4. Protocolo WebSocket

Handshake `GET /ws`: `Origin` igual a `APP_ORIGIN` (senão 403, sem upgrade); cookie `sid`
válido (senão 401). Vários sockets por treinador são permitidos; todos recebem o mesmo
broadcast. Ao abrir, o servidor envia um destes: `hunt.snapshot` (há runner),
`hunt.catchup { ticksRemaining }` (em catch-up) ou `hunt.idle` (sem hunt).

Envelope `{ t: string, ...campos }`, JSON, ≤ 4 KB, Zod `.strict()`.

Cliente → servidor:

| `t` | Campos | Efeito |
|---|---|---|
| `hunt.stop` | — | `stopViaScheduler` |
| `item.use` | `itemId: string` | intent `useItem` |
| `team.setActive` | `pokemonId: string` | intent `setActive` |
| `settings.update` | `patch: SettingsPatch` (mesmo schema do REST) | `applySettings` |
| `ping` | — | `pong` |

Servidor → cliente:

| `t` | Campos |
|---|---|
| `hunt.snapshot` | `session: { huntId, sessionId, startedAt }`, `state: HuntState` (sem `seed`/`rngState`; montado campo a campo) |
| `hunt.tick` | `tick: number`, `events: Event[]` |
| `hunt.stopped` | `reason: 'team-fainted' \| 'intent' \| 'no-route'`, `healed: boolean` |
| `hunt.catchup` | `ticksRemaining: number` |
| `hunt.summary` | `ticks, defeats, captures, captureFailures, faints, xpTrainer, gold, levelUps, evolutions, returns` |
| `hunt.idle` | — |
| `error` | `code, message` (mesmos códigos do REST + `rate-limited`, `validation`) |
| `pong` | — |

Abuso por conexão: uma intenção a cada `INTENT_MIN_INTERVAL_MS` (excedente → `error
rate-limited`, descartada; `ping` não conta); mensagem inválida (JSON, schema, tamanho) →
`error validation`; `WS_MAX_INVALID_IN_A_ROW` seguidas → fecha com 1008; `ping` do servidor a
cada 30 s, sem `pong` em 60 s → fecha com 1001; a cada 5 min o socket revalida a sessão
(`resolveSession`) e fecha com 1008 se ela sumiu; logout fecha os sockets daquele token.

## 5. Catch-up e recuperação no boot

`attach(trainerId)`: `loadActive` → `ticksOwed = ticksOwedSince(lastSimulatedAt, now)`. Se
`ticksOwed < MIN_CATCHUP_TICKS`, o runner entra direto. Senão nasce com `catchingUp: true`
(o timer o ignora) e `catchUp` roda: fatias de 2 000 ticks separadas por `setImmediate`
(≈10 ms de CPU cada; 12 h ≈ 108 fatias), `Summary` e `pendingLog` acumulados, `hunt.catchup
{ ticksRemaining }` por fatia. Ao terminar: `flushRunner({ sync: true })`, `hunt.summary`,
`hunt.snapshot`, `catchingUp: false`. `stopped` no meio → `finish` com a mesma regra de cura.
Mesma seed e mesmo `rngState` do snapshot ⇒ resultado idêntico ao que teria acontecido online.

Boot: `main.ts` → migrations → `buildApp` → `listen` → `recoverSessions` (mais antigas
primeiro; snapshot corrompido → `finish` sem sync e log de erro). Shutdown: `scheduler.stop()`
(para o timer, sinaliza os catch-ups a parar após a fatia atual), `flushAll` com sync
(`Promise.allSettled`, erros logados), `closeAll(1001)`, `app.close()`, pool. Perda máxima em
queda brusca: 10 s de estado e 60 s de tabelas; o snapshot é a verdade e o sync do próximo
boot recompõe as tabelas.

## 6. Segurança (S21–S28)

- S21. Handshake só com `Origin` igual a `APP_ORIGIN` e cookie válido; nunca token na URL;
  sem CORS. Teste: sem cookie → 401; Origin estranho → 403; nenhum socket aberto.
- S22. Toda mensagem do cliente validada com Zod `.strict()`, ≤ 4 KB; inválida → `error
  validation`; três seguidas → 1008. Teste: cada caso.
- S23. Uma intenção por 200 ms por conexão; excedente → `error rate-limited`. Teste: 6 em 200 ms.
- S24. Nada que vale pontos vem do cliente: intenções só nomeiam ids do próprio treinador e o
  motor valida posse/estado; identidade vem da sessão do handshake. Teste: `pokemonId`
  alheio → `error unknown-pokemon`.
- S25. `seed`/`rngState` nunca saem: `hunt.snapshot` montado campo a campo. Teste: grep no JSON.
- S26. Escritas por treinador serializadas em `persistChain`; `finishRunner` e `stopHunt`
  usam `FOR UPDATE`; o runner é o único escritor de `hunt_sessions.state` enquanto vive.
  Teste: `finish` concorrente com um save em voo não reordena (o save chega antes).
- S27. `hunt_log` recebe uma linha por derrota/captura com `created_at` do servidor (S17).
- S28. Logout fecha os sockets do token; revalidação de sessão a cada 5 min fecha sockets de
  sessão vencida. Teste: logout → socket recebe close 1008.

## 7. Erros

`AppError` continua a exceção de domínio; no WS vira `error { code, message }` para o socket
que enviou. Erro inesperado dentro de `step` é bug do motor e poderia corromper o estado; regra: log
de erro com `trainerId`, o runner é removido da memória SEM apagar a sessão
(o snapshot anterior fica) e os sockets recebem `error { code: 'internal' }`; o próximo boot
tenta de novo. Erros de banco no `persistChain`: logados, a cadeia continua (o próximo save
tenta de novo); três falhas seguidas → `finish` sem sync.

## 8. Testes

- **Unitários** (fixture 5x5 do motor, sem banco): `runner` (tick, `needsSave/needsSync`,
  `logEntriesOf`), `catchup` (fatias == `simulate(N)` inteiro; teto; `MIN_CATCHUP_TICKS`;
  parada em `stopped`; `onSlice` chamado por fatia), `protocol` (cada mensagem aceita/rejeitada,
  tamanho), rate limit e contador de inválidas (`now` injetado).
- **Integração com Postgres** (`createScheduler` com `tick()` manual, `now` injetado, sem
  timer): start → 300 ticks → `hunt_sessions.state` igual ao runner, `hunt_log` com as derrotas,
  tabelas sincronizadas; `finish` por `team-fainted` cura o time e apaga a sessão; `no-route`
  não cura; `updateSettings` grava em `trainers` e no estado; `stopViaScheduler` com e sem
  runner; boot recovery com `last_simulated_at` 10 min no passado → estado final igual a
  `simulate(3000)` com a mesma seed e `rngState`; `flushAll` no shutdown; erro de banco não
  derruba o tick.
- **WebSocket real** (`app.listen({ port: 0 })` + cliente `ws`): S21–S25 e S28 acima;
  conectar → `hunt.snapshot`; `tick()` manual → `hunt.tick`; `item.use` → `hunt.tick` com
  `itemUsed`; `hunt.stop` → `hunt.stopped` e sessão apagada; dois sockets recebem o mesmo tick;
  `ping` → `pong`.
- Cobertura ≥ 80 % em `packages/server/src`; suíte raiz verde; smoke manual com um script
  `ws` (subir, logar, iniciar hunt, ver ticks).

## 9. Fora do escopo

Cliente (fase 3), box para capturas com time cheio, compensação de drift, partição por
processo/worker (as sessões não compartilham estado, então é possível depois), `trainer.update`
como mensagem separada (os eventos e o snapshot já carregam xp/ouro), chat, ranking.
