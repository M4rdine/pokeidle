# @pokeidle/assets-tools

Pipeline de assets da fase zero: lê `Tibia.spr` / `Tibia.dat` (8.60 ou 8.54), extrai PNGs,
gera atlases para o PixiJS e converte mapas do Tiled em `HuntMap` JSON. Os arquivos
originais **não** ficam no repositório: aponte os comandos para a sua cópia local.

## Comandos

```bash
pnpm assets inspect <spr> <dat> [--version 860|854]
pnpm assets extract <spr> <dat> [--out assets/extracted] [--version 860|854]
pnpm assets contact-sheet [--extracted assets/extracted] [--all-outfits] [--all-items] [--tileset assets/atlas]
pnpm assets build [--extracted assets/extracted] [--manifest tools/assets/manifest.json] [--out assets/atlas]
pnpm assets map-import tools/assets/maps/route-1.tmj --id route-1 --name "Rota 1" [--tileset assets/atlas/tiles.tsj] [--manifest tools/assets/manifest.json] [--out packages/shared/data/hunts]
pnpm assets map-preview packages/shared/data/hunts/route-1.json [--atlas assets/atlas] [--out preview.png] [--blocking]
```

- `inspect` resume assinaturas, contagens e avisos sem escrever nada.
- `extract` escreve todos os PNGs e o `catalog.json`.
- `contact-sheet` gera o `index.html` usado para descobrir ids de outfit e item; com
  `--tileset <dir>`, desenha `tileset.html` a partir do `tiles.json` do `build` (a folha de
  aprovação da curadoria do tileset, uma célula por tile recortado do atlas) em vez do dump
  extraído.
- `build` valida o manifest contra o catálogo e gera os atlases.
- `map-import` converte um mapa exportado do Tiled e grava em `packages/shared/data/hunts`
  por padrão; sem `--manifest`, confere os nomes de espécie dos spawns contra
  `loadRegistry().species` do `@pokeidle/shared` (com `--manifest`, usa os nomes do
  manifest em vez do registro).
- `map-preview` desenha uma hunt já convertida em PNG a partir do atlas gerado pelo `build`,
  sobrepondo `detail` ao `ground`; com `--blocking`, tinge de vermelho os tiles bloqueados.

Os `.tmj` de origem do Tiled (commitados, não gerados) ficam em `tools/assets/maps/` — só o
`HuntMap` JSON convertido vai para `packages/shared/data/hunts`.

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
  "tiles": [
    { "name": "grass", "itemId": 4526, "patternX": 0, "patternY": 0 },
    { "name": "pokecenter", "itemId": 4530, "slice": { "cols": 2, "rows": 2 } }
  ],
  "terrains": [
    {
      "name": "grama-terra",
      "colors": ["grama", "terra"],
      "tiles": [
        { "tile": "grass", "corners": ["grama", "grama", "grama", "grama"] },
        { "tile": "dirt", "corners": ["terra", "terra", "terra", "terra"] }
      ]
    }
  ],
  "transitions": [{ "name": "grama-terra", "from": "grass", "to": "dirt", "softness": 5 }]
}
```

Regras validadas (`parseManifest` + `validateManifest`):

- `name` em kebab-case ascii (`^[a-z0-9-]+$`) e **nunca só dígitos** — um nome numérico
  seria reordenado pelas chaves de objeto do JS e quebraria os ids locais do tileset.
- nomes e ids de espécie únicos; nomes de tile únicos (incluindo os nomes que as peças
  mistas de `transitions` geram, ver abaixo).
- `outfitId` e `attackOutfitId` (opcional) precisam existir no catálogo e ter 4 direções.
- `itemId` precisa existir e o par `patternX`/`patternY` precisa caber na faixa do item; um
  item maior que **1x1** (a célula do tileset é de 32px) precisa da chave `slice` batendo com
  o tamanho do item — veja "Fatiar tiles grandes" abaixo.
- `terrains` (opcional): cada entrada tem `name`, `colors` (as cores do pincel de terreno no
  Tiled) e `tiles` — cada `tiles[].tile` referencia um nome de tile já declarado, e
  `tiles[].corners` são as quatro cores dos cantos, nessa ordem: **superior-direito,
  inferior-direito, inferior-esquerdo, superior-esquerdo**. Toda cor citada em `corners`
  precisa estar em `colors`.
- `transitions` (opcional): cada entrada tem `name`, `from` e `to` (dois nomes de tile já
  declarados, diferentes entre si) e `softness` opcional (1 a 12; controla o ruído da borda
  gerada — quanto maior, mais irregular). Gera as catorze peças mistas e o terreno
  correspondente automaticamente — veja o passo 4 de "Desenhar um mapa" abaixo.
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

## Desenhar um mapa

Fluxo completo de autoria, do atlas até a prévia:

1. `pnpm assets build` — gera `assets/atlas/tiles.png`, `tiles.json` e `tiles.tsj` (o
   tileset do Tiled, com os wangsets dos `terrains` do manifest).
2. Opcional: `pnpm assets contact-sheet --tileset assets/atlas` e abra o `tileset.html`
   gerado para aprovar o corte de cada tile antes de desenhar o mapa.
3. Abra `assets/atlas/tiles.tsj` no Tiled.
4. Pinte com o pincel de terreno (Terrain Brush) — ele usa os cantos (`corners`) de cada
   entrada de `terrains` no manifest para escolher a peça certa automaticamente.
   Declarar uma entrada em `transitions` (com `from`/`to` apontando para dois tiles de chão já
   existentes) gera as catorze peças de borda por composição dos dois tiles e já deixa o
   terreno correspondente pronto — o autor do mapa não precisa recortar nem escolher a peça de
   borda na mão, só pintar com o pincel de terreno normalmente.
5. Salve o mapa como JSON (`.tmj`), seguindo o contrato de autoria abaixo.
6. `pnpm assets map-import <mapa.tmj> --id <id> --name "<nome>"` converte para `HuntMap` e
   grava em `packages/shared/data/hunts`.
7. `pnpm assets map-preview packages/shared/data/hunts/<id>.json` desenha o resultado em
   PNG para conferência visual; use `--blocking` para ver os tiles bloqueados em vermelho.

`map-import` recusa o mapa — listando todos os problemas de uma vez — quando:

- o ponto de partida (`spawnPoint`) cai num tile bloqueado;
- o Centro Pokémon (`pokecenter`) cai num tile bloqueado;
- o Centro Pokémon está a menos de um tile da borda do mapa;
- o Centro Pokémon (ou algum de seus quatro vizinhos ortogonais) não é alcançável a pé a
  partir do ponto de partida — mesmo que o próprio tile esteja livre, um Centro murado
  quebraria a hunt no jogo (o motor busca caminho com A* e desiste com `no-route`);
- algum `spawn` não tem nenhum tile livre dentro do seu raio, ou tem um tile livre mas
  inalcançável a pé (um bolsão fechado nunca seria alcançado pelos selvagens).

### Fatiar tiles grandes

Um item do Tibia maior que 1×1 (a cela do tileset é sempre 1 tile de 32px) precisa da
chave `slice` na entrada de `tiles` do manifest, com `cols`/`rows` batendo com o tamanho do
item (`validateManifest` recusa o manifest se não bater). Cada peça fatiada vira um tile
próprio, nomeado `<nome>-x<col>-y<row>` na ordem de leitura (esquerda pra direita, cima pra
baixo) — por exemplo, um `pokecenter` 2×2 vira `pokecenter-x0-y0`, `pokecenter-x1-y0`,
`pokecenter-x0-y1` e `pokecenter-x1-y1`, cada um pintável como um tile normal no Tiled.

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

> `HuntMapSchema` e `parseOrThrow` moram em `@pokeidle/shared` (compartilhado entre servidor
> e cliente) e são importados diretamente de lá — veja `packages/shared/README.md`.

## Desenvolvimento

```bash
pnpm --filter @pokeidle/assets-tools test
pnpm --filter @pokeidle/assets-tools test -- --coverage
pnpm --filter @pokeidle/assets-tools typecheck
```

Módulos de `src/` são puros, exceto `extract.ts`, `build-atlases.ts`, o writer de
`contact-sheet.ts`, `json-file.ts`, `cli.ts`, `main.ts` (o único com efeito colateral
na importação) e `map-preview.ts` (`loadTilesAtlas` lê o atlas do disco).
