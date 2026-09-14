# Fase 2b: Conta, persistência e REST — Design

Data: 2026-09-14. Spec pai: `docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md`
(§5 modelo de dados, §7 protocolo, §8 segurança). Motor: `docs/superpowers/specs/2026-09-14-fase-2a-engine-design.md`.

## 1. Objetivo

Dar ao motor da fase 2a uma casa: contas com e-mail e senha, sessão em cookie, treinador,
time, inventário, Pokédex, escolha do inicial, e a ponte entre o banco e o `HuntState`
(iniciar, salvar snapshot, sincronizar de volta, parar). Tudo por HTTP (REST). Scheduler,
WebSocket, catch-up e o log de hunt escrito por eventos ficam para a fase 2c.

Decisões desta fase (respostas do usuário em 2026-09-14):

- Postgres 16 via Docker Compose para dev e testes; o usuário liga o Docker.
- Inicial escolhido entre Charmander, Bulbasaur e Squirtle no nível 10 (todos já têm o
  golpe do tipo: Ember, Vine Whip, Bubble). Nível 5 não vence a Rota 1.
- Registro aberto, sem convite; rate limit por IP. Sem verificação de e-mail nem reset
  de senha no MVP.
- Estado da hunt persistido como snapshot `jsonb` do `HuntState` inteiro, mais as tabelas
  normalizadas (time, inventário, treinador, Pokédex) como fonte de verdade fora da hunt.
- Abordagem A: Fastify + Drizzle, módulos por domínio, sessões próprias no Postgres
  (sem biblioteca de auth), REST com Zod.

## 2. Arquitetura e módulos

`packages/server/src/`:

| Módulo | Responsabilidade |
|---|---|
| `engine/` | Fase 2a, intocado. |
| `config.ts` | Variáveis de ambiente validadas com Zod: `DATABASE_URL`, `PORT` (padrão 3000), `COOKIE_SECURE` (`true`/`false`, padrão `false`), `APP_ORIGIN` (ex.: `http://localhost:3000`, usado na checagem de `Origin`), `TRUST_PROXY` (padrão `false`), `LOG_LEVEL` (padrão `info`). |
| `db/schema.ts` | Tabelas Drizzle (§3). |
| `db/client.ts` | `createDb(url): Db` (pool `pg` + `drizzle`), `closeDb(db)`. `Db` é o tipo do Drizzle com o schema. |
| `db/migrate.ts` | `migrate(db)` aplica `packages/server/drizzle/*.sql` (drizzle-orm/node-postgres/migrator). |
| `auth/password.ts` | `hashPassword(plain)`, `verifyPassword(hash, plain)` com argon2id (`argon2`), custos configuráveis para os testes. `DUMMY_HASH` para comparação em e-mail inexistente. |
| `auth/session.ts` | `newSessionToken()` (32 bytes → base64url), `hashToken(token)` (SHA-256 hex), `SESSION_TTL_MS` = 30 dias, `TOUCH_INTERVAL_MS` = 1 h; `createSession(db, userId)`, `resolveSession(db, token, now)`, `deleteSession(db, token)`. |
| `auth/plugin.ts` | Plugin Fastify: lê o cookie `sid`, resolve a sessão, carrega `user` e `trainer` e põe em `request.auth`; `requireAuth` como `preHandler`. |
| `account/*.ts` | `register`, `login`, `logout`, `getMe`, `chooseStarter`, `listTeam`, `setTeamOrder`, `updateSettings`, `listInventory`, `listPokedex`. Funções puras sobre `db` (recebido por parâmetro). |
| `hunt-store/*.ts` | `startHunt`, `saveSnapshot`, `loadActive`, `syncToTables`, `stopHunt`, mais os mapeadores linha ↔ motor (`mappers.ts`). |
| `http/app.ts` | `buildApp({ db, config, logger? }): FastifyInstance` — registra cookie, rate limit, auth plugin, rotas e o tratamento de erros. |
| `http/routes/{auth,trainer,hunts}.ts` | Rotas por domínio; corpos validados com Zod. |
| `http/errors.ts` | `AppError(code, status, message)` e o mapa código → HTTP. |
| `http/security.ts` | Checagem de `Origin` nas rotas que mudam estado, registro do helmet e do `redact` do logger. |
| `main.ts` | Único ponto com I/O de processo: carrega config, cria `db`, roda migrations, sobe o servidor. |

Regra de dependência: `http → account | hunt-store → db`; `hunt-store → engine`; `engine`
não importa nada do servidor; nenhum módulo importa um singleton de banco. Sem
`console.log`; o log é o `pino` do Fastify.

## 3. Banco

Postgres 16. Todas as tabelas têm `created_at timestamptz not null default now()` e, onde
há atualização, `updated_at timestamptz not null default now()`.

| Tabela | Colunas |
|---|---|
| `users` | `id uuid pk default gen_random_uuid()`, `email text unique not null` (minúsculas, aparado), `password_hash text not null`, `role text not null default 'player'` (`player` \| `admin`). |
| `sessions` | `token_hash text pk`, `user_id uuid fk users on delete cascade`, `expires_at timestamptz not null`, `last_seen_at timestamptz not null`. Índice em `user_id`. |
| `trainers` | `id uuid pk`, `user_id uuid unique fk users on delete cascade`, `name text unique not null` (3–16 chars, `[A-Za-z0-9 ]`), `xp int not null default 0`, `gold int not null default 0`, `return_hp_percent int not null default 30`, `ball_tier text not null default 'best'`, `max_wild_hp_percent int not null default 30`, `allow_duplicates bool not null default false`. |
| `pokemon` | `id text pk` (o id que o motor usa), `trainer_id uuid fk trainers on delete cascade`, `species_name text not null`, `level int not null`, `xp int not null`, `hp int not null`, `hp_max int not null`, `team_slot int null` (0–5; nulo = mochila); índice único `(trainer_id, team_slot)` onde `team_slot is not null`. |
| `inventory` | `(trainer_id, item_id) pk`, `quantity int not null check (quantity >= 0)`. |
| `pokedex_entries` | `(trainer_id, species_name) pk`, `seen_at timestamptz not null`, `caught_at timestamptz null`. |
| `hunt_sessions` | `trainer_id uuid pk fk trainers on delete cascade`, `hunt_id text not null`, `session_id text not null`, `state jsonb not null`, `seed int not null`, `rng_state bigint not null`, `started_at timestamptz not null`, `last_simulated_at timestamptz not null`. |
| `hunt_log` | `id bigserial pk`, `trainer_id uuid fk`, `hunt_id text`, `species_name text`, `level int`, `xp_trainer int`, `gold int`, `drops jsonb`, `captured bool`, `created_at`. Só a tabela nesta fase; a 2c escreve. |

Ids de Pokémon: iniciais recebem `st-<uuid>`; capturados usam o id do motor
`${sessionId}-w${n}` (fase 2a), único entre sessões. Não há nível de treinador no motor,
por isso `trainers` guarda só `xp`.

`settings.seen` do motor = espécies do treinador com `caught_at` preenchido.

Migrations: `drizzle-kit generate` a partir de `schema.ts`, SQL versionado em
`packages/server/drizzle/`. `drizzle.config.ts` na raiz do pacote. Scripts:
`db:generate`, `db:migrate`, `dev` (tsx watch), `start`.

`docker-compose.yml` na raiz: serviço `postgres` (`postgres:16-alpine`), usuário/senha
`pokeidle`/`pokeidle`, banco `pokeidle`, porta do host `5433` (a 5432 já é do Postgres
local do Homebrew), volume nomeado, e
`docker/postgres-init/01-test-db.sql` que cria o banco `pokeidle_test`. `.env.example`
com `DATABASE_URL=postgres://pokeidle:pokeidle@localhost:5433/pokeidle`,
`DATABASE_URL_TEST=postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test`, `PORT`,
`COOKIE_SECURE`.

### Mudanças em `shared` e no motor

`createRng(seed, state?)` e `rng.state(): number` para o snapshot guardar o estado do
mulberry32 e a retomada na 2c ser determinística. Teste: `createRng(1)` avançado N vezes
e `createRng(1, s.state())` produzem a mesma sequência a partir daí.

`CreateInput` do motor ganha `trainer?: { xp, gold }` (padrão `{ 0, 0 }`) para o
`HuntState` carregar os valores absolutos do treinador desde o início da hunt; assim
`syncToTables` grava absolutos e pode rodar quantas vezes for preciso sem somar duas vezes.

## 4. Autenticação e sessões

- **Registro** `POST /auth/register { email, password, name }` → 201 `{ user, trainer }` e
  cookie. E-mail válido (Zod `email`), único; senha 8–128; `name` 3–16, único. Cria `users`
  e `trainers` na mesma transação, com inventário inicial (`poke-ball` 5, `potion` 3), 0
  de ouro, sem Pokémon. Erros: `validation` 400, `email-taken` 409, `name-taken` 409.
- **Login** `POST /auth/login { email, password }` → 200 `{ user, trainer }` e cookie.
  E-mail inexistente e senha errada respondem igual: `invalid-credentials` 401; no caso de
  e-mail inexistente ainda roda `verifyPassword(DUMMY_HASH, password)` para igualar o
  tempo.
- **Logout** `POST /auth/logout` → 204; apaga a sessão e limpa o cookie. Sem cookie válido
  também responde 204.
- **Cookie** `sid`: `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `secure` = `COOKIE_SECURE`,
  `maxAge` 30 dias. Valor = token de 32 bytes em base64url; no banco só o SHA-256.
- **Expiração**: `expires_at = last_seen_at + 30 dias`. Em cada requisição autenticada, se
  `now - last_seen_at > 1 h`, atualiza `last_seen_at` e `expires_at` (uma escrita por
  hora, no máximo). Sessão vencida ou token desconhecido → `unauthorized` 401 e cookie
  limpo.
- **Rate limit** (`@fastify/rate-limit`, em memória): `/auth/login` e `/auth/register`
  10 por minuto por IP → `rate-limited` 429. Demais rotas 300 por minuto por IP.
- **Argon2id** (`argon2`): parâmetros padrão da biblioteca em produção; nos testes
  `memoryCost` 2^12 e `timeCost` 1 via opção de `hashPassword`.

## 5. Treinador e inicial

- `POST /trainer/starter { species }` com `charmander | bulbasaur | squirtle` → 201 com o
  Pokémon. Só se o treinador não tem nenhum Pokémon (`starter-already-chosen` 409).
  Cria no nível 10, `hp = hpMax` (`hpAt`), `xp = xpForLevel(curva, 10)`, `team_slot 0`,
  e a Pokédex ganha `seen_at`/`caught_at`.
- `GET /me` → `{ user: { id, email, role }, trainer: { id, name, xp, gold, settings:
  { returnHpPercent, capture }, hasStarter, activeHuntId } }`.
- `GET /trainer/team` → `{ team: Pokemon[] (ordenados por team_slot), box: Pokemon[] }`.
- `PUT /trainer/team { slots: string[] }` (1–6 ids, sem repetição, todos do treinador,
  senão `validation` 400 / `not-found` 404) → 200 com o time. `hunt-active` 409 se houver
  `hunt_sessions`. Quem sai do array vai para a mochila (`team_slot null`).
- `PATCH /trainer/settings { returnHpPercent?, capture?: { ballTier?, maxWildHpPercent?,
  allowDuplicates? } }` → 200 com os settings. Validação igual ao motor (0–100; tier em
  `poke|great|ultra|best`). Grava no banco; a 2c aplica `updateSettings` na hunt ativa.
- `GET /trainer/inventory` → `{ items: [{ itemId, quantity }] }` com quantidade > 0.
- `GET /trainer/pokedex` → `{ entries: [{ speciesName, seenAt, caughtAt }] }`.

## 6. Hunts e `hunt-store`

- `GET /hunts` → `{ hunts: [{ id, name, width, height, minLevel, maxLevel }] }` a partir
  do registro (`loadRegistry().hunts`).
- `POST /hunts/:id/start` → 201 `{ session: { huntId, sessionId, startedAt } }`. Exige
  inicial (`no-starter` 409), hunt existente (`not-found` 404), nenhuma hunt ativa
  (`hunt-active` 409), pelo menos um Pokémon do time com `hp > 0` (`validation` 400).
- `POST /hunts/stop` → 200 `{ trainer }`; sem hunt ativa `no-hunt` 409.
- `GET /hunts/active` → `{ session: { huntId, sessionId, startedAt, state } | null }`;
  `state` é o snapshot sem `seed`/`rng_state`.

`hunt-store`:

- `startHunt(db, registry, trainerId, huntId, now)`: lê treinador, time por `team_slot`,
  inventário e Pokédex; monta `team: PokemonState[]` (ids do banco), `inventory`,
  `settings` (`returnHpPercent`, `capture`, `seen`); `sessionId = randomUUID()`, `seed =
  crypto.randomInt(0, 2**31)`; `createHuntState({ hunt, sessionId, team, inventory,
  settings }, { registry, hunt, rng: createRng(seed) })`; insere `hunt_sessions` com
  `state`, `seed`, `rng_state = seed`, `started_at = last_simulated_at = now`.
- `saveSnapshot(db, trainerId, state, rngState, now)`: `UPDATE` de `state`, `rng_state`,
  `last_simulated_at`.
- `loadActive(db, trainerId)`: linha de `hunt_sessions` ou `null`; o `state` é validado
  com um schema Zod do `HuntState` (`hunt-store/state-schema.ts`) antes de ser usado.
- `syncToTables(db, trainerId, state, now)`, numa transação: para cada Pokémon do
  `state.player.team`, `UPDATE` de `species_name/level/xp/hp/hp_max` se o id existe, senão
  `INSERT` (capturado novo) com `team_slot` = posição no time; `team_slot` dos demais
  membros do time segue a ordem do snapshot; inventário: `UPSERT` por item com o valor do
  snapshot (e `DELETE` dos itens que zeraram); `trainers.xp/gold` = valores do snapshot
  (o motor carrega os absolutos desde o start); Pokédex: espécies do time recebem
  `caught_at` se ainda nulo, espécies em `settings.seen` idem, `seen_at` para as novas.
  Capturas com `toBox: true` não têm estado no motor (só evento) e não entram nesta fase.
  Nota: uma captura com `toBox: true` não gera Pokémon nenhum no time do motor, mas a
  espécie entra em `seen` e ganha `caught_at` mesmo assim; com `allowDuplicates: false`
  o motor não tenta capturar de novo a mesma espécie — a box (2c/3) decide se esse
  comportamento muda quando a persistência de captures em box existir.
- `stopHunt(db, trainerId, now)`: `loadActive` (`no-hunt` se nulo) → `syncToTables` →
  `DELETE` da sessão, tudo numa transação. Se `loadActive` encontrar um snapshot
  corrompido (`CorruptSnapshotError`), `stopHunt` não relança: apaga a sessão SEM
  `syncToTables` (não dá pra sincronizar um `state` ilegível) e devolve o treinador —
  o jogador perde só o progresso desde o último sync.

Contrato para a 2c (documentado, não implementado): o scheduler chama `saveSnapshot` a
cada 10 s, `syncToTables` a cada 60 s e no stop, e escreve `hunt_log` a partir dos
eventos `wildDefeated`/`captured`.

Invariante: `startHunt` seguido de `syncToTables` sem nenhum tick não altera linha alguma.

## 7. Erros e respostas

Todo erro é `{ error: { code, message } }`. Códigos e HTTP: `validation` 400,
`invalid-credentials` 401, `unauthorized` 401, `not-found` 404, `email-taken` 409,
`name-taken` 409, `starter-already-chosen` 409, `no-starter` 409, `hunt-active` 409,
`no-hunt` 409, `forbidden` 403, `rate-limited` 429, `payload-too-large` 413, `internal` 500. Erros Zod viram `validation` com a
mensagem do primeiro problema. Erros inesperados viram `internal` com mensagem genérica
e são logados com stack pelo pino. `AppError` é a única exceção de domínio; serviços
lançam `AppError`, nunca objetos soltos.

## 8. Testes

- **Unitários** (sem banco): `password` (hash/verify, `DUMMY_HASH` verifica falso),
  `session` (token de 43 chars base64url, hash estável, expiração e `touch` a partir de
  `now` injetado), `mappers` (linha ↔ `PokemonState`, settings ↔ colunas, `seen`),
  `state-schema` (aceita um `HuntState` do motor, rejeita lixo), schemas Zod das rotas,
  `config` (valores padrão e erro claro em `DATABASE_URL` ausente), `rng.state()` em
  `shared`.
- **Integração** (Postgres do Compose, `DATABASE_URL_TEST`): `test/setup-db.ts` aplica
  migrations uma vez por execução e trunca todas as tabelas antes de cada teste; se o
  banco não responde, falha com "Postgres de teste indisponível: suba o Docker Compose".
  Casos: registro (201, cookie, e-mail duplicado, nome duplicado, validação); login
  (ok, credenciais inválidas idênticas para e-mail inexistente e senha errada); logout;
  sessão vencida → 401 e cookie limpo; `touch` só após 1 h; rate limit 429 na 11ª
  tentativa; inicial (escolha única, espécie inválida, nível 10 com HP cheio, Pokédex);
  `GET /me`; time (listar, reordenar, ids alheios, `hunt-active`); settings; inventário;
  Pokédex; hunts (listar, start sem inicial, start ok, start duplicado, `GET /hunts/active`,
  stop sem hunt, stop com sync); `hunt-store` direto: start → 400 ticks de `simulate` com
  o motor → `syncToTables` → banco reflete HP/XP/nível/captura nova/inventário/ouro/Pokédex;
  start → sync sem tick = no-op (linhas iguais); `loadActive` rejeita jsonb corrompido.
- **Segurança** (integração): S2 (conta B não acessa recursos de A), S3 (`seed`/`rng_state`
  ausentes), S5 (flags do cookie; `sessions` sem o token em claro), S7 (corpo e status
  iguais), S9 (campo desconhecido → 400; corpo > 16 KB → 413), S10 (429), S11 (`Origin`
  errado → 403), S12 (cabeçalhos presentes), S13 (500 genérico), S14 (`redact`, unitário).
- Cobertura ≥ 80 % de linhas em `packages/server/src` (motor já em 97 %). Todos os
  testes via `app.inject`, sem porta aberta.

## 9. Segurança

Princípio: o navegador pertence ao jogador. Tudo o que o cliente envia, um jogador pode
enviar à mão; tudo o que o cliente recebe, ele pode ler. Esconder a API não é critério de
segurança, é no máximo atrito. O que protege é o servidor ser a única autoridade e
validar cada mensagem. (Verificação feita em 2026-09-14: o pokeidle.io **se comunica**
sim — um único WebSocket em `wss://pokeidle.io` com JSON nos dois sentidos, 86 tipos de
mensagem do cliente como `{ t: 'ball.throw', ballId, slot }` e respostas como
`capturado`, `levelup`; REST só para auth, compras, ranking e JSON estático; Cloudflare
Turnstile no login; token de sessão em `localStorage`. Os frames só aparecem no filtro
"WS" do DevTools e só se ele estava aberto antes da conexão. Não há nada a reproduzir
nesse ponto: o nosso desenho já tem a mesma forma, REST mínimo mais um WS na 2c, e é
mais forte num aspecto, o cookie `httpOnly` em vez de token legível por XSS.)

Critérios desta fase, cada um com o teste que o prova (§8 ganha a lista abaixo):

**Autoridade e autorização**
- S1. Todo número que vale pontos nasce no servidor (motor da 2a). O cliente só envia
  intenções; nenhuma rota aceita XP, ouro, HP, nível ou itens no corpo.
- S2. Dono do recurso vem da sessão, nunca do corpo ou da URL: `trainerId` é sempre
  `request.auth.trainer.id`. Teste: conta B tenta reordenar o time / parar a hunt /
  ler `hunts/active` de A → 404 ou 409, nunca os dados de A.
- S3. `seed` e `rng_state` nunca saem do servidor (`GET /hunts/active` os remove). Teste:
  a resposta não contém as chaves.
- S4. Relógio só do servidor: `now` vem de `Date.now()` no servidor; nenhuma rota lê
  timestamps do cliente.

**Sessão e senha**
- S5. Cookie `sid` `httpOnly`, `SameSite=Lax`, `Secure` em produção, `Path=/`; o banco
  guarda só o SHA-256 do token; token de 32 bytes de `crypto.randomBytes`. Teste: flags
  presentes no `Set-Cookie`; a linha em `sessions` não contém o token.
- S6. Login cria sessão nova (rotação); logout apaga; sessão vencida é apagada ao ser
  encontrada. Uma conta pode ter várias sessões (vários dispositivos).
- S7. argon2id com parâmetros padrão da biblioteca; senha nunca logada; resposta e tempo
  iguais para e-mail inexistente e senha errada (`DUMMY_HASH`). Teste: os dois casos
  devolvem o mesmo corpo e status.
- S8. Enumeração de e-mail no registro (`email-taken` 409) é aceita de propósito pela
  escala de amigos e pela UX; fica limitada pelo rate limit de registro.

**Entrada**
- S9. Zod em todo corpo, query e params, com `.strict()` (campos desconhecidos → 400).
  `bodyLimit` 16 KB. Só `application/json` nas rotas com corpo.
- S10. Rate limit por IP: `/auth/login` e `/auth/register` 10/min; demais rotas 300/min
  (incluindo rotas inexistentes, via `preHandler` no `setNotFoundHandler`; limite diário
  de registro entra junto com o captcha, se aparecer abuso). `TRUST_PROXY` não é um
  boolean solto: `'false'` (padrão, ignora `X-Forwarded-For`) | `'true'` (confia em toda
  a cadeia) | um inteiro ≥ 1 (hops) | uma lista separada por vírgula de IPs/CIDRs — só
  use `'true'`/hops atrás de um proxy que de fato sobrescreve o cabeçalho, nunca exposto
  direto à internet. Teste: 11ª tentativa → 429.
- S11. CSRF: além de `SameSite=Lax`, toda rota que muda estado exige `Origin` (ou
  `Referer`) igual a `APP_ORIGIN` da config; ausente ou diferente → 403 `forbidden`.
  Formulários cross-site não conseguem enviar JSON sem preflight, e o preflight falha
  porque não há CORS (a API só serve a própria origem). Teste: POST com `Origin`
  estranho → 403.

**Saída e cabeçalhos**
- S12. `@fastify/helmet`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, CSP mínima (`default-src 'self'`; ajustada na fase 3
  quando houver cliente), HSTS só quando `COOKIE_SECURE=true`.
- S13. Erros: nunca stack, texto de banco ou nome de tabela na resposta; 500 é genérico.
  Teste: um erro forçado no serviço devolve `{ error: { code: 'internal' } }` sem detalhe.
- S14. Log com `pino` e `redact` para `req.headers.cookie`, `req.headers.authorization`,
  `password`, `token`. Teste unitário do `redact`.

**Banco e economia**
- S15. Só consultas parametrizadas (Drizzle). `check (quantity >= 0)`, únicos em e-mail,
  nome e `team_slot`; FKs com `on delete cascade`. Toda escrita de ouro, item ou captura
  em transação (`syncToTables`, `stopHunt`, registro, inicial).
- S16. Usuário do banco da aplicação sem superuser; em produção a porta 5432 não é
  pública (só no Compose de dev). Migrations rodam no boot com o mesmo usuário.
- S17. `hunt_log` (2c) permite detectar outliers de XP por minuto; nesta fase a tabela
  existe.

**Segredos e dependências**
- S18. Segredos só em variáveis de ambiente; `.env` no `.gitignore`; `.env.example` sem
  valores reais. Config falha no boot se `DATABASE_URL` faltar.
- S19. Versões fixas no `pnpm-lock.yaml`; `pnpm audit --prod` no script `check`.
- S20. Bundle do cliente (fase 3) não terá segredos; as regras do jogo em `shared` são
  públicas por natureza, e o servidor decide mesmo assim.

**Fora desta fase, anotado para depois**: captcha (Turnstile) no registro se aparecer
abuso; bloqueio progressivo por conta após N falhas de login; verificação de e-mail;
reset de senha; 2FA; auditoria de admin; origem e rate limit de intenções no WebSocket
(2c: `Origin` no handshake, cookie no handshake, 1 intenção a cada 200 ms por conexão,
tamanho máximo de mensagem).

## 10. Fora do escopo

Scheduler, WebSocket, catch-up, `hunt_log` por eventos, aplicação de `updateSettings`
em hunt ativa, verificação de e-mail, reset de senha, papéis de admin além da coluna,
box/mochila para capturas com time cheio, shiny, HTTPS/TLS (fica no proxy).
