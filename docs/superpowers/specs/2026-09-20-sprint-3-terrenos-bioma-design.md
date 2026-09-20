# Sprint 3: terrenos base por bioma — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`.
Referência de estilo: `docs/design/referencia/estilo-terreno.png`.

## 1. Problema

O tileset de 155 peças vem do dump do Tibia e as transições entre materiais são compostas por
código, com máscara de ruído. Funciona, mas a margem fica pontilhada e o conjunto não tem unidade
visual. O teste pago do Retro Diffusion mostrou que dá para ter margem desenhada de verdade, com
borda escura e faixa de espuma, pelo mesmo preço de dez centavos por conjunto.

## 2. Objetivo e limites

Substituir a base de terreno por conjuntos gerados, coerentes entre si, cobrindo os seis biomas
que as regiões vão precisar.

Fora do escopo: props, vegetação e construção (sprint 4); desenhar Kanto (sprint 5); sprites de
Pokémon, que continuam vindo do dump por decisão do usuário.

Critério de pronto: seis pincéis de terreno novos aparecem na paleta do Tiled, gerados no mesmo
estilo, e a folha de aprovação passa no olho do usuário.

## 3. Os seis pares

Cada par vira um wangset de canto, no formato que a fase 4a já sabe declarar.

| Par | Prompt (curto, dois materiais) | Onde serve |
|---|---|---|
| campo → caminho | `Green grass and dirt path` | rota, ligação entre áreas |
| campo → água | `Green grass and blue water` | lago, rio, litoral |
| campo → areia | `Green grass and pale sand` | praia, deserto de borda |
| areia → água | `Pale sand and blue water` | linha d'água da praia |
| pedra → caverna | `Grey stone floor and dark cave rock` | interior de caverna |
| campo → pedra | `Green grass and grey rock` | montanha, afloramento |

A regra descoberta no teste vale para todos: **prompt curto de dois materiais**. Frase descritiva
longa produz ruído, e isso já custou dez centavos uma vez.

## 4. Pipeline

Nada de ferramenta nova. O que muda é a origem da imagem:

1. Gerar com `rd_tile__tileset`, 32 px, um conjunto por par.
2. Conferir na folha ampliada antes de aceitar; rejeitar e regerar sai por dez centavos.
3. Recortar o conjunto em peças de 32 e nomeá-las no padrão que o manifesto já usa.
4. Declarar o wangset no manifesto e rodar `pnpm assets build`.

O recorte é a única peça de código nova: o Retro Diffusion devolve uma grade 4×5 e o nosso
manifesto espera peças nomeadas por código de canto. A conversão é determinística e testável.

## 5. Convivência com o que existe

As transições compostas por código (`transitions` no manifesto) continuam funcionando e não são
apagadas nesta sprint. Elas passam a ser o caminho de exceção, para pares que não valem uma
geração. O que muda é a preferência: quando existe conjunto gerado, ele ganha.

Os 155 tiles atuais continuam no atlas. A substituição de props e vegetação é a sprint 4.

## 6. Testes

- O recorte da grade do Retro Diffusion em peças nomeadas é função pura e tem teste com uma grade
  sintética de cores conhecidas.
- O manifesto recusa conjunto com número de peças diferente do esperado.
- O build gera os wangsets novos e o tileset do Tiled continua com número de tile estável, o que
  já tem teste desde a correção de 19/09.

Curadoria não tem teste: é gosto, e a porta é a folha de aprovação.

## 7. Riscos

O maior continua sendo coerência entre lotes. Cada geração é um sorteio. Mitigação: gerar os seis
pares na mesma sessão, com o mesmo estilo, e aprovar em conjunto, não um a um.

O segundo é o conjunto gerado não cobrir os dezesseis códigos de canto que o Tiled espera. Se a
grade vier incompleta, o pincel fica capenga. Mitigação: o recorte valida a contagem e falha alto,
em vez de gerar um wangset com buraco.
