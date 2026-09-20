# Sprint 6: navegador de áreas e analisador de caçada — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`. Triagem: item A16.

## 1. Problema

Kanto tem oito áreas desde a sprint 5 e a tela de hunts as mostra como uma lista de cartões
iguais, com nome e faixa de nível. Quem quer subir um Pokémon de fogo, ou completar a Pokédex,
não tem como descobrir onde farmar sem abrir o JSON do repositório. Com duas regiões e dezenas de
áreas — que é para onde o plano vai — a lista vira um paredão inútil.

A referência resolve isso com um mapa da região e um painel que, ao passar o mouse numa área,
responde "vale a pena?" com XP por hora, ouro por hora e o confronto de tipos. É a melhor ideia
do jogo inteiro e é dado derivado: sai das fórmulas que já temos, sem nada novo no servidor.

## 2. Objetivo e limites

Uma tela de seleção onde dá para achar a área certa por tipo, faixa de nível, confronto e
Pokédex, e onde cada área mostra o que rende antes de entrar.

Fora do escopo: drops por área com multiplicador de raridade (sprint 7 — aqui o analisador usa a
tabela de loot padrão que já existe); segunda região (sprint 8); mapa da região renderizado em
PixiJS com zoom e arraste. Este sprint entrega o mapa como *minimapa estático por área* desenhado
a partir do tile de terreno dominante; a tela grande com zoom fica para quando houver mais de uma
região para navegar.

Critério de pronto: com o filtro "forte contra água" e "nível 10 a 20", a tela mostra só as áreas
que servem, e o cartão de cada uma diz quanto XP por hora ela rende para o time atual.

## 3. De onde vêm os dados

Nada novo no servidor. O cliente já carrega o registro inteiro (`ctx.registry`), que desde a
sprint 2 tem `regions` com as áreas, cada uma com `species`, `minLevel` e `maxLevel`. A Pokédex
já vem de `GET /pokedex`. As fórmulas de XP, dano e loot são funções puras de `@pokeidle/shared`.

O único acréscimo é um módulo puro novo em `packages/shared/src/analyzer.ts`, usado pelo cliente
e testável sozinho:

```ts
export interface AreaEstimate {
  readonly xpPerHour: number
  readonly goldPerHour: number
  /** Multiplicador médio de dano do time contra as espécies da área. */
  readonly matchup: number
  /** Espécies da área que faltam na Pokédex. */
  readonly missing: readonly string[]
}

export function estimateArea(input: EstimateInput): AreaEstimate
```

A estimativa não simula a caçada: é uma aproximação declarada como tal na interface. O modelo é
o mais simples que responde à pergunta:

1. Nível médio da área = média de `minLevel` e `maxLevel`.
2. Tempo por derrota = HP médio do selvagem ÷ dano médio por tick do time, em ticks de 200 ms,
   mais um tempo fixo de deslocamento até o próximo selvagem.
3. XP por derrota = `xpOnDefeat` da espécie no nível médio; ouro por derrota = meio da faixa de
   `lootTableFor`.
4. Por hora = por derrota × derrotas por hora, média simples entre as espécies da área.

Se o time não consegue derrubar a espécie (dano médio zero por imunidade), a área aparece como
"seu time não fere" em vez de um número inventado.

## 4. A tela

Substitui `mountHunts`. Três partes:

**Barra de filtros.** Tipo (as 18 opções), faixa de nível (dois campos), "forte contra" e "fraco
contra" derivados da tabela de tipos, e "só com espécie que falta na Pokédex". Cada filtro vive na
URL (`?tipo=fire&nivel=10-20`), para o estado ser compartilhável e sobreviver ao recarregar —
é a regra de URL como estado das nossas próprias diretrizes de front-end.

**Lista de áreas.** Um cartão por área, com contagem "X de Y áreas" no topo. O cartão traz nome,
faixa de nível, as espécies com sprite, o minimapa e três números do analisador. Área de região
bloqueada aparece esmaecida com o nível que a abre, nunca some — saber o que vem depois é parte
do jogo.

**Painel do analisador.** Ao focar um cartão (mouse ou teclado), o painel lateral abre com a
tabela por espécie: nível, XP por derrota, ouro, chance de captura com a melhor bola do inventário
e o confronto de tipo contra o time. No celular o painel vira uma gaveta abaixo do cartão.

Acessibilidade não é apêndice: os cartões são uma lista navegável por teclado, o foco abre o
painel, os filtros são `fieldset` com rótulo, e o confronto nunca é indicado só por cor — vem com
o número do multiplicador.

## 5. Arquivos

- `packages/shared/src/analyzer.ts` — estimativa pura (novo).
- `packages/shared/test/analyzer.test.ts` — testes da estimativa (novo).
- `packages/client/src/state/area-filters.ts` — filtro puro e leitura/escrita da URL (novo).
- `packages/client/src/ui/screens/areas/` — a tela quebrada em `AreaList`, `AreaCard`,
  `AreaFilters`, `AreaAnalyzer` e `minimap.ts`, nenhum acima de 200 linhas (novo).
- `packages/client/src/ui/screens/hunts.ts` — some; quem chama passa a montar a tela nova.
- `packages/client/src/styles/areas.css` — estilo da tela (novo).

## 6. Testes

- `analyzer.test.ts`: XP/hora cresce com o nível da área; time imune devolve "não fere"; a
  estimativa é determinística (mesma entrada, mesma saída).
- `area-filters.test.ts`: cada filtro isola o conjunto certo; filtros compõem; a ida e volta pela
  URL preserva o estado.
- `areas.test.ts`: a contagem "X de Y" bate com o filtro; região bloqueada não tem botão; focar
  um cartão abre o painel; o painel lista uma linha por espécie.
- O smoke continua verde: ele clica no primeiro cartão não bloqueado, que continua existindo.

## 7. Riscos

O analisador mentir. Um número errado é pior que número nenhum, porque o jogador decide com base
nele. Mitigação: a estimativa é declarada como aproximação na própria interface ("~1.2k XP/h"), e
os testes fixam a ordem de grandeza contra uma simulação real de 3000 ticks do motor, não contra
um valor mágico.

O segundo é a tela virar um painel de planilha e matar o clima do jogo. Mitigação: o cartão mostra
três números e sprites; a tabela completa só aparece no painel, sob demanda.
