# Fase 4b: água animada e copa acima do jogador — Design

Data: 2026-09-18. Spec pai: `docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md`.
Fase anterior: `docs/superpowers/specs/2026-09-18-fase-4a-tileset-autoria-design.md`, que adiou
este trabalho em §1 e §2. Pipeline atual: `tools/assets/README.md`.

## 1. Problema

A 4a entregou 155 peças e o pincel de terreno, mas o mapa é uma fotografia: a água é um quadro
parado e a árvore é desenhada atrás do jogador, que anda por cima da copa como se ela fosse chão
pintado. São as duas coisas que mais denunciam que o cenário não é um lugar.

A matéria-prima existe. O dump OTPokemon 2019 marca 1 438 itens com mais de uma fase, e a água
curada (item 632) tem seis. O que falta é o pipeline levar essas fases até a tela e o mapa poder
dizer o que fica na frente do jogador.

Decisões do usuário em 2026-09-18: **anima tudo que o dump marcar como animado** entre os tiles
curados, sem lista manual; e a copa é declarada por ele **numa camada nova do Tiled**, não
deduzida da peça nem da altura do item. A abordagem escolhida foi assar o estático e animar só o
que se move.

## 2. Objetivo e limites

Entregar movimento no cenário e profundidade na passagem por baixo de árvores, sem tocar no
motor, no servidor nem no protocolo.

Fora do escopo: desenhar o mapa final, que é do usuário; som; qualquer mudança de regra de jogo;
animação de Pokémon, que já existe; e otimizar o bundle, que é dívida registrada da 3b.

Critério de pronto: `pnpm assets extract` grava todas as fases; `pnpm assets build` produz um
atlas cujos tiles animados têm uma animação declarada; um mapa com camada `canopy` importa,
aparece na prévia em PNG desenhada por último e, no jogo, cobre o Pokémon que passa por baixo,
com a água se mexendo.

## 3. Pipeline de assets

**Extrator.** `writeItem` passa a percorrer `item.phases`, como `writeOutfit` já faz. A assinatura
vira `itemFramePath(outDir, id, patternX, patternY, phase = 0)`. A fase 0 mantém o caminho de hoje,
`items/<id>_<px>_<py>.png`, e as demais ganham sufixo, `items/<id>_<px>_<py>_<fase>.png`. Uma
extração antiga continua servindo aos tiles estáticos, e uma nova só acrescenta arquivos.

**Atlas.** Um tile com `phases > 1` no catálogo entra com a peça de sempre, sob o nome da entrada
do manifesto, mais um quadro por fase extra, nomeado `<tile>_<fase>`. O `tiles.json` ganha
`animations[<tile>] = ['<tile>', '<tile>_1', …]`, montado explicitamente pelo gerador. Hoje o
agrupamento de animação sai de uma regra de sufixo que serve aos Pokémon; ela continua valendo
para `pokemon.json` e não é usada para decidir os tiles, porque a fase 0 não tem sufixo e ficaria
de fora da própria animação.

Peça fatiada anima peça a peça: um item 2×2 animado gera `<tile>-x0-y0`, `<tile>-x0-y0_1` e assim
por diante, cada pedaço com a sua animação.

**Tileset do Tiled.** A ordem escrita em `tiles.tsj` exclui os quadros de fase. A paleta mostra
uma água, não seis, e o autor não consegue pintar a fase três por engano.

**Transições.** As peças geradas pela 4a passam a ser compostas fase a fase: a peça `<nome>-<código>`
ganha os mesmos quadros que o lado animado tem. Quando `from` e `to` têm contagens diferentes, o
lado curto repete por índice cíclico, e a contagem final é a do lado longo. Sem isso, o pincel
`grama-agua` deixaria uma linha morta na junção mais visível do mapa. A máscara de ruído continua
determinística e é a mesma em todas as fases da mesma peça, senão a borda cintilaria.

## 4. Formato do mapa e autoria

`HuntMapSchema` ganha `layers.canopy`, opcional, um array de nome de tile ou nulo, sujeito à mesma
checagem de `width * height` das outras camadas. Ser opcional é o que mantém
`packages/shared/data/hunts/route-1.json` válido sem edição.

O importador emite `canopy` quando o arquivo do Tiled tem uma camada de tiles com esse nome, e
omite o campo quando não tem. Os nomes citados por ela passam pela mesma checagem de existência no
tileset que `ground` e `detail` já sofrem.

Copa e bloqueio são independentes: o tronco continua marcado na camada de bloqueio pelo autor, e
uma peça na copa nunca vira obstáculo por si. `tools/assets/maps/route-1.tmj` passa a trazer a
camada vazia, na ordem certa, para o autor não precisar criá-la e nomeá-la à mão.

`renderMapPreview` desenha `ground`, `detail` e `canopy` nessa ordem, usando a fase 0 de cada
tile animado. A prévia passa a ter a mesma ordem de camada do jogo, então erro de camada aparece
sem subir servidor.

Servidor e motor não mudam. Eles leem bloqueio e spawns, e uma camada a mais passa reta.

## 5. Cena do cliente

A ordem de desenho passa a ser, de baixo para cima: chão e detalhe assados numa textura; tiles
animados do chão; personagens, que já se ordenam por posição; copa assada numa segunda textura;
tiles animados da copa; e o overlay de barra de vida e rótulo, que fica acima de tudo para o
jogador não perder o Pokémon de vista embaixo de uma árvore.

`buildMapSprite` passa a receber a tabela de animações e a pular qualquer posição cujo nome tenha
animação; essas posições viram `AnimatedSprite` num contêiner próprio. A decisão de assar ou
animar é uma função pura do mapa mais a tabela, o que a torna testável sem renderizador.

Todos os tiles animados compartilham um relógio só, com 500 ms por fase, declarado como constante
no cliente. A água pulsa junta em vez de ferver em desencontro, que é como o Tibia se comporta e
é o que o olho espera.

Câmera, zoom e efeitos não mudam: tudo continua dentro do mesmo contêiner de mundo.

Custo: só tile animado vira sprite. Numa rota isso é a mancha de água. O pior caso teórico, um
mapa inteiro de água, dá `width * height` sprites, ainda uma ordem de grandeza abaixo de desenhar
todas as camadas como sprite, que foi a alternativa descartada.

## 6. Testes

- Extrator: um item com três fases grava três arquivos, e a fase 0 cai no caminho antigo.
- Atlas: um tile animado produz os quadros esperados e uma entrada em `animations` que começa pela
  fase 0; um tile estático não produz entrada nenhuma.
- Tileset: a ordem escrita no `tiles.tsj` não contém nome de fase.
- Transição: com um lado animado, a peça mista sai com a contagem de quadros do lado longo, o lado
  curto repete, e a máscara é a mesma em todas as fases.
- Manifesto e importador: mapa com camada `canopy` importa com a camada; sem a camada, o campo não
  aparece e o resultado continua passando no `HuntMapSchema`.
- Prévia: a copa é desenhada depois do detalhe, provado por um pixel que só a copa poderia pintar.
- Cliente: a função pura de partição devolve as posições certas em cada balde, e um tile animado
  nunca aparece nos dois.

A meta de cobertura de cada pacote continua a que já vale.

## 7. Riscos

O maior é o dump usar fase como variação, não como quadro, em algum item curado; o resultado seria
tremeliqueira em vez de animação. A mitigação é olhar as fases na folha de contato antes de fechar,
e trocar a peça quando for o caso.

O segundo é o crescimento do atlas: seis quadros por tile animado. A entrega mede e reporta o
tamanho final da imagem, para a decisão de cortar alguma família ser tomada com número na mão.

O terceiro é erro de copa só aparecer em jogo. A prévia desenhar na mesma ordem do jogo é o que
reduz isso a um ciclo de conferência sem navegador.
