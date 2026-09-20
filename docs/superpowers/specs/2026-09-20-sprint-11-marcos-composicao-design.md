# Sprint 11 — Mapas, parte 2: marcos e composição

## O que estava errado

A sprint 10 deu profundidade ao terreno, mas o mapa continuava sem **lugares**. Três sintomas com
a mesma raiz:

1. **O Centro Pokémon nunca foi desenhado.** Ele existia só como um ponto no `HuntMap` — o jogador
   andava até uma célula invisível para curar. É a definição de mapa que não conta nada.
2. **A trilha ia de lugar nenhum a lugar nenhum.** `percurso()` desenhava um Z entre a partida e o
   Centro pelo meio da área, sem tocar em nada pelo caminho. Como o Centro era invisível, o
   caminho parecia enfeite.
3. **Duas áreas do mesmo bioma eram a mesma textura com nomes diferentes.** Nada distinguia
   "Entrada da Caverna" de "Caverna Funda".

## O que esta sprint entrega

### 1. O Centro Pokémon vira prédio

Prop de 3×3 gerado (`props/centro-pokemon.png`), assentado com a coluna do meio acima da porta.
As duas linhas de cima vão para a copa, desenhada acima do jogador; a de baixo, para o detalhe.
As nove barram passagem. A porta continua pisável — é onde o jogador para para curar.

A busca da porta passa a exigir 3×3 livres acima dela: escolher uma porta boa e descobrir depois
que o prédio não cabe seria um bug silencioso.

### 2. A trilha liga o que interessa

`percurso()` agora sai da partida, passa por **todas as zonas de spawn** em ordem de vizinho mais
próximo, e termina na porta do Centro. Não é a rota ótima e não precisa ser: o que importa é não
ziguezaguear entre duas paradas vizinhas.

A trilha passou para antes da grama alta. Ela só pinta sobre material primário puro, então o
caminho sobrevive e a grama cresce em volta — um caminho atravessando grama alta, que é a imagem
que o gênero inteiro usa. Na ordem inversa a grama cobria a zona e a trilha não entrava mais nela.

### 3. Marco por área

`Bioma.marco` nomeia um prop de 3×3 colocado uma vez, num canto livre. A varredura sai do canto
superior esquerdo, ao contrário da do Centro, que sai do inferior direito: os dois ficam longe um
do outro sem ninguém coordenar. Sem lugar, a área fica sem marco — derrubar o desenho por causa de
um enfeite seria desproporcional.

Três marcos gerados: `boca-de-caverna` (as quatro áreas de caverna), `naufragio` (as duas de
praia) e `pedras-erguidas` (as três de pico rochoso).

### 4. Props de qualquer tamanho

`propFrames` só sabia cortar 1×1 e 2×2, com o `2` escrito na mão. Agora corta N×N a partir de
`size`, que o manifesto valida como múltiplo de 32 até 256. Sem isso nenhum prop maior que uma
árvore entraria.

## Fora de escopo, com motivo

**Caverna e praia continuam sem marcação de spawn.** A grama alta da sprint 10 só casa onde o
material primário é campo — em piso de rocha ou areia ela seria mentira, e o pincel nem casaria.
Marcar o selvagem nessas seis áreas exige conjuntos próprios (areia↔vegetação de praia,
rocha↔musgo), e isso é uma entrega inteira, não um apêndice desta.

**A trilha é uma escada de segmentos retos.** `distanciaAoSegmento` só sabe medir segmento
horizontal ou vertical, então toda perna é um L. Dá para ver a regularidade. Curvar exige trocar a
representação do traçado.

## Testes

- toda área ganha as nove peças do prédio acima da porta, e as nove barram;
- a porta continua pisável;
- sem o prop no atlas, o mapa continua válido e sem prédio — a degradação é testada, não suposta;
- a trilha chega na porta do Centro em toda área que tem trilha;
- a trilha passa a até três tiles de toda zona de spawn;
- toda área com `marco` ganha as nove peças distintas dele, e elas não pisam no Centro;
- prop de 3×3 sai em nove quadros nomeados por coluna e linha; o de 1×1 continua inteiro.
