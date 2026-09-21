---
name: Pokeidle
description: Interface de RPG 16-bit para um MMO idle de Pokémon — moldura com bisel, superfícies aninhadas e um único acento amarelo.
colors:
  noite: "#131826"
  cava: "#0d111c"
  painel: "#2a3145"
  painel-alto: "#343c54"
  moldura: "#7a5c3a"
  moldura-luz: "#a8814f"
  moldura-sombra: "#46331f"
  text: "#f0f0f5"
  muted: "#9aa0b4"
  accent: "#f8d030"
  ouro: "#f0c040"
  xp: "#58a6f0"
  danger: "#e04848"
  ok: "#52c46a"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.02em"
  row-title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.8em"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
  micro:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.75em"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.04em"
rounded:
  none: "0"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "16px"
  "4": "32px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-hover:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
  button-primary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-disabled:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "8px"
    width: "100%"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
  type-badge:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0 4px"
    typography: "{typography.label}"
  filter-type:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0 4px"
  filter-type-pressed:
    textColor: "{colors.text}"
  filter-toggle:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
  filter-toggle-pressed:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.accent}"
  area-row:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  area-row-locked:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
  area-gate:
    textColor: "{colors.accent}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
    typography: "{typography.micro}"
  area-analyzer:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "16px"
  modal:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    width: "min(560px, 92vw)"
  toast:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    width: "360px"
---

# Design System: Pokeidle

## Overview

**Creative North Star: "A Moldura"**

Pokeidle é um jogo, não um painel. A primeira versão desta interface foi desenhada como terminal
de campo — escura, chapada, borda reta de 2 px, raio zero — e estava tecnicamente correta e
errada para o produto: lia como dashboard. Um clone de Pokémon pede a linguagem do gênero, e a
linguagem do gênero é a interface de RPG 16-bit.

O mundo é construído por **relevo**. Toda superfície tem bisel: duas sombras internas sem
desfoque, clara em cima à esquerda e escura embaixo à direita. É isso que dá volume numa
interface de pixel, e é uma regra só que responde a pergunta de projeto mais frequente da tela —
**o que se levanta e o que afunda**. O que é ação se levanta: painel, botão, card, slot ocupado.
O que é leitura afunda: trilho de medidor, campo de entrada, lista, vaga vazia, vaga travada.
Inverter a luz separa os dois sem gastar cor nova.

O bisel é CSS, não asset. Duas `box-shadow` internas ficam nítidas em qualquer tamanho e mudam de
cor por token — coisa que um 9-slice em PNG não faz. Asset fica para o que só asset resolve.

O que dá caráter é a **densidade**. A versão anterior tinha 52 classes, 11 controles e 37 % de uma
coluna vazia. A régua agora é a repetição: o mesmo chip de nível, o mesmo selo de tipo e o mesmo
medidor aparecem na mesma ordem em seis slots, e é essa repetição que deixa comparar Pokémon com
Pokémon de relance.

**Key Characteristics:**
- Fundo azul-noite em três planos, moldura em bronze, sem gradiente e sem textura
- Bisel de 2 px sem desfoque como único recurso de profundidade; levanta o que age, afunda o que se lê
- Um só acento (amarelo `{colors.accent}`) para estado ativo, ação primária, recompensa e foco
- Dezoito cores canônicas de tipo, usadas como identidade e nunca como texto sozinho
- Números tabulares e chips repetidos em coluna sempre que houver comparação
- Tipografia de sistema sem fonte de display; hierarquia por peso, caixa e cor
- Movimento quase ausente: 120 ms no preenchimento de medidor, e nada mais

## Colors

Uma paleta escura de oito papéis, quase acromática, contra dezoito matizes canônicos de tipo que
entram só onde identificam uma espécie.

### Primary
- **Amarelo Elétrico** (`{colors.accent}`): o único acento do sistema. Marca o que está ativo (aba
  atual, slot do Pokémon em campo, linha aberta na ficha), o que é ação primária (borda do botão
  `.primary`), o que é recompensa (linha de log de XP e ouro), o que é portão de nível e o que é
  foco de teclado. É o mesmo valor de `--type-electric`; a coincidência é do mundo Pokémon, não um
  segundo token.

### Secondary
- **Verde Saudável** (`{colors.ok}`): estado bom e confirmado — conexão aberta, cooldown pronto,
  confronto vantajoso na ficha de áreas.
- **Vermelho de Alerta** (`{colors.danger}`): erro de formulário, log de alerta, conexão caída,
  confronto desvantajoso. Nunca decorativo.

### Tertiary
- **As dezoito cores de tipo** (`{colors.type-normal}` … `{colors.type-fairy}`): os matizes
  canônicos da série. Identificam a espécie e o filtro; entram em borda, em ponto marcador e em
  fundo esmaecido por `color-mix`, e só chegam ao texto depois de misturados com o claro do tema.

### Neutral
- **Preto de Página** (`{colors.bg}`): o fundo da janela. É também o fundo do que recuou de plano
  (linha de área bloqueada, gaveta do analisador) e o fundo dos campos de entrada.
- **Grafite de Painel** (`{colors.panel}`): toda superfície que se levanta — painel, botão, modal,
  toast, linha de área disponível.
- **Cinza de Borda** (`{colors.border}`): a borda de 2 px, os divisores de 1 px e o trilho vazio de
  qualquer medidor.
- **Branco de Leitura** (`{colors.text}`): o texto corrente.
- **Cinza de Rótulo** (`{colors.muted}`): rótulo de unidade, legenda de filtro, cabeçalho de tabela,
  log informativo, célula vazia. É o que sustenta a hierarquia no lugar de um segundo tamanho.

### Named Rules

**A Regra do Acento Único.** Só existe um acento. Se algo precisa de destaque e não é estado ativo,
ação primária, recompensa ou foco, então não precisa de destaque — precisa de posição. Não se
inventa um segundo amarelo, um azul de link ou um roxo de marca.

**A Regra do Tipo na Borda.** A cor de tipo identifica; ela não lê. O matiz vai para a borda, para o
ponto marcador e para o fundo em `color-mix`; o rótulo fica no claro do tema, ou no matiz misturado
a 45 % com `{colors.text}`. Motivo medido: `ghost` e `dark` como texto cheio sobre o painel dão
2,6:1.

**A Regra da Cor Nunca Sozinha.** Nenhum estado é comunicado só por cor. O confronto verde diz
"arrasa" por escrito; o vermelho diz "desvantagem"; o cinza diz "não fere". A cor confirma a palavra,
nunca a substitui.

## Typography

**Display Font:** nenhuma. O sistema não tem registro de display (ver *Do's and Don'ts*).
**Body Font:** pilha do sistema (`system-ui, sans-serif`), 14 px, entrelinha 1,4.
**Label/Mono Font:** nenhuma família separada — o papel de dado é feito por `tabular-nums` sobre a
mesma pilha.

**Character:** a voz é a da máquina que reporta: neutra, densa, sem personalidade tipográfica
própria. A escala é curta de propósito (1,2rem no topo, 14 px no corpo, 0,75em no rodapé do dado), e
quem faz o trabalho de hierarquia é o peso (600/700), a caixa alta com espacejamento largo nos
rótulos, e o par `{colors.text}` / `{colors.muted}`.

### Hierarchy
- **Title** (700, 1.2rem, 1.4, `letter-spacing: 0.02em`): `h1` e `h2`. Título de tela e de cartão.
- **Row-title** (600, 1rem, `letter-spacing: 0.02em`): nome da área na ficha. O único degrau entre o
  título e o corpo.
- **Body** (400, 14px/1.4, `tabular-nums`): todo o resto do texto e todos os números.
- **Label** (400, 0.8em, `letter-spacing: 0.08em`, caixa alta): legenda de `fieldset` e cabeçalho de
  tabela do analisador (0.06em). Também a caixa baixa forçada do selo de tipo (0.8em,
  `text-transform: lowercase`).
- **Micro** (400, 0.75em, 1.15, `letter-spacing: 0.04em`): a unidade sob o número ("xp/h", "ouro/h",
  "níveis", "confronto").

### Named Rules

**A Regra do Dígito Alinhado.** `font-variant-numeric: tabular-nums` é do `body` e toda superfície
de comparação o reafirma. Número que vai para coluna nunca usa dígito proporcional.

**A Regra do Número em Cima, Unidade Embaixo.** Uma métrica é `strong` com o valor e um `span` mudo
com a unidade, empilhados, alinhados à direita. O valor é lido; a unidade é consultada.

**A Regra do Milhar Curto.** Na ficha, 1240 vira "1,2k". A vírgula é a decimal do português e a lista
existe para comparar ordens de grandeza, não para somar. O valor cheio fica no detalhe.

## Layout

Três larguras, e cada uma corresponde a um modo de uso. **Formulário** (`.screen-auth`): 420 px,
centrado, com margem vertical de 32 px — registro e login não têm nada a comparar. **Ficha**
(`.screen-areas`): 1100 px, centrada, para o navegador de áreas e qualquer tela de leitura longa.
**Janela inteira** (`.game-grid`): a tela do jogo não rola; ocupa `100vh` numa grade de
`280px 1fr 200px` por `auto 1fr 180px`, com áreas nomeadas (`top / left center right / bottom`), e
cada painel rola por dentro. A cena fica no centro com fundo `#000` e `overflow: hidden`.

O ritmo de espaço tem quatro degraus: 4 px para o que se cola (ícone e rótulo), 8 px para o que se
agrupa (itens de uma lista, painéis do HUD), 16 px para o que se separa (padding de tela e de painel,
colunas da ficha), 32 px para o que respira sozinho (margem do cartão de formulário, estado vazio de
tela cheia). O HUD é mais apertado que as telas de leitura: 8 px onde elas usam 16.

A ficha de áreas é o caso denso: cada linha é uma grade de `1fr 7rem` (corpo e coluna de ação), e o
corpo é outra grade de seis colunas de largura declarada
(`minmax(9rem, 1fr) 4.5rem 10rem 4.5rem 4.5rem 7rem`). As larguras são fixas de propósito — com
`auto`, o texto de cada linha moveria o x de todas as colunas, que é exatamente o que a ficha existe
para não fazer.

Há um só ponto de quebra em todo o projeto: **960 px**. Abaixo dele os filtros viram uma coluna, e a
linha da ficha reflui para áreas nomeadas (`nome / faixa + métricas / espécies / confronto`),
mantendo `min-width: 4.5rem` nas métricas para que a borda direita não dance de linha para linha. A
tabela do analisador passa a rolar na horizontal em vez de quebrar.

## Elevation & Depth

**A profundidade é o bisel.** Duas `box-shadow` internas sem desfoque, clara em cima à esquerda e
escura embaixo à direita, e nada mais — sem projeção, sem borrão, sem camada de sombra solta.
É um recurso só, e ele responde à pergunta de projeto mais frequente da tela.

| Estado | Como se lê | Quem usa |
|---|---|---|
| **Levantado** | luz em cima à esquerda, sombra embaixo à direita | painel, card, botão, slot ocupado |
| **Afundado** | a luz inverte: sombra em cima à esquerda | trilho de medidor, campo, lista, vaga vazia ou travada |
| **Pressionado** | o levantado inverte enquanto o dedo está lá | botão em `:active` |

Os três planos de fundo sustentam o bisel: `{colors.noite}` fora de tudo, `{colors.painel}` no que
se levanta, `{colors.cava}` no que afunda. A cor sozinha não basta — é a direção da luz que diz se
ali se age ou se lê.

Existem duas cortinas, e elas são cortina e não sombra: o `.modal-backdrop` em preto a 60 %, e o
`.overlay` da cena em `rgb(13 17 28 / 88%)` — a cor da própria página, não um preto genérico.

### Named Rules

**A Regra da Luz.** Não se inventa um terceiro estado de profundidade. Se algo precisa se destacar
e não é "levantado" nem "afundado", então não precisa de profundidade — precisa de posição, de
peso ou do acento.

**A Regra do Plano, Não da Opacidade.** O indisponível recua de plano, não de legibilidade. A linha
de área bloqueada cai para o fundo da página, mas os números continuam em contraste cheio — é por
eles que se decide o que perseguir. O portão de nível é informação, e informação não se esmaece.

**A Regra da Borda que Responde.** O estado vive na borda e no acento. `hover`, `focus`, ativo e
aberto levam a borda para `{colors.accent}`. O fundo quase nunca muda, então nada salta nem empurra
o vizinho.

## Shapes

Retângulo, sempre. `border-radius: 0` é a única forma do sistema e está escrito explicitamente onde
alguém poderia hesitar (`.panel`, `.filter-type`). O vocabulário de traço tem dois pesos e cada um
tem um trabalho: **2 px** (`--border-w`) é estrutura — contorna painel, botão, campo, modal, toast,
linha, e é também a espessura do `outline` de foco; **1 px** é divisão interna — separa linha de
tabela, item de mochila, célula da Pokédex, e contorna o selo de tipo.

A arte é pixel art e o quadro respeita isso: `image-rendering: pixelated` no `canvas`, sprites
ampliados em múltiplos inteiros (`transform: scale(2)` no cartão de inicial e no Pokémon ativo). Na
ficha de áreas, onde os frames do atlas variam entre 32 e 64 px, a miniatura é uma caixa de tamanho
declarado que recorta e escala o sprite por dentro, para que um Rhydon de 64 px não invada a coluna
vizinha.

Medidores são barras retas sem raio: 10 px de altura para o `progress` de HP, 40 × 6 px para o
cooldown de golpe, preenchidos por `transform: scaleX()` sobre trilho `{colors.border}`.

## Components

### Buttons
- **Shape:** retângulo puro (raio 0), borda de 2 px, fundo `{colors.panel}`, padding 8 × 16 px.
- **Primary:** idêntico ao padrão, exceto pela borda em `{colors.accent}`. A ação primária se declara
  pela borda, não por fundo preenchido.
- **Hover:** a borda vai para `{colors.accent}`; nada mais muda. Botão desabilitado não responde.
- **Disabled:** `opacity: 0.5` e cursor padrão.
- **Ghost / Link:** sem borda e sem fundo, texto em `{colors.accent}` sublinhado (`.link`); usado
  dentro de frase corrida, como no estado vazio da ficha.
- **Focus:** `outline: 2px solid var(--accent)` com `outline-offset: -2px` — o anel entra para dentro
  para não empurrar o vizinho numa grade de colunas fixas.

### Chips
- **Selo de tipo:** caixa baixa, 0.8em, padding lateral de 4 px, borda de 1 px no matiz do tipo,
  fundo transparente. O rótulo é lido no claro do tema.
- **Filtro de tipo (`aria-pressed`):** o mesmo selo com um ponto marcador de 0.55em no matiz. Ligado,
  ganha fundo `color-mix(in srgb, var(--t) 28%, var(--panel))`, borda de 2 px e um anel de 2 px em
  volta do ponto. `hover` clareia o selo com `filter: brightness(1.35)`.
- **Alternador de estado (`.filter-toggle`):** botão de texto comum; ligado, borda e texto vão para
  `{colors.accent}`.

### Cards / Containers
- **Corner Style:** raio 0.
- **Background:** `{colors.panel}` sobre página `{colors.bg}`.
- **Border:** 2 px sólida em `{colors.border}`.
- **Shadow Strategy:** nenhuma — ver *Elevation & Depth*.
- **Internal Padding:** 16 px nas telas de leitura, 8 px nos painéis do HUD.

### Inputs / Fields
- **Style:** fundo `{colors.bg}` (mais escuro que o painel que o contém, então o campo afunda em vez
  de saltar), borda de 2 px, padding de 8 px, largura total, raio 0.
- **Campo numérico curto:** largura declarada em `ch` (`5ch` no filtro de nível) e texto centrado.
- **Label:** empilhado acima do campo, 4 px de distância, em `{colors.muted}`.
- **Error:** parágrafo `role="alert"` em `{colors.danger}` com `min-height: 1.2em` reservada, para
  que a mensagem não empurre o formulário ao aparecer.

### Navigation
- **Abas (`.tabs`):** botões lado a lado com 8 px entre eles; a ativa se marca pela borda em
  `{colors.accent}`.
- **Barra superior do HUD:** uma faixa de painel com `flex-wrap`, 8/16 px de espaço, atalhos à
  esquerda e a intenção de sair empurrada para a ponta direita por `margin-left: auto`.
- **Indicador de conexão:** só texto colorido — `{colors.ok}` aberto, `{colors.accent}` reconectando
  ou recuperando, `{colors.danger}` caído.

### Modais
- **Uso:** tarefas de resolver-e-voltar (time, mochila, loja, Pokédex, configurações).
- **Forma:** `min(560px, 92vw)`, `max-height: 86vh`, painel com borda de 2 px, cabeçalho com divisor
  de 2 px e fechar sem moldura.
- **Não se usa modal para detalhe que será comparado** — ver a regra da gaveta.

### Ficha de áreas (componente-assinatura)
A recusa deliberada da grade de cartões. Cada área é uma `li` em grade de duas colunas: o corpo é um
único `button` (o que abre o detalhe) e a ação de caçar fica **fora** dele, porque botão dentro de
botão não existe em HTML. Dentro do corpo, seis colunas de largura declarada: nome, faixa de níveis,
espécies (até quatro miniaturas mais "+N" e até três selos de tipo), XP/h, ouro/h, confronto. As três
métricas usam `display: contents` para serem células próprias da grade da linha, e não um bloco
aninhado — só assim ficam na mesma coluna em todas as linhas.

Estados: disponível (painel levantado), aberta (borda em acento), bloqueada (fundo de página, título
em `{colors.muted}`, e no lugar do botão um selo `nível N` em `{colors.accent}` sobre
`color-mix(in srgb, var(--accent) 12%, transparent)`). Enquanto o time e a Pokédex não chegam, as
células mostram travessão e "…calculando" com `aria-busy`, em vez de anunciar zero como se fosse
medida.

### Gaveta do analisador (componente-assinatura)
O detalhe abre dentro da própria ficha, colado sob a linha escolhida: `margin-top` negativo de 8 px
para encostar, borda de 2 px em `{colors.accent}` sem borda superior (ela continua a borda da linha),
fundo `{colors.bg}`, padding de 16 px. Dentro, uma tabela de colunas colapsadas: cabeçalho em caixa
alta e `{colors.muted}`, primeira coluna com `width: 100%` para absorver a sobra, colunas numéricas
alinhadas à direita com `white-space: nowrap`, e divisores de 1 px só entre linhas do corpo.

## Do's and Don'ts

### Do:
- **Do** usar a borda como canal de estado: 2 px em `{colors.border}` em repouso, `{colors.accent}` em
  `hover`, foco, ativo e aberto.
- **Do** declarar largura de coluna sempre que uma tela existir para comparar linhas. `auto` deixa o
  conteúdo mover o alinhamento, e o alinhamento é a comparação.
- **Do** escrever o estado por extenso junto da cor ("arrasa", "não fere", "faltam 2 na Pokédex").
- **Do** distinguir "ainda não sei" de "medi e deu zero": enquanto o dado não chega, travessão e
  `aria-busy`, nunca um zero formatado.
- **Do** recuar de plano (fundo `{colors.bg}`) para marcar o indisponível, mantendo os números em
  contraste cheio.
- **Do** manter `tabular-nums` em qualquer número que entre em coluna.
- **Do** abrir o detalhe em gaveta, dentro da lista, quando o jogador vai abrir uma, olhar, fechar e
  abrir a vizinha. Modal só para tarefa que se resolve e se fecha.
- **Do** escalar sprite em múltiplo inteiro e recortá-lo numa caixa de tamanho declarado quando o
  frame do atlas variar.
- **Do** respeitar `prefers-reduced-motion: reduce` desligando animação e transição, como faz a ficha
  de áreas.

### Don't:
- **Don't** introduzir raio de canto. O sistema é de raio zero e a exceção não tem onde se apoiar.
- **Don't** usar sombra para elevar. Profundidade aqui é plano e borda; o único `box-shadow` do
  projeto é anel de estado.
- **Don't** pintar texto com o matiz cru de um tipo sobre o painel. Misture com `{colors.text}` (a
  ficha usa 45 %) ou deixe o matiz só na borda e no ponto.
- **Don't** transformar uma comparação em grade de cartões iguais. Cartão lado a lado é legítimo para
  escolha única e irreversível (a tela de inicial), não para ler a mesma coluna em oito linhas.
- **Don't** animar o que muda a caixa. O movimento que existe é de borda (120 ms `ease-out`) e de
  entrada da gaveta (160 ms `cubic-bezier(0.16, 1, 0.3, 1)`, opacidade e 4 px de `translateY`).
- **Don't** aninhar botão dentro de botão para caber uma ação secundária na linha; a ação sai para
  uma coluna própria.
- **Don't** apagar informação para indicar bloqueio. `opacity` esconde o número que justifica a meta.
- **Don't** acrescentar um segundo acento. Se dois elementos disputam destaque na mesma tela, o
  problema é de posição, não de cor.

## Estado conhecido

Duas coisas são verdade no código de hoje e ficam registradas como dívida, não como regra:

1. **O selo de tipo global ainda não foi corrigido.** A regra `.type` em `layout.css` pinta o matiz
   cru como texto sobre o painel; para `ghost` e `dark` isso fica abaixo de 4,5:1 (medido em ~2,6:1).
   A ficha de áreas já sobrepõe essa regra localmente com `color-mix`; a tela de inicial e os modais
   ainda usam o tratamento original. A regra do sistema é a da ficha — as outras telas é que estão
   atrasadas.
2. **O sistema não tem registro de display.** A voz tipográfica é a pilha do sistema e a escala é
   plana: `h1` a 1,2rem contra um corpo de 14 px, sem família própria e sem um degrau real de título.
   Isso é uma lacuna do mundo, não uma decisão a ser herdada: uma tela nova não deve tomar
   `system-ui` a 1,2rem como se fosse o display do projeto.
