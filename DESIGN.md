---
name: Pokeidle
description: Interface de MMO de Pokémon — moldura de madeira desenhada sobre penumbra, e o mundo pixelado como a única coisa saturada da tela.
colors:
  fora: "#15110e"
  painel: "#2b231c"
  painel-alto: "#3a3026"
  cava: "#12100d"
  madeira-luz: "#c9a173"
  madeira: "#a97c5c"
  madeira-escura: "#5d4438"
  tinta: "#f2e7d6"
  tinta-fraca: "#b0a08c"
  marca: "#f7d979"
  marca-borda: "#c9a227"
  ouro: "#e8b53c"
  ouro-cheio: "#d9a521"
  xp: "#6ec6ef"
  xp-cheio: "#56c4f1"
  perigo: "#f07368"
  ok: "#6ecb78"
  hp: "#4fb35d"
  type-fire: "#f08030"
  type-water: "#6890f0"
  type-grass: "#78c850"
  type-electric: "#f8d030"
  type-normal: "#a8a878"
  type-poison: "#a040a0"
  type-ground: "#e0c068"
  type-flying: "#a890f0"
  type-psychic: "#f85888"
  type-bug: "#a8b820"
  type-rock: "#b8a038"
  type-ghost: "#705898"
  type-ice: "#98d8d8"
  type-dragon: "#7038f8"
  type-fighting: "#c03028"
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
    backgroundColor: "{colors.painel-alto}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "2px 4px"
    typography: "{typography.data}"
  button-hover:
    backgroundColor: "{colors.painel-alto}"
    textColor: "{colors.marca}"
  button-primary:
    backgroundColor: "{colors.painel-alto}"
    textColor: "{colors.marca}"
    rounded: "{rounded.none}"
    padding: "2px 4px"
  button-pressed:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.tinta}"
  button-disabled:
    backgroundColor: "{colors.painel-alto}"
    textColor: "{colors.tinta-fraca}"
  button-nav:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-fraca}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
  input:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "2px 4px"
    width: "100%"
  panel:
    backgroundColor: "{colors.painel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  panel-sunken:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  panel-floating:
    backgroundColor: "{colors.painel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
  meter-track:
    backgroundColor: "{colors.cava}"
    rounded: "{rounded.none}"
  chip:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "1px 4px"
    typography: "{typography.label}"
  row-selected:
    backgroundColor: "{colors.marca}"
    textColor: "{colors.fora}"
    rounded: "{rounded.none}"
  type-badge:
    backgroundColor: "{colors.painel-alto}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "0 4px"
    typography: "{typography.label}"
  toast:
    backgroundColor: "{colors.painel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    width: "360px"
---

# Design System: Pokeidle

## Overview

**Creative North Star: "Madeira sobre penumbra"**

A interface é o HUD de um MMO de Pokémon: moldura de madeira, painéis escuros, e o mundo pixelado
como a única coisa saturada da tela. O chrome **emoldura** o jogo em vez de competir com ele.

### A moldura é arte, não CSS

Esta é a decisão central, e as três versões anteriores caíram por não tê-la. A primeira foi
desenhada como terminal de campo e lia como dashboard. A segunda trocou o terminal por moldura
com bisel — duas `box-shadow` internas — e a terceira trocou a cor por papel e couro. Todas as
três continuaram desenhando moldura com CSS, e o veredito do usuário foi o mesmo nas três:
**parece página web, não jogo**.

O veredito estava certo, e o teto é estrutural. `box-shadow` não tem canto desenhado, não tem
textura e não tem estado apertado. Dá para acertar contraste, hierarquia e espaçamento em cima
dela e ainda entregar um site tematizado.

Agora cada superfície usa `border-image` sobre uma peça de 32×32 do **UI Pack Pixel Adventure do
Kenney** (CC0), repintada na paleta do nosso atlas por `pnpm ui`
(`tools/assets/scripts/ui-moldura.ts`). Painel, botão, fenda e botão apertado saem do **mesmo**
tile de origem, com a moldura idêntica e só o miolo mudando de profundidade — arte nova não é
preciso, e a família fica óbvia na tela.

O recorte: a peça tem 32 px e a madeira ocupa 6 px de cada lado. `border-image-slice: 6 fill`
corta os nove pedaços, `border-width` é sempre um **múltiplo inteiro** de 6 (12 px em painel e
botão, 6 px em linha de lista), e `border-image-repeat: repeat` faz as laterais ladrilharem em
vez de esticarem. É o que mantém o pixel quadrado em qualquer tamanho de painel.

### A cor não foi inventada

A madeira da moldura é a **terra batida da trilha** do nosso próprio mapa, medida no PNG do atlas
por `pnpm cores` (`tools/assets/scripts/cores-do-mundo.ts`):

| material do mundo | medido | vira |
|---|---|---|
| terra batida da trilha | `#a97c5c` | `{colors.madeira}`, a moldura |
| rocha de caverna | `#614846` | `{colors.madeira-escura}` |
| campo | `#3a8f45` | `{colors.hp}` |
| água | `#57c4f1` | `{colors.xp-cheio}` |

Quem olha a tela e o mapa vê o mesmo mundo porque **é** o mesmo mundo. Quando o tileset mudar,
`pnpm cores` remede, `pnpm ui` repinta, e a casca acompanha; sem isso, a próxima geração de
terreno faria a interface e o mapa deixarem de combinar em silêncio.

**Key Characteristics:**
- Moldura desenhada em `border-image`, nunca em `box-shadow`; largura sempre múltipla de 6 px
- Penumbra em quatro planos, madeira na moldura; o mundo é a coisa saturada da tela
- Nenhuma "cor de acento": a ênfase é o grifo, e a cor fica livre para significar
- Um marca-texto, com um trabalho só no sistema inteiro: qual linha é a de agora
- Duas faces auto-hospedadas — bitmap para nome e título, Atkinson para todo o resto
- Dezoito matizes canônicos de tipo, como identidade, nunca como texto sozinho
- Movimento quase ausente: 120 ms no medidor, 200 ms no que troca de estado, e nada mais

## Colors

Dezoito papéis, contra dezoito matizes canônicos de tipo que entram só onde identificam uma
espécie. Todo par que a interface pinta é medido em
`packages/client/test/styles/contraste.test.ts` — a paleta não passa por aprovação de olho.

### Primary
Não existe cor primária de marca, e a ausência é a decisão. A ação primária é a mesma moldura de
madeira com o rótulo em `{colors.marca}`. Uma cor de acento a mais aqui seria uma cor a menos
disponível para dizer o que é moeda, o que é vida e o que é perigo.

### Secondary
- **Marca-texto** (`{colors.marca}`, borda `{colors.marca-borda}`): o amarelo elétrico que o projeto
  usava como acento sobrevive no único trabalho que comporta — grifo. Marca **a linha de agora** e
  nada mais: o slot do Pokémon em campo, a aba atual, a linha aberta na ficha.
- **Ouro** (`{colors.ouro}` em texto, `{colors.ouro-cheio}` em preenchimento): moeda, recompensa,
  portão de nível, marco no log, recarga de golpe.
- **Verde Saudável** (`{colors.ok}`): confirmado — conexão aberta, confronto vantajoso.
- **Vermelho de Alerta** (`{colors.perigo}`): erro, alerta, conexão caída, HP crítico. Nunca decorativo.
- **Vida e experiência** (`{colors.hp}`, `{colors.xp}` em texto, `{colors.xp-cheio}` em barra).

### Tertiary
**As dezoito cores de tipo** (`{colors.type-normal}` … `{colors.type-fairy}`): os matizes canônicos
da série. Identificam espécie e filtro; entram em borda e em fundo por `color-mix`, e chegam ao
texto só depois de misturados com a tinta do tema. Não existe fonte canônica publicada para eles —
a Pokémon Company nunca divulgou hex, e a PokéAPI não traz cor de tipo.

### Neutral
- **Fora** (`{colors.fora}`): fora de tudo, e a tarja em volta do mundo. É o valor que
  `scene/app.ts` lê do token para pintar o fundo do renderizador, para os dois não divergirem.
- **Painel** (`{colors.painel}`): o miolo do painel. `{colors.painel-alto}` é o do botão levantado,
  `{colors.cava}` o da fenda. Os três batem com os miolos pintados nos PNGs das molduras; se um
  mudar, o outro muda junto.
- **Madeira** (`{colors.madeira}`, luz `{colors.madeira-luz}`, escura `{colors.madeira-escura}`): as
  três cores da moldura, o fio que separa listas, e o anel de foco.
- **Tinta** (`{colors.tinta}`) e **tinta fraca** (`{colors.tinta-fraca}`): texto corrente e rótulo.
  A secundária é puxada do próprio marrom da madeira, nunca cinza.

### Named Rules

**A Regra da Cor Que Significa.** Cor não decora. Se um elemento precisa de destaque e não é moeda,
perigo, vida, experiência ou a linha de agora, ele precisa de **posição ou peso**, não de matiz.

**A Regra do Material Duplo.** Um material que aparece em texto e em preenchimento tem **dois**
tokens, porque os dois papéis pedem contrastes opostos: o valor em texto vive sobre o painel; o
preenchimento vive dentro da fenda, mais escura ainda. Um token só reprovaria num dos dois.

**A Regra do Grifo Invertido.** Num mundo escuro o grifo é a **única** ilha clara, então quem
escreve em cima dele escreve com `{colors.fora}`. Foi exatamente isto que a troca do mundo claro
para o escuro quebrou em sete lugares de uma vez.

**A Regra do Tipo na Borda.** A cor de tipo identifica; ela não lê. Os dezoito matizes foram
desenhados como preenchimento sobre fundo claro, então sobre a penumbra entram clareados, em fundo
tingido e borda.

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
- **Name** (Pixelify, 700, 1.125rem): `h2`, nome do treinador, nome do Pokémon ativo.
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

Dois registros, e cada um diz uma coisa diferente.

**A moldura desenhada** diz *"isto é um objeto"*: painel, botão, campo, fenda. Ela vem do PNG, e o
estado apertado é **outra peça**, trocada no `:active` — não uma simulação com sombra.

**A sombra projetada** — com deslocamento e desfoque de verdade — diz *"isto está por cima de
tudo"*. Vale para modal e toast, e para mais nada.

**Nem um nem outro**: chip, selo de tipo, célula de lista, linha de tabela. Eles recebem no máximo
um fio de 1px em `{colors.madeira}` ou um tingimento de fundo, porque não são objetos separados.

A luz separa função sem gastar cor: **o que age se levanta, o que se lê afunda**. A fenda
(`{colors.cava}`) é onde se lê, e o miolo quase preto dela é o que deixa a barra de vida e a de
experiência atingirem contraste.

## Layout

Três larguras, uma por modo de uso.

**Formulário** (`.screen-auth`): 420 px, centrado — registro e login não têm nada a comparar.

**Folha** (qualquer `.screen` que não seja a do jogo): até 1280 px, centrada, com a moldura de
painel em volta do conteúdo e a penumbra aparecendo só na margem.

**Janela inteira** (`.game-grid`): a tela do jogo não rola. Ocupa `100vh` numa grade de
`300px 1fr 260px` por `auto 1fr clamp(76px, 12vh, 140px)`, com áreas nomeadas
(`left menu right / left center right / left bottom right`), e cada painel rola por dentro.

As três colunas são agrupadas por **pergunta**, e não por tipo de componente:

| coluna | responde | o que carrega |
|---|---|---|
| esquerda | quem eu sou | identidade, nível com XP, ouro, área, Pokémon em campo, time |
| centro | o que está acontecendo | menu de funções, o mundo, o registro |
| direita | o que meu Pokémon pode fazer | golpes e situação |

O **menu de funções fica no alto do centro**, numa linha de alvos iguais, e não numa barra que
atravessa a tela. Em barra, cinco atalhos de texto disputavam a faixa com a identidade e com
"Parar"/"Sair", e numa tela estreita a fila quebrava em três linhas de moldura comendo a altura do
mundo. O par que muda o **estado da sessão** fica numa faixa à parte, à direita da grade: ele é a
única coisa ali que não apenas abre um painel.

Abaixo de 900 px a grade empilha na ordem `menu / mundo / combate / perfil / registro` — o jogo
antes do perfil, porque uma coluna de identidade inteira empurraria o mundo para fora da primeira
tela. A rolagem aninhada some junto: numa página que já rola, painel que rola por dentro esconde
conteúdo sem nenhum sinal de que ele existe.

O ritmo tem cinco degraus: 4 px para o que se cola, 8 px para o que se agrupa, 16 px para o que se
separa, 32 px para o que respira, 48 px para margem de página.

## Motion

Interface de tarefa reage; não coreografa. Há dois tempos e um só formato de curva: 120 ms para o
preenchimento de medidor, 200 ms para o que troca de estado, e `cubic-bezier(0.16, 1, 0.3, 1)`
quando a curva importa. Não existe entrada animada de seção, nem sequência de carregamento.
`prefers-reduced-motion` zera tudo.

## Accessibility

- **Contraste medido, não estimado.** Todo par que a interface pinta está em `contraste.test.ts`,
  com o mínimo do seu papel (4,5:1 para texto, 3:1 para limite de componente e preenchimento de
  medidor). O teste tem âncora própria: preto sobre branco tem que dar 21:1, senão a régua está
  quebrada e todos os pares "passariam".
- **Alvo de 24 px** (WCAG 2.2 SC 2.5.8) em todo botão, `[role=button]` e rótulo de caixa de marcar.
- **Foco visível** em anel de 2 px de `{colors.madeira-luz}` com 2 px de folga, global, só no foco
  por teclado.
- **As superfícies do navegador são tematizadas**: seleção de texto, cursor, barra de rolagem,
  `accent-color` e deslocamento de sublinhado.
- **Cor nunca sozinha** (ver *Named Rules* em Colors).

## O mapa

Escolher onde caçar é uma decisão sobre o **mundo**, e o mundo se vê de relance. O mapa é um
**modal** e não uma tela, e a razão é de produto: durante uma caçada, sair para uma tela significa
parar de caçar. O modal abre por cima, o jogo continua rodando atrás, e trocar de área é um clique.

- **A imagem é gerada**, não ilustrada: `pnpm assets region-preview` compõe o mapa a partir das
  mesmas áreas que o servidor simula. O mapa-múndi é o chão que o jogador pisa, então não pode
  divergir do jogo — um desenho à parte divergiria no primeiro ajuste de terreno.
- **O marcador é um medalhão** com o sprite da primeira espécie e a faixa de nível pendurada
  embaixo. Antes era uma plaqueta com o nome da área, e nome não responde à pergunta que se faz
  olhando um mapa: *o que mora ali*. Um Butterfree responde na hora; "Bosque Denso" manda abrir a
  ficha para descobrir.
- **O analisador é o mesmo componente da tela de áreas.** Reusar em vez de desenhar outro é o que
  impede os dois lugares de darem números diferentes para a mesma área.
- **Trocar de área é parar e começar**, nessa ordem, e o rótulo do botão diz isso ("Trocar para
  esta área"). O servidor recusa uma segunda caçada enquanto houver uma ativa, e com razão: a
  sessão precisa ser fechada e o progresso gravado. Esconder isso atrás de "Caçar aqui" seria
  mentir sobre uma ação que grava progresso.

## Ícones

Existem, e são **elementos**, nunca `background` de quem os contém. A moldura usa `border-image`
com `fill`, e o `fill` pinta o miolo da peça por cima de qualquer `background` — um ícone posto
como fundo de botão simplesmente não aparece. A mesma armadilha derruba o grifo da aba ativa, que
por isso declara `border-image-source: none`.

As peças vêm do **Pixel UI Icons do VerzatileDev** (CC0), repintadas na nossa paleta por
`pnpm icones`. A repintura é por **luminância**, e não por troca exata de cor como nas molduras:
a folha de origem é sombreada, um ícone usa oito tons de azul, e uma tabela de-para quebraria no
primeiro que tivesse um tom a mais. Mapear o brilho sobre a nossa rampa preserva o desenho e joga
tudo dentro da paleta de uma vez.

Trazemos só os seis que a interface realmente desenha na tela. A folha tem 64; importar os 64
encheria o repositório de arte que ninguém usa, e cada um seria um convite a inventar um uso.

## O que falta

**Os ícones do menu de funções.** O pack do VerzatileDev é um conjunto de CONTROLE — reprodução,
setas, mais/menos, cadeado, lista, gráfico. Ele **não tem ícone de assunto**: não há livro, mapa,
mochila, loja nem engrenagem. Dos seis itens do nosso menu ele cobre um (Time ≈ o ícone de
pessoas), e pôr ícone em um só seria pior que em nenhum — a fileira perderia o alinhamento de
peso que hoje ela tem.

Até existirem os seis, o menu fica só com rótulo. E continua valendo: nada de emoji e nada de
glifo Unicode fazendo as vezes de ícone.

## Créditos de arte## Créditos de arte

- Moldura: **UI Pack Pixel Adventure**, de [Kenney](https://kenney.nl/assets/ui-pack-pixel-adventure)
  — CC0 1.0. A peça de origem está em `tools/assets/ui/kenney/` com a licença; o repintado é nosso.
- Ícones: **Pixel UI Icons**, de [VerzatileDev](https://verzatiledev.itch.io/pixel-ui-icons) —
  CC0 1.0. A folha de origem está em `tools/assets/ui/verzatile/` com a licença transcrita: o
  `.zip` distribuído não traz arquivo de licença nenhum, e num repositório aberto que redistribui
  a arte ela precisa viajar junto.
- Fontes: **Pixelify Sans** (OFL, The Pixelify Sans Project Authors) e **Atkinson Hyperlegible**
  (OFL, Braille Institute of America). Ver `packages/client/src/styles/fontes/LEIAME.md`.

## Do's and Don'ts

**Do**
- Desenhe moldura nova repintando uma peça do pack; `pnpm ui` é o caminho.
- Use largura de moldura múltipla de 6 px, senão o pixel deixa de ser quadrado.
- Tire cor nova do atlas, com `pnpm cores`, antes de inventar uma.
- Dê ao número a face de leitura, sempre, em qualquer tamanho.
- Ponha o par novo de cores no teste de contraste junto com a regra que o usa.

**Don't**
- Não desenhe moldura com `box-shadow`. É o erro que derrubou três versões seguidas.
- Não invente um acento. Se precisa de destaque, use posição, peso ou o grifo.
- Não use o grifo em mais de um papel por tela, nem escreva claro em cima dele.
- Não ponha a face de HUD abaixo de 18 px nem em cima de um dígito.
- Não use emoji ou glifo Unicode como ícone: o sistema não tem biblioteca de ícones, e o primeiro
  glifo seria o primeiro ícone dela.
- Não arredonde canto: o mundo é de canto reto.
- Não escreva cor literal em folha de estilo. Se falta um valor, falta um token.
