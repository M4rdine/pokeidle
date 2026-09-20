# Sprint 10 — Mapas, parte 1: o mapa deixa de ser textura

## O problema, na raiz

Hoje uma área é: **um material, mais X% de um segundo material espalhado, mais props em ruído
uniforme**. Isso é uma textura, não um lugar. Em `regioes.ts` o bioma declara `set` e `mistura`;
em `region-draw.ts` o segundo material sai de `smooth(...) < bioma.mistura` e os props saem de
`noise(...) > prop.densidade` — ruído branco por tile, sem correlação espacial nenhuma.

A consequência é visível no Campo Inicial: campo chapado, uma trilha reta, arbustos e flores em
densidade igual em toda parte, uma árvore. E as duas regiões são 96×72 com as mesmas quatro
camadas saídas da mesma função, então por construção elas não têm como parecer lugares diferentes.

## O que esta sprint entrega

Três mudanças, todas atacando a correlação espacial que falta.

### 1. Massa coerente em vez de chuvisco

O bioma ganha `forma: 'ruido' | 'corpo'`. Com `'ruido'` nada muda — é o certo para terra batida
salpicada num campo. Com `'corpo'` o segundo material vira **uma massa conectada só**, com margem,
em vez de manchas espalhadas: Margem do Lago passa a ter um lago.

A implementação é uma máscara de disco deformada por ruído, e não o limiar global de hoje: um
centro sorteado dentro da área, um raio, e a borda modulada por `smooth()` para não sair circular.

### 2. Grama alta marcando onde há selvagem

Conjunto novo `campo-alta` (gerado; `tools/assets/terrenos/campo-alta.png`), e os spawns passam a
ser pintados de grama alta. O mapa vira informação: quem olha vê onde os Pokémon aparecem, em vez
de descobrir andando.

### 3. Campo de densidade nos props

`noise()` por tile vira `smooth()` por tipo de prop, com semente própria. A densidade local passa a
ser `densidade * campo^k`, então árvore forma bosque e sobra clareira, em vez de confete uniforme.

## Fora de escopo, com motivo

**Penhasco e elevação ficaram para a sprint 11.** A tentativa de gerar o conjunto custou US$ 0,20 e
provou o limite: `rd_tile__tileset` só produz pincel de canto simétrico, e elevação precisa de
família assimétrica — face vertical mais sombra projetada. "Green grass and grey rock cliff"
devolveu chão rochoso plano, indistinguível do `campo-pedra` que já existia. Entregar isso como
"profundidade" seria maquiagem.

## Testes

Propriedades verificáveis e determinísticas dada a semente, não capturas de tela:

- **corpo é um corpo**: com `forma: 'corpo'`, as células do material secundário formam **um único
  componente conexo** (busca em largura), e não N manchas.
- **ruído continua ruído**: com `forma: 'ruido'`, o resultado é idêntico ao de hoje — a mudança não
  pode alterar os mapas que já estão bons.
- **spawn em grama alta**: toda célula de spawn de um bioma com grama alta cai em material `b` do
  conjunto `campo-alta`.
- **props se agrupam**: a variância da contagem de props por quadrante é maior com campo de
  densidade do que com ruído uniforme, na mesma semente e com a mesma contagem total aproximada.
- A cobertura de atlas que já existe (`packages/server/test/atlas-cobertura.test.ts`) pega
  qualquer tile novo que o mapa use e o atlas não tenha.

## Como se revisa

`pnpm assets map-preview` rende a região em PNG. A revisão é olhar Campo Inicial e Margem do Lago
antes e depois, nas duas regiões.
