# Fase 4a: Tileset rico e autoria de mapa no Tiled — Design

Data: 2026-09-18. Spec pai: `docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md`.
Contexto visual: `docs/design/2026-09-14-pokeidle-gdd.md` §5. Pipeline atual: `tools/assets/README.md`.

## 1. Problema

A Rota 1 foi gerada por script com os seis únicos tiles curados (grama, terra, piso de pedra,
montanha, água, areia). O resultado é um tapete de grama com manchas: sem transição entre
materiais, sem vegetação, sem construção, e com o Centro Pokémon representado apenas por um
retângulo de piso. O jogo roda, mas não parece um lugar.

O dump OTPokemon 2019 já extraído tem 18 602 itens com metadados (1 623 marcados como chão,
7 953 ocupando mais de um tile, 1 438 animados) e 48 folhas de contato em
`assets/curadoria-otp2019/` onde cada sprite aparece com o id ao lado. A matéria-prima existe;
falta curadoria e ferramenta de autoria.

Decisões do usuário em 2026-09-18: o mapa final é **desenhado por ele no Tiled**, com o tileset
que esta fase entrega; a curadoria é **generosa** (rota, vila e caverna, cerca de 70 peças); as
transições são pintadas com **pincel automático de terreno**; e o trabalho foi dividido em duas
fases, sendo esta a primeira. Água animada e copa de árvore desenhada na frente do jogador ficam
para a fase 4b.

## 2. Objetivo e limites

Entregar tudo que é preciso para o usuário desenhar a Rota 1 e futuras hunts no Tiled e ver o
resultado no jogo, sem tocar em motor, cliente, servidor ou protocolo.

Fora do escopo: água animada e camada acima do jogador (fase 4b); desenhar o mapa final (é do
usuário); novas espécies de Pokémon; Rota 2 como conteúdo jogável, ainda que o tileset já cubra
vila e caverna.

Critério de pronto: `pnpm assets build` gera um tileset com as peças curadas e os terrenos
declarados; o usuário abre `assets/atlas/tiles.tsj` no Tiled, pinta com o pincel de terreno e
salva; `pnpm assets map-import` aceita o arquivo e recusa mapa inválido com mensagem clara; e
`pnpm assets map-preview` desenha o mapa em PNG.

## 3. Curadoria

A seleção sai das folhas de contato, por leitura visual, e vira entradas no
`tools/assets/manifest.json`. Alvo por família, aproximado, com o número final decidido pelo que
o dump realmente oferece de peças coerentes entre si:

| Família | Peças | Observação |
|---|---|---|
| Grama com variações e bordas para terra | 12 | base mais três variações discretas; oito bordas (4 lados, 4 cantos) |
| Terra, caminho de pedra e areia | 8 | inclui bordas de caminho |
| Água com margens | 9 | quadro parado nesta fase; a animação é 4b |
| Árvores, arbustos, flores, tocos | 10 | árvore grande entra fatiada |
| Pedras, cercas, portão, placa | 10 | cerca com lados, cantos e portão |
| Centro Pokémon | 9 | prédio 3×3 fatiado, com porta no tile central de baixo |
| Parede e chão de caverna, degraus | 8 | serve a conteúdo futuro, não muda esta fase |

Regras da curadoria, para a seleção não virar colcha de retalhos: peças de uma mesma família vêm
do mesmo conjunto do dump; nada de item com sombra embutida que brigue com o vizinho; e todo
tile de borda precisa ter o par oposto, senão o terreno fica capenga.

O usuário aprova a seleção antes de desenhar, olhando uma folha de contato só com os tiles
escolhidos, com o nome de cada peça ao lado. O comando `contact-sheet` hoje só sabe desenhar o
dump extraído, então ganha a opção `--tileset assets/atlas/tiles.json`, que desenha o atlas
gerado em vez do dump.

## 4. Manifesto

`TileSchema` em `tools/assets/src/manifest.ts` ganha dois campos opcionais.

**Fatiamento.** `slice: { cols: number; rows: number }` declara que o item ocupa mais de um tile.
O gerador corta o PNG (um item 2×2 sai do extrator como um único 64×64) em peças de 32 e nomeia
cada uma `<name>-x<col>-y<row>`, por exemplo `pokecenter-x0-y2`. Sem `slice`, o comportamento é o
de hoje: um item 1×1 vira um tile com o nome da entrada.

**Terrenos.** O manifesto ganha `terrains: { name, kind, tiles }[]`, onde `kind` é `corner` ou
`edge` e `tiles` mapeia cada peça da família para a máscara que o Tiled espera. Uma entrada
descreve, por exemplo, a transição entre grama e terra: qual tile é o interior de cada material e
quais são os oito arredores.

As validações de `validateManifest` acompanham: item com `slice` precisa bater com `width` e
`height` do catálogo; item sem `slice` continua obrigado a ser 1×1; nome de tile gerado por
fatiamento também entra na checagem de duplicado; e todo tile citado por um terreno precisa
existir na lista de tiles.

## 5. Gerador de atlas

`buildAtlases` passa a expandir cada entrada com `slice` em várias peças antes de empacotar, e
`toTiledTileset` passa a escrever os terrenos como `wangsets` no `tiles.tsj`, no formato do
Tiled 1.10. O `tiles.json` do PixiJS não muda de forma: continua um quadro por nome, e o cliente
não percebe diferença nenhuma além de existirem mais nomes.

O atlas de tiles sai de 6 para cerca de 70 quadros, o que muda a imagem de 96×64 para algo perto
de 320×224. Irrelevante para carga e memória.

## 6. Importador e prévia

`importTiledMap` ganha validações que hoje não existem e que deixam passar mapa quebrado:

- o ponto de partida e o Centro Pokémon precisam cair em tile não bloqueado;
- todo nome de tile citado pelas camadas precisa existir no tileset;
- todo ponto de nascimento precisa ter ao menos um tile livre dentro do raio;
- o Centro Pokémon precisa estar dentro do mapa e a pelo menos um tile da borda.

Cada falha vira uma linha na mensagem de erro, juntas, como já acontece com as validações atuais.

Entra o comando `pnpm assets map-preview <mapa.json> [--out preview.png] [--blocking]`, que
desenha o mapa a partir do atlas: camadas `ground` e `detail` na ordem, e, com `--blocking`, uma
tinta vermelha translúcida sobre os tiles bloqueados. É a forma de conferir um mapa sem subir
servidor nem navegador, e é o que eu uso para revisar o desenho do usuário.

## 7. Fluxo de trabalho

1. Eu curo e rodo `pnpm assets build`.
2. Eu gero a folha de contato do tileset novo e mando para o usuário aprovar ou pedir troca.
3. O usuário desenha no Tiled, seguindo o contrato de autoria que já existe no README, agora com
   o pincel de terreno.
4. Eu rodo `pnpm assets map-import`, corrijo o que o validador apontar, gero a prévia e mostro.
5. O mapa importado substitui `packages/shared/data/hunts/route-1.json`. O jogo passa a usá-lo
   sem nenhuma outra mudança.

O `route-1.tmj` atual, gerado por script, fica no repositório como ponto de partida para o
usuário abrir no Tiled em vez de começar de uma tela em branco.

## 8. Testes

O pipeline ganha teste; a curadoria não, porque é gosto.

- Fatiamento: um item 2×2 vira quatro tiles com os nomes esperados e o recorte certo.
- Manifesto: `slice` incompatível com o catálogo, terreno citando tile inexistente e nome
  duplicado vindo de fatiamento são recusados.
- Tileset: os `wangsets` escritos batem com os terrenos declarados, e um mapa salvo pelo Tiled com
  pincel de terreno é importado sem perda.
- Importador: cada validação nova tem um caso que falha e um que passa.
- Prévia: um mapa pequeno gera um PNG do tamanho esperado, e `--blocking` muda os pixels dos
  tiles bloqueados.
- Folha de contato: `--tileset` desenha uma célula por tile do atlas, com o nome.

A meta de cobertura de `tools/assets` continua a que já vale para o pacote.

## 9. Riscos

O maior é a curadoria não combinar entre si e o mapa continuar feio apesar da ferramenta. Por
isso a folha de contato de aprovação vem antes do desenho, e não depois.

O segundo é o formato de `wangsets` do Tiled não bater de primeira. A mitigação é testar contra um
arquivo salvo pelo próprio Tiled, e não só contra o que o gerador escreve.
