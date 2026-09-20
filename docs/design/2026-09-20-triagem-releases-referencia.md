# Triagem das releases do pokeidle.io

Data: 2026-09-20. Fonte: notas de versão do Discord da referência, de **2026-08-07 a 2026-09-18**,
da v1.22 à v1.65, em dois lotes. Plano que consome esta triagem:
`docs/design/2026-09-20-plano-3-meses.md`.

## 1. Como triei

Cada item entra em **adotar**, **adaptar** ou **descartar**, contra três filtros:

1. **Cabe no objetivo?** O nosso é portfólio técnico. Sistema que só brilha com população grande
   não prova engenharia aqui, prova operação de comunidade.
2. **Cabe no modelo?** Região com áreas, hunt por área, motor determinístico no servidor.
3. **Custa o quê?** Sistema que exige moderação, suporte, pagamento ou anti-fraude de conta
   multiplica custo de operação sem multiplicar o que o projeto demonstra.

A referência é um jogo comercial que saiu de beta para lançamento no período, com 800 a 1.600
jogadores simultâneos, monetização por diamantes, RMT, staff e tickets. Boa parte do que ela
lançou existe para sustentar isso. Copiar sem triar seria copiar o custo junto.

## 2. Adotar

| # | Sistema | Por que adotar | Sprint |
|---|---|---|---|
| A1 | **Degraus de dificuldade por região** (Outland 1 a 8: nível 150→25.000, drops raros ×1→×8, XP e ouro inalterados) | Encaixa no modelo região/área e dá profundidade sem conteúdo novo | 8 |
| A2 | **Teto de nível na captura** em hunts de nível alto | Regra anti-inflação de uma linha, com efeito grande na curva | 8 |
| A3 | **Rebalanceamento de economia** (curva de ouro achatada após certo nível, loot voltando a importar) | Nosso motor simula 3000 ticks em teste; provar balanceamento por simulação é raro em portfólio | 7 |
| A4 | **Nota do Pokémon 0–10 por espécie**, alinhada à força, dez faixas | Fórmula pura e testável, e eles já erraram: a nota antiga somava stats e caía ao evoluir | 10 |
| A5 | **Qualidade do indivíduo**: IV, potência, tiers P1–P5, e **refino** (queimar pedra para +1 permanente em ATK, DEF, SP.ATK, SP.DEF ou HP; velocidade não refina, só entra no cooldown) | Dá razão para capturar o mesmo Pokémon de novo | 10 |
| A6 | **Painel de automação completo** (poções por slider de 10 a 100 %, revive ao desmaiar, voltar à hunt **com trava**: não volta sem poção nem revive) | Já temos dois limiares; é o que faz um idle ser idle, e a trava evita o loop de morte que eles sofreram | 7 |
| A7 | **Penalidade de morte** (−10 % do XP do nível) e **desistir do combate** com aviso do custo | Fecha o loop de risco que hoje não existe | 7 |
| A8 | **Itens seguráveis**, começando por Exp. Share (5 % do XP de batalha) | Primeiro sistema de item equipado, base para o resto | 10 |
| A9 | **Bolsa com abas** (treinador, pedras, loots, raros) | O inventário já existe e está cru | 10 |
| A10 | **Pokédex com vistos e capturados**, filtro por tipo, evolução e pedra necessária por espécie | Os dados já estão no banco desde a fase 2b | 10 |
| A11 | **Bosses**: espécie não capturável, drop exclusivo, barra de vida própria no palco | Conteúdo de fim de linha barato, reaproveita o motor inteiro | 8 |
| A12 | **Contadores de sessão** (ouro/h, abates/h, capturas/h, drops contados) | Telemetria de jogo é argumento de portfólio | 9 |
| A13 | **Carência de reconexão** (90 s antes de perder a hunt) | Robustez de tempo real; temos heartbeat, falta a carência | 9 |
| A14 | **Pesca** como segunda atividade, com cooldown próprio | Exercita o motor de tick com algo que não é combate | 11 |
| A15 | **Folga de nível** (usar Pokémon até 5 níveis acima do treinador, exceto o inicial) e **reduzir nível** | Regras pequenas que resolvem frustração real relatada por eles | 10 |
| **A16** | **Analisador de hunt**: ao passar o mouse na área, mostrar XP/hora, ouro/hora, matchup de tipo e tabela de drops por espécie | É a melhor ideia da referência inteira e é dado derivado puro. Entra junto com o navegador de áreas | 6 |
| **A17** | **Depot**: armazém de Pokémon fora da equipe, captura com time cheio vai direto para lá, com busca e ordenação por nota | O `state.box` já existe no motor desde a fase 3a e nunca ganhou tela | 10 |
| **A18** | **Shiny decidido no servidor só na captura**, nunca visível durante a hunt, sem som que denuncie | Eles adotaram isso para matar macro e multi-conta. Encaixa exatamente na nossa autoridade de servidor e é um argumento de segurança para a apresentação | 8 |
| **A19** | **Evolução com múltiplos destinos** (Eevee), com pedra e nível corretos por destino e tela de escolha | Nosso sistema de evolução é linear hoje | 10 |
| **A20** | **Validação automática de conteúdo**: toda pedra exigida por alguma evolução precisa ser obtenível, toda espécie precisa de área, toda tabela de drop precisa fechar | Nasce de um bug real deles: 34 evoluções dependiam da Sun Stone e **nenhuma hunt dropava**. Nosso importador já valida alcançabilidade de mapa; estender para conteúdo é barato e impressiona | 7 |
| **A21** | **Regras de saída da hunt**: só sai no Centro ou com item de fuga, e liberação entre ondas | Fecha uma brecha de otimização e é regra de motor, barata | 7 |
| **A22** | **Modo imersivo**: esconder HUD e deixar só a cena, como papel de parede animado | Custa pouco e é exatamente o quadro que se usa para demonstrar o projeto | 11 |
| **A23** | **Excluir conta e trocar e-mail** (LGPD) | Engenharia real, exigência legal, e conta como cuidado de produto na apresentação | 12 |
| **A24** | **Landing page separada do jogo**, com o jogo em `/app` | A porta de entrada do portfólio | 12 |

## 3. Adaptar

| Sistema da referência | O que fazemos aqui | Por quê |
|---|---|---|
| Ginásios liderados por jogadores, +25 % de dano por tipo | Ginásios PvE com líder fixo e o mesmo bônus de tipo na hunt | Sem população para disputar liderança, mas o bônus por tipo é ótimo objetivo |
| Mercado da comunidade, com taxa de anúncio, nota mínima, empilhamento e retenção anti-multi-conta | Mercado NPC com histórico de preços | Mercado entre jogadores exige população e moderação; o histórico é o que tem valor técnico |
| Casas por sorteio de fragmento, com VIP e IPTU em diamantes, academia interna e raridades de 85 % a 0,0005 % | Base do treinador com postos de XP para Pokémon guardados, sem sorteio pago | Vira sumidouro de progressão single-player, sem economia nem paywall |
| TM Researcher com peças de boss, disco AoE e discos elementais por tipo | Sistema de golpe permanente por item, sem a camada de troca de peças | O efeito de combate é interessante; a economia de peças não |
| Modo Pocket com janela flutuante e PiP no Android | Tela compacta de acompanhamento, sem PiP nativo | PiP nativo é custo alto para web |
| Copiar Wiki e Pokédex para o ChatGPT | Exportar dados por rota pública em JSON | Mesma utilidade, e vira demonstração de API |
| Captcha Cloudflare e lista de domínios de e-mail permitidos | Limite por IP, que já existe, mais convite se aparecer abuso | Dependência externa que não acrescenta ao que o projeto demonstra |
| Patch notes em modal dentro do jogo | Changelog gerado do histórico do git | Mostra disciplina de release sem manutenção manual |

## 4. Descartar

Depende de população, dinheiro real ou equipe de moderação. Fica registrado como decidido fora,
não como esquecido.

- **Monetização inteira**: diamantes, VIP, boosts pagos, pacotes, fundador, reembolso, referral,
  votação por recompensa, sorteios de rede social, skins pagas.
- **RMT e mercado de diamantes.**
- **PvP ranqueado, fichas de PvP, guerra de guildas, torneios, ranking global.**
- **Guildas, chat mundial, sussurro, lista de amigos, ignorar jogador, moderação com mute,
  tags de cargo, staff e tickets.**
- **Anti-multi-conta e limite de contas.**
- **Trilha sonora com player arrastável.** Som inteiro está fora do escopo destes três meses.
- **Infra para 10 mil simultâneos.** Nosso alvo medido é outro: 850 caçadas a 25 % de CPU numa
  máquina só, e provar esse número é mais interessante que persegui-lo.

## 5. O que aprender com os tropeços deles

A parte mais útil das releases, e que não aparece em lista de features nenhuma.

**A pedra que ninguém podia conseguir.** Trinta e quatro evoluções dependiam da Sun Stone e
nenhuma hunt a dropava. Descobriram em produção. É o argumento mais forte a favor do item A20:
validação de conteúdo automatizada, no mesmo lugar onde já validamos alcançabilidade de mapa.

**A inflação de moeda.** Admitiram em 03/09 que, depois do nível 100, a curva de ouro gerava
inflação a ponto de a moeda "não servir mais pra nada". Antes disso, em 11/08, um Aerodactyl com
valor de venda corrompido valia 23 bilhões e obrigou reinício de emergência. Nós temos motor
determinístico: dá para medir a curva **antes** de soltar e travar com teste de balanceamento,
como já fizemos com o limiar de retorno em 50 %.

**A nota que punia evoluir.** A nota era soma de stats, então evoluir baixava a nota do mesmo
indivíduo. Confundiu a base por semanas. Lição de fórmula: normalizar por espécie desde o
primeiro dia.

**O shiny que os bots enxergavam.** Macros identificavam shiny durante a hunt e gastavam a bola
cara só nele. A correção foi estrutural: o shiny passa a ser decidido no servidor **no momento da
captura**, e nada no cliente denuncia antes. É exatamente o tipo de decisão que a nossa
arquitetura já permite e que vale contar na apresentação.

**O retorno automático que matava o jogador.** O "voltar à hunt ao morrer" fazia perder XP em
loop quando acabavam poções e revives. A trava veio depois. Nós implementamos a trava junto.

**O travamento com dois alvos.** Tiveram deadlock de aggro quando dois inimigos agrediam ao mesmo
tempo, deixando o Pokémon parado. Nosso `pickTarget` tem a mesma classe de risco e merece um
teste de regressão explícito.

**A Pokédex fantasma.** Variantes de uma região eram contadas como espécies de outra geração,
gerando milhares de abates falsos. Integridade de dado de conteúdo também precisa de teste.

**A reversão de economia.** Em 24/08 anunciaram mudança de economia e reverteram no mesmo dia,
antes de subir. Sinal de mudança sem simulação prévia. Nós temos o simulador.

## 6. O que muda nos sprints

Nenhum sprint novo foi criado. Os vinte e quatro itens adotados couberam nos blocos existentes,
porque quase todos são regra de jogo, não infraestrutura. Os sprints mais afetados:

- **6** ganha o analisador de hunt junto do navegador de áreas.
- **7** vira o sprint de regras de risco e economia, com automação, morte, saída de hunt e a
  validação automática de conteúdo.
- **8** ganha degraus de dificuldade, teto de captura, bosses e o shiny decidido no servidor.
- **10** concentra os sistemas de indivíduo: nota, qualidade, refino, itens seguráveis, depot,
  evolução ramificada e pokédex.
- **12** ganha landing page e exclusão de conta.

Cada item adotado vira spec própria no fluxo de sempre, com brainstorm, spec e plano, na semana
em que for executado. Esta triagem é o funil, não a especificação.
