# Sprint 12 — O HUD vira instrumento

## O que está errado, medido

O `hud.css` começa com `/* HUD da tela de jogo: preenchido na etapa da tela do jogo. */`. O
comentário é de um placeholder que nunca foi substituído, e a tela mostra isso. Medido numa janela
de 1280×718 com sessão real:

| Superfície | Altura | Fração da tela |
|---|---|---|
| Barra de topo | 107 px (quebra em duas linhas) | 15 % |
| Log | 180 px fixos | 25 % |
| Cena — o jogo | 432 px | 60 % |

**Quarenta por cento da tela é moldura, e o log — a superfície menos ligada a decisão — é o maior
painel do quadro.**

Defeitos concretos, todos verificados no DOM:

1. **Banda preta de 33 px sob a cena.** `app.init({ resizeTo: parent })` mede o pai uma vez e
   depois só escuta `window`. Quando os dados da sessão chegam, a barra de topo quebra de uma
   linha para duas, o centro encolhe 33 px e o Pixi não re-mede. Um defeito causa o outro.
2. **O sprite do ativo cobre o nome.** `.sprite` usa `transform: scale(2)` com
   `transform-origin: top left`: a caixa continua do tamanho do frame e o desenho transborda por
   cima do texto de baixo. "Charizard L61" sai ilegível.
3. **As barras de HP e XP são `<progress>` cru, em azul de navegador.** Azul não existe na paleta
   do projeto — o DESIGN.md tem um acento só, amarelo.
4. **Três 🔒 nos slots travados.** Emoji fazendo papel de ícone, num sistema que não tem ícone
   nenhum em lugar nenhum.
5. **Sem hierarquia na barra de topo.** O ouro — o número que o jogador veio ver — tem o mesmo
   peso de `tick 63146`, que é telemetria de desenvolvedor.
6. **Superfícies do navegador sem tema.** Scrollbar, checkbox, anel de foco e seleção de texto
   saem no padrão do sistema, em cima de um mundo visual inteiro definido no DESIGN.md.

## O que esta sprint entrega

### 1. Proporção: a cena cresce

Barra de topo em uma linha só, por hierarquia e não por encolher fonte. Log responsivo
(`clamp`) no lugar dos 180 px fixos. O que sobra vai para a cena.

`ResizeObserver` no container da cena: ela passa a preencher o espaço em qualquer mudança de
layout, não só em `window.resize`. É a correção de raiz da banda preta.

### 2. Barra de topo com três zonas

Identidade (nome, nível, XP), leitura (ouro em destaque, progresso da área) e ações. O estado da
conexão e o tick viram um bloco de status micro — telemetria não compete com decisão.

### 3. Ficha do ativo legível

Caixa de sprite dimensionada, como `spriteThumb` já faz nas outras telas: nada transborda.
Medidores próprios no lugar de `<progress>` cru, com cor semântica no HP — verde saudável,
amarelo ferido, vermelho crítico — que é leitura de instrumento, não decoração.

### 4. Time sem emoji

Slot travado mostra o nível que destrava, que é informação. Slot vazio diz que está vazio. Sem
glifo Unicode fazendo papel de ícone.

### 5. Superfícies do navegador vestidas

Scrollbar, checkbox, anel de foco e seleção saem da paleta. É o sinal mais barato de que a tela
foi construída e não montada, e o que se esquece com mais frequência.

### 6. Estados de verdade

Desconectado, vazio e primeira vez deixam de ser um travessão. Quem chega e vê "—" não sabe se o
jogo quebrou ou se ainda não começou.

### 7. Arquivo com hash criado depois do boot

Apareceu no caminho, ao rebuildar o cliente com o servidor no ar: a página abria em branco e o
console dizia que o CSS voltou `application/json`. Causa: `@fastify/static` com `wildcard: false`
varre a pasta no registro e cria **uma rota por arquivo**. Um build novo gera nomes com hash que
não existiam naquela varredura, e o 404 em JSON chega no lugar da folha de estilo.

A correção é uma rota de reserva com alcance só em `/app`, onde moram os arquivos com hash:
nenhuma rota de API muda de comportamento e o 404 de rota desconhecida continua sendo JSON. O
caminho pedido é resolvido e comparado com a pasta antes de qualquer leitura, e só as extensões
que o build emite são servidas.

Um teste de travessia acompanha. Ele começou errado: o "segredo" estava **dentro** da pasta do
build, onde tudo é público por definição, e acusou como falha o que era o comportamento correto.
A ameaça real é escapar da `CLIENT_DIST` — é isso que o teste mede agora.

## Fora de escopo

Detalhe de Pokémon e verbete de Pokédex com conteúdo — são conteúdo novo, não acabamento, e estão
na sprint 13.

## Como se verifica

Captura em 1280 e em 390 px, contraste do texto corrente ≥ 4,5:1, e os testes de unidade das
telas que já existem em `packages/client/test`.
