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

1. `pnpm db:up` — sobe o Postgres do `docker-compose.yml` (porta 5433).
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
| `POST /trainer/starter` | sim | `validation`, `starter-already-chosen` |
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
