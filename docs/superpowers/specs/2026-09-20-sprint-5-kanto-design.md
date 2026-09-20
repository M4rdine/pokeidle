# Sprint 5: Kanto desenhada com áreas — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`.

## 1. Problema

O modelo de região com áreas existe desde a sprint 2, mas Kanto tem uma área só, que é a Rota 1
antiga recortada inteira. O terreno novo e os props novos estão no atlas e não aparecem em lugar
nenhum. O jogador continua vendo o mapa gerado por script com peças do Tibia.

## 2. Objetivo e limites

Desenhar Kanto como uma região grande, com várias áreas de biomas distintos, usando só o tileset
novo, e ligá-la ao jogo.

Fora do escopo: navegador de áreas no cliente (sprint 6); drops por área (sprint 7); segunda
região (sprint 8).

Critério de pronto: Kanto importa limpa com as áreas validadas, a prévia em PNG mostra biomas
distintos e coerentes, e o jogo roda nela sem nenhuma peça do Tibia no cenário.

## 3. O desenho

Região de 96×72 tiles, dividida em oito áreas de níveis crescentes, cada uma com bioma próprio:

| Área | Bioma | Níveis | Espécies |
|---|---|---|---|
| campo-inicial | campo com bosque esparso | 2–6 | pidgey, rattata |
| bosque-denso | floresta fechada | 5–10 | caterpie, weedle, oddish |
| trilha-pedregosa | campo com afloramento | 8–14 | geodude, sandshrew |
| margem-do-lago | campo, praia e água | 10–16 | poliwag, psyduck |
| praia-longa | areia e água | 12–18 | krabby, shellder |
| entrada-da-caverna | pedra e caverna | 15–22 | zubat, geodude |
| caverna-funda | caverna fechada | 20–28 | golbat, onix |
| pico-rochoso | pedra alta | 25–35 | machop, onix |

Cada área tem ponto de partida, Centro Pokémon e spawns próprios, e é recortada num mapa jogável
pelo importador que já existe.

## 4. Como desenhar sem desenhar à mão

Oito áreas à mão levariam dias. O gerador de região compõe por código, como o da Rota 1, mas agora
com material por bioma e pincel de canto de verdade:

1. Campo de alturas por ruído decide o material de cada canto dentro da área.
2. O tile sai do pincel do bioma, escolhendo a peça pelo código dos quatro cantos.
3. Props entram por densidade de bioma, com árvore ocupando dois tiles, tronco bloqueando e copa
   na camada de cima.
4. Caminho de terra liga as áreas, passando pelos Centros.

O resultado é ponto de partida para o Tiled, não substituto: o arquivo continua sendo `.tmj` e o
usuário pode abrir e ajustar qualquer área à mão.

## 5. Testes

- O gerador é determinístico por semente: duas execuções com a mesma semente dão o mesmo `.tmj`.
- Toda área gerada passa nas validações do importador, que é o que prova caminho até o Centro e
  spawn alcançável.
- Nenhum nome de tile citado pelo mapa vem do dump: o teste varre as camadas e recusa nome fora
  da lista de terrenos e props desenhados.
- O registro aceita a região nova com oito áreas.

## 6. Riscos

O maior é a área ficar bonita e injogável: Centro cercado, spawn ilhado. Mitigação: as validações
do importador já cobrem os dois casos e recusam a região inteira nomeando a área.

O segundo é o mapa ficar monótono, porque ruído puro tende a manchas parecidas. Mitigação: cada
bioma tem a própria mistura de materiais e a própria densidade de props, e o caminho de terra
cruza o mapa dando direção.
