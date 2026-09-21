---
name: Pokeidle
description: Interface de MMO de Pokémon — ardósia fria, o vermelho da Poké Ball, e os dezoito matizes de tipo fazendo o trabalho pesado.
colors:
  fundo: "#161b2b"
  painel: "#222a40"
  painel-alto: "#2c3650"
  cava: "#11151f"
  borda: "#3a4560"
  borda-forte: "#6b7aa3"
  texto: "#eef1f8"
  texto-fraco: "#9aa6c4"
  primaria: "#e91515"
  primaria-alta: "#ff2d2d"
  primaria-texto: "#ffffff"
  selecao: "#6f8ae6"
  selecao-texto: "#11151f"
  ouro: "#ffcb05"
  ouro-cheio: "#ffcb05"
  xp: "#58a6f0"
  xp-cheio: "#58a6f0"
  hp: "#4ade80"
  perigo: "#ff7a7a"
  ok: "#4ade80"
  tipo-escuro: "#11151f"
  tipo-claro: "#ffffff"
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
    textColor: "{colors.texto}"
    rounded: "8px"
    padding: "8px 16px"
    typography: "{typography.data}"
  button-primary:
    backgroundColor: "{colors.primaria}"
    textColor: "{colors.primaria-texto}"
    rounded: "8px"
    padding: "8px 16px"
  button-disabled:
    backgroundColor: "{colors.painel-alto}"
    textColor: "{colors.texto-fraco}"
  input:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.texto}"
    rounded: "8px"
    padding: "8px 16px"
    width: "100%"
  panel:
    backgroundColor: "{colors.painel}"
    textColor: "{colors.texto}"
    rounded: "8px"
  panel-sunken:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.texto}"
    rounded: "8px"
  panel-floating:
    backgroundColor: "{colors.painel}"
    textColor: "{colors.texto}"
    rounded: "8px"
  chip:
    backgroundColor: "{colors.cava}"
    textColor: "{colors.texto}"
    rounded: "999px"
    padding: "1px 8px"
    typography: "{typography.label}"
  row-selected:
    backgroundColor: "{colors.selecao}"
    textColor: "{colors.selecao-texto}"
    rounded: "8px"
  type-badge:
    backgroundColor: "{colors.type-fire}"
    textColor: "{colors.tipo-escuro}"
    rounded: "999px"
    padding: "1px 8px"
    typography: "{typography.label}"
  toast:
    backgroundColor: "{colors.painel}"
    textColor: "{colors.texto}"
    rounded: "8px"
    padding: "8px 16px"
    width: "360px"
---

# Design System: Pokeidle

## Overview

**Creative North Star: "Os selos de tipo"**

O design system do Pokémon já existe e está nos **selos de tipo**: pílulas saturadas, de canto
redondo, com o rótulo em alto contraste sobre cor cheia. A casca existe para HOSPEDAR isso, não
para competir com isso.

### O que veio antes, e por que caiu

Quatro versões. As três primeiras erraram na mesma direção e a terceira errou feio:

1. **Terminal de campo** — escuro e chapado. Lia como dashboard.
2. **Moldura com bisel** — resolveu a gramática, manteve azul-noite com bronze: o padrão de
   fábrica de todo idle de navegador.
3. **Caderneta de campo** — papel e couro. Claro e quente, e não tinha nada a ver com Pokémon.
4. **Madeira sobre penumbra** — moldura 9-slice de 12 px, arte de verdade. Caiu por dois motivos,
   e o segundo é o que importa: **borda grossa demais** (doze pixels por objeto pesam a tela e
   comem o espaço do conteúdo) e, principalmente, **era um mundo de RPG de fantasia**. Marrom
   sobre marrom é Zelda, é Stardew. Pokémon é vermelho e branco, azul, saturado e limpo.

O padrão do erro foi sempre o mesmo: escolher um idioma visual pela sua coerência interna, em vez
de pelo que o produto é.

### O que este mundo é

- **Ardósia fria** de fundo. Fria de propósito: o mundo do jogo é verde e terra, e complementar
  faz o jogo saltar da tela. O marrom competia com ele.
- **Vermelho da Poké Ball** como única cor de marca, e só na ação primária.
- **Os dezoito matizes de tipo** carregando o resto — eles são a identidade, não decoração.
- **Um fio de 1 px e uma sombra.** Sem moldura, sem bisel, sem textura.
- **Canto arredondado.** A regra anterior ("o mundo é de canto reto") veio da madeira; os selos
  oficiais são pílulas.

**Key Characteristics:**
- Superfície é retângulo de canto macio com 1 px de borda; profundidade em dois degraus de sombra
- Nenhuma cor decorativa: marca é a ação primária, seleção é a linha de agora, o resto é dado
- Ícone de assunto é SPRITE OFICIAL do acervo da PokeAPI, nunca desenho nosso
- Duas faces auto-hospedadas — bitmap para nome e título, Atkinson para todo o resto
- Movimento quase ausente: 120 ms no medidor, 200 ms no que troca de estado, e nada mais

## Colors

Vinte papéis, contra dezoito matizes de tipo. Todo par que a interface pinta é medido em
`packages/client/test/styles/contraste.test.ts` — a paleta não passa por aprovação de olho, e o
teste já pegou cinco cores escolhidas a olho nesta rodada.

### Primary
**Vermelho da Poké Ball** (`{colors.primaria}`, texto `{colors.primaria-texto}`). É a única cor de
marca do sistema e aparece só na ação primária. Tudo que não for "o botão que faz a coisa
acontecer" usa posição e peso, não matiz.

### Secondary
- **Seleção** (`{colors.selecao}`, texto `{colors.selecao-texto}`): a linha de agora — slot do
  Pokémon em campo, aba atual, linha aberta na ficha, marcador escolhido no mapa. **Um trabalho
  só.** É um preenchimento CLARO com tinta escura, e não o contrário: escuro sobre escuro não se
  vê contra o painel, e claro com texto branco não alcança 4,5:1.
- **Ouro** (`{colors.ouro}`): moeda, recompensa, portão de nível, marco no log.
- **Verde e vermelho de estado** (`{colors.ok}`, `{colors.perigo}`): confirmado e alerta.
- **Vida e experiência** (`{colors.hp}`, `{colors.xp}`).

### Tertiary
**Os dezoito matizes de tipo** (`{colors.type-normal}` … `{colors.type-fairy}`), como **pílula
saturada com rótulo em alto contraste**, que é como o jogo oficial os desenha.

A tinta do rótulo é **escura por padrão**: medindo os dezoito contra branco, só CINCO passam em
4,5:1 — `dark`, `dragon`, `fighting`, `ghost` e `poison`. O palpite inicial tinha a lista quase
invertida, e nada na tela denunciava: o selo continuava bonito e o rótulo dentro dele, ilegível.
O teste percorre os dezoito.

### Neutral
- **Fundo** (`{colors.fundo}`): fora de tudo, e a tarja em volta do mundo. É o valor que
  `scene/app.ts` lê do token para pintar o fundo do renderizador.
- **Painel** (`{colors.painel}`), **um degrau à frente** (`{colors.painel-alto}`) e **fenda**
  (`{colors.cava}`), que é onde se lê.
- **Traço**: `{colors.borda}` só SEPARA e pode ser discreta; `{colors.borda-forte}` delimita
  CONTROLE e precisa dos 3:1 que a WCAG 1.4.11 exige de quem identifica um botão.
- **Texto** (`{colors.texto}`) e **rótulo** (`{colors.texto-fraco}`).

### Named Rules

**A Regra da Cor Que Significa.** Cor não decora. Se um elemento precisa de destaque e não é
marca, seleção, moeda, estado, vida ou experiência, ele precisa de posição ou peso.

**A Regra do Par Declarado.** Todo preenchimento colorido tem a sua tinta declarada junto
(`primaria`/`primaria-texto`, `selecao`/`selecao-texto`, matiz de tipo/`tipo-escuro`), e o par
está no teste. A troca de mundo claro para escuro quebrou isso em sete lugares de uma vez.

**A Regra da Cor Nunca Sozinha.** Nenhum estado é comunicado só por cor. HP ferido muda de cor
**e** de comprimento; o confronto diz "arrasa" por escrito.

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

**Um fio e uma sombra.** Superfície é um retângulo de canto macio com 1 px de borda e, quando
precisa se destacar, uma sombra com deslocamento e desfoque. A profundidade tem dois degraus, e
cada um diz uma coisa:

| degrau | diz | onde |
|---|---|---|
| `--sombra-1` | está apoiado na superfície | painel, botão |
| `--sombra-2` | está POR CIMA de tudo | modal, toast |

**Nem um nem outro**: chip, selo de tipo, célula de lista, linha de tabela. Eles recebem no
máximo um fio de 1 px em `{colors.borda}` ou um tingimento de fundo, porque não são objetos
separados.

O que existia antes aqui era uma moldura 9-slice de 12 px desenhada em PNG, com a peça trocada no
`:active`. Era arte de verdade e ainda assim estava errada: doze pixels de moldura por objeto
pesam a tela, comem o espaço do conteúdo, e o material era o de outro gênero. O botão apertado
agora é uma linha de CSS — afunda, perde a sombra e escurece — em vez de um segundo arquivo.

## Layout

Três larguras, uma por modo de uso.

**Formulário** (`.screen-auth`): 420 px, centrado — registro e login não têm nada a comparar.

**Folha** (qualquer `.screen` que não seja a do jogo): até 1280 px, centrada, sobre uma
superfície de painel, com o fundo da página aparecendo só na margem.

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
- **Foco visível** em dois traços: fio claro de `{colors.texto}` com 2 px de folga, que garante
  contraste sobre qualquer superfície, mais um halo índigo que diz de qual sistema ele é.
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

Sempre um **elemento**, nunca o `background` de quem o contém: assim ele pode receber estado
próprio, e a regra sobreviveu a três trocas de mundo visual.

**Assunto** — mapa, time, mochila, Pokédex, loja, configurações: **sprite oficial** do acervo da
PokeAPI. Nada de símbolo desenhado por nós quando existe o do próprio jogo: a fidelidade sai de
graça e nenhum desenho nosso chega perto.

Duas rodadas foram gastas antes de chegar aqui, e as duas ensinaram:

1. **Gerador não faz símbolo.** Três estilos do Retro Diffusion — `tile_object`, `mc_item` e
   `1_bit` — falharam pelo mesmo motivo: um gerador produz ILUSTRAÇÃO, e um ícone é SÍMBOLO. O
   `1_bit` desenhou um livro limpo a 64 px cujo contorno some inteiro ao reduzir para 16.
   Custou US$ 0,23 descobrir.
2. **Desenhar à mão dá só "aceitável".** Os seis foram desenhados pixel a pixel e três reprovaram
   na folha de contato: a moeda lia-se roda, a engrenagem lia-se olho, o livro lia-se duas barras.
   Ficaram passáveis — e a arte oficial, que já existia, é incomparavelmente melhor.

**Controle** — mais, menos, parar, cadeado, fechar: não existem como item do jogo, então vêm do
pack do VerzatileDev (CC0) e são repintados na nossa paleta por **luminância**. A folha é
sombreada, um ícone usa oito tons de azul, e uma tabela de-para quebraria no primeiro com um tom
a mais.

`configuracoes` é o único de assunto sem correspondente honesto: não há engrenagem no acervo,
porque engrenagem é convenção de interface e não item de Pokémon. `machine-part` é o mais próximo.

### Regras

**O ícone acompanha o rótulo, nunca o substitui.** Símbolo sozinho vira adivinhação, e a fileira
do menu é onde o jogador procura por nome. A exceção é o par de zoom do mapa, onde `+` e `−` são
universais e o espaço é do mapa.

**Nada de emoji e nada de glifo Unicode** fazendo as vezes de ícone.

## O palco da entrada

A tela de login e a da escolha do inicial dividem um fundo só: **uma rota ensolarada em pixel
art**, 256×144 px e 6,5 KB, em `packages/client/src/styles/arte/entrada.webp`. Antes ali estava o
PNG do mapa da região esticado — mapa reduzido não é arte-chave — e depois um retângulo liso, que
não é decisão nenhuma.

Entre os dois houve uma terceira versão, descartada, que é a que ensina: uma **pintura
fotorrealista de um entardecer**, gerada com IA paga. Bonita, e errada por duas razões que valem
para qualquer arte que entre aqui depois.

**Pintura atrás de um jogo pixelado são duas mãos na mesma tela.** É o mesmo erro que este
documento já registra para os ícones — não desenhar o que o jogo já tem —, só que aplicado ao
estilo em vez do objeto. A primeira tela do jogo tem que falar o idioma do jogo.

**Pokémon é uma franquia LUMINOSA.** Céu azul, verde saturado, sol a pino. Entardecer dramático é
idioma de RPG sombrio, e escolhê-lo "pelo clima" foi a mesma troca de idioma da madeira marrom,
com outra roupa.

**Nenhum Pokémon na arte — mas isso sozinho não faz arte nenhuma.** A regra continua: sprite de
gerador ao lado do acervo oficial denuncia as duas mãos. O que faz uma rota parecer Pokémon não é
a criatura, é o **vocabulário do mundo**: grama alta em tufos destacados, telhado vermelho, placa
de rota, trilha de terra. Sem esse vocabulário, "sem criaturas" só entrega papel de parede.

**O arquivo é do tamanho nativo.** Quem amplia é o `image-rendering: pixelated`, como o mundo do
jogo. Guardar uma versão grande borraria o desenho antes de entregá-lo — e custaria dez vezes mais
bytes para ficar pior. A pintura descartada pesava 64 KB; esta pesa 6,5.

**O cartão fica a 92%, sem desfoque.** Desfoque é o reflexo moderno para descolar um cartão do
fundo; sobre pixel art ele apaga a única coisa que a arte tem. A translucidez deixa o verde e o
azul tingirem o painel — ele passa a estar no mesmo mundo — e o texto não perde contraste. Sobre a
arte o cartão sobe para `--sombra-2`: um fio de 1 px não descola nada de um mundo desenhado.

O prompt literal, as duas saídas e as contas de compressão estão em
`packages/client/src/styles/arte/LEIAME.md`.

## Créditos de arte

- Ícones de assunto: acervo de sprites da [PokeAPI](https://github.com/PokeAPI/sprites). O
  repositório é CC0 e a arte é copyright da The Pokémon Company — os dois enunciados convivem, e
  o que isso significa para nós está escrito em `tools/assets/ui/pokeapi/LICENSE.md`.
- Ícones de controle: **Pixel UI Icons**, de [VerzatileDev](https://verzatiledev.itch.io/pixel-ui-icons)
  — CC0 1.0. A folha está em `tools/assets/ui/verzatile/` com a licença transcrita: o `.zip`
  distribuído não traz arquivo de licença nenhum, e num repositório aberto que redistribui a arte
  ela precisa viajar junto.
- Fontes: **Pixelify Sans** (OFL) e **Atkinson Hyperlegible** (OFL). Ver
  `packages/client/src/styles/fontes/LEIAME.md`.
- Arte-chave da entrada: pixel art gerada no **Retro Diffusion** (`rd_pro__default`), que cede os
  direitos da saída a quem gera. Prompt, contas de compressão e o porquê de ser pixel art em
  `packages/client/src/styles/arte/LEIAME.md`.

## Do's and Don'ts

**Do**
- Deixe os selos de tipo carregarem a cor. Eles são a identidade da franquia.
- Use sprite oficial para ícone de assunto; desenhar só quando o jogo não tiver o objeto.
- Declare a tinta junto do preenchimento, e ponha o par no teste de contraste.
- Meça o contraste antes de aceitar uma cor. Nesta rodada o teste pegou cinco escolhidas a olho.

**Don't**
- Não engrosse a borda. Um fio de 1 px e uma sombra bastam; 12 px de moldura pesam a tela e
  comem o espaço do conteúdo.
- Não escolha um idioma visual pela coerência interna dele. Madeira sobre penumbra era coerente
  e era de outro jogo — foi o erro que derrubou a versão anterior.
- Não invente uma segunda cor de marca. Se precisa de destaque, use posição ou peso.
- Não use o preenchimento de seleção em mais de um lugar por tela.
- Não ponha a face de HUD abaixo de 18 px nem em cima de um dígito.
- Não use emoji ou glifo Unicode como ícone.
- Não escreva cor literal em folha de estilo. Se falta um valor, falta um token.
