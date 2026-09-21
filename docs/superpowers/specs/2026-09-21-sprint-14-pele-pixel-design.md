# Sprint 14 — A interface vira jogo

## O diagnóstico, medido

A tela de jogo tinha **52 classes CSS**, **11 elementos interativos** e **197 px da coluna
esquerda vazios** — 37 % dela sem função. O `DESIGN.md` existia e era coerente, mas descrevia
tokens, não componentes: painel, botão, medidor, selo de tipo e slot. Cinco coisas.

O jogo de referência tem, só no painel esquerdo, uns dez tipos de componente — moeda com ícone,
chip de atributo, emblema de rank, card com moldura, cabeçalho de seção, botão de ícone. O que
ele faz bem não é cor mais bonita: é **densidade, hierarquia repetível e arquitetura de
informação**.

## A decisão

O `DESIGN.md` anterior se comprometeu com "O Terminal de Campo" — escuro, chapado, borda reta de
2 px, raio zero. Para um painel de operação estava certo. Para um clone de Pokémon estava errado:
lia como dashboard, não como jogo. **O mundo visual foi substituído**, não refinado.

O novo mundo é o da interface de RPG 16-bit: **moldura com bisel**, luz em cima à esquerda e
sombra embaixo à direita, superfícies aninhadas onde o que é leitura afunda e o que é ação se
levanta. Não é a paleta da referência — é a gramática dela, com cor nossa.

### Por que a moldura é CSS, e não asset

Bisel de pixel é duas sombras internas sem desfoque. Em CSS ele é nítido em qualquer tamanho,
muda de cor por token e não depende de o gerador devolver um 9-slice exato. Asset fica para o que
só asset resolve: os ícones.

## Fora de escopo, e é decisão do dono

Amigos, jogadores online, chat, guild, gemas, diamantes, VIP, market, PvP, ginásio, torneio e rank
**não entram**. O servidor não tem nenhum desses sistemas, e painel sem sistema atrás é caixa
vazia — pior que a ausência. Entra só o que o servidor já entrega, adensado: nível de treinador
separado do nível do Pokémon, ouro, equipe com atributos, Pokémon em campo, inventário, Pokédex e
configurações.

## O vocabulário novo

| Componente | Papel |
|---|---|
| `.quadro` | superfície levantada, com bisel — todo painel |
| `.quadro-fundo` | superfície afundada — onde se lê, não onde se age |
| `.chip` | atributo curto e repetível (nível, tipo, poder) |
| `.moeda` | valor com ícone, alinhado em coluna tabular |
| `.cabeca` | cabeçalho de seção em caixa alta |
| `.botao-icone` | ação sem texto, quadrada |
| `.medidor` | barra afundada com preenchimento e rótulo |
