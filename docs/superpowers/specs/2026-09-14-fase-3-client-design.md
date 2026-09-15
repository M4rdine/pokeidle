# Fase 3: Cliente web (PixiJS) — Design

Data: 2026-09-14. Spec pai: `docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md` (§7 protocolo,
§9 cliente, §10 testes). Servidor: specs das fases 2a (motor), 2b (conta/REST) e 2c (tempo real).

## 1. Objetivo

O jogo jogável no navegador: entrar, escolher o inicial, iniciar a Rota 1 e ver a hunt acontecer
com o mapa de tiles, as sprites do OTPokemon andando e lutando, HUD com time, HP, golpes com
cooldown e log, mochila, time, configurações e Pokédex. Tudo renderizado a partir do que o
servidor manda; o cliente só envia intenções.

Decisões desta fase (respostas do usuário em 2026-09-14):

- Escopo completo da spec §9 (todas as telas), alvo desktop (≥ 1024 px), mobile depois.
- Servido pelo Fastify em produção (`@fastify/static`, uma origem só); em dev, `vite dev` em
  5173 com proxy para 3000 e `APP_ORIGIN=http://localhost:5173`.
- Abordagem A: store imutável + `reconcile` + HUD em HTML puro (sem framework); PixiJS só na cena.
- Fatos apurados: o atlas tem só animações de andar (640 frames, 4 direções, 42 espécies; zero
  frames de ataque) → ataque é efeito procedural; não há ícones de itens → itens por nome e
  badge de tipo; `shared` é importável pelo navegador como está.

## 2. Pacote e ferramentas

`packages/client`: Vite 8, TypeScript 5 (mesmo `tsconfig.base.json`), PixiJS 8, Vitest 5 +
happy-dom (o par do Vite 8; os outros pacotes seguem no Vitest 2, o pnpm isola), Playwright para
uma smoke E2E. Dependência de runtime: `pixi.js`, `zod` (via `shared`), `@pokeidle/shared`.

```
packages/client/
  index.html  vite.config.ts  vitest.config.ts  playwright.config.ts  package.json  tsconfig.json
  src/
    main.ts                 boot: carrega atlas → GET /me → escolhe a tela
    config.ts               TICK_MS (shared), URLs relativas, tamanhos
    api/http.ts             fetch same-origin JSON; erro → { code, message }; 401 → tela de auth
    api/ws.ts               WebSocket: conexão, reconexão com backoff (1 s → 30 s), fila de
                            intenções (1 a cada 200 ms), parse com o schema do shared
    state/store.ts          createStore<T>: get, set (objeto novo), subscribe(selector, fn)
    state/hunt-view.ts      HuntView + applySnapshot/applyEvent (puro)
    state/session.ts        me/trainer/team/inventory/pokedex + fluxo de telas
    state/log.ts            formatação dos eventos em português
    scene/app.ts            Pixi Application, containers (mapa, entidades, overlay), ticker
    scene/map-layer.ts      tiles ground/detail num RenderTexture; bloqueio opcional (debug)
    scene/sprites.ts        fábrica de AnimatedSprite por espécie/direção; fallback marcador
    scene/reconcile.ts      diff puro: entidades por id → ops create/update/remove
    scene/interpolate.ts    tween de posição ao longo de TICK_MS; direção pelo delta
    scene/effects.ts        lunge de ataque, flash no alvo, número de dano, fade de saída
    scene/camera.ts         segue o jogador com suavização; zoom 1x/2x
    ui/dom.ts  ui/toast.ts  ui/overlay.ts
    ui/screens/{auth,starter,hunts,game}.ts
    ui/hud/{top-bar,active-pokemon,moves,log,team-strip}.ts
    ui/modals/{bag,team,settings,pokedex}.ts
    styles/{tokens,layout,hud,modals}.css
  test/                     unitários (happy-dom)
  e2e/smoke.spec.ts         Playwright
```

Regra de dependência: `ui → state → api`; `scene → state`; `scene/reconcile`, `interpolate`,
`camera` e `state/*` são puros (sem Pixi, sem DOM); `scene/app`, `sprites`, `effects` são os
únicos que tocam Pixi; `ui/*` são os únicos que tocam o DOM. Nenhuma fórmula é reimplementada:
`hpAt`, `xpForLevel`, `availableMoves`, `cooldownTicks`, `expectedDamage` vêm do `shared`.

## 3. Contrato de fio compartilhado (mudança no servidor)

Movido para `packages/shared/src/protocol/`:

- `hunt-state.ts`: schema Zod (`.strict()`) e tipos `Point`, `PlayerMode`, `PokemonState`,
  `WildState`, `PlayerState`, `CaptureSettings`, `HuntSettings`, `HuntState`, `BallTier`.
- `events.ts`: `EventSchema` (união discriminada por `type`) e o tipo `Event`.
- `messages.ts`: `ClientMessageSchema`/`ClientMessage`, `ServerMessageSchema`/`ServerMessage`
  (com `SessionInfo`, `Summary`, `StopReason`), `SettingsPatchSchema`.

O servidor passa a importar de lá: `engine/types.ts` reexporta os tipos (o código do motor não
muda), `hunt-store/state-schema.ts` usa `HuntStateSchema` do shared, `realtime/protocol.ts` usa
`ClientMessageSchema`/`ServerMessage` do shared, `account/settings.ts` usa `SettingsPatchSchema`
do shared. Os testes do servidor (200) provam que nada mudou de forma. `shared` ganha o subpath
`"./protocol": "./src/protocol/index.ts"` em `exports`.

Adições ao protocolo:

- `hunt.snapshot` e `hunt.tick` ganham `serverTime: number` (ms desde a época, `now()` do
  servidor) para o cliente medir atraso e alinhar a interpolação.
- Nova rota `GET /hunts/:id/map` (autenticada) → o `HuntMap` completo do registro (camadas de
  tiles, bloqueio, spawns) ou 404. A rota de debug continua só com `DEBUG_VIEWER`.
- Correção do item parked da 2c: `if (!isCurrent()) return` antes do `runners.set` do ramo
  `stopped` de `runCatchUp`, e o broadcast do `onSlice` gated pela geração; teste com `detach`
  durante o catch-up.

## 4. Estado do cliente

`HuntView` = `{ session: SessionInfo | null, state: HuntState | null, serverTime, tick, phase:
'idle' | 'catching-up' | 'active' | 'stopped', catchup: { remaining } | null, lastSummary,
stoppedInfo, derived: { cooldownUntil: Record<moveName, tick>, targetWildId, wildHpMax:
Record<wildId, number> } }`. `applySnapshot` substitui `state` inteiro e recalcula `derived`;
`applyEvent(view, event, registry)` devolve um `view` novo:

| Evento | Efeito no espelho |
|---|---|
| `spawned` | selvagem novo com `hp = hpMax = hpAt(base, level)` |
| `moved` | posição do jogador; modo `walking` |
| `attack` (jogador) | `hp` do selvagem alvo; `targetWildId`; `cooldownUntil[move] = tick + cooldownTicks(move)`; modo `fighting` |
| `attack` (selvagem) | `hp` do Pokémon alvo |
| `wildDefeated` | remove o selvagem; `trainer.xp/gold` somados; drops na mochila; alvo limpo |
| `captured` | remove o selvagem; bola −1; se `!toBox`, Pokémon novo no time (id `${sessionId}-w${wildId}`, nível, `hpAt`) e `seen` |
| `captureFailed` | bola −1 |
| `pokemonFainted` | `hp = 0` |
| `switched` | `activeIndex`; cooldowns zerados |
| `levelUp` | nível e `hpMax` (`hpAt`) do Pokémon; `hp += delta` |
| `evolved` | `speciesName` |
| `itemUsed` | `hp` do Pokémon; item −1 |
| `returning` / `healed` | modo; `healed` põe `hp = hpMax` no time e limpa cooldowns |
| `stopped` | `phase = 'stopped'` com o motivo |
| `skipped` | alvo limpo |

O snapshot a cada 10 s corrige qualquer deriva; `serverTime` do tick alimenta a interpolação
(início do tween = chegada da mensagem; duração = `TICK_MS`).

`api/ws.ts`: uma conexão por aba; `send(intent)` entra numa fila que despacha no máximo uma
mensagem a cada 200 ms (o `ping` não conta); botões que mandam intenção ficam desabilitados
200 ms. Reconexão com backoff exponencial 1 s → 30 s e jitter; ao reconectar, o servidor manda
`hunt.snapshot`/`hunt.catchup`/`hunt.idle` e o cliente refaz `GET /me`. Mensagem que falha no
schema é ignorada com aviso no log do cliente (nunca `console`; painel de log interno).

## 5. Cena

Containers: `map` (tiles `ground` e `detail` desenhados uma vez num `RenderTexture` de
`width×32 × height×32`), `entities` (`sortableChildren`, `zIndex = y`), `overlay` (nomes, níveis,
barras de HP, números de dano). Entidade = `AnimatedSprite` com a animação `walk_<direção>` do
atlas, âncora no pé (0.5, 1), tocando enquanto se move e parada no frame 0 quando não; espécie sem
frames no atlas → marcador colorido com rótulo (nunca quebra). `reconcile(prev, next)` devolve
ops `{ create | update | remove }` por id (`player` e `wild:<id>`); o adaptador Pixi as aplica.
Interpolação: a cada `moved` a entidade recebe um alvo e o tween vai da posição atual ao alvo em
`TICK_MS`; alvo novo antes do fim → salta ao alvo anterior e recomeça (o servidor prevalece);
direção pelo delta. Ataque: atacante avança 8 px na direção do alvo e volta em 150 ms; alvo pisca
branco por 100 ms; número de dano sobe 24 px e some em 600 ms. Derrota/captura: fade de 300 ms.
Câmera: segue o jogador com suavização (lerp 0.15 por frame), clamp nas bordas do mapa; zoom 1x/2x
por botão e teclas `+`/`-`. Canvas com `image-rendering: pixelated`; `resolution` = devicePixelRatio.

## 6. Interface

**Direção visual:** painéis escuros com bordas de 2 px em pixel art e cantos retos (linha
Tibia/PXG), cor por tipo de Pokémon nos rótulos, numerais tabulares, fonte do sistema; nada de
gradiente decorativo nem cards uniformes. Tokens em `styles/tokens.css` (cores por tipo, espaço,
bordas). Sem inline `<script>`/`<style>` (CSP `default-src 'self'`).

**Fluxo por estado** (`main.ts` decide pelo `GET /me`): sem sessão → **Auth** (abas entrar e
registrar; erros do servidor como texto); sem inicial → **Inicial** (três cartões com o sprite
`walk_south`, tipos, nível 10); sem hunt ativa → **Hunts** (cartões de `GET /hunts` com faixa de
nível e botão iniciar, atalhos de time/mochila/configurações/Pokédex); com hunt → **Jogo**.

**Jogo:** barra superior (treinador, XP, ouro, hunt, tick, indicador de conexão: conectado /
reconectando / catch-up com progresso, botões Parar e Sair); coluna esquerda (cartão do Pokémon
ativo: sprite, nome, nível, barra de HP, XP até o próximo nível; lista de golpes de
`availableMoves` com poder, tipo e arco de cooldown que esvazia por tick); centro (canvas);
direita (faixa do time com 6 slots, HP em miniatura, clique → `team.setActive`); rodapé (log em
português, 200 linhas, filtro "só combate"). Modais: **Mochila** (itens com quantidade; Usar em
poções → `item.use`, desabilitado sem hunt ou com HP cheio), **Time** (ordem por setas →
`PUT /trainer/team`, bloqueado durante hunt com aviso; mochila de Pokémon listada),
**Configurações** (retorno em %, tier de bola, % de HP para captura, duplicatas → `settings.update`
no socket com hunt, `PATCH /trainer/settings` sem), **Pokédex** (vistos/capturados com sprite).
Sobreposições: catch-up com barra e ticks restantes; resumo do catch-up em toast grande; hunt
parada (motivo traduzido; "time curado no Centro" quando `healed`) com botão de recomeçar; erros
do servidor como toast. Atalhos: `Esc` fecha modal, `+`/`-` zoom.

**Log** (`state/log.ts`): "Charmander usou Ember em Zubat: 9 de dano", "Zubat L4 derrotado:
+21 XP, +5 ouro", "Capturou Gastly L9!", "A Poké Ball falhou", "Charmander subiu para o nível 13",
"Charmander evoluiu para Charmeleon", "Usou Poção: HP 18", "HP baixo, voltando ao Centro",
"Time curado", "Hunt parada: time caído".

## 7. Servidor: mudanças desta fase

- `@fastify/static`: `/` → `packages/client/dist` (index.html e assets com hash; `/` só existe se
  `dist` existir, senão 404 como hoje) e `/assets/atlas/` → `ASSETS_DIR` com `allowedPath` nos 4
  arquivos do atlas. Cache: `immutable` para assets com hash, `no-cache` para `index.html`.
- `GET /hunts/:id/map`, `serverTime`, protocolo no `shared`, correção do catch-up (§3).
- Scripts: raiz `client:dev` (`vite dev`), `client:build`, `client:e2e`; README do server explica
  a ordem `pnpm client:build` → `pnpm --filter @pokeidle/server start`. `.env.example` ganha a
  nota sobre `APP_ORIGIN` em dev com o Vite.
- CSP: `img-src 'self' data: blob:` (Pixi extrai texturas por canvas) mantendo o resto.

## 8. Testes

- **Unitários** (Vitest 5 + happy-dom, sem Pixi): `store` (só dispara quando a fatia muda);
  `hunt-view` (cada linha da tabela do §4 contra um snapshot fixo; snapshot substitui tudo;
  cooldown e `hpMax` derivados; XP, ouro e mochila do espelho após aplicar os eventos de um
  `simulate(300)` do motor batem com o `state` final do próprio motor; como o cliente não importa
  o servidor, o teste usa uma gravação (`test/fixtures/route1-300.json`: snapshot inicial, eventos e estado final) gerada
  uma vez por um script do servidor e commitada); `reconcile` (ops corretas por id); `interpolate`
  (t = 0, 100, 200 ms; troca de alvo no meio); `log` (uma linha por tipo); `ws` (fila de 200 ms,
  backoff, mensagem inválida ignorada); `session` (transições de tela por `GET /me`); `camera`
  (clamp e lerp).
- **Smoke E2E** (Playwright, `pnpm --filter @pokeidle/client e2e`, fora do `pnpm test` raiz):
  sobe o servidor com o Postgres do Compose e o build do cliente; registra, escolhe inicial,
  inicia a Rota 1, espera a primeira linha "derrotado" no log, abre a mochila, para a hunt.
  A suíte E2E completa fica para a fase 4.
- **Cobertura** ≥ 80 % em `src` excluindo `scene/app.ts`, `scene/sprites.ts`, `scene/effects.ts`
  e `main.ts` (só rodam com canvas real; cobertos pela smoke).
- **Servidor:** testes existentes cobrem o refactor do protocolo; novos para `GET /hunts/:id/map`,
  a rota estática (allowlist, 404 sem `dist`), `serverTime`, e o `detach` durante catch-up.

## 9. Fora do escopo

Mobile e toque, animação de ataque por frames (não existe no atlas), ícones de itens, som,
partículas, mais de uma hunt no mapa, chat, ranking, loja, box de Pokémon (captura com time
cheio segue descartando), interpolação preditiva além do tween entre tiles, PWA/offline.
