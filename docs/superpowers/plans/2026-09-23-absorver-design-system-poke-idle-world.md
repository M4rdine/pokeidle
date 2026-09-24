# Absorver o design system do Poke Idle World

**Referências:** duas capturas do *Poke Idle World* — a tela de entrada e a Pokepedia (ficha do
Bulbasaur). É o mesmo gênero e o mesmo assunto que o nosso: MMO idle de Pokémon.

**Estado:** plano. Nada implementado. Três decisões da Fase 0 são do dono do projeto, não minhas,
porque contradizem regras que ele já aprovou.

---

## 1. O que as referências são, elemento por elemento

### 1.1 Tela de entrada

| Elemento | Como é |
|---|---|
| Fundo | Arte-chave *full-bleed*, pintura digital anime em alta resolução. Céu azul dramático, cascatas, torre de cristal, raios de sol. Cinco Pokémon e o treinador **de costas**, silhuetados, emoldurando o centro. |
| Logotipo | Central, no topo. Letreiro dourado biselado com contorno escuro, emblema circular (montanha, palmeira, água) e Poké Ball, sobre brasão azul-marinho com filete dourado. Vocabulário de logo de MMO: bisel, brilho, sombra projetada. |
| Linha de apoio | "O MMORPG IDLE DE POKÉMON" — caixa alta, entreletra larguíssima (~0,3em), peso fino, cinza-claro. |
| Cartão | Azul-marinho quase preto, ~500 px, **moldura dupla dourada** (fio externo + fio interno com folga), canto reto com recorte, sombra pesada. |
| Título do cartão | "ENTRAR NO JOGO" — **serifada**, caixa alta, entreletra larga, âmbar. |
| Campos | Fundo mais escuro que o cartão, canto ~10 px, fio de 1 px, **ícone à esquerda dentro do campo** (pessoa, cadeado), olho à direita na senha. |
| Botão primário | O elemento mais distintivo: **forma de gema** — cantos chanfrados (octogonal), preenchimento em gradiente verde-azulado, filete dourado, brilho interno, chevron "›" antes do rótulo. |
| Botão secundário | Mesma forma chanfrada, sem preenchimento, só o filete dourado. Fantasma. |
| Rodapé | "POKE IDLE WORLD · v0.1.0" — miúdo, caixa alta, entreletra, no canto inferior direito. |

### 1.2 Pokepedia

| Elemento | Como é |
|---|---|
| Barra superior | Faixa de largura total, marinho, **moldura dupla dourada com cantos cortados**. Nas duas extremidades, **losangos ciano fora da moldura** — rebites. |
| Marca | Ícone ornamentado + "POKE**PEDIA**" em duas cores (branco + dourado), serifada, caixa alta. |
| Busca | Campo pílula, **filete âmbar**, placeholder cinza. |
| Logo | Repetido no centro da barra e **quebrando a moldura** — passa por baixo dela. |
| Ação de saída | "→ VOLTAR AO JOGO": fundo escuro, filete dourado, caixa alta, entreletra. |
| Barra lateral | Itens em **pílula** (~10 px), cada um com **ícone em pixel art** à esquerda. O ativo ganha filete âmbar, preenchimento um degrau mais claro e um **ponto/losango na borda externa**. Grupo separado por rótulo miúdo "SISTEMAS" sobre **fio com gradiente**. |
| Fundo da página | A **mesma arte-chave, escurecida e desfocada**. Os painéis flutuam semitransparentes sobre ela. |
| Trilha | "Pokepedia / Pokémon / Bulbasaur" — miúda, apagada. |
| Cartão-herói | Poço quadrado com **filete ciano** e sprite grande em `pixelated`; chip `#001`; **nome em serifada enorme**; **selos de tipo em pílula de cor cheia** (PLANTA verde, VENENO roxo) e um selo de raridade **em contorno** (◆ RARO, filete azul) — sólido para tipo, contorno para raridade. |
| Faixa de leituras | Quatro cartões iguais: **ícone pixel colorido à esquerda**, número grande em cima, rótulo miúdo em caixa alta embaixo. |
| Painéis | Cabeçalho = **losango + título em caixa alta + fio que esvanece**. O losango é **ciano** em "STATS BASE" e **dourado** em "LINHA EVOLUTIVA" e "DROPS" — a cor do losango classifica a família do painel. |
| Barras de atributo | Trilho escuro **segmentado por marcas verticais**, preenchimento em **gradiente laranja→amarelo**, número à direita, total no pé. |
| Linha evolutiva | Cadeia horizontal de poços com **setas entre eles** e o **nível sob a seta**; o poço da espécie atual tem filete dourado. |

---

## 2. O vocabulário, destilado

Oito movimentos, do mais estrutural ao mais ornamental:

1. **Cabeçalho de painel marcado.** Losango + título + fio que esvanece. Dá hierarquia dentro do painel sem caixa nova.
2. **Leitura como cartão.** Ícone + número grande + rótulo miúdo, em faixa de N iguais.
3. **Barra com trilho segmentado e preenchimento em gradiente.** O dado vira gráfico, não enfeite.
4. **Poço de retrato grande com filete de acento.**
5. **Cadeia, não lista.** Evolução com setas e nível entre os elos.
6. **Duas cores de acento com papéis distintos.** Dourado = moldura, estrutura, ação primária. Ciano = marcador, indicador, dado vivo.
7. **Conteúdo flutuando sobre a arte escurecida**, em vez de sobre cor chapada.
8. **Ornamento:** moldura dupla, canto chanfrado, rebite, título serifado.

Os movimentos 1–5 são **informação**. O 6–7 são **ambiente**. O 8 é **estilo** — e é só o 8 que
colide com o que já decidimos.

---

## 3. As três colisões com o nosso DESIGN.md

Não são impedimentos; são decisões já tomadas que precisam ser **revistas de propósito** e não
atropeladas em silêncio.

### 3.1 Rebite e filigrana estão na lista de rejeitados

> "**Fita, filigrana, pilha de folhas, pergaminho rasgado, rebite.** Todo esse vocabulário é do
> mundo de papel e fantasia que este projeto **já recusou duas vezes**."
> — `DESIGN.md`, *O que ficou de fora, e por quê*

Os losangos ciano nas pontas da barra superior são rebites, literalmente.

**Contra-argumento honesto:** a regra foi escrita contra *madeira e fantasia* — o erro que derrubou
a versão de madeira e a arte-chave fotorrealista. A referência aqui **não é do gênero vizinho: é do
mesmo produto**, um idle de Pokémon. Emoldurar sprite em pixel art com cromo marinho-e-dourado é o
que o líder desse nicho faz, e não importa vocabulário de pergaminho junto.

**Recomendação:** adotar o losango **só como marcador semântico** (cabeçalho de painel, item ativo),
onde ele carrega informação, e **não** como rebite decorativo nas pontas de moldura. Isso respeita o
princípio real por trás da regra — "decoração não ganha cor" — e pega 90% do ganho visual.

### 3.2 O dourado deles é decorativo; a nossa regra proíbe cor decorativa

> "Papéis semânticos. **A cor aqui é informação; decoração não ganha nenhuma.**" — `tokens.css`

E `--ouro: #ffcb05` já tem dono: é o **ouro do jogador**, a recompensa que acende. Usar o mesmo
amarelo em moldura mata o canal semântico — o número que o jogador veio ver deixa de ser o único
amarelo da tela.

**Recomendação:** um token **separado e de matiz diferente** — latão dessaturado (~`#c9a227`),
`--latao`, explicitamente estrutural. Fica longe o bastante de `#ffcb05` para os dois coexistirem,
e o ouro-recompensa continua sendo o único amarelo saturado.

### 3.3 A serifada seria a terceira família

Temos duas: Pixelify Sans (voz de HUD, com piso de 18 px e **proibida em número**) e Atkinson
Hyperlegible. A regra de estilo do dono é "no máximo duas famílias, salvo exceção clara".

**Três saídas:**

- **(a)** A serifada entra **no lugar da Pixelify nos títulos**, e a Pixelify recua para nome
  próprio de Pokémon apenas. Mantém duas famílias de texto. Risco: a Pixelify é a "voz de jogo" e
  perder ela dos títulos pode descaracterizar.
- **(b)** A serifada entra como terceira, declarada como exceção, limitada a título de página e de
  seção. Custo: mais um WOFF2 auto-hospedado (~20 KB no orçamento de fonte).
- **(c)** Não entra. Os títulos ganham peso por **entreletra, caixa alta e tamanho**, que é 70% do
  efeito, sem fonte nova.

**Recomendação:** começar por **(c)** na Fase 1 e medir. Se a tela ainda parecer "browser", testar
**(b)** com uma serifada de display em uma única tela antes de espalhar.

---

## 4. O que já temos e não se perde

A referência **não** tem coisas que nós temos, e o plano não pode custar nenhuma delas:

- **A cor do tipo entrando na estrutura** (`comTipo()`, `--tipo`/`--tipo-2` nos trilhos e poços). É a
  tese do nosso DESIGN.md e a referência só usa tipo em selo.
- **Luz de cima com sombra dura** (`--relevo-1..3`, `--relevo-cava`). Nossos painéis têm mais
  volume que os deles, que são bem mais chapados.
- **Poço afundado vs. peça levantada** como gramática consistente.
- **Os testes que travam o sistema**: contraste WCAG, token órfão, paridade `DESIGN.md`↔`tokens.css`
  por valor hexadecimal, piso e proibição de número na fonte bitmap.

---

## 5. Plano

### Fase 0 — decisões (bloqueante, ~0 código)

Responder 3.1, 3.2 e 3.3. Sem isso, as fases 3–5 não têm base.

### Fase 1 — os cinco movimentos de informação (sem cor nova, sem fonte nova)

Tudo aqui cabe no sistema atual e não depende de nenhuma decisão.

1. **`.painel-cabeca`** — marcador + título caixa-alta + fio que esvanece
   (`linear-gradient(90deg, var(--borda-clara), transparent)`). O marcador usa `--selecao` por
   enquanto. Arquivo: `styles/quadro.css`.
2. **`.leitura-cartao`** — a `.leitura` existente dentro de um cartão com ícone à esquerda; faixa de
   N com `grid-template-columns: repeat(auto-fit, minmax(...))`.
3. **`.medidor` com trilho segmentado** — marcas verticais via `repeating-linear-gradient` no
   `--face-trilho`, preenchimento em gradiente de dois pontos. Nossa barra já tem trilho e brilho
   especular; falta a segmentação e a segunda parada de cor.
4. **Poço de retrato grande** — reusar `.slot-poco` (já tingido por tipo) em tamanho de ficha.
5. **Cadeia de evolução** — trocar a fileira de botões por elos com seta e nível, reusando o poço.

**Testes:** nenhum par de cor novo, então o teste de contraste não muda. Um caso novo em
`test/ui/species/` para a cadeia e a faixa de leituras.

**Valor:** é a maior parte da diferença entre as duas capturas, e não gasta nenhuma decisão.

### Fase 2 — a ficha de espécie deixa de ser modal

Hoje ela vive espremida num modal de 540 px (ver captura atual: sprite de 32 px ao lado do nome,
sem faixa de leituras, evolução em botões que quebram linha). A referência dá a ela uma **página**.

- Rota/tela própria, reusando o padrão da tela de áreas.
- Cartão-herói: poço grande + `#004` em chip + nome + selos de tipo + selo de raridade em contorno.
- Faixa de quatro leituras. **Atenção:** os quatro números deles (nível da hunt, XP por abate, preço
  NPC, venda) são do jogo *deles*. Os nossos equivalentes precisam sair do nosso registro — não
  copiar os rótulos.
- Dois painéis lado a lado (atributos | evolução), empilhando em tela estreita.

### Fase 3 — a moldura (depende de 3.1 e 3.2)

- `--latao` e `--latao-fraco` em `tokens.css` + entrada correspondente no `DESIGN.md` (o teste de
  paridade compara por hexadecimal).
- `--marca` (ciano) como acento de indicador, distinto de `--selecao`.
- **Moldura dupla:** `box-shadow: 0 0 0 1px var(--latao), 0 0 0 4px var(--fundo), 0 0 0 5px
  var(--latao-fraco)` — sem gastar `border-width`, que participa do layout. É o mesmo motivo pelo
  qual o `DESIGN.md` recusou 9-slice.
- **Canto chanfrado:** `clip-path` **apaga `box-shadow`**. A forma que funciona é um
  pseudo-elemento de moldura atrás do conteúdo, os dois com o mesmo `clip-path`, com o de trás
  ligeiramente maior — o filete vira a diferença entre as duas formas.
- **Botão gema:** a forma chanfrada + gradiente + filete, como variante de `.primary`.

**Testes:** os novos pares (`--latao` sobre `--painel`, `--marca` sobre `--painel`) entram no teste
de contraste; filete de controle precisa de 3:1 (WCAG 1.4.11).

### Fase 4 — a entrada

- Arte de fundo em `cover` e, **por cima dela, um véu determinístico** — a arte é variável e o
  contraste não pode depender dela. O contraste continua sendo medido contra o véu, não contra a
  foto, e é isso que mantém o teste válido.
- Cartão de entrada com a moldura da Fase 3.
- Ícone dentro do campo (pessoa, cadeado) usando o nosso conjunto de ícones em pixel.
- Versão no rodapé.

**Decisão de arte pendente:** a arte deles é pintura digital em alta resolução; a nossa é pixel art
de 256×144 (`arte/entrada.webp`). **Não recomendo trocar o idioma da arte** — é exatamente o erro
que já custou três tentativas. O ganho está na moldura e na composição, não em repintar.

### Fase 5 — Pokepedia como superfície própria (maior, avaliar depois)

Barra superior emoldurada + barra lateral de pílulas com ícone + agrupamento. Só faz sentido quando
houver conteúdo de enciclopédia que justifique sair do jogo — hoje a Pokédex é um modal e dá conta.

---

## 6. O que fica de fora, e por quê

- **Logotipo biselado 3D.** Vocabulário de logo de MMO, não de sistema de interface. Decisão de
  marca, separada desta.
- **Fundo desfocado atrás de todo painel.** `backdrop-filter` custa caro e a nossa cena já é
  Canvas; escurecer com véu chapado dá o mesmo resultado por muito menos.
- **Rebite nas pontas da moldura.** Ver 3.1 — fica o losango como marcador, não como enfeite.
- **Recolorir a barra por valor.** Eles não fazem, e o nosso sistema já diz "decoração não ganha
  cor".

---

## 7. Ordem sugerida

Fase 1 → medir na tela → Fase 2 → Fase 0 (decidido com as duas primeiras já na frente, o que torna a
decisão concreta em vez de hipotética) → Fase 3 → Fase 4. Fase 5 só se a enciclopédia crescer.

A Fase 1 sozinha já fecha a maior parte da distância entre a nossa ficha e a deles, e não gasta
nenhuma das três decisões.
