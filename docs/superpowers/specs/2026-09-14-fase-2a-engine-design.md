# Pokeidle Fase 2a — Motor de simulação (`packages/server/src/engine`) — Design

Data: 2026-09-14
Status: aprovado em conversa
Specs pai: `2026-09-13-pokeidle-mvp-design.md` (§6 loop de simulação, §8 segurança), `2026-09-13-fase-1-shared-design.md` (fórmulas e contrato do `shared`).

## 1. Objetivo

Motor puro da hunt: dado um estado, um tick devolve o estado seguinte e os eventos do tick. Sem I/O,
sem timers, sem classes com estado. O servidor (fase 2c) roda o motor a 5 ticks/s por sessão ativa e
persiste o estado; o catch-up offline é o mesmo `step` em laço.

A fase 2 foi dividida em 2a (este motor), 2b (conta e persistência: Fastify, Drizzle, argon2id,
sessões) e 2c (tempo real: WebSocket, scheduler, snapshot/deltas, recuperação no boot).

### Decisões fechadas nesta fase

| Decisão | Escolha |
|---|---|
| Representação do tick | Redutor puro `step(state, deps) → { state, events }`, estado imutável e serializável |
| Precisão de golpe | Não aplicada; `accuracy: null` e `100` equivalem |
| Selvagem | Nível uniforme em `[minLevel, maxLevel]`, HP cheio, mesmas fórmulas; não anda; só o engajado ataca |
| Cooldown | Todo golpe começa pronto; conta após o primeiro uso |
| Cura no Centro | 25 ticks (5 s) fixos após chegar, cura o time inteiro |
| Captura | Automática e configurável por treinador: `ballTier` (`poke` \| `great` \| `ultra` \| `best`), `maxWildHpPercent`, `allowDuplicates`; uma tentativa por selvagem; bola consumida mesmo em falha |
| Time | Ativo cai → próximo com HP; time inteiro sem HP e sem poção → `stopped`. XP só para quem lutou |
| Poção | Usada automaticamente quando o ativo cai abaixo de `returnHpPercent`; sem poção → `returning` |
| Shiny | Fora do MVP |
| Teto de catch-up | Responsabilidade do servidor (12 h), não do motor |

Abordagens descartadas: entidades mutáveis com `tick()` (viola imutabilidade, difícil de testar);
agendador de eventos (mistura tempo real com simulação, quebra o catch-up determinístico).

## 2. Estado

```ts
interface Point { x: number; y: number }
type PlayerMode = 'searching' | 'walking' | 'fighting' | 'returning' | 'healing' | 'stopped'

interface PokemonState {
  id: string; speciesName: string; level: number; xp: number; hp: number; hpMax: number
}
interface WildState {
  id: number; spawnIndex: number; speciesName: string; level: number; hp: number; hpMax: number
  position: Point; cooldowns: Readonly<Record<string, number>>; captureTried: boolean
}
interface CaptureSettings { ballTier: 'poke' | 'great' | 'ultra' | 'best'; maxWildHpPercent: number; allowDuplicates: boolean }
interface HuntSettings { returnHpPercent: number; capture: CaptureSettings; seen: readonly string[] }

interface HuntState {
  huntId: string; sessionId: string; tick: number
  player: {
    team: readonly PokemonState[]; activeIndex: number
    position: Point; path: readonly Point[]
    mode: PlayerMode; targetWildId: number | null; healingUntilTick: number | null
    cooldowns: Readonly<Record<string, number>>          // moveName → readyAtTick
  }
  wilds: readonly WildState[]
  respawns: readonly { spawnIndex: number; atTick: number }[]
  nextWildId: number
  trainer: { xp: number; gold: number }
  inventory: Readonly<Record<string, number>>
  settings: HuntSettings
}
```

`hpMax` é o único derivado guardado (muda só no level up e é lido todo tick). Golpes disponíveis,
dano e cooldown vêm do `shared` na hora. `seen` alimenta `allowDuplicates` (espécies já capturadas
pelo treinador; o servidor fornece a partir da Pokédex).

`sessionId` identifica de forma única a sessão de hunt (o servidor gera um uuid ao chamar
`createHuntState`) e prefixa o `id` de todo Pokémon capturado (`${sessionId}-w${wild.id}`), para
que capturas de sessões concorrentes nunca colidam — o `nextWildId` por si só reinicia em 1 a cada
sessão e não é suficiente para garantir unicidade global.

Constantes: `TICKS_PER_SECOND = 5`, `HEAL_TICKS = 25`, `RETURN_HP_PERCENT_DEFAULT = 30`,
`CAPTURE_MAX_WILD_HP_DEFAULT = 30`.

## 3. O tick: `step(state, deps)`

`deps = { registry: Registry; hunt: HuntMap; rng: Rng }`. Ordem fixa:

1. **Respawns**: entradas com `atTick <= tick` viram selvagens: nível `rng.int(min, max)`, posição
   sorteada no raio do spawn em tile livre (não bloqueado, sem outro selvagem, não o jogador); sem
   tile livre, reagenda para `tick + 5`. Evento `spawned`.
2. **Jogador** por modo:
   - `searching`: alvo = selvagem alcançável com menor custo de caminho A* (empate: menor id).
     Sem alvo, permanece. Com alvo, `path` calculado, modo `walking` (ou `fighting` se já adjacente).
   - `walking`: avança um tile de `path`; se o próximo tile ficou ocupado, recalcula; se o alvo
     sumiu, `searching`. Adjacente (Manhattan 1) → `fighting`. Evento `moved`.
   - `fighting`: alvo sumiu → `searching`. Se captura aplicável (ver §5) → tentativa. Senão:
     golpes = `availableMoves(species, level, moves)` filtrados por `cooldowns[name] <= tick`;
     se houver, `bestMove` (ou o primeiro com `expectedDamage > 0`; se todos 0, `searching` com
     o selvagem marcado como ignorado até o próximo respawn) → `computeDamage` → HP do selvagem;
     `cooldowns[name] = tick + cooldownTicks(move)`. Evento `attack`.
   - `returning`: anda até tile adjacente ao `pokecenter`; ao chegar, `healing` com
     `healingUntilTick = tick + HEAL_TICKS`. Evento `returning` ao entrar no modo. Sem caminho até o
     Centro (nem tile adjacente), o jogador para: modo `stopped`, `targetWildId: null`, `path: []`,
     evento `stopped` com `reason: 'no-route'`.
   - `healing`: ao vencer o prazo, todo o time com `hp = hpMax`, modo `searching`. Evento `healed`.
   - `stopped`: nada.
3. **Selvagem engajado** (o `targetWildId` do jogador, se `fighting` e adjacente): mesmo modelo,
   `bestMove` contra o ativo, cooldowns próprios. Evento `attack`.
4. **Consequências**:
   - Selvagem com `hp <= 0`: `xpOnDefeat` para treinador e ativo; `levelFromXp` pode subir vários
     níveis (evento `levelUp` por nível, `hpMax` recalculado e `hp` sobe pelo mesmo tanto que `hpMax`
     subiu — não mantendo a proporção de HP);
     `nextEvolution` a cada nível subido (evento `evolved`, `speciesName` troca, `hpMax` recalculado);
     `rollLoot` → ouro e itens no inventário; selvagem removido e `respawns` ganha
     `{ spawnIndex, atTick: tick + respawnSeconds * 5 }`; modo `searching`. Evento `wildDefeated`.
   - Ativo com `hp <= 0`: evento `pokemonFainted`; próximo com `hp > 0` vira ativo (evento
     `switched`, cooldowns zerados); sem ninguém, `stopped` (evento `stopped`).
   - Ativo com `hp / hpMax * 100 < returnHpPercent` e modo `searching`, `walking` ou `fighting`: se
     houver poção no inventário, usa a mais fraca que cure (evento `itemUsed`); senão modo `returning`.

`tick` incrementa ao final. Eventos são objetos `{ type, tick, ...payload }` tipados por união
discriminada.

## 4. Pathfinding

A* em grid de 4 vizinhos, custo 1, heurística Manhattan. Bloqueiam: `layers.blocking`, tiles com
selvagem, fora do mapa. O destino é qualquer tile adjacente ao alvo. `findPath(from, isBlocked,
goalTest, width, height) → Point[] | null` (caminho sem a origem). Recalcula só ao trocar de alvo ou
ao encontrar tile ocupado.

## 5. Captura

Aplicável quando: `wild.captureTried === false`, `wild.hp / wild.hpMax * 100 <= capture.maxWildHpPercent`,
(`allowDuplicates` ou `!seen.includes(speciesName)`), e existe bola: `ballTier` fixo exige aquela
bola no inventário; `best` usa a de maior `ballBonus` disponível. Tentativa: consome a bola,
`rollCapture({ captureRate, hpMax, hpCurrent, ballBonus }, rng)`; sucesso → selvagem sai do mapa,
entra no time se houver vaga (senão evento `captured` com `toBox: true` e o servidor decide),
`seen` ganha a espécie, respawn agendado, modo `searching`, evento `captured`; falha →
`captureTried = true`, evento `captureFailed`, o combate continua no próximo tick.

## 6. Intenções e criação

`applyIntent(state, intent, deps) → { state, events } | { error }` com
`intent ∈ { stop, useItem { itemId }, setActive { pokemonId }, updateSettings { patch } }`.
Regras: `stop` → `stopped`; `useItem` só poção com quantidade > 0 e ativo com `hp < hpMax`;
`setActive` só para membro com `hp > 0`, zera cooldowns; `updateSettings` valida faixas
(`returnHpPercent` e `maxWildHpPercent` em `[0, 100]`). Erro tipado `{ error: { code, message } }`,
estado inalterado.

`createHuntState({ hunt, team, inventory, settings, seen, sessionId }, deps)`: posição no
`spawnPoint`, modo `searching`, `tick 0`, todos os spawns já gerados (`count` selvagens cada),
`nextWildId` sequencial. `resumeHuntState` não existe: o estado serializado é o próprio estado.

`stopped` é absorvente nesta fase: `step` não sai desse modo sozinho (nem por time caído nem por
`no-route`); o motor não tem intenção de reinício. Sair de `stopped` é responsabilidade do servidor,
que recria a sessão chamando `createHuntState` de novo; a política de o que fazer com um time
inteiramente caído (ex.: cura automática, tela de derrota) fica para a fase 2b.

## 7. Catch-up

`simulate(state, ticks, deps) → { state, events }`; o chamador agrega eventos longos
(`summarizeEvents(events) → { defeats, captures, xp, gold, drops, faints }`) para não guardar 200 mil
linhas. Determinismo: mesmo estado e mesma seed → mesmo resultado.

## 8. Estrutura

```
packages/server/
├── package.json  tsconfig.json  vitest.config.ts   # @pokeidle/server; deps: @pokeidle/shared
└── src/engine/
    ├── types.ts        # HuntState e afins, Event, Intent
    ├── constants.ts
    ├── grid.ts         # findPath, adjacency, occupancy
    ├── spawn.ts        # criação de selvagens e respawns
    ├── combat.ts       # ataque do jogador e do selvagem, captura
    ├── progression.ts  # xp, level up, evolução, loot
    ├── items.ts        # uso de poções e outros itens
    ├── player.ts       # máquina de modos do jogador
    ├── step.ts         # orquestra o tick
    ├── intents.ts      # applyIntent
    ├── create.ts       # createHuntState
    ├── simulate.ts     # simulate, summarizeEvents
    └── index.ts
```

## 9. Testes

- Unitários de `grid.ts` (caminho, bloqueio, sem caminho), de cada transição de modo em mapas 5x5
  sintéticos com registro mínimo (`test/engine/step.test.ts`), de captura (aplicabilidade, consumo
  de bola, sucesso/falha), de progressão (level up em cascata, evolução, loot).
- Cenário na Rota 1 real com `loadRegistry()`: Charmander nível 5 sozinho, 3000 ticks; invariantes
  por tick (HP em `[0, hpMax]`, XP monotônico, uma derrota por selvagem, respawn respeita o tempo,
  jogador nunca em tile bloqueado, contagem de selvagens ≤ soma de `count`); resultado: ≥ 1
  derrota, e se o HP caiu abaixo do limite houve `returning` ou `itemUsed`.
- Determinismo: duas execuções de 3000 ticks com a mesma seed são `toEqual`.
- Intenções inválidas devolvem erro e estado idêntico.
- Meta: 80 % de cobertura em `src/engine`.
