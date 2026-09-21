# Town Maps das regiões

## `kanto.webp` — o mapa de Kanto

**192×144 px, 2,1 KB, WebP sem perda.** É o Town Map de **Pokémon FireRed/LeafGreen**, recortado
da captura de tela do item: o arquivo de origem tem 240×160 (a tela do GBA inteira, com a moldura
marrom do item em volta), e a área útil do mapa é `x=24..215, y=16..160`.

Origem: [Bulbagarden Archives](https://archives.bulbagarden.net/media/upload/7/7c/KantoTownMap.png),
onde está sob alegação de uso legítimo editorial.

**A arte é copyright da The Pokémon Company / Nintendo / Game Freak.** Está registrado aqui como
fato, não como opinião jurídica — a mesma posição já assumida para os sprites do acervo da
PokeAPI, e pela mesma razão: é um fan game sem monetização. Ver
`tools/assets/ui/pokeapi/LICENSE.md`.

### Por que este e não os outros

Foram avaliadas três versões:

| arquivo | jogo | tamanho | por que não |
|---|---|---|---|
| **este** | FireRed/LeafGreen, Town Map | 240×160 | — |
| mapa ilustrado | FireRed/LeafGreen, arte de quebra-cabeça | 1000×750 | aquarela, não pixel art: briga com a interface inteira, e traz o logotipo da franquia cravado no canto |
| Town Map | Let's Go | 1280×720 | vetorial chapado com brilho, e 40% da largura é oceano vazio |

O escolhido é **pixel art nativa com 26 cores** — o mesmo idioma do jogo, sem emenda. Ele sobe de
192 px para ~700 na tela com `image-rendering: pixelated`, em degrau, sem nenhum pixel
interpolado.

### Ele não tem rótulo de texto, e isso é bom

No jogo original o nome do lugar vem da caixa de texto do cursor, não do mapa. Os marcos aparecem
como **Poké Ball vermelha** (cidade) e **quadrado azul** (rota ou local). Numa tela de escolher
destino isso é vantagem: os rótulos são nossos, na nossa fonte, no nosso idioma.

### As coordenadas foram DETECTADAS, não estimadas

As posições dos marcadores em `regions.json` (`noMapa`) saíram de uma varredura da própria arte:
os 14 marcadores de cidade (`#f83810`) e os 11 de local (`#5880f0`) foram agrupados por
conectividade e o centroide de cada blob virou a coordenada. Posicionar no olho erraria por
alguns pixels em cada um, e num mapa que todo mundo conhece o erro apareceria.

A checagem de que dois marcadores não se encostam é feita no espaço da TELA, não em porcentagem:
o mapa tem proporção 4:3, então 1% de largura vale 1,33× mais pixel que 1% de altura, e dois
marcadores empilhados passariam numa comparação ingênua e colidiriam assim mesmo.

## As Terras Altas usam o mesmo mapa

Não é preguiça: é o que os dados dizem. Seis das oito áreas das Terras Altas são marcos reais de
Kanto — Túnel Rocha, Zona Safári, Usina, Ilhas Espuma, Estrada da Vitória e Planalto Índigo. A
"segunda região" é a Kanto tardia com outro nome.
