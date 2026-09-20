# Sprint 7: drops por área e validação de conteúdo — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`. Triagem: itens A1 e A20.

## 1. Problema

O loot hoje é da espécie, não do lugar: um Zubat derruba a mesma poção com a mesma chance no
Campo Inicial e na Caverna Funda. Como o nível e o tempo por derrota crescem muito mais rápido
que a recompensa, as áreas de nível alto pagam quase o mesmo que a inicial por muito mais
trabalho — o analisador da sprint 6 mostra isso com clareza: o Pico Rochoso rende menos ouro por
hora que o Campo Inicial.

A referência resolve com degraus de raridade por região (item A1): a mesma espécie derruba o
mesmo item, mas a chance do raro multiplica conforme a área avança, e XP e ouro não mudam. É o
que dá profundidade sem inventar conteúdo.

E há um bug de classe inteira à espreita (item A20): eles descobriram em produção que 34
evoluções dependiam de uma pedra que **nenhuma hunt dropava**. Nosso importador já valida
alcançabilidade de mapa; estender a validação para o conteúdo é barato e impede a mesma classe de
falha.

## 2. Objetivo e limites

Duas entregas ligadas: o multiplicador de raridade por área, visível no jogo e no analisador; e a
validação automática de conteúdo no registro, que recusa o jogo inteiro quando um item exigido não
é obtenível.

Fora do escopo: itens novos, pedras de evolução (sprint 10, com a evolução ramificada), e o painel
de automação. A economia continua com a tabela de loot que já existe.

Critério de pronto: derrotar um selvagem numa área avançada lista o drop na linha do log com a
chance multiplicada; o analisador mostra a tabela de drops por espécie; e o registro recusa um
`loot.json` cujo item exigido por evolução não caia em lugar nenhum.

## 3. O multiplicador

Cada área ganha `rarity`, um inteiro de 1 a 8, derivado da ordem dela dentro da região pelo
importador — a área mais fácil é 1, a mais difícil da região é 8, distribuído por igual. O
multiplicador afeta **só a chance dos drops**, nunca o ouro nem o XP: subir os três de uma vez
inflaciona a economia e apaga a razão de voltar às áreas antigas.

```ts
export function dropChance(base: number, rarity: number): number
```

A chance sobe de forma decrescente, não linear: `1 - (1 - base) ** rarity` é a probabilidade de
pelo menos um acerto em `rarity` sorteios, o que mantém a chance abaixo de 1 e dá ao degrau 8 um
ganho perceptível sem transformar o raro em garantido. Uma chance de 2 % vira 15 % no degrau 8;
uma de 50 % vira 99,6 %, que é o comportamento certo para um item comum já frequente.

O motor passa a sortear com a chance ajustada. `rollLoot` ganha o parâmetro, e o servidor o lê da
área da caçada ativa — o cliente nunca decide isso.

## 4. A validação de conteúdo

`buildRegistry` ganha um bloco novo de checagens, no mesmo formato das que já existem (todos os
problemas de uma vez, não o primeiro):

- Todo item que o jogo exige é obtenível: cai de alguma espécie ou está à venda na loja. A
  checagem nasceu mirando pedras de evolução, mas o nosso modelo de evolução ainda é só por nível
  (evolução por item é da sprint 10); hoje ela vale sobre os itens que a tabela de destraves
  exige, e cobre as pedras no dia em que elas existirem, sem precisar de código novo.
- Nenhum drop tem chance zero: uma entrada que nunca cai é conteúdo morto se passando por
  conteúdo. (A ideia original de somar as chances e exigir ≤ 1 estava errada: os drops são
  sorteados de forma independente, então somar não significa nada.)
- Todo item que a loja vende tem preço de venda menor que o de compra, senão existe um ciclo de
  ouro infinito.
- "Toda espécie aparece em alguma área" ficou de fora: com uma região só, quarenta das quarenta e
  duas espécies estão legitimamente sem área. A checagem entra na sprint 8, junto com a segunda
  região, que é quando ela passa a acusar algo de verdade.

A checagem roda no boot do servidor e no teste do registro, que é onde ela precisa doer.

## 5. A leitura no cliente

O analisador da sprint 6 ganha uma coluna nova na tabela por espécie: **drops**, com o item e a
chance já multiplicada pela raridade da área. É o que a triagem A16 pedia e ficou de fora da
sprint 6 por falta do dado.

A linha da ficha ganha o degrau de raridade como um selo discreto (`raridade ×3`), ao lado da
faixa de nível: é a informação que explica por que uma área difícil vale a pena.

## 6. Arquivos

- `packages/shared/src/loot.ts` — `dropChance` e `rollLoot` com raridade.
- `packages/shared/src/schemas/region.ts` — `rarity` na área.
- `packages/shared/src/registry.ts` — as checagens novas de conteúdo.
- `tools/assets/src/region-import.ts` — deriva `rarity` da ordem da área.
- `packages/server/src/engine/progression.ts` — passa a raridade ao sorteio.
- `packages/client/src/ui/screens/areas/AreaAnalyzer.ts` e `AreaRow.ts` — coluna de drops e selo.

## 7. Testes

- `dropChance`: degrau 1 devolve a chance base; a chance cresce com o degrau e nunca chega a 1;
  entrada fora de faixa é recusada.
- O motor: com a mesma seed, a área de degrau alto produz mais drops que a de degrau 1 em 3000
  ticks, e o ouro **não** muda — é a prova de que o multiplicador ficou onde deveria.
- O registro: um item exigido que não cai nem está à venda derruba `buildRegistry` nomeando o
  item; preço de venda acima do de compra e drop com chance zero também; e o conteúdo real do
  repositório passa em todas as checagens.
- O analisador: a chance mostrada é a ajustada, não a base.

## 8. Riscos

O maior é inflacionar a economia sem perceber. Mitigação: o multiplicador toca só a chance de
drop, e o teste de balanceamento que já existe passa a medir também o ouro por hora, travando a
regressão.

O segundo é a validação nova recusar o jogo por conteúdo legítimo que ainda não foi importado —
uma espécie sem área hoje é o caso normal, porque só Kanto existe. Mitigação: essa checagem ficou
de fora e entra na sprint 8, com a segunda região; as outras nasceram como erro.

## 9. O que a execução mostrou

O teste de ouro não confirmou a previsão, contradisse: a área inicial rende **~3 200 de ouro em
dez minutos**, o dobro dos ~1 500 que o GDD §6 registra. A causa não é a raridade (ela não toca
ouro) e sim o sprint 5, que subiu a densidade da área inicial para cinco espécies e vinte
selvagens a fim de alcançar as 150 derrotas exigidas pelo próprio GDD. O teste trava a faixa
medida hoje, e a escolha entre aceitar o número, dobrar os preços da loja ou cortar o ouro por
derrota está registrada no GDD §6 como decisão em aberto do dono do jogo — é balanceamento, não
implementação.
