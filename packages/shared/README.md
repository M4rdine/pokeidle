# @pokeidle/shared

Pacote compartilhado entre servidor e cliente: schemas Zod, dados de jogo validados e as
fórmulas puras do Pokeidle (stats, XP, golpes, dano, captura, evolução, loot). Tudo é
exportado por `./src/index.ts` (`exports: { ".": "./src/index.ts" }`, sem build).

## Regenerar os dados

```bash
pnpm pokedata sync [--force]
```

Busca no PokeAPI as espécies listadas em `tools/assets/manifest.json`, grava
`species.json`, `moves.json` e `type-chart.json` em `data/` e usa cache em disco
(`tools/pokedata/.cache`); `--force` ignora o cache.

## Arquivos em `data/`

| Arquivo | Quem gera |
| --- | --- |
| `species.json`, `moves.json`, `type-chart.json` | `pnpm pokedata sync` (PokeAPI) |
| `items.json`, `loot.json` | autorais, editados à mão |
| `hunts/*.json` | `pnpm assets map-import` (a partir de um `.tmj` do Tiled) |

Cada hunt precisa de um import próprio em `src/data-files.ts` — adicionar uma hunt é
adicionar uma linha lá (ver seção abaixo).

## Contrato (seção 7 da spec)

```ts
loadRegistry(): Registry // memoizado; lança na primeira chamada se houver referência quebrada
  // Registry = { species, speciesById, moves, items, loot, hunts, typeChart }
  // species/speciesById/moves/items/loot/hunts são ReadonlyMap; falha inclui golpe sem
  // ficha, evolução sem alvo, item de loot inexistente e espécie de spawn inexistente.

statAt(base: number, level: number): number
hpAt(base: number, level: number): number
statsAt(base: BaseStats, level: number): Stats

xpForLevel(rate: GrowthRate, level: number): number
levelFromXp(rate: GrowthRate, xp: number): number
xpOnDefeat(defeated: Pick<Species, 'baseExperience'>, defeatedLevel: number): number

availableMoves(species: Species, level: number, moves: ReadonlyMap<string, Move>): Move[]
cooldownTicks(move: Pick<Move, 'power'>): number
computeDamage(input: DamageInput): number

captureChance(input: CaptureInput): number
rollCapture(input: CaptureInput, rng: Rng): boolean

nextEvolution(species: Species, level: number, registry: Pick<Registry, 'species'>): Species | undefined

rollLoot(species: Species, loot: ReadonlyMap<string, LootTable>, rng: Rng): LootResult

createRng(seed): Rng // único gerador aleatório do jogo
```

## Constantes das fórmulas

- **stats**: IV fixo 31, offset de stat +5, offset de HP (+level +10).
- **xp**: curvas `fast`/`medium-fast`/`medium-slow`/`slow` (sem `erratic`/`fluctuating`,
  rejeitadas pelo schema); XP ao derrotar = `floor(baseExperience * nível / 7)`.
- **golpes**: cooldown = `clamp(round(power / 20), 1, 8)` segundos, em ticks de 5/s.
- **dano**: STAB 1.5x, fator aleatório entre 0.85 e 1.0, dano mínimo 1.
- **captura**: fórmula clássica sobre `hpMax`/`hpCurrent`/`captureRate`/`ballBonus`, dividida
  por 255.
- **loot**: sem tabela explícita, ouro = `[baseExperience/10, baseExperience/5]` e 5% de
  chance de `potion`.

## Adicionar uma hunt

1. Exporte o mapa do Tiled e rode `pnpm assets map-import <mapa.tmj> --id <id> --name <nome>`
   (grava em `data/hunts/<id>.json` por padrão; sem `--manifest`, valida `speciesName` dos
   spawns contra `loadRegistry().species`).
2. Adicione `import <id> from '../data/hunts/<id>.json' with { type: 'json' }` e inclua no
   array `hunts` de `rawData`, em `src/data-files.ts`.

## Consumidores

`tools/assets` usa este pacote como dependência de workspace: `hunt-map.ts` e
`parse-or-throw.ts` lá são apenas re-exports daqui.
