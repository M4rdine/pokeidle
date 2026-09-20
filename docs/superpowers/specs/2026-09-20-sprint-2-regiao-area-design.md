# Sprint 2: modelo de conteúdo, região e área — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`.
Triagem que motivou: `docs/design/2026-09-20-triagem-releases-referencia.md`.

## 1. Problema

Hoje uma caçada é um mapa de 40×30, e o destravamento é uma lista plana em `unlocks.hunts`. A
referência trabalha com regiões que abrem por nível e, dentro de cada uma, dezenas de áreas com
espécie, faixa de nível e drops próprios. Só uma delas tem 58 áreas.

Com o modelo atual, vinte áreas custariam vinte mapas desenhados à mão. Isso não acontece.

## 2. Objetivo e limites

Trocar a unidade de conteúdo de "mapa" para "região com áreas", sem que o motor mude de
comportamento e sem perder nenhum dos 233 testes do servidor.

Fora do escopo: navegador de áreas no cliente (sprint 6), drops por área (sprint 7), portão por
região no servidor (sprint 8), desenhar Kanto (sprint 5).

Critério de pronto: a Rota 1 de hoje passa a ser a primeira área de Kanto, o jogo roda igual, e
importar uma região com duas áreas gera dois mapas jogáveis a partir de um desenho só.

## 3. O modelo

**Região é o mapa. Área é um retângulo dentro dele.**

```
regiao (arquivo .tmj, desenhado uma vez)
├── propriedades do mapa: id, nome, ordem, nivelMinimo
├── camadas ground / detail / blocking / canopy  (como hoje)
└── camada de objetos
    ├── area  "rota-1"   x,y,w,h   + propriedades: nome
    │   ├── spawnPoint   (dentro do retângulo)
    │   ├── pokecenter   (dentro do retângulo)
    │   └── spawn ×N     (dentro do retângulo)
    └── area  "rota-2"   ...
```

O contrato de autoria não muda para quem desenha: os objetos `spawnPoint`, `pokecenter` e `spawn`
continuam iguais. O que entra é o objeto `area`, que delimita a qual área cada um pertence.

## 4. O que o importador passa a fazer

`importTiledMap` vira `importRegion`, que devolve **uma região e N mapas de caçada**:

1. Lê as propriedades do mapa para montar a região.
2. Para cada objeto `area`, recorta as quatro camadas de tile no retângulo dela.
3. Traduz as coordenadas dos objetos contidos para o referencial da área.
4. Emite um `HuntMap` por área, no formato atual, que o motor já sabe consumir.
5. Roda as validações que já existem **por área**: ponto de partida e Centro não bloqueados,
   Centro longe da borda, alcançabilidade a pé, spawn com tile livre alcançável.
6. Recusa a região inteira se qualquer área falhar, com a mensagem dizendo qual área e qual
   problema.

Validações novas da região, porque agora existem erros que só aparecem no conjunto:

- duas áreas com o mesmo identificador;
- áreas que se sobrepõem;
- área que sai dos limites do mapa;
- objeto `spawnPoint`, `pokecenter` ou `spawn` que não está dentro de nenhuma área;
- área sem exatamente um `spawnPoint` e um `pokecenter`.

## 5. Dados e registro

`packages/shared/data/`:

- `regions.json` — lista de regiões, cada uma com `id`, `name`, `order`, `minTrainerLevel` e as
  áreas: `id`, `name`, `anchor` (posição do marcador no mapa da região), `bounds`, faixa de nível
  e espécies, tudo derivado no import.
- `hunts/<area-id>.json` — um `HuntMap` por área, exatamente o formato de hoje.

O registro ganha `regions` e mantém `hunts` indexado por id de área. Nada no motor muda: ele
recebe um `HuntMap` como sempre.

`unlocks.json` troca `hunts` por `regions`, com o nível mínimo por região. A Rota 1 fica em Kanto,
que abre no nível 1, então o comportamento observável continua o mesmo.

## 6. Compatibilidade

A sessão de caçada no banco guarda `hunt_id`. Como a Rota 1 vira a área `route-1` dentro de
Kanto, o identificador continua o mesmo e **não há migração de dados**. Sessões ativas sobrevivem
ao deploy.

## 7. Testes

- Recorte: uma região 20×20 com duas áreas de 8×8 gera dois mapas de 8×8, com as camadas certas e
  as coordenadas dos objetos traduzidas.
- Cada validação nova tem um caso que falha e um que passa.
- Uma área cujo Centro fica fora do recorte é recusada nomeando a área.
- A Rota 1 importada pelo caminho novo é idêntica, tile a tile, ao `route-1.json` de hoje. Este é
  o teste que prova que a troca não mudou comportamento.
- O registro recusa região que cita área inexistente e área órfã sem região.

## 8. Riscos

O maior é a tradução de coordenadas. Um erro de um tile desloca spawns e o Centro, e o sintoma
aparece longe, como caçada que não acha caminho. Mitigação: o teste de igualdade tile a tile com
a Rota 1 atual, que só passa se o recorte for exato.

O segundo é a área virar um conceito duplicado do mapa, com dois lugares guardando a mesma
verdade. Mitigação: a área não guarda camada nenhuma; ela é só um retângulo mais metadados, e o
mapa recortado é gerado, nunca editado à mão.
