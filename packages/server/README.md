# @pokeidle/server

Motor de simulação do hunt automático (`src/engine`): dado um `HuntState` e ticks
determinísticos, produz o próximo `HuntState` mais os eventos ocorridos. Puro e sem
I/O — não conhece banco, rede nem tempo real; quem chama decide quantos ticks rodar e
com qual `Rng`.

## Contrato

```ts
defaultSettings(seen?: readonly string[]): HuntSettings
createHuntState(input: CreateInput, deps: EngineDeps): HuntState
step(state: HuntState, deps: EngineDeps): StepResult
applyIntent(state: HuntState, intent: Intent, deps: EngineDeps): IntentResult
simulate(state: HuntState, ticks: number, deps: EngineDeps): StepResult
summarizeEvents(events: readonly Event[], ticks: number): Summary
```

`EngineDeps = { registry, hunt, rng }` vem de `loadRegistry()` e `createRng(seed)` do
`@pokeidle/shared`. `createHuntState` recebe `settings` opcional (senão usa
`defaultSettings()`) e sempre grampeia `returnHpPercent` e
`capture.maxWildHpPercent` para `[0, 100]`, mesmo se o chamador passar algo fora da
faixa. `createHuntState` também exige `sessionId: string` — um identificador único por
sessão de hunt (o servidor passa um uuid) — que fica gravado em `HuntState.sessionId` e
prefixa o `id` de todo Pokémon capturado (`${sessionId}-w${wild.id}`), para que capturas
de sessões diferentes nunca colidam.

## Ordem do tick (`step`)

1. `processRespawns` — spawna selvagens cujo `respawns[].atTick` já chegou.
2. `stepPlayer` — um passo do jogador conforme o modo atual (ver abaixo).
3. Ataque do selvagem engajado, se o jogador está em `fighting` e adjacente a um alvo vivo.
4. `resolveConsequences`: selvagens com `hp <= 0` são derrotados (XP, ouro, loot); se o
   ativo caiu, troca para o próximo com HP > 0 (ou `stopped` se o time inteiro caiu); se o
   ativo está abaixo de `returnHpPercent`, usa a poção mais fraca disponível ou manda o
   jogador para `returning`.
5. `tick += 1`.

## Modos (`PlayerState.mode`)

`searching` (procura o selvagem vivo mais próximo, ignorando `skippedWildIds`) →
`walking` (segue o caminho A*) → `fighting` (captura se aplicável, senão ataca; um golpe
imune marca o alvo em `skippedWildIds` e volta a `searching`) → `returning` (a caminho do
Pokécenter; sem rota possível até o Centro nem tile adjacente, para em `stopped` com evento
`stopped`/`reason: 'no-route'`) → `healing` (cura o time e limpa `skippedWildIds`) →
`stopped` (time inteiro caído, sem rota até o Centro ou intenção `stop`). `skippedWildIds`
também é limpo ao trocar de ativo
(`setActive`, fainted) e ao subir de nível/evoluir. Em `stopped`, `step` só roda
`processRespawns` e avança o tick — nenhum outro efeito colateral se repete enquanto a
hunt fica parada; `stopped` é absorvente nesta fase, o motor não tem intenção de
reinício. Sair desse modo é responsabilidade do servidor, que recria a sessão chamando
`createHuntState` de novo; a política de o que fazer com um time inteiramente caído
(ex.: cura automática, tela de derrota) fica para a fase 2b.

## Constantes (`constants.ts`)

`TICKS_PER_SECOND = 5`, `HEAL_TICKS = 25` (5 s), `RESPAWN_RETRY_TICKS = 5`,
`RETURN_HP_PERCENT_DEFAULT = 30`, `CAPTURE_MAX_WILD_HP_DEFAULT = 30`,
`MAX_TEAM_SIZE = 6`.

## Eventos

`spawned`, `moved`, `attack`, `wildDefeated`, `captured`, `captureFailed`,
`pokemonFainted`, `switched`, `levelUp`, `evolved`, `itemUsed`, `returning`, `healed`,
`stopped`, `skipped`. `summarizeEvents` agrega os que importam para UI/analytics
(derrotas, capturas, faltas, XP, ouro, drops, level-ups, evoluções, retornos).

## Uso na fase 2c

Um scheduler no servidor roda `step` a 5 ticks/s por hunt ativa; o snapshot persistido é
o próprio `HuntState` (serializável, sem estado escondido). Ao reconectar, o servidor faz
catch-up com `simulate(state, ticks, deps)`, com teto de 12 h de ticks perdidos por
chamada.

Nota para a 2c: `simulate` materializa todos os eventos em memória (~1 evento/tick); um
catch-up de 12 h a 5 ticks/s é da ordem de 200 mil eventos numa única chamada, então o
servidor deve fatiar essa chamada e resumir cada lote incrementalmente com
`summarizeEvents` em vez de acumular tudo de uma vez — isso fica para a fase 2c, o motor
em si não faz esse recorte.

## Fora do motor

Accuracy (todo golpe acerta) e shiny. Sistema de box: `captured` sinaliza `toBox: true`
quando o time já está em `MAX_TEAM_SIZE`, mas o motor não guarda o Pokémon em lugar
nenhum nesse caso — persistir a captura cabe a quem consome o evento.

## Servidor HTTP (fase 2b)

### Subir localmente

1. `pnpm db:up` — sobe o Postgres do `docker-compose.yml` (porta 5433). O usuário
   `pokeidle` do Compose é superuser — conveniente só em dev (migrations, truncate
   entre testes); em produção o usuário da aplicação NÃO é superuser e a porta 5432
   não fica pública (S16).
2. Copie `.env.example` (raiz) para `packages/server/.env` (arquivo ignorado pelo
   git): `pnpm server:dev`/`start` rodam com `cwd = packages/server` (via `pnpm
   --filter`), e `dotenv/config` em `main.ts` só lê `.env` do diretório atual.
3. `pnpm server:dev` — roda `src/main.ts` com `tsx watch`: aplica as migrations e sobe
   o Fastify em `PORT` (padrão 3000). `pnpm --filter @pokeidle/server start` roda a
   mesma coisa sem watch.

### Rotas

| Rota | Auth | Códigos de erro |
|---|---|---|
| `POST /auth/register` | — | `validation`, `email-taken`, `name-taken`, `rate-limited` |
| `POST /auth/login` | — | `validation`, `invalid-credentials`, `rate-limited` |
| `POST /auth/logout` | — | — |
| `GET /me` | sim | `unauthorized` |
| `POST /trainer/starter` | sim | `validation`, `not-found`, `starter-already-chosen` |
| `GET/PUT /trainer/team` | sim | `validation`, `not-found`, `hunt-active` |
| `PATCH /trainer/settings` | sim | `validation` |
| `GET /trainer/inventory` \| `/trainer/pokedex` | sim | — |
| `GET /hunts` | sim | — |
| `POST /hunts/:id/start` | sim | `not-found`, `no-starter`, `hunt-active`, `validation` |
| `POST /hunts/stop` | sim | `no-hunt` |
| `GET /hunts/active` | sim | — |

Toda rota autenticada exige o cookie de sessão `sid` (`httpOnly`, `SameSite=Lax`,
`Secure` em produção — ver `auth/cookie.ts`) e falha com `unauthorized` (401) sem ele.
Rotas que mudam estado exigem o cabeçalho `Origin` igual a `APP_ORIGIN` (S11); sem ele
o erro é `forbidden` (403). `GET /hunts/active` e `POST /hunts/:id/start` nunca
devolvem `seed`/`rngState` — só `huntId`, `sessionId`, `startedAt` e o `state` público
do motor (S3).

### `hunt-store`

`startHunt`/`stopHunt`/`loadActive` (`src/hunt-store`) são a única porta de entrada
para `hunt_sessions`: o `trainerId` sempre vem da sessão autenticada, nunca do corpo ou
da URL, e `sessionId`/`seed` são sempre gerados no servidor (S2). O snapshot
(`state`, `rngState`) é o `HuntState` do motor serializado em `jsonb`. Contrato para a
fase 2c: o scheduler de ticks chama `saveSnapshot` a cada 10 s (grava `state`/
`rngState`), `syncToTables` a cada 60 s e no `stop` (grava em `pokemon`, `inventory`,
`trainers`, `pokedex_entries` — idempotente), e registra eventos relevantes em
`hunt_log` conforme ocorrem.

Snapshot corrompido (`state` que não bate mais com `HuntStateSchema`): `loadActive`
lança `CorruptSnapshotError` (`hunt-store/state-schema.ts`), que vira 500 genérico em
qualquer rota que dependa dele — exceto em `stopHunt`, que trata esse caso especial:
sem conseguir ler o `HuntState`, não dá pra sincronizar, então apaga a sessão sem
`syncToTables` (o jogador perde só o progresso desde o último sync) e devolve o
treinador normalmente, em vez de propagar o erro.

### Testes

`docker compose up -d` é obrigatório antes de `pnpm --filter @pokeidle/server test`
(os testes de integração abrem conexão real com Postgres). `DATABASE_URL_TEST`
(padrão `postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test`) aponta para o
banco de teste; `test/helpers/db.ts` roda as migrations e trunca todas as tabelas
entre os testes.

### Segurança

Critérios S1–S20 (números só do servidor, isolamento entre contas, segredo do PRNG,
sessão, senha, rate limit, CSRF, headers, erros sem vazamento, segredos em `.env` etc.)
estão descritos em
`docs/superpowers/specs/2026-09-14-fase-2b-account-persistence-design.md` §9; os testes
que os cobrem estão espalhados entre `test/security.test.ts`, `test/auth.test.ts` e
`test/hunts.test.ts` (isolamento entre contas, S2/S3).

`TRUST_PROXY` (S10) não é mais um boolean solto: `'false'` (padrão) ignora
`X-Forwarded-For` e usa o IP da conexão TCP; `'true'` confia em toda a cadeia; um
inteiro ≥ 1 confia nos N hops mais próximos; uma lista separada por vírgula de
IPs/CIDRs confia só quando a conexão vem de um desses endereços. Só use `'true'` atrás
de um proxy que sobrescreve o cabeçalho antes de repassar a requisição — do contrário
qualquer cliente pode forjar `X-Forwarded-For` e escapar do rate limit por IP.

## Tempo real (fase 2c)

Enquanto uma hunt está ativa, o progresso roda num scheduler em memória (`src/realtime`)
que simula a hunt a 5 ticks/s independente de haver alguém conectado; o WebSocket só
transmite o que já está acontecendo, não é ele quem impulsiona a simulação.

### Conectar

`GET /ws` (upgrade WebSocket). Exige o mesmo cookie de sessão `sid` das rotas REST
(S21) — sem ele, 401 antes mesmo do upgrade — e o cabeçalho `Origin` igual a
`APP_ORIGIN`, senão 403; não há CORS nem token na URL. Uma conexão nunca inicia uma
hunt sozinha: o cliente chama `POST /hunts/:id/start` primeiro (ou já tem uma ativa) e
só então conecta. Até 8 sockets simultâneos por treinador (`WS_MAX_SOCKETS_PER_TRAINER`);
o nono é fechado com 1013.

### Mensagens

| Cliente → servidor | Quando usar |
|---|---|
| `ping` | keepalive do lado do cliente; servidor responde `pong` |
| `hunt.stop` | encerra a hunt ativa (equivalente a `POST /hunts/stop`) |
| `item.use` | usa um item do inventário na hunt corrente |
| `team.setActive` | troca o Pokémon ativo do time |
| `settings.update` | atualiza `returnHpPercent`/`capture.maxWildHpPercent`/etc. |

| Servidor → cliente | Quando chega |
|---|---|
| `hunt.idle` | ao conectar sem hunt ativa |
| `hunt.snapshot` | ao conectar com hunt ativa (sem catch-up pendente) |
| `hunt.catchup` | ao conectar durante um catch-up, e a cada fatia dele |
| `hunt.tick` | a cada tick com eventos (`spawned`, `attack`, `captured`, etc.) |
| `hunt.summary` | ao fim de um catch-up, resumo agregado do período perdido |
| `hunt.stopped` | a hunt terminou (`reason` + `healed`) |
| `error` | intenção rejeitada ou falha inesperada (`code` + `message`) |
| `pong` | resposta a `ping` |

Toda mensagem do cliente é validada com Zod `.strict()` e limitada a 4 KB (S22); uma
mensagem inválida gera `error validation` sem fechar a conexão, mas três seguidas
fecham com 1008. Intenções (tudo exceto `ping`) têm limite de uma a cada 200 ms por
conexão; a excedente recebe `error rate-limited`. `hunt.snapshot`/`hunt.tick` nunca
carregam `seed` nem `rngState` (S25).

### Ritmo

Tick a cada 200 ms (5/s). Snapshot (`hunt_sessions.state`/`rng_state`) salvo a cada 10 s
de ticks simulados; sync completo nas tabelas relacionais (`pokemon`, `inventory`,
`trainers`, `pokedex_entries`, `hunt_log`) a cada 60 s e sempre que a hunt para. Ao
reconectar (ou no boot) depois de um hiato, o servidor faz catch-up determinístico do
tempo perdido em fatias de `CATCHUP_SLICE_TICKS`, com teto de 12 h por sessão
(`MAX_CATCHUP_TICKS`); cada fatia manda `hunt.catchup` com o tanto que ainda falta.

### Fim de hunt

`hunt.stopped` chega com `reason` (`intent`, `no-route`, `team-fainted`,
`persist-failed`, `corrupt`) e `healed`. Só `team-fainted` cura o time automaticamente
ao encerrar (`finishRunner`); nos demais casos o time fica como estava no último tick
simulado.

### Limites de abuso (S21–S28)

Handshake exige `Origin`+cookie válidos, sem CORS (S21); mensagens `.strict()` ≤ 4 KB,
três inválidas seguidas fecham 1008 (S22); uma intenção a cada 200 ms por conexão
(S23); toda intenção só referencia ids do próprio treinador, validados pelo motor
(S24); `seed`/`rngState` nunca saem (S25); escritas por treinador são serializadas
numa fila só daquele treinador, e `finish`/`stopHunt` usam `SELECT ... FOR UPDATE`
(S26); `hunt_log` recebe uma linha por derrota/captura com `created_at` do servidor
(S27); logout fecha os sockets daquele token, e a sessão é revalidada a cada 5 min —
uma sessão vencida fecha o socket com 1008 (S28).

### REST durante uma hunt ativa

Enquanto o scheduler é o único escritor de `hunt_sessions`/`pokemon`/`inventory` de um
treinador com hunt ativa, as rotas REST de inventário e time (`GET /trainer/inventory`,
`GET/PUT /trainer/team`) podem devolver dados com até 60 s de atraso em relação ao que
o WebSocket já mostrou — elas leem as tabelas relacionais, sincronizadas no ritmo acima,
não o snapshot em memória.

### Boot e shutdown

No boot (`src/main.ts`), depois de `app.listen` e `scheduler.start()`,
`recoverSessions` (`src/realtime/boot.ts`) religa cada sessão ainda em
`hunt_sessions` ao scheduler, da mais antiga (`last_simulated_at`) para a mais
recente, fazendo o catch-up necessário de cada uma; uma sessão com snapshot corrompido
é encerrada sem sync em vez de travar o boot. `SIGINT`/`SIGTERM` disparam
`createShutdown`: para o timer de tick, dá flush com sync em tudo que está em memória,
fecha os sockets abertos (1001), fecha o Fastify e por fim o pool do banco — idempotente,
uma segunda chamada não repete o trabalho.

### Smoke test manual

`pnpm --filter @pokeidle/server smoke:ws` (com o servidor já rodando) registra um
treinador aleatório, escolhe o inicial, inicia a Rota 1 e imprime os 20 primeiros
`hunt.tick` recebidos pelo WebSocket — útil para checar visualmente handshake, ritmo
dos ticks e o fechamento gracioso do servidor.

## Visualizador de depuração (`/debug`)

Página descartável para ver uma hunt acontecer antes de existir um cliente de verdade
(fase 3). Não é o cliente do jogo — só usa as rotas REST/WebSocket já públicas, com o
mesmo cookie de sessão de qualquer outro cliente, e nunca expõe estado de jogador fora
delas. Fica inteiramente atrás de `DEBUG_VIEWER` (padrão `false`): com a flag desligada,
nenhuma rota `/debug/*` existe (404 em todas).

1. `DEBUG_VIEWER=true` no `.env` (ver `.env.example`).
2. Se `assets/atlas/` (raiz do repo) ainda não existir, gere com `pnpm assets build`
   (ver `tools/assets/README.md`) — o visualizador serve `tiles.png`/`tiles.json` e
   `pokemon.png`/`pokemon.json` de lá via `GET /debug/atlas/:file` (allowlist fixa,
   sem path traversal; qualquer outro nome ou arquivo ausente é 404). `ASSETS_DIR`
   aponta para esse diretório por padrão e pode ser sobrescrito.
3. `pnpm server:dev` e abra `http://localhost:3000/debug/`.
4. Registre uma conta (ou entre com uma existente), escolha um inicial e clique em
   "Iniciar Rota 1". O mapa aparece no `<canvas>`, o treinador ativo anda até o
   selvagem mais próximo e luta; o log à direita recebe cada evento do WebSocket
   (`attack`, `wildDefeated`, `captured`, etc.).
5. Cores: retângulo branco/laranja/azul-claro/verde é o jogador (`searching`/
   `fighting`/`returning`/`healing`); círculos vermelhos são selvagens (amarelo = alvo
   atual); o quadrado azul é o Pokécenter; a caixa "bloqueio" sobrepõe em vermelho os
   tiles não andáveis do mapa; barras finas acima de cada sprite são HP.

`GET /debug/map/:id` devolve o `HuntMap` do registro (404 se o id não existir); nenhuma
rota sob `/debug` lê ou grava estado de jogador — isso continua só nas rotas normais que
a própria página consome (`/auth/*`, `/trainer/*`, `/hunts/*`, `/ws`).
