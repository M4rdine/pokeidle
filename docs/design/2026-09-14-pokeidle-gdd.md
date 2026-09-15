# Pokeidle — Game Design Document (MVP)

Data: 2026-09-14. Complementa a spec do MVP (`docs/superpowers/specs/2026-09-13-pokeidle-mvp-design.md`)
e as specs técnicas das fases. Este documento diz o que o jogador sente e decide; as specs dizem
como o código faz. Decisões aqui vieram do usuário em 2026-09-14; números vieram de simulações
com o motor real (10 minutos na Rota 1, 4 seeds, Charmander nível 10).

## 1. Fantasia e loop

Você é um treinador que escolhe uma hunt, e o seu Pokémon ativo caça sozinho: anda até um
selvagem, luta com golpes em cooldown, ganha XP, ouro e loot, tenta capturar espécies novas, usa
poção quando o HP cai, volta ao Centro Pokémon quando não dá mais, e continua mesmo com a aba
fechada. Você intervém nas decisões que importam: qual Pokémon está ativo, quando trocar, o que
comprar, quando parar, e nos limiares que governam o automático.

O laço de um minuto: andar → lutar (3–6 golpes) → derrota → +XP/+ouro → próximo selvagem.
O laço de uma sessão (10–30 min): subir de nível, capturar uma espécie nova, evoluir o inicial,
comprar poções melhores. O laço de dias: completar a Pokédex da hunt, subir o nível do treinador
para destravar itens e vagas, chegar na hunt seguinte.

## 2. Os primeiros 10 minutos

1. **Registro** (30 s): e-mail e senha, sem confirmação.
2. **Inicial** (30 s): Charmander, Bulbasaur ou Squirtle no nível 10, com o sprite andando e os
   tipos. Nível 5 foi testado e é injogável na Rota 1 (0–2 derrotas em 10 min); 10 é o mínimo
   que caça sozinho.
3. **Primeira hunt** (imediato): a lista tem só a Rota 1 (níveis 2–12) com "Iniciar". O jogador
   nasce com 3 Poções e 5 Poké Balls.
4. **Minuto 1**: o Pokémon anda até o primeiro selvagem e luta. Dica única: "Seu Pokémon caça
   sozinho. Você pode fechar a aba." Primeira derrota vira a primeira linha de log com +XP/+ouro.
5. **Minuto 2–5**: primeira captura (a Rota 1 tem 5 espécies; a primeira nova vira captura
   automática com uma bola). Dica: "Capturou! O time tem 6 vagas; veja em Time."
6. **Minuto 5–8**: primeira vez abaixo de 50 % de HP → poção automática, com dica: "Usou uma
   Poção. Ajuste em Configurações quando usar e quando voltar ao Centro."
7. **Minuto ~7**: Charmander chega ao nível 16 e evolui (fanfarra). Meta seguinte aparece no HUD:
   nível de treinador para destravar a Super Poção e a Great Ball.
8. **Minuto 10**: ~180 derrotas, 3–5 capturas, ~1 500 de ouro. A loja do Centro já é útil.

Com as regras atuais (retorno em 30 %, poção de 20 %), metade das primeiras sessões termina com o
time caído no primeiro minuto. Com as regras deste documento, zero quedas em 3 de 4 seeds.

## 3. Sistemas

### 3.1 Combate
- Tick de 200 ms; golpe = dano oficial × tipo × STAB, com cooldown proporcional ao poder.
- **Quem chega ataca primeiro**: o selvagem só revida a partir do tick seguinte ao engajamento
  (hoje ele dá o primeiro golpe; mudança pequena no motor).
- Golpe escolhido pelo maior dano esperado entre os prontos; imunidade pula o selvagem.
- O ativo caído troca para o próximo do time; time inteiro caído para a hunt e cura no Centro.

### 3.2 Cura e poções
- Dois limiares por treinador, configuráveis: **usar poção abaixo de X %** (padrão 50) e
  **voltar ao Centro abaixo de Y %** (padrão 30). Abaixo de X com poção: usa a mais fraca que
  cubra o HP faltante, senão a mais forte que tiver. Sem poção e abaixo de Y: volta ao Centro
  (cura completa em 5 s, grátis).
- Poções em três níveis, por percentual do HP máximo: Poção 20 % (100 ouro), Super Poção 50 %
  (400), Hiper Poção 100 % (1 500). Venda pela metade.
- Medido: retorno em 50 % + poção de 50 % dá ~180 derrotas em 10 min sem quedas.

### 3.3 Captura e time
- Captura automática configurável (tier de bola, HP máximo do selvagem, duplicatas), uma
  tentativa por selvagem, bola consumida mesmo em falha.
- Time de até 6; vagas destravam por nível de treinador (tabela abaixo). Capturado com o time
  cheio vai para a **mochila de Pokémon** (guardado, trocável no modal Time), nunca descartado.
- Bolas: Poké Ball (200), Great Ball (600), Ultra Ball (1 200), compradas na loja conforme o nível.

### 3.4 Nível do treinador (progressão central)
- XP do treinador = mesmo XP que cada derrota dá ao Pokémon. Curva `medium-fast` (XP = L³),
  já existente no `shared`. Ritmo medido na Rota 1: ~44 000 XP/h.

| Nível | XP acumulado | Tempo estimado | Destrava |
|---|---|---|---|
| 1 | 0 | início | Poção, Poké Ball, 3 vagas no time |
| 10 | 1 000 | 2 min | 4.ª vaga |
| 20 | 8 000 | 11 min | Super Poção, Great Ball, 5.ª vaga |
| 30 | 27 000 | 37 min | Hiper Poção, 6.ª vaga |
| 40 | 64 000 | 1 h 30 | Ultra Ball |
| 50 | 125 000 | 2 h 50 | Rota 2 (quando existir; aparece bloqueada antes) |

O HUD mostra nível, barra de XP e "próximo: Super Poção no nível 20".

### 3.5 Economia
- Ouro só de derrotas (4–20 por selvagem na Rota 1; ~9 000/h). Loja no Centro Pokémon, aberta
  só fora de hunt: compra e venda dos itens acima, respeitando o nível do treinador. Transação
  com checagem de saldo (S15). Sem market nem troca entre jogadores no MVP.

### 3.6 Pokédex e hunts
- Pokédex por hunt: "Rota 1: 3/5" no HUD; espécie vista quando aparece, capturada quando entra.
- Hunts: só a Rota 1 nesta fase. A lista mostra hunts futuras bloqueadas pelo nível exigido.

## 4. Feedback por evento (cliente)

| Evento | Cena | HUD/log | Primeira vez |
|---|---|---|---|
| `moved` | tween de 200 ms, animação de andar na direção | — | — |
| `attack` do jogador | avanço de 8 px, número de dano; super efetivo maior e laranja, pouco efetivo cinza | log "X usou Y em Z: N" | — |
| `attack` do selvagem | flash branco e tremor de 2 px no ativo | barra de HP | dica em HP < 50 % |
| `wildDefeated` | fade 300 ms; "+XP" flutuante amarelo | log com XP e ouro; barra de XP do treinador | dica na primeira |
| `captured` | brilho branco 400 ms e o selvagem some | log "Capturou X!"; slot do time pisca | dica "veja em Time" |
| `captureFailed` | bola quica e some | log "A Poké Ball falhou" | — |
| `levelUp` | anel dourado 600 ms | log; cartão do ativo pisca | — |
| `evolved` | fade branco e troca de sprite | toast grande | — |
| `itemUsed` | brilho verde curto | log "Usou Poção: HP N" | dica de configurar |
| `returning` / `healed` | trilha até o Centro; brilho verde no Centro | log | dica "voltou ao Centro" |
| `stopped` | escurece a cena | sobreposição com motivo e "Iniciar de novo" | — |
| nível de treinador | — | fanfarra na barra + toast "Destravou: …" | — |
| bolas acabando (≤ 1) | — | toast "Compre bolas no Centro" | uma vez por sessão |

Sem som no MVP (a coluna fica para depois). Sem partículas além das listadas.

## 5. Hierarquia de informação (desktop)

Sempre visível: HP e nome do ativo, golpes com cooldown, alvo atual (destacado na cena), nível e
XP do treinador com o próximo destrave, ouro, contador da Pokédex da hunt, estado da conexão e
o log dos últimos eventos. Um clique: time (6 slots com HP), configurações, mochila, loja,
Pokédex. Escondido: seed, estado do PRNG, ids internos, ticks brutos (só em debug).

## 6. Números de referência (medidos)

Charmander nível 10 na Rota 1, 10 minutos, regras deste documento: 170–210 derrotas, 3–5
capturas, ~7 000 XP, ~1 500 ouro, nível 21–22 do Pokémon, 7–15 retornos ao Centro, 0–1 queda.
Custo de CPU do servidor: 58 µs por tick por hunt (~850 hunts simultâneas em 25 % de um núcleo).

## 7. O que muda no código (entra como "fase 3a: regras e economia", antes do cliente)

1. `items.json`: Poção 20 %/100, Super 50 %/400, Hiper 100 %/1 500; `sellPrice` = metade.
2. Motor: `HuntSettings.potionHpPercent` (padrão 50) além de `returnHpPercent` (30); escolha da
   poção por HP faltante; quem chega ataca primeiro; `state.box` para capturas com o time cheio
   (o motor é a única fonte de verdade, inclusive no catch-up); vagas do time vindas de
   `settings.teamSlots`.
3. Banco: colunas `potion_hp_percent` em `trainers`; mochila de Pokémon já cabe em `pokemon`
   com `team_slot` nulo; sync grava o `box`.
4. Nível do treinador derivado de `trainers.xp` com `levelFromXp('medium-fast')`; tabela de
   destraves em `shared` (`data/unlocks.json`); servidor valida compras e tamanho do time.
5. REST: `GET /shop` (catálogo com nível exigido), `POST /shop/buy`, `POST /shop/sell`, só sem
   hunt ativa, transacionais; `PATCH /trainer/settings` aceita `potionHpPercent`.
6. Cliente (fase 3b): HUD e telas conforme §4 e §5.

## 8. Decisões em aberto (não bloqueiam)

Som; Rota 2 e caverna (conteúdo); market/troca; ranking; o que o nível 50+ destrava quando
houver mais hunts; se a cura no Centro deve custar ouro em níveis altos.
