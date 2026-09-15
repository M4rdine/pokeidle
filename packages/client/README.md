# @pokeidle/client

Cliente web do Pokeidle: Vite 8 + PixiJS 8, sem framework. A cena desenha o que o servidor manda
pelo WebSocket; a interface é HTML puro. Nenhuma regra de jogo vive aqui.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm client:dev` | Vite em `http://localhost:5173` com proxy para o servidor em 3000. O servidor precisa rodar com `APP_ORIGIN=http://localhost:5173`, senão recusa a origem (S11). |
| `pnpm client:build` | Gera `dist/` (chunks com hash em `dist/app/`). O Fastify serve essa pasta em `/`. |
| `pnpm client:test` | Vitest 5 + happy-dom. Cobertura mínima 80 % de linhas, exceto os arquivos que só rodam com canvas real (`scene/app.ts`, `scene/entities.ts`, `scene/map-layer.ts`, `scene/sprites.ts`, `scene/effects.ts`, `main.ts`). |
| `pnpm client:e2e` | Smoke com Playwright (porta 3100, banco de teste). Nunca rode junto com `pnpm server:test`: os dois usam o mesmo Postgres. |

Depois de `pnpm client:build`, reinicie o servidor: ele registra os arquivos do build no boot, então
um servidor antigo devolve 404 para os chunks novos.

## Pastas

- `api/` fala com o servidor: `http.ts` (REST validado por schema), `ws.ts` (uma conexão, fila de
  uma intenção a cada 200 ms, reconexão com espera de 1 s a 30 s), `dto.ts` (schemas das respostas).
- `state/` é puro: `store.ts` (assinatura por fatia), `hunt-view.ts` (espelho do estado da hunt a
  partir dos eventos), `log.ts`, `session.ts`, `progress.ts`, `tips.ts`.
- `scene/` desenha: `reconcile.ts`, `interpolate.ts`, `camera.ts` e `atlas.ts` são puros; só
  `app.ts`, `entities.ts`, `map-layer.ts`, `sprites.ts` e `effects.ts` tocam o PixiJS.
- `ui/` é o único lugar que toca o DOM: telas, HUD e modais.

Regra de dependência: `ui → state → api` e `scene → state`. Fórmulas (`hpAt`, `xpForLevel`,
`availableMoves`, `cooldownTicks`, `typeMultiplier`) vêm sempre de `@pokeidle/shared`.

## Atalhos e detalhes

- `+` e `-` mudam o zoom da cena; `Esc` fecha o modal aberto.
- Sprites vêm de `/assets/atlas/*` (o servidor libera só os quatro arquivos do atlas).
- A política de segurança do servidor proíbe `unsafe-eval`, por isso a cena importa
  `pixi.js/unsafe-eval`, que substitui os geradores de código do PixiJS.
- Estilo aplicado por API do DOM, nunca por atributo `style`, que a mesma política bloqueia.
