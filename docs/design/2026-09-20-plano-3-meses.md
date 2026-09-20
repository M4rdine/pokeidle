# Pokeidle: proposta de design e plano de três meses

Data: 2026-09-20. GDD: `docs/design/2026-09-14-pokeidle-gdd.md`.

## 1. Para que serve este plano

Decisões do usuário em 2026-09-20, que orientam tudo abaixo:

| Pergunta | Resposta |
|---|---|
| Quem desenha os assets | Eu gero, ele corrige |
| Destino do jogo em três meses | Portfólio técnico |
| Assets do Tibia | Substituir só o cenário; sprites de Pokémon ficam |
| Ritmo | Mais de 15 h por semana, sprints semanais |

"Portfólio técnico" muda a prioridade: o que precisa impressionar é engenharia, não
quantidade de conteúdo. O jogo tem que estar bonito o bastante para alguém querer olhar, e
por baixo tem que mostrar simulação determinística, autoridade no servidor, tempo real,
pipeline de assets próprio, testes e operação. Conteúdo entra como prova de que os sistemas
existem, não como fim.

## 2. O que já é forte, e que a apresentação precisa destacar

Medido neste repositório, não prometido:

- Motor de simulação puro e determinístico, 232 testes no servidor, com teste de 3000 ticks
  que trava invariantes e progresso.
- Autoridade total no servidor: o cliente não simula nada, o que elimina a fraude que
  derruba clones de idle game.
- Tempo real com um escalonador a 5 ticks por segundo, 58 µs por tick por treinador, cerca de
  850 caçadas simultâneas a 25 % de CPU, e catch-up de até 12 h em fatias.
- Pipeline de assets escrito do zero: leitura de `.spr`/`.dat` do Tibia, atlas, fatiamento,
  tileset do Tiled com wangsets, transições geradas, prévia em PNG.
- 583 testes no monorepo e smoke de navegador que já pegou dois defeitos que teste unitário
  não pegaria.

O que falta para isso virar portfólio: ninguém consegue ver. Não há deploy público, não há
CI, não há documentação de arquitetura, e a primeira impressão visual é fraca.

## 3. Direção de arte

**Estilo travado:** pixel art limpa de 32 px, cores saturadas, sombreamento suave, contorno
escuro discreto e uma faixa clara de "espuma" onde materiais se encontram. É o estilo que o
Retro Diffusion produziu no teste de 2026-09-20, guardado em
`docs/design/referencia/estilo-terreno.png`, e é ele que define a paleta de tudo que vier depois.

**Regra de prompt, descoberta no teste:** prompt curto de dois materiais funciona; prompt
descritivo longo produz ruído. "Green grass and blue water" deu um conjunto wang coerente;
uma frase de vinte palavras com três materiais deu manchas sobre água ruidosa.

**Escopo da troca:** só cenário. Terrenos, props, vegetação, construção e efeitos de mapa
passam a ser gerados. Os sprites de Pokémon continuam vindo do dump, o que mantém o risco de
licença nos personagens e é uma decisão consciente do usuário.

**Custo:** dez centavos de dólar por conjunto de terreno. Saldo em 2026-09-20: US$ 5,30, ou
cinquenta e três conjuntos, o que cobre os seis biomas e as folhas de props com folga. O gargalo
é curadoria, não dinheiro.

**Pipeline:** gerar no Retro Diffusion, cortar para o nosso atlas, declarar wangset no
manifesto, abrir no Tiled, desenhar. As ferramentas para isso já existem desde a fase 4a.

## 4. O modelo de conteúdo que falta

A referência (pokeidle.io) não tem "mapas": tem **regiões** com portão de nível e, dentro de
cada uma, **dezenas de áreas**. Kanto e Johto abrem no nível 1, Outland no 150, Hoenn no 500,
Sinnoh no 1.000, Unova no 5.000, Kalos no 10.000, Alola no 25.000. Só Outland tem 58 áreas.

Cada área carrega espécie, faixa de nível, drops próprios e regras: a tela mostra "Nessa região
não existem espécies Shiny — área apenas para farm de itens lendários". O jogador escolhe onde
caçar num mapa-múndi com marcadores, filtrando por tipo, faixa de nível, fraco contra, forte
contra e já capturado.

Nosso modelo hoje é outro: uma hunt é um mapa de 40×30, e `unlocks.hunts` gateia por nível uma
lista plana. Isso não escala para dezenas de áreas por região.

**Proposta: região é o mapa, área é um recorte dele.**

| Conceito | O que é | De onde vem |
|---|---|---|
| Região | Um mapa grande desenhado uma vez, com bioma próprio e nível mínimo | Tiled, como hoje, só que maior |
| Área | Um retângulo dentro da região, com espécies, faixa de nível e respawn | Objeto no Tiled, como os spawns já são |
| Drop | Tabela por espécie, com ouro e itens por chance | `loot.json`, que já existe |
| Raridade | Variante da área que multiplica raros | Propriedade do objeto de área |

A decisão de engenharia que torna isso barato: **o importador recorta cada área num `HuntMap`
próprio na hora do build**. O motor não muda nada, os 232 testes do servidor continuam valendo, e
a região grande existe para duas coisas: autoria no Tiled e a imagem do navegador de áreas, que o
nosso `map-preview` já sabe gerar em PNG.

Com isso, desenhar uma região de vinte áreas custa um mapa, não vinte.

## 5. Design de jogo: o que entra em três meses

1. **Regiões e áreas**, como descrito acima. É a espinha; tudo depois depende dela.
2. **Navegador de áreas**: mapa da região com marcadores, filtro por tipo, faixa de nível, fraco
   contra e já capturado, com contagem de "X de Y áreas".
3. **Drops por área**: a tabela de loot já existe por espécie; falta multiplicador de raridade por
   área e a leitura no cliente, com o log mostrando o que caiu.
4. **Portão de nível por região**, que transforma `huntUnlockLevel` de código morto em sistema.
5. **Resumo de progresso offline**, que é a parte mais interessante do motor e hoje é invisível.
6. **Pokédex com meta** e **evolução visível**, ambas baratas e memoráveis.

Fora de escopo nestes três meses, apesar de existirem na referência: PvP, ginásio, torneio,
mercado entre jogadores, guilda, chat global, passe de batalha, VIP e gemas. São sistemas sociais
e de monetização que não servem ao objetivo de portfólio e multiplicam o custo de operação.

## 5b. Sobre as releases da referência

O usuário vai enviar as notas de versão do jogo de referência para virarem specs. Regra de
triagem, para o backlog não virar um depósito: cada release entra na fila classificada em
**adotar**, **adaptar** ou **descartar**. Adotar é o que cabe no nosso escopo e no nosso modelo.
Adaptar é o que precisa de outra forma aqui. Descartar é o que depende de PvP, monetização ou
população grande. Nada entra no sprint sem passar por essa classificação.

## 6. Sprints

Doze sprints semanais. Cada um termina com algo que dá para ver ou medir. A ordem mudou depois
da referência: infraestrutura barata primeiro, porque destrava mostrar; o modelo de conteúdo logo
em seguida, porque tudo depende dele; arte e mundo no meio; prova de engenharia no fim.

### Bloco A — fundação (semanas 1 a 3)

**Sprint 1: integração contínua e deploy público.**
Testes, tipos, cobertura e smoke a cada push. Servidor e Postgres hospedados, domínio, HTTPS e
migração no boot. Pronto quando existe um link que um estranho abre e joga, e um teste quebrado
deixa o PR vermelho sozinho.

**Sprint 2: modelo de conteúdo, região e área.**
Schemas de região e área no shared, objeto de área no contrato do Tiled, importador recortando
cada área num `HuntMap` próprio, registro e migração. A Rota 1 de hoje vira a primeira área de
Kanto. Pronto quando o jogo roda com o modelo novo sem o motor mudar de comportamento.

**Sprint 3: terrenos base por bioma.**
Seis pares de terreno gerados com prompt curto: campo, floresta, praia, caverna, montanha e
cidade. Cortar, nomear, declarar wangset. Pronto quando os seis pincéis aparecem na paleta do
Tiled e a folha de aprovação passa no seu olho.

### Bloco B — o mundo (semanas 4 a 6)

**Sprint 4: props, vegetação e construção.**
Árvores em três silhuetas por bioma, arbustos, flores, pedras, cerca, ponte e um Centro Pokémon
montável. Pronto quando nenhuma peça do Tibia resta no cenário.

**Sprint 5: Kanto desenhada.**
Uma região grande no Tiled, com doze áreas marcadas, espécies e faixas de nível coerentes com a
progressão. Pronto quando as doze áreas importam limpas e a prévia em PNG da região fica boa o
bastante para virar a imagem do navegador.

**Sprint 6: navegador de áreas.**
Mapa da região com marcadores, zoom e arraste, filtro por tipo, faixa de nível, fraco contra,
forte contra e já capturado, com contagem de "X de Y áreas". Pronto quando dá para achar onde
farmar um tipo específico sem sair da tela.

### Bloco C — sistemas (semanas 7 a 9)

**Sprint 7: drops por área.**
Multiplicador de raridade por área, leitura no cliente e log mostrando o que caiu, no formato da
referência. Pronto quando derrotar um selvagem lista itens e ouro na linha do log.

**Sprint 8: segunda região e portão de nível.**
Região nova com nível mínimo, e `huntUnlockLevel` finalmente chamado no servidor. Pronto quando
um treinador de nível baixo recebe recusa clara ao tentar entrar.

**Sprint 9: observabilidade.**
Métricas de tick, de caçadas ativas e de erro, mais rastreamento de exceção. Pronto quando dá
para responder "quantas caçadas rodam agora" olhando um painel.

### Bloco D — prova de engenharia (semanas 10 a 12)

**Sprint 10: resumo offline, histórico e pokédex.**
Tela de retorno com o que aconteceu, gráfico de XP e ouro por hora vindo do `hunt_log`, e pokédex
com progresso por região. Pronto quando fechar a aba por uma hora rende um relatório na volta.

**Sprint 11: teste de carga, celular e acessibilidade.**
Script que sobe N caçadas simultâneas e mede CPU, memória e atraso de tick. Layout responsivo,
toque, teclado e contraste. Pronto quando o número de 850 caçadas é confirmado ou corrigido, e dá
para jogar no celular sem rolagem lateral.

**Sprint 12: documentação e apresentação.**
Diagrama de arquitetura, decisões registradas, README honesto e vídeo curto de demonstração.
Pronto quando alguém de fora entende o projeto em cinco minutos.

## 7. Backlog fora dos sprints

Dívida registrada que entra quando sobrar espaço, em ordem de dor:

- Orçamento de bundle estourado: 437 kB, 117 kB comprimido, contra a meta de 300 kB.
- `/assets/atlas` relido do disco a cada request, sem ETag, com um PNG de 1,2 MB.
- Mapa viaja por HTTP e também dentro do registro que o navegador baixa.
- A gravação `route1-300.json` não exercita evolução, troca, queda, captura falha nem parada.
- Banco de teste compartilhado ainda falha sob carga alta; isolar por worker.
- `choosePotion` deveria derivar o ativo em vez de receber.
- A mochila de Pokémon nunca é podada.
- Venda na loja não é limitada por nível, decisão documentada.

## 8. Riscos

O maior é a coerência da arte gerada. Cada lote sai de um sorteio diferente e o conjunto pode
virar colcha de retalhos. Mitigação: travar o estilo no sprint 1, gerar sempre com o mesmo
estilo e prompt curto, e aprovar por folha de contato antes de entrar no atlas.

O segundo é o tempo do usuário virar gargalo na correção manual. Mitigação: eu entrego lotes
pequenos e frequentes, nunca um despejo de cem peças.

O terceiro é o deploy público expor um jogo sem moderação nem limite de abuso. Mitigação: o
sprint 5 entra com limite por IP, que já existe, e registro aberto pode virar convite se
aparecer problema.
