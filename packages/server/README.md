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
hunt fica parada; sair desse modo é assunto de uma intenção de reinício, que ainda não
existe no motor (fica para a fase 2b/2c).

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

## Fora do motor

Accuracy (todo golpe acerta) e shiny. Sistema de box: `captured` sinaliza `toBox: true`
quando o time já está em `MAX_TEAM_SIZE`, mas o motor não guarda o Pokémon em lugar
nenhum nesse caso — persistir a captura cabe a quem consome o evento.
