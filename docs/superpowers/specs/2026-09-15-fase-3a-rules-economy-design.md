# Fase 3a: Regras e economia no servidor — Design

Data: 2026-09-15. Implementa o §7 do GDD (`docs/design/2026-09-14-pokeidle-gdd.md`) antes do
cliente (fase 3b, `2026-09-14-fase-3-client-design.md`). Motor: spec 2a; conta: 2b; tempo real: 2c.

## 1. Objetivo

Colocar no servidor as regras fechadas no GDD: dois limiares de HP com poções em três níveis,
quem chega ataca primeiro, mochila de Pokémon para capturas com o time cheio, nível do treinador
com destraves (vagas do time e itens da loja) e a loja do Centro Pokémon. Mover o contrato de fio
para o `shared` para o cliente da 3b consumir. Nenhuma tela; tudo por REST e motor.

## 2. Contrato de fio no `shared` (substitui o §3 da spec 3b)

`packages/shared/src/protocol/`: `hunt-state.ts` (schema Zod `.strict()` + tipos `Point`,
`PlayerMode`, `BallTier`, `PokemonState`, `WildState`, `PlayerState`, `CaptureSettings`,
`HuntSettings`, `HuntState`), `events.ts` (`EventSchema` discriminado por `type`, tipo `Event`),
`messages.ts` (`SettingsPatchSchema`, `ClientMessageSchema`, `ServerMessage`, `SessionInfo`,
`Summary`, `StopReason`), `index.ts`. `shared/package.json` ganha `"./protocol":
"./src/protocol/index.ts"`. O servidor importa de lá: `engine/types.ts` vira reexport dos tipos
(o código do motor não muda), `hunt-store/state-schema.ts` usa `HuntStateSchema` do shared,
`realtime/protocol.ts` usa `ClientMessageSchema`/`ServerMessage`, `account/settings.ts` usa
`SettingsPatchSchema`. Os campos novos desta fase (`box`, `potionHpPercent`, `teamSlots`) já
nascem no schema com `.default()` para snapshots antigos continuarem legíveis (`[]`, `50`, `6`).

## 3. Dados (`packages/shared/data`)

- `items.json`: `potion` 20 % (100 / vende 50), `super-potion` 50 % (400 / 200), `hyper-potion`
  100 % (1 500 / 750); bolas inalteradas (`poke-ball` 200/100, `great-ball` 600/300,
  `ultra-ball` 1 200/600).
- `unlocks.json` novo, com `UnlocksSchema` no shared:
  ```json
  { "growthRate": "medium-fast",
    "teamSlots": [{ "level": 1, "slots": 3 }, { "level": 10, "slots": 4 }, { "level": 20, "slots": 5 }, { "level": 30, "slots": 6 }],
    "items": { "super-potion": 20, "great-ball": 20, "hyper-potion": 30, "ultra-ball": 40 },
    "hunts": { "route-2": 50 } }
  ```
- `shared/src/unlocks.ts`: `trainerLevel(xp)` = `levelFromXp(growthRate, xp)`, `xpToNextLevel(xp)`,
  `teamSlotsFor(level)` (maior degrau ≤ nível), `itemUnlockLevel(itemId)` (0 se não listado),
  `nextUnlock(level): { level, what: string } | null`, `huntUnlockLevel(huntId)`. Registry carrega
  e valida (`loadRegistry().unlocks`); itens listados têm de existir.

## 4. Motor

- `HuntSettings` ganha `potionHpPercent` (padrão `POTION_HP_PERCENT_DEFAULT = 50`) e `teamSlots`
  (padrão `MAX_TEAM_SIZE = 6`, clampado a [1, 6]); `clampSettings` cobre os dois.
- `HuntState` ganha `box: readonly PokemonState[]` (capturas desta sessão com o time cheio; o
  motor é a única fonte de verdade, inclusive no catch-up). `createHuntState` começa com `[]`.
- **Poções** (`items.ts`): `choosePotion(state, registry, active)`: entre as poções com quantidade
  > 0, a mais fraca cujo `ceil(hpMax·healPercent/100) ≥ hpMax − hp`; se nenhuma cobre, a mais
  forte. `resolveLowHp`: com `hp% < potionHpPercent` e alguma poção → `applyPotion(choosePotion)`;
  senão com `hp% < returnHpPercent` → `returning`; senão nada. `weakestPotion` sai.
  `RETURN_HP_PERCENT_DEFAULT` agora é `50` (não `30`), o padrão para voltar ao Centro. Padrão 50
  (não 30): medido em 8 seeds, 30 % derruba o inicial em metade delas.
- **Quem chega ataca primeiro** (`step.ts`): `step` guarda `engagedBefore = mode === 'fighting'
  ? targetWildId : null` antes de `stepPlayer`; `engagedWildAttack(s, deps, engagedBefore)` só
  ataca se `s.player.targetWildId === engagedBefore` (o selvagem já estava engajado no tick
  anterior). Continua exigindo `fighting`, alvo vivo e adjacente.
- **Box** (`combat.ts`): `toBox = team.length >= settings.teamSlots`; com `toBox`, o Pokémon vai
  para `state.box` (evento `captured { toBox: true }` inalterado).
- `Intent updateSettings.patch` aceita `potionHpPercent`; `teamSlots` não é intenção (vem do
  nível, só via `createHuntState`).

## 5. Banco e hunt-store

- Migration `0001`: `trainers.potion_hp_percent int not null default 50`.
- `toHuntSettings(trainer, seen, teamSlots)` passa `potionHpPercent` e `teamSlots`;
  `startHunt` calcula `teamSlots = teamSlotsFor(trainerLevel(trainer.xp))` e recusa com
  `validation` se o time no banco tiver mais Pokémon que as vagas (não acontece porque vagas só
  crescem; a checagem é defesa).
- `syncWithin` ganha `syncBox`: cada entrada de `state.box` vira `INSERT … ON CONFLICT (id) DO
  UPDATE` em `pokemon` com `team_slot = null` (idempotente; nunca mexe em linhas que já estavam na
  mochila). `syncTeam` inalterado (limpa e reatribui só os slots do time).
- `GET /me` passa a devolver em `trainer`: `level`, `xpToNext`, `teamSlots`, `nextUnlock`
  (`{ level, what } | null`) e `settings.potionHpPercent`.
- `PUT /trainer/team`: `slots.length ≤ teamSlotsFor(level)`, senão `validation` 400 com a
  mensagem "o time tem N vagas no nível L".
- `PATCH /trainer/settings` e `settings.update` aceitam `potionHpPercent` (0–100).

## 6. Loja

- `GET /shop` (auth) → `{ level, gold, items: [{ itemId, name, kind, buyPrice, sellPrice,
  unlockLevel, unlocked, owned }] }` ordenado por `unlockLevel`, depois `buyPrice`.
- `POST /shop/buy { itemId, quantity }` (1–99, `.strict()`) → 200 `{ gold, item: { itemId,
  quantity } }`. Numa transação: `hasActiveHunt` → `hunt-active` 409; item inexistente → 404;
  `trainerLevel < unlockLevel` → `locked` 409; `SELECT trainers FOR UPDATE`; `gold < buyPrice ×
  quantity` → `insufficient-gold` 409; `UPDATE gold`; `UPSERT inventory`.
- `POST /shop/sell { itemId, quantity }` → 200 `{ gold, item }`. Transação: `hunt-active`;
  `owned < quantity` → `validation`; `gold += sellPrice × quantity`; inventário decrementa e apaga
  em zero.
- Códigos novos: `locked` 409, `insufficient-gold` 409 (tabela `STATUS_BY_CODE` e seu teste).
- Só fora de hunt: com hunt ativa o inventário do motor é a verdade e divergiria.

## 7. Segurança (S29–S32)

- S29. Nível e destraves calculados no servidor a partir de `trainers.xp`; nada vem do cliente.
- S30. Compra e venda em transação com `FOR UPDATE` no treinador; preço lido do registro, nunca
  do corpo; quantidade limitada a 99; ouro nunca negativo (constraint `check (gold >= 0)` nova).
- S31. Loja e reordenação do time recusadas com hunt ativa (fonte de verdade única).
- S32. Snapshots antigos sem os campos novos são aceitos por `.default()`; qualquer outro
  desvio continua `CorruptSnapshotError`.

## 8. Testes

- `shared`: `UnlocksSchema` (itens inexistentes rejeitados), `trainerLevel`/`teamSlotsFor`/
  `nextUnlock` (tabela do GDD §3.4: XP 0/1 000/8 000/27 000/64 000/125 000 → níveis 1/10/20/30/
  40/50 e as vagas 3/4/5/5/6/6), round-trip do `HuntStateSchema` com e sem os campos novos.
- Motor (fixture 5x5): `choosePotion` (cobre o faltante → mais fraca que cobre; nenhuma cobre →
  mais forte; nenhuma → null); dois limiares (hp 45 % com poção → poção; 45 % sem poção e
  retorno 30 → nada; 25 % sem poção → returning; 25 % com poção → poção); primeiro golpe (tick de
  chegada: só ataque do jogador; tick seguinte: os dois); box (7.ª captura vai para `state.box`,
  evento `toBox: true`, time intacto; com `teamSlots: 3` a 4.ª já vai); `updateSettings` com
  `potionHpPercent` fora de [0, 100] → `invalid-settings`.
- **Balanceamento como teste** (Rota 1, Charmander 10, padrões, 3 000 ticks, seeds 42/9/7):
  `defeats ≥ 150`, `faints = 0`, `captures ≥ 3` em cada seed. Se mudar dados ou regras e isso
  quebrar, o balanceamento mudou e alguém precisa olhar.
- `hunt-store`: `box` sincroniza com `team_slot` nulo e é idempotente; `teamSlots` vem do nível;
  `potionHpPercent` ida e volta.
- REST: `/me` com nível, `xpToNext`, `teamSlots`, `nextUnlock`; `PUT /trainer/team` acima das
  vagas → 400; `PATCH settings` com `potionHpPercent`; loja: catálogo com `unlocked` por nível,
  comprar ok, `locked`, `insufficient-gold`, `hunt-active`, item inexistente, quantidade 100 →
  400, vender ok e além do que tem → 400, ouro nunca negativo, conta B não compra com o ouro de A.
- Realtime: suíte existente inalterada (o protocolo mudou de lugar, não de forma).
- Cobertura ≥ 80 % em `packages/server/src` e `packages/shared/src`.

## 9. Fora do escopo

Cliente (3b), Rota 2 e caverna (conteúdo), som, market, ranking, cura paga no Centro,
versionamento de snapshot além dos defaults, ícones de itens.
