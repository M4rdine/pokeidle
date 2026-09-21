# Arte-chave

## `entrada.webp` — o fundo da entrada e da escolha do inicial

**256×144 px, 6,5 KB, WebP sem perda.** Pixel art de uma rota ensolarada: trilha de terra subindo
para uma cidade de telhados vermelhos, grama alta em tufos na frente, placa de rota, montanha ao
fundo. Gerada com **Retro Diffusion**, estilo `rd_pro__default`, em 21/09/2026.

### Por que pixel art, e não pintura

A primeira versão desta arte era uma pintura fotorrealista de um entardecer, feita com FLUX.1
[schnell] pela fal. Era bonita e estava errada por duas razões que valem para a próxima:

**1. Pintura atrás de um jogo pixelado são duas mãos na mesma tela.** É exatamente o erro que
este repositório já documentou para os ícones — não desenhar à mão o que o jogo já tem — só que
aplicado ao estilo em vez do objeto. A tela de entrada é a primeira coisa que alguém vê; se ela
fala outro idioma visual, o jogo atrás parece o rascunho dela.

**2. Entardecer dramático é idioma de RPG sombrio. Pokémon é uma franquia LUMINOSA.** Céu azul,
verde saturado, sol a pino. Escolher entardecer pelo "clima" foi a mesma troca de idioma da
madeira marrom da versão anterior do design system, com outra roupa.

E o que faz uma rota parecer Pokémon **não é a criatura** — é o vocabulário do mundo: grama alta
em tufos destacados, telhado vermelho, placa de rota, trilha de terra. A regra "nenhum Pokémon na
arte" continua valendo (sprite de gerador ao lado do acervo oficial denuncia na hora), mas ela
sozinha não faz arte nenhuma: foi ela que, sem o vocabulário, deixou a primeira tentativa virar
um papel de parede de paisagem genérica.

### O tamanho é o nativo, de propósito

256×144 é o máximo do modelo e é o que está no repositório. **Quem amplia é o navegador**, com
`image-rendering: pixelated` em `.screen-auth`/`.screen-starter` — do mesmo jeito que o mundo do
jogo é ampliado. Guardar uma versão grande seria borrar o desenho antes de entregá-lo, e custaria
dez vezes mais bytes para ficar pior.

As contas, medidas: PNG do fornecedor 17,6 KB; PNG reencodado pelo nosso `tools/assets/src/png.ts`
9,9 KB; **WebP sem perda 6,5 KB**. Nada de WebP com perda aqui — perda em pixel art come
justamente as bordas duras que são o desenho inteiro.

Para comparação, a pintura descartada pesava 64 KB depois de comprimida.

### Prompt

> A sunny grassy route stretching toward a small town of white houses with bright red roofs
> nestled in rolling green hills, a tan dirt path winding through clumps of tall grass, round
> leafy trees along the path, a wooden signpost beside the path, blue mountains on the horizon,
> bright blue sky with fluffy white clouds, vivid saturated colors, cheerful midday light, no
> people and no animals

Duas saídas, e a escolhida é a que tem a **placa ilegível**. A outra trazia "Town / Mountains /
Route" em letras legíveis — texto em inglês numa interface em português, e texto em arte-chave é
dívida em qualquer idioma.

### Licença

Retro Diffusion cede os direitos da saída a quem gerou. Custo desta rodada: US$ 0,36 por duas
imagens.

## O véu

`.screen-auth` e `.screen-starter` pintam um gradiente frio por cima, entre 35% e 62%, mais escuro
nas pontas. Sem ele o texto branco do cartão cai em cima de céu azul claro. O cartão em si fica a
92% de opacidade, **sem desfoque**: desfoque é o reflexo moderno para descolar um cartão do fundo,
e aqui apagaria a única coisa que a arte tem.
