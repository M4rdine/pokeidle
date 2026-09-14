# @pokeidle/assets-tools

Pipeline de assets da fase zero: lê `Tibia.spr` / `Tibia.dat` (8.60 ou 8.54), extrai PNGs,
gera atlases para o PixiJS e converte mapas do Tiled em `HuntMap` JSON. Os arquivos
originais **não** ficam no repositório: aponte os comandos para a sua cópia local.

## Comandos

```bash
pnpm assets inspect <spr> <dat> [--version 860|854]
pnpm assets extract <spr> <dat> [--out assets/extracted] [--version 860|854]
pnpm assets contact-sheet [--extracted assets/extracted] [--all-outfits] [--all-items]
pnpm assets build [--extracted assets/extracted] [--manifest tools/assets/manifest.json] [--out assets/atlas]
pnpm assets map-import <mapa.tmj> --id rota-1 --name "Rota 1" [--tileset assets/atlas/tiles.tsj] [--manifest tools/assets/manifest.json] [--out packages/shared/data/hunts]
```

- `inspect` resume assinaturas, contagens e avisos sem escrever nada.
- `extract` escreve todos os PNGs e o `catalog.json`.
- `contact-sheet` gera o `index.html` usado para descobrir ids de outfit e item.
- `build` valida o manifest contra o catálogo e gera os atlases.
- `map-import` converte um mapa exportado do Tiled e grava em `packages/shared/data/hunts`
  por padrão; sem `--manifest`, confere os nomes de espécie dos spawns contra
  `loadRegistry().species` do `@pokeidle/shared` (com `--manifest`, usa os nomes do
  manifest em vez do registro).

Efeitos e mísseis são opcionais: se o `.dat` estiver corrompido nessas seções, a leitura
segue e um `aviso: ...` é impresso.

## Saída de `assets/extracted`

```
outfits/<id>/<direction>_<phase>.png   direction = north|east|south|west (ou x0..xN)
items/<id>_<px>_<py>.png               px/py = patternX/patternY do item
catalog.json                           dimensões, direções, fases e flags de cada thing
index.html                             contact sheet (gerado pelo contact-sheet)
```

## `manifest.json`

Curadoria manual — veja `manifest.example.json`. Campos:

```json
{
  "version": 1,
  "species": [{ "id": 1, "name": "bulbasaur", "outfitId": 128, "attackOutfitId": 129 }],
  "tiles": [{ "name": "grass", "itemId": 4526, "patternX": 0, "patternY": 0 }]
}
```

Regras validadas (`parseManifest` + `validateManifest`):

- `name` em kebab-case ascii (`^[a-z0-9-]+$`) e **nunca só dígitos** — um nome numérico
  seria reordenado pelas chaves de objeto do JS e quebraria os ids locais do tileset.
- nomes e ids de espécie únicos; nomes de tile únicos.
- `outfitId` e `attackOutfitId` (opcional) precisam existir no catálogo e ter 4 direções.
- `itemId` precisa existir, ser **1x1** (a célula do tileset é de 32px) e o par
  `patternX`/`patternY` precisa caber na faixa do item.
- chaves extras no topo são ignoradas (é assim que o `_leiame` do exemplo sobrevive).

## Saída de `assets/atlas`

| Arquivo | Conteúdo |
| --- | --- |
| `pokemon.png` / `pokemon.json` | spritesheet PixiJS das espécies |
| `tiles.png` / `tiles.json` | spritesheet PixiJS dos tiles |
| `tiles.tsj` | o mesmo `tiles.png` como tileset do Tiled |

Nomes de frame no `pokemon.json`:

- `<species>/walk_<direction>_<phase>` e `<species>/attack_<direction>_<phase>`
- animações: `<species>/walk_<direction>` e `<species>/attack_<direction>`
  (lista de frames ordenada pela fase)

No `tiles.json` cada frame tem a chave igual ao `name` do tile no manifest. No `tiles.tsj`
o id local de cada tile é a posição no manifest e o nome vai na propriedade `name`
(`{ "name": "name", "type": "string", "value": "grass" }`).

## Contrato de autoria no Tiled

- mapa **ortogonal**, tiles de **32px**, **não infinito**, "Tile Layer Format" = **CSV**;
- exatamente **um** tileset, o `tiles.tsj` gerado pelo `build`;
- três camadas de tiles no nível raiz: `ground`, `detail` e `blocking`
  (qualquer gid diferente de 0 em `blocking` vira `true`);
- camadas dentro de grupos **não** são suportadas;
- uma camada de objetos com as classes:
  - `spawnPoint` (exatamente 1) — posição inicial do jogador;
  - `pokecenter` (exatamente 1);
  - `spawn` (0 ou mais) com as propriedades `species` (string), `minLevel`, `maxLevel`,
    `count` e `respawnSeconds` (int). O raio vem do tamanho do objeto:
    `ceil(max(width, height) / 2 / 32)`; a posição vem do centro do objeto.

## `HuntMap`

```ts
{
  id: string            // kebab-case
  name: string
  width: number, height: number
  tileSize: 32
  layers: {
    ground: (string | null)[]   // width*height, nome do tile
    detail: (string | null)[]
    blocking: boolean[]
  }
  spawnPoint: { x, y }
  pokecenter: { x, y }
  spawns: { speciesName, minLevel, maxLevel, x, y, radius, count, respawnSeconds }[]
}
```

O schema exige camadas com exatamente `width * height` entradas, `minLevel <= maxLevel`
e todas as posições (`spawnPoint`, `pokecenter`, cada spawn) dentro do mapa.

> `HuntMapSchema` mora em `@pokeidle/shared` (compartilhado entre servidor e cliente).
> `hunt-map.ts` e `parse-or-throw.ts` aqui são apenas re-exports de lá — veja
> `packages/shared/README.md`.

## Desenvolvimento

```bash
pnpm --filter @pokeidle/assets-tools test
pnpm --filter @pokeidle/assets-tools test -- --coverage
pnpm --filter @pokeidle/assets-tools typecheck
```

Módulos de `src/` são puros, exceto `extract.ts`, `build-atlases.ts`, o writer de
`contact-sheet.ts`, `json-file.ts`, `cli.ts` e `main.ts` (o único com efeito colateral
na importação).
