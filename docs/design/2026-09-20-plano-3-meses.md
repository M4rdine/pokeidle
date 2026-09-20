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

**Custo:** dez centavos de dólar por conjunto de terreno. Um cenário completo com seis pares
de terreno e vinte folhas de props fica em torno de três a cinco dólares. O gargalo é
curadoria, não dinheiro.

**Pipeline:** gerar no Retro Diffusion, cortar para o nosso atlas, declarar wangset no
manifesto, abrir no Tiled, desenhar. As ferramentas para isso já existem desde a fase 4a.

## 4. Design de jogo: o que muda em três meses

O loop não muda. O que entra é profundidade que prova sistemas:

1. **Rota 2 de verdade.** O destravamento por nível já existe em `unlocks.json` e nunca foi
   exercitado porque só há uma rota. Rota 2 transforma código morto em sistema demonstrável.
2. **Resumo de progresso offline.** O catch-up de 12 h é a parte mais interessante do motor e
   hoje é invisível. Uma tela de "o que aconteceu enquanto você estava fora" mostra isso.
3. **Pokédex com meta.** Já existem entradas de pokédex no banco. Falta objetivo e tela.
4. **Histórico de caçada.** O `hunt_log` já grava tudo. Um gráfico de XP e ouro por hora
   prova a telemetria e dá ao jogador uma razão para ajustar configurações.
5. **Evolução visível.** O evento existe e o cliente já tem o flash. Falta a tela de antes e
   depois, que é barata e memorável.

Fora de escopo nestes três meses: PvP, comércio entre jogadores, mais de duas rotas, som,
monetização.

## 5. Sprints

Doze sprints semanais. Cada um termina com algo que dá para ver ou medir.

### Bloco A — a primeira impressão (sprints 1 a 3)

**Sprint 1: travar o estilo e gerar os terrenos base.**
Gerar os seis pares de terreno (grama/terra, grama/areia, grama/água, terra/pedra,
pedra/caverna, areia/água) com prompt curto. Cortar, nomear e entrar no manifesto. Entregar
folha de aprovação e escolher com o usuário. Critério: seis wangsets novos no `tiles.tsj`.

**Sprint 2: props, vegetação e construção.**
Árvores em três silhuetas, arbustos, flores, pedras, cerca, ponte e um Centro Pokémon montável.
Critério: o tileset novo cobre tudo que a Rota 1 usa hoje, sem nenhuma peça do Tibia no cenário.

**Sprint 3: redesenhar a Rota 1 com o tileset novo.**
Trocar o gerador por autoria no Tiled, agora com peças que combinam. Critério: prévia em PNG
aprovada pelo usuário e jogo rodando com o mapa novo.

### Bloco B — o jogo existe para os outros (sprints 4 a 6)

**Sprint 4: CI no GitHub Actions.**
Testes, typecheck, cobertura e smoke rodando a cada push, com selo no README. Critério: PR
que quebra teste fica vermelho.

**Sprint 5: deploy público.**
Servidor e Postgres hospedados, domínio, HTTPS, migração automática no boot. Critério: link
que qualquer pessoa abre e joga.

**Sprint 6: observabilidade.**
Logs estruturados já existem; entram métricas de tick, de caçadas ativas e de erro, mais
rastreamento de exceção. Critério: painel que responde "quantas caçadas rodando agora".

### Bloco C — profundidade de sistema (sprints 7 a 9)

**Sprint 7: Rota 2 e destravamento.**
Mapa novo, spawns de nível mais alto, `huntUnlockLevel` finalmente chamado no servidor.
Critério: jogador de nível baixo recebe recusa clara ao tentar entrar.

**Sprint 8: resumo offline e histórico.**
Tela de retorno com o que aconteceu, e gráfico de XP e ouro por hora a partir do `hunt_log`.
Critério: fechar a aba por uma hora e ver o relatório ao voltar.

**Sprint 9: Pokédex e evolução visível.**
Tela de pokédex com progresso e tela de evolução com antes e depois.
Critério: capturar uma espécie nova muda a pokédex na hora.

### Bloco D — prova de engenharia (sprints 10 a 12)

**Sprint 10: teste de carga.**
Script que sobe N caçadas simultâneas e mede CPU, memória e atraso de tick, confirmando ou
corrigindo os números do README. Critério: gráfico com o limite real medido.

**Sprint 11: mobile e acessibilidade.**
Layout responsivo, toque, navegação por teclado e contraste. Critério: jogar no celular sem
rolagem horizontal.

**Sprint 12: documentação e apresentação.**
Diagrama de arquitetura, decisões registradas, README que explica o que é interessante, vídeo
curto de demonstração. Critério: alguém de fora entende o projeto em cinco minutos.

## 6. Backlog fora dos sprints

Dívida registrada que entra quando sobrar espaço, em ordem de dor:

- Orçamento de bundle estourado: 437 kB, 117 kB comprimido, contra a meta de 300 kB.
- `/assets/atlas` relido do disco a cada request, sem ETag, com um PNG de 1,2 MB.
- Mapa viaja por HTTP e também dentro do registro que o navegador baixa.
- A gravação `route1-300.json` não exercita evolução, troca, queda, captura falha nem parada.
- Banco de teste compartilhado ainda falha sob carga alta; isolar por worker.
- `choosePotion` deveria derivar o ativo em vez de receber.
- A mochila de Pokémon nunca é podada.
- Venda na loja não é limitada por nível, decisão documentada.

## 7. Riscos

O maior é a coerência da arte gerada. Cada lote sai de um sorteio diferente e o conjunto pode
virar colcha de retalhos. Mitigação: travar o estilo no sprint 1, gerar sempre com o mesmo
estilo e prompt curto, e aprovar por folha de contato antes de entrar no atlas.

O segundo é o tempo do usuário virar gargalo na correção manual. Mitigação: eu entrego lotes
pequenos e frequentes, nunca um despejo de cem peças.

O terceiro é o deploy público expor um jogo sem moderação nem limite de abuso. Mitigação: o
sprint 5 entra com limite por IP, que já existe, e registro aberto pode virar convite se
aparecer problema.
