# Sprint 4: props, vegetação e construção — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`.

## 1. Problema

Os seis terrenos da sprint 3 dão chão coerente, mas o cenário continua vazio: tudo que ocupa o
mapa — árvore, arbusto, pedra, flor, placa — ainda vem do dump do Tibia, com outra paleta e outro
traço. Um mapa com terreno novo e props velhos fica pior que um mapa coerente e feio.

## 2. Objetivo e limites

Substituir a camada de props e vegetação por arte gerada no mesmo estilo dos terrenos, coberta
por bioma, e com o recorte pronto para entrar na camada de copa.

Fora do escopo: sprites de Pokémon, que continuam do dump por decisão do usuário; desenhar Kanto
(sprint 5); Centro Pokémon montável, que depende de peças de construção e fica para o fim desta
sprint se sobrar espaço.

Critério de pronto: nenhuma peça do Tibia resta no cenário da Rota 1, e a folha de aprovação
mostra os props agrupados por bioma com fundo transparente.

## 3. O que gerar

Lotes de quatro variações por família, com `rd_tile__tile_object` a 64 px para o que ocupa dois
tiles e 32 px para o que ocupa um.

| Família | Tamanho | Onde entra |
|---|---|---|
| Árvore de copa larga | 64 | detalhe + copa |
| Árvore conífera | 64 | detalhe + copa |
| Arbusto | 32 | detalhe |
| Tufo de mato e flores | 32 | detalhe |
| Pedra e pedregulho | 32 | detalhe, bloqueia |
| Tronco caído e toco | 32 | detalhe |
| Cristal e rocha de caverna | 32 | detalhe de caverna |
| Placa e cerca | 32 | detalhe de rota |

## 4. Fundo transparente

O gerador entrega o objeto sobre fundo chapado, não sobre transparência. Recortar à mão não
escala. Entra `removeFlatBackground`, função pura que:

1. Lê a cor dos quatro cantos da imagem e toma a mais repetida como fundo.
2. Faz preenchimento por vizinhança a partir da borda, marcando tudo que encosta no fundo dentro
   de uma tolerância.
3. Zera o alfa só do que foi alcançado a partir da borda.

Preencher a partir da borda, e não por cor global, é o que preserva um buraco interno da mesma cor
do fundo — a copa de uma árvore com céu aparecendo no meio, por exemplo, continua recortada certo
porque o interior não encosta na borda.

## 5. Convivência

Os 155 tiles do dump continuam declarados no manifesto até a Rota 1 ser redesenhada na sprint 5.
Esta sprint acrescenta; a remoção acontece quando o mapa novo não citar mais nenhum deles, e o
registro já tem checagem que acusa tile citado e ausente.

## 6. Testes

- `removeFlatBackground` apaga a moldura, preserva o miolo e preserva buraco interno da cor do
  fundo; não altera a imagem de entrada.
- Tolerância zero não apaga pixel levemente diferente; tolerância alta apaga.
- Imagem sem fundo uniforme sai inalterada.
- O build recusa prop cujo PNG não existe.

Curadoria não tem teste: a porta é a folha de aprovação.

## 7. Riscos

O maior é o gerador devolver o objeto com sombra colada no fundo. A sombra vira halo escuro
quando o fundo some. Mitigação: a tolerância é por família, e a folha de aprovação mostra as
peças sobre xadrez, onde halo aparece na hora.

O segundo é escala inconsistente: uma árvore que sai ocupando 40 px numa tela de 64 px fica menor
que a vizinha. Mitigação: o recorte apara o transparente e centraliza, então o que manda é o
tamanho declarado no manifesto, não o que o gerador entregou.
