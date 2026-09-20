# Sprint 9: observabilidade — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`.

## 1. Problema

O servidor simula caçadas de todos os jogadores num relógio só, e não há como ver o que ele está
fazendo. A única medida que existe — 58 µs por tick por caçada, ~850 simultâneas — saiu de uma
medição pontual da fase 2a, num jogo com uma área. Hoje são dezesseis, em duas regiões, com
persistência em ritmo diferente. Ninguém sabe se o número ainda vale.

Quando algo dá errado em produção, o que se tem é `pino` no stdout da Fly.io: dá para ler o
último erro, não para responder "quantas caçadas rodam agora", "o tick está atrasando" ou "o
banco está segurando o laço".

E a sprint 11 depende disto: o teste de carga precisa medir alguma coisa.

## 2. Objetivo e limites

Instrumentar o que o servidor já faz, expor em `/metrics` no formato Prometheus, e uma página que
lê esse mesmo endpoint e mostra o estado atual sem exigir Grafana.

Fora do escopo: Sentry e rastreamento de exceção em serviço externo — decisão do dono do projeto,
porque o valor aparece com usuários reais, que ainda não existem. Erros continuam em log
estruturado, agora com um contador por tipo para aparecerem no painel. Também fora: alertas,
retenção histórica e qualquer banco de séries temporais; o `/metrics` existe para ser raspado por
quem quiser isso depois.

Critério de pronto: `curl /metrics` responde no formato Prometheus com tick, caçadas, sockets,
persistência, HTTP e erros; a página mostra os mesmos números; e nada disso é acessível sem
credencial.

## 3. O que medir

Quatro famílias, escolhidas pelo que responde uma pergunta de operação:

**O laço.** `pokeidle_tick_duration_seconds` (histograma) e `pokeidle_tick_lag_seconds`
(histograma) — quanto o tick custa e quanto ele atrasa em relação aos 200 ms. `pokeidle_ticks_total`
(contador). É aqui que aparece o teto real de caçadas simultâneas.

**As caçadas.** `pokeidle_hunts_active` (medidor) e `pokeidle_hunts_catching_up` (medidor);
`pokeidle_hunts_started_total` e `pokeidle_hunts_finished_total{reason}` (contadores). Responde
"quantas rodam agora" e por que as que terminaram terminaram.

**O que segura o laço.** `pokeidle_persist_duration_seconds{kind}` (histograma, com `kind` em
save/sync/finish) e `pokeidle_persist_failures_total{kind}`. A persistência é a única parte do
tick que fala com o banco; quando o tick atrasa, é aqui que se olha primeiro.

**A borda.** `pokeidle_http_requests_total{method,route,status}` e
`pokeidle_http_duration_seconds{method,route}`; `pokeidle_ws_connections` (medidor) e
`pokeidle_ws_messages_total{direction}`; `pokeidle_errors_total{scope}` para exceção tratada,
com `scope` dizendo onde (tick, persist, ws, http).

Mais as métricas padrão de processo do `prom-client` (memória, CPU, event loop), que são de graça
e respondem metade das perguntas de infraestrutura.

**Cardinalidade** é a armadilha desta sprint: `route` precisa ser o padrão da rota
(`/hunts/:id/start`), nunca a URL concreta, senão cada id de área vira uma série nova. O mesmo
vale para `status`, que fica no código e não na mensagem.

## 4. Como instrumentar sem sujar o domínio

O scheduler já tem `hooks.onPersistStart`; a sprint amplia esse mecanismo em vez de espalhar
chamadas de métrica pelo motor:

```ts
export interface SchedulerHooks {
  onPersistStart?(kind: PersistKind, trainerId: string): void
  onPersistEnd?(kind: PersistKind, trainerId: string, ms: number, ok: boolean): void
  onTick?(durationMs: number, lagMs: number, runners: number): void
  onHuntStarted?(): void
  onHuntFinished?(reason: StopReason): void
  onError?(scope: string): void
}
```

O módulo de métricas (`src/metrics/`) implementa esses ganchos e mais nada sabe sobre ele. O
motor e o scheduler continuam testáveis sem métrica nenhuma, e o teste de métrica não precisa de
servidor HTTP: ele chama os ganchos e lê o registro.

No HTTP, um `onResponse` do Fastify registra método, `request.routeOptions.url` (o padrão, não a
URL) e o status. No WebSocket, o registro de sockets já centraliza conexão e envio.

## 5. Acesso

`/metrics` nunca é público. Duas camadas:

1. `METRICS_TOKEN` no ambiente. Presente, exige `Authorization: Bearer <token>`.
2. Ausente, o endpoint só responde a requisição de loopback — o caso do desenvolvimento local.

Assim não existe configuração em que o endpoint fique aberto por esquecimento. O mesmo vale para
a página, que é servida em `/metrics/ui` sob a mesma regra.

## 6. A página

Uma página estática, no mesmo padrão do `/debug` que já existe: HTML, CSS e um script sem
framework, lendo `/metrics` a cada cinco segundos e desenhando o essencial —

- caçadas ativas e em catch-up, como números grandes;
- tick: p50/p95/p99 de duração e de atraso, com a régua dos 200 ms marcada;
- persistência: p95 por tipo e falhas acumuladas;
- HTTP: requisições por minuto e taxa de erro;
- erros por escopo desde o boot;
- memória e uptime do processo.

Sem gráfico histórico: o `/metrics` não guarda série. A página mostra o agora, e quem quiser
histórico aponta um Prometheus para o mesmo endpoint. Herda o mundo visual do jogo — fundo
escuro, painel de borda reta, número tabular — conforme `DESIGN.md`.

## 7. Arquivos

- `packages/server/src/metrics/registry.ts` — o registro `prom-client` e as métricas declaradas.
- `packages/server/src/metrics/hooks.ts` — a implementação de `SchedulerHooks` sobre o registro.
- `packages/server/src/metrics/http.ts` — o plugin Fastify de `onResponse`.
- `packages/server/src/http/routes/metrics.ts` — `/metrics` e `/metrics/ui`, com a guarda.
- `packages/server/public/metrics/` — a página.
- `packages/server/src/realtime/scheduler.ts` — os ganchos novos.
- `packages/server/src/config.ts` — `METRICS_TOKEN` opcional.

## 8. Testes

- O registro: cada gancho move a métrica que deve mover, e só ela; o texto exportado tem `HELP`,
  `TYPE` e os nomes esperados.
- Cardinalidade: uma requisição a `/hunts/campo-inicial/start` e outra a `/hunts/gruta-umida/start`
  produzem **uma** série de `pokeidle_http_requests_total`, com `route="/hunts/:id/start"`.
- Acesso: sem token configurado, requisição de fora do loopback recebe 404 (não 401 — um 401
  confirmaria que o endpoint existe); com `METRICS_TOKEN`, sem header recebe 401 e com header
  correto recebe 200.
- O scheduler: `onTick` é chamado uma vez por tick com a duração e o atraso, e `onHuntFinished`
  recebe o motivo real da parada.
- A página: carrega, pede `/metrics` e mostra o número de caçadas ativas que o endpoint devolveu.

## 9. Riscos

O maior é a instrumentação custar mais que o que mede. O tick roda cinco vezes por segundo e
percorre todos os runners; um histograma por runner seria caro. Mitigação: as métricas de tick
são por tick, não por runner, e o gancho recebe números já calculados.

O segundo é a explosão de cardinalidade derrubar o processo com o tempo — o modo clássico de
falha de instrumentação. Mitigação: o teste de cardinalidade acima, e nenhuma métrica com
`trainerId` ou id de área como rótulo.
