---
name: Pokeidle
description: A caderneta de campo do treinador — papel, couro e latão em volta, e o mundo pixelado no meio com a cor toda.
colors:
  mesa: "#33261f"
  papel-luz: "#fff8e8"
  papel-alto: "#f5ecd6"
  papel: "#e9ddbe"
  papel-cava: "#d3c49f"
  couro: "#a07556"
  couro-luz: "#d0a684"
  couro-sombra: "#5d4438"
  tinta: "#2c211a"
  tinta-fraca: "#5a4938"
  marca: "#f7d979"
  marca-borda: "#97791d"
  ouro: "#6f5310"
  ouro-cheio: "#d9a521"
  xp: "#1a698c"
  xp-cheio: "#56c4f1"
  perigo: "#8f2820"
  ok: "#2c6431"
  hp: "#398e45"
  type-normal: "#a8a878"
  type-fire: "#f08030"
  type-water: "#6890f0"
  type-electric: "#f8d030"
  type-grass: "#78c850"
  type-ice: "#98d8d8"
  type-fighting: "#c03028"
  type-poison: "#a040a0"
  type-ground: "#e0c068"
  type-flying: "#a890f0"
  type-psychic: "#f85888"
  type-bug: "#a8b820"
  type-rock: "#b8a038"
  type-ghost: "#705898"
  type-dragon: "#7038f8"
  type-dark: "#705848"
  type-steel: "#b8b8d0"
  type-fairy: "#ee99ac"
typography:
  title:
    fontFamily: "'Pixelify Sans', 'Courier New', monospace"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  name:
    fontFamily: "'Pixelify Sans', 'Courier New', monospace"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  body:
    fontFamily: "'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  data:
    fontFamily: "'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  none: "0"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "16px"
  "4": "32px"
  "5": "48px"
components:
  button:
    backgroundColor: "{colors.papel-alto}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    typography: "{typography.data}"
  button-hover:
    backgroundColor: "{colors.papel-alto}"
    textColor: "{colors.tinta}"
  button-primary:
    backgroundColor: "{colors.couro-sombra}"
    textColor: "{colors.papel-alto}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-disabled:
    backgroundColor: "{colors.papel-alto}"
    textColor: "{colors.tinta-fraca}"
  button-nav:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-fraca}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
  input:
    backgroundColor: "{colors.papel-cava}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "8px"
    width: "100%"
  panel:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  panel-sunken:
    backgroundColor: "{colors.papel-cava}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  panel-floating:
    backgroundColor: "{colors.papel-alto}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  meter-track:
    backgroundColor: "{colors.mesa}"
    rounded: "{rounded.none}"
  chip:
    backgroundColor: "{colors.papel-cava}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "1px 4px"
    typography: "{typography.label}"
  row-selected:
    backgroundColor: "{colors.marca}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  type-badge:
    backgroundColor: "{colors.papel-alto}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "0 4px"
    typography: "{typography.label}"
  toast:
    backgroundColor: "{colors.papel-alto}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    width: "360px"
---

# Design System: Pokeidle

## Overview

**Creative North Star: "A Caderneta de Campo"**

A interface é o caderno de quem anda pelo mundo. Papel, couro e latão em volta; o mundo pixelado
no meio, com a cor toda. O chrome **emoldura** o jogo em vez de competir com ele.

Duas versões anteriores erraram na mesma direção. A primeira foi desenhada como terminal de campo
— escura, chapada — e lia como dashboard. A segunda trocou o terminal por moldura com bisel, o
que resolveu a gramática mas manteve a cor: azul-noite `#131826` com bronze e um acento amarelo,
que é a combinação de fábrica de todo idle de navegador. Ela não tinha nada a ver com o verde e a
terra que emoldurava, e não declarava **nenhuma** `font-family` — a interface inteira rodava na
fonte padrão do navegador enquanto o jogo dentro dela era pixel art.

O que resolve as duas coisas de uma vez é a mesma decisão: **o chrome sai do mundo**.

### A cor não foi inventada

Cada superfície é um material do atlas, medido no próprio PNG por
`tools/assets/scripts/cores-do-mundo.ts` (`pnpm cores`):

| material do mundo | medido | vira |
|---|---|---|
| areia da praia | `#dcd2ac` | `{colors.papel}`, a folha |
| terra batida da trilha | `#a97c5c` | `{colors.couro}`, a moldura |
| rocha de caverna | `#614846` | `{colors.couro-sombra}` e `{colors.mesa}` |
| campo | `#3a8f45` | `{colors.hp}` |
| água | `#57c4f1` | `{colors.xp-cheio}` |

Quem olha a tela e o mapa vê o mesmo mundo porque **é** o mesmo mundo. Quando o tileset mudar,
`pnpm cores` remede e a paleta acompanha; sem isso, a próxima geração de terreno faria a interface
e o mapa deixarem de combinar em silêncio.

**Key Characteristics:**
- Superfície clara de papel em quatro planos, moldura de couro; o mundo é a coisa saturada da tela
- Dois registros de profundidade com significados diferentes: bisel entalha, sombra projetada flutua
- Nenhuma "cor de acento": ênfase é o couro invertido, e a cor fica livre para significar
- Um marca-texto, com um trabalho só no sistema inteiro: qual linha é a de agora
- Duas faces auto-hospedadas — bitmap para nome e título, Atkinson para todo o resto
- Dezoito matizes canônicos de tipo, como identidade, nunca como texto sozinho
- Movimento quase ausente: 120 ms no medidor, 200 ms no que troca de estado, e nada mais

## Colors

Dezenove papéis tirados do mundo, contra dezoito matizes canônicos de tipo que entram só onde
identificam uma espécie. Todo par que a interface pinta é medido em
`packages/client/test/styles/contraste.test.ts` — a paleta não passa por aprovação de olho.

### Primary
Não existe cor primária de marca, e a ausência é a decisão. Ação primária e seleção são desenhadas
**invertendo o couro** (`{colors.couro-sombra}` de fundo, `{colors.papel-alto}` de texto), que é o
material da própria caderneta. Uma cor de acento a mais aqui seria uma cor a menos disponível para
dizer o que é moeda, o que é vida e o que é perigo.

### Secondary
- **Marca-texto** (`{colors.marca}`, borda `{colors.marca-borda}`): o amarelo elétrico que o projeto
  usava como acento sobreviveu no único papel que papel comporta — grifo. Marca **a linha de agora**
  e nada mais: o slot do Pokémon em campo, a aba atual.
- **Ouro** (`{colors.ouro}` em texto, `{colors.ouro-cheio}` em preenchimento): moeda, recompensa,
  portão de nível, marco no log, recarga de golpe.
- **Verde Saudável** (`{colors.ok}`): confirmado — conexão aberta, confronto vantajoso.
- **Vermelho de Alerta** (`{colors.perigo}`): erro, alerta, conexão caída, HP crítico. Nunca decorativo.
- **Vida e experiência** (`{colors.hp}`, `{colors.xp}` em texto, `{colors.xp-cheio}` em barra).

### Tertiary
**As dezoito cores de tipo** (`{colors.type-normal}` … `{colors.type-fairy}`): os matizes canônicos
da série. Identificam espécie e filtro; entram em borda e em fundo por `color-mix`, e chegam ao
texto só depois de escurecidos contra o papel.

### Neutral
- **Mesa** (`{colors.mesa}`): fora de tudo, e o fundo de toda fenda. A tarja que sobra em volta do
  mundo é a mesa, não um preto avulso.
- **Papel** (`{colors.papel}`): a folha. `{colors.papel-alto}` é o degrau que se levanta,
  `{colors.papel-cava}` o que afunda, `{colors.papel-luz}` só o fio iluminado da quina do bisel.
- **Couro** (`{colors.couro}`, luz `{colors.couro-luz}`, sombra `{colors.couro-sombra}`): moldura,
  divisor, anel de foco.
- **Tinta** (`{colors.tinta}`) e **tinta fraca** (`{colors.tinta-fraca}`): texto corrente e rótulo.
  A secundária é tingida do próprio papel, nunca cinza.

### Named Rules

**A Regra da Cor Que Significa.** Cor não decora. Se um elemento precisa de destaque e não é moeda,
perigo, vida, experiência ou a linha de agora, ele precisa de **posição ou peso**, não de matiz.

**A Regra do Material Duplo.** Um material que aparece em texto e em preenchimento tem **dois**
tokens, porque os dois papéis exigem contrastes opostos: o valor em texto vive sobre papel claro e
precisa ser escuro (`{colors.ouro}`, `{colors.xp}`); o preenchimento vive dentro da fenda escura do
medidor e precisa ser claro (`{colors.ouro-cheio}`, `{colors.xp-cheio}`). Um token só reprovaria
num dos dois, sempre.

**A Regra do Grifo Único.** O marca-texto marca a linha de agora. Gastá-lo também no log, na
situação e no estado de combate o transformaria em decoração — e aí ele não marcaria mais nada.

**A Regra do Tipo na Borda.** A cor de tipo identifica; ela não lê. Os dezoito matizes foram
desenhados como preenchimento sobre fundo claro, e `electric`, `ice` e `ground` como texto puro
sobre papel ficam abaixo de 2:1.

**A Regra da Cor Nunca Sozinha.** Nenhum estado é comunicado só por cor. HP ferido muda de cor **e**
de comprimento; o confronto diz "arrasa" por escrito; a recarga pronta fica verde **e** cheia.

## Typography

**Display Font:** Pixelify Sans (bitmap, variável 400–700), auto-hospedada.
**Body Font:** Atkinson Hyperlegible (400/700), auto-hospedada.
**Label/Mono Font:** nenhuma terceira família — o papel de dado é `tabular-nums` sobre a Atkinson.

As duas são OFL e vivem em `packages/client/src/styles/fontes/`, só no subconjunto latin (35 KB no
total). São auto-hospedadas de propósito: o jogo roda em VPS própria e não entrega o IP de quem
joga a um CDN de terceiros para desenhar texto.

### A face de HUD tem duas restrições duras

As duas foram descobertas **na tela**, não no papel, e as duas são verificadas por teste em
`packages/client/test/styles/tokens.test.ts`:

1. **Só de 18 px para cima.** Abaixo disso a grade de pixels cai fora do grid de tela e a forma
   apodrece: "Configurações" saiu renderizado como "ConAgurações".
2. **Nunca em número.** No corpo desta face o 5 e o 8 têm quase a mesma silhueta. A coluna de poder
   dos golpes mostrava 95, 50 e 35 e se lia 98, 80 e 38; o cartão do ativo dizia "L68" enquanto o
   rótulo no mundo, ao lado, dizia L65.

Sobra para ela exatamente o que ela faz bem: **nome próprio e título**, grandes. Todo o resto —
número, rótulo miúdo, texto de botão, prosa — é da Atkinson.

### Hierarchy
- **Title** (Pixelify, 700, 1.5rem): `h1`. Título de tela.
- **Name** (Pixelify, 700, 1.125rem): `h2`, nome do treinador, nome do Pokémon ativo, nome da área.
- **Body** (Atkinson, 400, 0.9375rem/1.45, `tabular-nums`): prosa, mensagem, linha de log.
- **Data** (Atkinson, 400, 0.8125rem): dado denso — ficha de áreas, faixa do time, lista de golpes.
- **Label** (Atkinson, 700, 0.6875rem, `letter-spacing: 0.12em`, caixa alta): rótulo de unidade,
  cabeçalho de seção, legenda de filtro.

A razão entre degraus é curta (~1,2) de propósito: interface de tarefa tem muito mais elemento de
texto que página de marca, e contraste exagerado vira ruído.

### Named Rules

**A Regra do Dígito Alinhado.** `tabular-nums` é do `body` e toda superfície de comparação o
reafirma. Número que vai para coluna nunca usa dígito proporcional.

**A Regra do Rótulo Uma Vez.** O rótulo de uma coluna sai no alto dela, não em cada linha. A lista
de golpes existe para comparar oito golpes, e comparar é ler a mesma coluna de cima a baixo;
repetir "poder" em cada linha empurra os números para posições diferentes e desfaz a coluna.

**A Regra do Nome Separado do Valor.** Nome é identidade, nível é valor. Eles são nós diferentes,
com faces diferentes — e é por isso que o cartão do ativo e a faixa do time mostram o mesmo Pokémon
do mesmo jeito.

## Depth

Dois registros, e cada um diz uma coisa diferente. Gastar os dois **por papel** é o ponto: antes
havia um bisel só, carimbado em painel, botão, chip e moldura por igual, e ênfase uniforme em tudo
é o mesmo que ênfase em nenhum.

**O bisel** — duas `box-shadow` internas sem desfoque, clara em cima à esquerda e escura embaixo à
direita. Diz *"isto é entalhado no papel"*. Vale para botão, campo, painel de seção e trilho de
medidor. É CSS, não asset: fica nítido em qualquer tamanho e muda de cor por token, coisa que um
9-slice em PNG não faz.

**A sombra projetada** — com deslocamento **e** desfoque de verdade. Diz *"isto está por cima da
caderneta"*. Vale para modal e toast. Papel sobre papel projeta sombra; papel entalhado, não.

**Nem um nem outro** — chip, selo de tipo, célula de lista. Eles recebem no máximo um fio de 1px em
`{colors.couro}` ou um tingimento de fundo, porque não são objetos separados: são marcas no papel.

A luz inverte para separar função sem gastar cor: **o que age se levanta, o que se lê afunda**. A
fenda (`{colors.papel-cava}` com o bisel invertido) é onde se lê; o trilho do medidor é uma fenda
cortada **através** do papel, e o que aparece no fundo dela é `{colors.mesa}`. É esse fundo escuro
que deixa a barra de vida e a de experiência atingirem contraste.

## Layout

Três larguras, uma por modo de uso.

**Formulário** (`.screen-auth`): 420 px, centrado — registro e login não têm nada a comparar.

**Folha** (qualquer `.screen` que não seja a do jogo): até 1280 px, centrada, com papel por baixo
do conteúdo inteiro e a mesa aparecendo só na margem. Sem isso, título e rótulo ficavam em tinta
escura direto sobre a mesa escura — 1,3:1, e "Onde caçar" simplesmente não aparecia.

**Janela inteira** (`.game-grid`): a tela do jogo não rola. Ocupa `100vh` numa grade de
`280px 1fr 260px` por `auto 1fr clamp(88px, 13vh, 150px)`, com áreas nomeadas
(`top / left center right / bottom`), e cada painel rola por dentro. Abaixo de 900 px a grade
empilha e a coluna do time vira faixa horizontal — escondê-la deixaria quem joga no celular sem
nenhum caminho para trocar o Pokémon ativo.

O ritmo tem cinco degraus: 4 px para o que se cola, 8 px para o que se agrupa, 16 px para o que se
separa, 32 px para o que respira, 48 px para margem de página. O HUD é mais apertado que as telas
de leitura: 8 px onde elas usam 16.

## Motion

Interface de tarefa reage; não coreografa. Há dois tempos e um só formato de curva: 120 ms para o
preenchimento de medidor, 200 ms para o que troca de estado, e `cubic-bezier(0.16, 1, 0.3, 1)`
quando a curva importa. Não existe entrada animada de seção, nem sequência de carregamento.
`prefers-reduced-motion` zera tudo.

## Accessibility

- **Contraste medido, não estimado.** Todo par que a interface pinta está em
  `contraste.test.ts`, com o mínimo do seu papel (4,5:1 para texto, 3:1 para limite de componente
  e preenchimento de medidor). O teste tem âncora própria: preto sobre branco tem que dar 21:1,
  senão a régua está quebrada e todos os pares "passariam".
- **Alvo de 24 px** (WCAG 2.2 SC 2.5.8) em todo botão, `[role=button]` e rótulo de caixa de marcar,
  a partir do token `--alvo`.
- **Foco visível** em anel de 2 px de `{colors.couro-sombra}` com 2 px de folga, global, só no foco
  por teclado.
- **As superfícies do navegador são tematizadas**: seleção de texto, cursor, barra de rolagem,
  `accent-color` e deslocamento de sublinhado. É o sinal mais barato de que a tela foi desenhada e
  não montada, e o que mais se esquece.
- **Cor nunca sozinha** (ver *Named Rules* em Colors).

## Do's and Don'ts

**Do**
- Tire cor nova do atlas, com `pnpm cores`, antes de inventar uma.
- Dê ao número a face de leitura, sempre, em qualquer tamanho.
- Gaste bisel no que se aperta e sombra no que flutua; deixe o resto sem nenhum dos dois.
- Escreva o rótulo da coluna uma vez, no alto.
- Ponha o par novo de cores no teste de contraste junto com a regra que o usa.

**Don't**
- Não invente um acento. Se precisa de destaque, use posição, peso ou a inversão do couro.
- Não use o marca-texto em mais de um papel por tela.
- Não ponha a face de HUD abaixo de 18 px nem em cima de um dígito.
- Não use emoji ou glifo Unicode como ícone: o sistema não tem biblioteca de ícones, e o primeiro
  glifo seria o primeiro ícone dela.
- Não arredonde canto: o mundo é de canto reto.
- Não escreva cor literal em folha de estilo. Se falta um valor, falta um token.
