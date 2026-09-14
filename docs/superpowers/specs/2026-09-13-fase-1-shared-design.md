# Pokeidle Fase 1 — `packages/shared` — Design

Data: 2026-09-13
Status: aprovado em conversa
Spec pai: `2026-09-13-pokeidle-mvp-design.md` (seção 3 e fases de entrega)

## 1. Objetivo

Pacote `@pokeidle/shared`: dados do jogo e fórmulas puras que servidor (fase 2) e cliente
(fase 3) consomem. Números oficiais dos jogos Pokémon via PokeAPI, adaptados ao combate
PXG-like (golpes com cooldown, nível sem teto). Nenhum I/O além do `import` estático de JSON.

### Decisões

| Decisão | Escolha |
|---|---|
| Teto de nível | Nenhum. Fórmulas oficiais aplicadas linearmente além de 100 |
| Learnset | `level-up` do version group `firered-leafgreen`; só golpes com `power` |
| Golpes em combate | Todos os aprendidos até o nível atual; IA usa o de maior dano fora de cooldown |
| Fonte de dados | Script `tools/pokedata` baixa do PokeAPI e grava JSON commitado em `packages/shared/data` |
| Tipos | Tabela atual de 18 tipos (PokeAPI devolve Clefairy/Jigglypuff como Fada) |
| Evolução | Só gatilho `level-up` com `min_level`, e só se o alvo estiver no manifest |
| Golpes de status | Fora do MVP |
| Aleatoriedade | PRNG seedado único (`createRng`), injetado nas fórmulas |

Abordagens descartadas: gerar TypeScript em vez de JSON (diff ilegível, dado e código
misturados); guardar dumps brutos do PokeAPI e derivar em runtime (200 KB por espécie,
dependência do formato externo).

## 2. Estrutura

```
packages/shared/
├── package.json            # @pokeidle/shared, ESM, dependência: zod
├── data/
│   ├── species/<name>.json # gerado
│   ├── moves.json          # gerado: golpes com poder usados por alguma espécie
│   ├── type-chart.json     # gerado: 18x18
│   ├── items.json          # autoral
│   ├── loot.json           # autoral
│   └── hunts/route-1.json  # movido de data/hunts (formato HuntMap)
└── src/
    ├── schemas/            # zod de cada dado + HuntMapSchema migrado de tools/assets
    ├── registry.ts         # loadRegistry(): carrega, valida, indexa por id e nome
    ├── stats.ts  damage.ts  moves.ts  xp.ts  capture.ts  evolution.ts  loot.ts
    ├── rng.ts              # mulberry32: createRng(seed) → { next(): [0,1), int(min,max) }
    └── index.ts
tools/pokedata/             # comando `pnpm pokedata sync [--force]`
```

Toda função recebe registro ou ficha como argumento; nada importa dado global.

## 3. Script `tools/pokedata`

- Lê `tools/assets/manifest.json` para a lista de espécies.
- Baixa `pokemon/{name}`, `pokemon-species/{name}`, `evolution-chain/{id}` e cada
  `move/{name}` referenciado. Cache em disco em `tools/pokedata/.cache` (gitignored);
  `--force` ignora o cache.
- Learnset: só `move_learn_method = level-up` em `version_group = firered-leafgreen`;
  descarta golpes com `power` nulo; avisa se a espécie ficar com menos de 2 golpes.
- Evolução: só `trigger = level-up` com `min_level`; alvo fora do manifest é omitido com aviso.
- Saída ordenada e determinística (chaves e listas em ordem fixa) para diffs limpos.

Ficha gerada:

```json
{
  "id": 4, "name": "charmander", "types": ["fire"],
  "baseStats": { "hp": 39, "attack": 52, "defense": 43, "spAttack": 60, "spDefense": 50, "speed": 65 },
  "baseExperience": 62, "growthRate": "medium-slow", "captureRate": 45,
  "learnset": [{ "move": "scratch", "level": 1 }, { "move": "ember", "level": 1 }, { "move": "flamethrower", "level": 34 }],
  "evolvesTo": { "species": "charmeleon", "level": 16 }
}
```

Golpe gerado: `{ "name": "flamethrower", "type": "fire", "power": 90, "accuracy": 100, "damageClass": "special" }`.

## 4. Fórmulas

Todas puras; `L` é o nível, `TICK_MS = 200`.

- **Stat:** `stat = floor((2·base + 31) · L / 100) + 5`; `hp = floor((2·base + 31) · L / 100) + L + 10`.
  Charizard L100: HP 297, Attack 204. L300: HP 671.
- **Dano:** `bruto = floor(floor(floor(2·L/5 + 2) · power · A / D) / 50) + 2`, A/D físicos ou
  especiais pela `damageClass`. Multiplicadores em ordem: tabela de tipos (produto sobre os
  tipos do alvo), STAB 1,5 se o tipo do golpe está nos tipos do atacante, aleatório uniforme em
  [0,85, 1,00] do PRNG. Mínimo 1. Sem crítico. Precisão não é aplicada no MVP.
- **Golpes disponíveis:** learnset com `level ≤ L`. **Cooldown em ticks:**
  `clamp(round(power / 20), 1, 8) · 5` (poder 40 → 10 ticks, 90 → 25, 110 → 30).
- **XP por nível:** curva oficial da `growthRate`, sem teto:
  `fast = 0,8·L³`, `medium-fast = L³`, `medium-slow = 1,2·L³ − 15·L² + 100·L − 140`,
  `slow = 1,25·L³`, `erratic` e `fluctuating` pelas fórmulas oficiais por faixa, estendidas
  com a última faixa acima de 100. `levelFromXp` é a inversa por busca binária.
  **XP por derrota:** `floor(baseExperience · L_derrotado / 7)`, igual para treinador e Pokémon.
- **Captura:** `a = floor((3·hpMax − 2·hpAtual) · captureRate · ballBonus / (3·hpMax))`,
  chance `min(1, a / 255)`. Bolas: poke 1,0, great 1,5, ultra 2,0.
  Charmander meio HP + Poké Bola ≈ 12 %; Ultra Bola com HP quase cheio ≈ 47 %.
- **Evolução:** `nextEvolution(species, L)` devolve a ficha alvo se `L ≥ evolvesTo.level`.
- **Loot:** `rollLoot(species, rng)` → `{ gold, drops: [{ item, quantity }] }`.

## 5. Dados autorais

`items.json` (MVP): `potion` cura 20 %, `super-potion` cura 50 %, `poke-ball` 1,0,
`great-ball` 1,5, `ultra-ball` 2,0; cada um com `buyPrice` e `sellPrice`.

`loot.json`: por espécie `{ "gold": [min, max], "drops": [{ "item", "chance" }] }`; cada drop
rola independente. Espécie sem entrada usa padrão derivado de `baseExperience`
(`gold = [floor(be/10), floor(be/5)]`, drop de `potion` com 5 %).

## 6. Migração do HuntMap

`HuntMapSchema` sai de `tools/assets/src/hunt-map.ts` para
`packages/shared/src/schemas/hunt-map.ts`; `tools/assets` importa de `@pokeidle/shared`.
`data/hunts` da raiz vai para `packages/shared/data/hunts`; `map-import` grava lá por padrão.
O importador do Tiled valida `speciesName` contra o registro de espécies.

## 7. Contrato para as próximas fases

- `loadRegistry()` → `{ species, moves, items, hunts, typeChart, loot }` validados; falha na
  inicialização se houver referência quebrada (golpe sem ficha, evolução sem alvo, item de loot
  inexistente, espécie de spawn inexistente).
- Fórmulas exportadas: `statAt`, `hpAt`, `computeDamage`, `availableMoves`, `cooldownTicks`,
  `xpForLevel`, `levelFromXp`, `xpOnDefeat`, `captureChance`, `nextEvolution`, `rollLoot`.
- `createRng(seed)`: único gerador aleatório do jogo.

## 8. Testes

- `tools/pokedata` contra fixtures gravadas de duas espécies (sem rede): filtro de golpes sem
  poder, evolução omitida fora do manifest, ordenação estável.
- Registro completo carrega e valida (rede de segurança do `sync`).
- Fórmulas em tabelas de casos com os números da seção 4; `levelFromXp(xpForLevel(n)) === n`
  para n de 1 a 500 em todas as curvas.
- Dano com PRNG seedado: determinismo e distribuição em [0,85, 1,00] em mil rolagens.
- Testes de `tiled-import` continuam verdes importando o schema do `shared`.

Meta: 80 % de cobertura em `packages/shared`.
