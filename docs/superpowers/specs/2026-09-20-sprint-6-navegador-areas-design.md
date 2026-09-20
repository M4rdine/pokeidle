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
PixiJS com zoom e arraste, que só se justifica quando houver mais de uma região para navegar.

Critério de pronto: com o filtro "forte contra água" e "nível 10 a 20", a tela mostra só as áreas
que servem, e cada uma diz quanto XP por hora rende para o time atual.

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

**Lista de áreas.** Uma linha por área, não um cartão, com contagem "X de Y áreas" ao lado do
título. A linha traz nome, faixa de nível, as espécies com sprite e tipo, e três números do
analisador, em colunas de largura fixa: a tarefa é comparar áreas, e comparar é ler a mesma
coluna de cima a baixo, o que cartões lado a lado não permitem. Área bloqueada aparece esmaecida
com o nível que a abre, nunca some — saber o que vem depois é parte do jogo.

O minimapa por área saiu do escopo na execução: numa linha de altura fixa ele competiria com os
sprites das espécies pelo mesmo espaço, e é a espécie, não o bioma, que responde à pergunta "onde
farmo o que eu quero". O bioma volta quando houver o mapa da região navegável, na sprint em que
existir uma segunda região para navegar.

**Painel do analisador.** Ao abrir uma linha (clique ou teclado), o detalhe aparece como gaveta
logo abaixo dela, com a tabela por espécie: nível, XP por derrota, ouro, tempo por derrota, chance
de captura e o confronto de tipo contra o time. Gaveta na própria lista, e não painel lateral nem
modal: comparar áreas exige abrir uma, olhar, fechar e abrir a vizinha sem perder o lugar.

Acessibilidade não é apêndice: a ficha é uma lista de verdade, o corpo de cada linha é um botão
nativo (com rótulo próprio, em vez do despejo de todas as colunas), "Caçar" fica fora dele porque
botão dentro de botão não existe em HTML, os filtros são `fieldset` com legenda, e o confronto vem
escrito ("arrasa", "vantagem", "não fere"), nunca só por cor.

## 5. Arquivos

- `packages/shared/src/analyzer.ts` — estimativa pura (novo).
- `packages/shared/test/analyzer.test.ts` — testes da estimativa (novo).
- `packages/client/src/state/area-filters.ts` — filtro puro e leitura/escrita da URL (novo).
- `packages/client/src/ui/screens/areas/` — a tela quebrada em `index.ts`, `AreaRow`,
  `AreaFilters`, `AreaAnalyzer` e `format.ts`, nenhum acima de 200 linhas (novo).
- `packages/client/src/ui/screens/hunts.ts` — some; quem chama passa a montar a tela nova.
- `packages/client/src/styles/areas.css` — estilo da tela (novo).

## 6. Testes

- `analyzer.test.ts`: XP/hora cresce com o nível da área; time imune devolve "não fere"; a
  estimativa é determinística (mesma entrada, mesma saída).
- `area-filters.test.ts`: cada filtro isola o conjunto certo; filtros compõem; a ida e volta pela
  URL preserva o estado.
- `areas.test.ts`: a contagem "X de Y" bate com o filtro; área bloqueada não tem botão de caçar;
  abrir uma linha mostra a tabela por espécie e abrir de novo fecha; filtro sem resultado explica
  o que fazer; sem o time carregado a ficha continua de pé, com travessão no lugar do número.
- O smoke passa a clicar na primeira linha não bloqueada.

## 7. Riscos

O analisador mentir. Um número errado é pior que número nenhum, porque o jogador decide com base
nele. Mitigação: a estimativa é declarada como aproximação na própria interface ("~1.2k XP/h"), e
os testes fixam a ordem de grandeza contra uma simulação real de 3000 ticks do motor, não contra
um valor mágico.

O segundo é a tela virar um painel de planilha e matar o clima do jogo. Mitigação: a linha mostra
três números e os sprites das espécies; a tabela completa só abre sob demanda.
