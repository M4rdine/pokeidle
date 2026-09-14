# Pokeidle MVP — Design

Data: 2026-09-13
Status: aprovado em conversa, aguardando revisão do arquivo

## 1. Objetivo

Clone do pokeidle.io como projeto de hobby para o autor e alguns amigos: um MMO idle
estilo PokeTibia que roda no navegador. O jogador escolhe uma hunt no mapa, o Pokémon
ativo anda até os selvagens, luta, loota e ganha XP sozinho, inclusive com a aba fechada.

Assets visuais (sprites de Pokémon estilo PXG e tiles do Tibia) vêm de packs da cena
PokeTibia e não têm licença. O projeto não será monetizado nem publicado em lojas.
Os assets ficam fora do repositório.

### Escopo do MVP

Entra:

- Conta com e-mail e senha, um treinador por conta.
- Três hunts jogáveis, cerca de 20 espécies da Gen 1.
- Loop de hunt automático simulado no servidor: procurar, andar, lutar, voltar ao
  Centro Pokémon, respawn.
- Golpes com dano, tipo e cooldown, tabela de tipos, fórmula de dano, XP e nível para
  treinador e Pokémon, ouro, loot, captura com Pokébola, poção.
- Mochila, time de até 6, Pokédex de vistos e capturados, log de eventos.
- Evolução simples por nível (uma linha evolutiva por espécie, sem pedra ou troca).
- Idle com aba fechada e recuperação após reinício do servidor (teto de 12 horas).
- Cliente com mapa de tiles, movimento animado, barras de HP, nomes e níveis.

Não entra (fases futuras): market, PvP, ranking, ginásio, clã, boss, loja, casa,
shiny, OAuth, verificação de e-mail, mobile, evolução por pedra ou troca. A coluna `is_shiny` já existe para não exigir migration depois.

## 2. Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Plataforma | Web, TypeScript | Igual ao original, roda em aba, fácil de hospedar |
| Servidor | Node + Fastify + WebSocket + Postgres, desde o início | Idle com aba fechada e base para sistemas sociais |
| Onde a simulação roda | Só no servidor, cliente renderiza (abordagem A) | Única fonte de verdade, elimina fraude de cliente |
| Combate | Golpes com cooldown estilo PXG | Fidelidade ao original |
| Render | PixiJS, interface em HTML vanilla | Mapa de tiles com movimento; interface é pequena |
| ORM / migrations | Drizzle | Tipagem forte, migrations em SQL legível |
| Testes | Vitest, Playwright, Postgres em Docker | Simulação é código puro, testa sem rede |
| Escala alvo | Dezenas de contas, um processo Node | Amigos; particionar por processo se crescer |

Abordagens descartadas:

- **Simulação determinística compartilhada:** exige determinismo perfeito em JS e
  confiar no resultado que o cliente reporta; detectar fraude devolve o custo da
  abordagem A com complexidade extra.
- **Cliente simula, servidor valida checkpoints:** hunt para ao fechar a aba e fraude é
  editar uma variável no console.

## 3. Estrutura do repositório

Monorepo pnpm.

```
pokeidle/
├── packages/
│   ├── shared/     # dados do jogo + fórmulas puras, sem I/O
│   ├── server/     # Fastify + WebSocket + Postgres, roda a simulação
│   └── client/     # Vite + PixiJS, renderiza e envia intenções
├── tools/
│   └── assets/     # extração .spr/.dat → PNG → spritesheet + atlas
├── assets/         # saída do pipeline, gitignored
├── docs/
└── docker-compose.yml   # Postgres local
```

`shared` contém: tabela de tipos, fórmula de dano, curva de XP, chance de captura,
definições de espécies, golpes, hunts, itens e tabelas de loot. Tudo como dados
tipados e funções puras. `server` executa; `client` consome apenas para exibição.
Nenhuma fórmula é reimplementada fora de `shared`.

## 4. Fase zero: pipeline de assets

Objetivo: transformar um pack PokeTibia bruto em arquivos que o PixiJS carrega direto.

1. **Fonte.** Cliente de servidor derivado de PXG com `Tibia.spr` e `Tibia.dat`
   (versão 8.54 ou 8.60), mais `items.otb` e um `.otbm` de exemplo para referência
   de mapa.
2. **Extração.** Leitor de `.spr/.dat` em TypeScript em `tools/assets`. Saída: um PNG
   por frame já composto (Pokémon 64x64 usa quatro sprites 32x32 por frame) e um
   `catalog.json` com os metadados de cada outfit e item. Object Builder é descartado
   por ser Adobe AIR.
3. **Curadoria.** `manifest.json` manual mapeando nome de espécie para IDs de sprite,
   com frames de andar em 4 direções e ataque. O `.dat` não tem nomes.
4. **Empacotamento.** Spritesheets por empacotador em grade próprio (determinístico,
   sem dependências; frames nunca são recortados ou rotacionados), atlas JSON no formato
   nativo do PixiJS. Um atlas `pokemon` e um único atlas `tiles` usado pelas camadas
   de chão e de detalhe.
5. **Mapa.** Uma hunt é um JSON de tiles com camadas (chão, detalhes, bloqueio) e uma
   lista de spawns. Desenhado no Tiled usando o atlas de tiles como tileset, exportado
   para JSON.

Contingência: se não houver pack íntegro com link vivo em uma tarde de busca, o MVP
começa com sprites gratuitos no mesmo formato de atlas. O código não muda.

## 5. Modelo de dados

**Dados estáticos** vivem em `shared` como TypeScript: espécies, golpes, hunts,
itens, loot, tabela de tipos, curva de XP.

**Estado do jogador** vive no Postgres:

- `users`: id, email único, hash de senha (argon2id), role (`player` | `admin`),
  created_at.
- `sessions`: token (32 bytes aleatórios), user_id, expires_at, last_seen_at.
- `trainers`: user_id único, level, xp, gold, active_hunt_id nullable,
  active_pokemon_id nullable, return_hp_percent, hunt_seed, last_simulated_at.
- `pokemon`: id, trainer_id, species_id, level, xp, current_hp, is_shiny,
  moves (array de move_id), team_slot nullable (1 a 6, null = mochila).
- `inventory`: trainer_id, item_id, quantity com constraint `quantity >= 0`, chave
  primária composta.
- `pokedex_entries`: trainer_id, species_id, seen_at, caught_at nullable.
- `hunt_log`: id, trainer_id, hunt_id, species_id, level, xp_trainer, xp_pokemon,
  gold, drops (jsonb), captured boolean, created_at.

Toda escrita que altera ouro, item ou captura ocorre em transação. Migrations com
Drizzle.

## 6. Loop de simulação no servidor

Um scheduler único roda todas as sessões de hunt ativas em ticks de 200 ms. O tick é
o átomo do jogo: um tile de movimento, um decremento de cooldown, um golpe.

**Sessão de hunt** (em memória, uma por treinador com hunt ativa): referência ao mapa
compartilhado, posição do Pokémon do jogador, selvagens vivos com posição e HP, alvo,
cooldowns, PRNG seedado por `hunt_seed`, buffer de eventos desde a última persistência.

**Máquina de estados do Pokémon do jogador:**

- `procurando`: escolhe o selvagem vivo mais próximo.
- `andando`: A* no grid, um tile por tick.
- `lutando`: adjacente ao alvo, usa o golpe de maior dano com cooldown zerado.
- `voltando`: HP abaixo de `return_hp_percent`; vai ao Centro Pokémon, cura em tempo
  proporcional ao dano, retorna.
- `parado`: time inteiro sem HP e sem poção; hunt pausa e o jogador é avisado.

**Selvagens:** spawns por hunt com espécie, faixa de nível e tempo de respawn. Ao
morrer: loot rolado pelo PRNG contra a tabela da espécie, XP para treinador e Pokémon,
ouro, tentativa de captura se houver Pokébola da tier adequada. Cada resultado vira um
evento no buffer.

**Persistência:** a cada 10 s, ou ao acumular 50 eventos, ou ao encerrar a sessão, o
buffer é aplicado em uma transação: atualiza `trainers` e `pokemon`, insere em
`hunt_log`, aplica drops em `inventory`. Perda máxima em queda de processo: 10 s.

**Idle com aba fechada:** a sessão continua no scheduler sem cliente conectado. No
boot do servidor, treinadores com `active_hunt_id` têm sessões recriadas e o intervalo
desde `last_simulated_at` é simulado em modo acelerado (tick a tick, sem esperar o
relógio, mesma seed), com teto de 12 horas.

**Custo:** centenas de operações em memória por tick por sessão. Cem sessões a 5
ticks/s é desprezível para um processo Node. Sessões não compartilham estado mutável,
então particionar por processo é possível sem redesenho.

## 7. Protocolo cliente-servidor

**HTTP (REST)** para o que não é tempo real: registro, login, logout, listar hunts,
Pokédex, inventário, time. Cookie de sessão httpOnly.

**WebSocket** para a hunt: uma conexão por aba, autenticada pelo cookie no handshake.
Envelope `{ type, payload }`, schema Zod em ambas as direções.

Cliente → servidor (intenções):

- `hunt.start { huntId }`
- `hunt.stop`
- `item.use { itemId }`
- `team.setActive { pokemonId }`
- `settings.update { returnHpPercent }`

Servidor → cliente:

- `hunt.snapshot`: estado completo da cena ao conectar ou trocar de hunt.
- `hunt.tick`: deltas desde o último tick (posições, HP, golpe usado com origem/alvo).
- `hunt.event`: derrota, drop, captura, level up, fuga; vira linha no log.
- `trainer.update`: xp, nível, ouro.
- `error { code, message }`: intenção rejeitada.

Reconexão pede novo snapshot. O cliente não prevê nem interpola além da animação
visual entre dois tiles.

**Validação de intenções:** schema válido, o treinador é dono do recurso, o estado
atual permite a ação. **Rate limit:** uma intenção a cada 200 ms por conexão; excesso
descartado com `error`.

## 8. Segurança

- Todo número que vale pontos (dano, drop, captura, XP, ouro) nasce no servidor.
- RNG só no servidor; `hunt_seed` guardado no banco e nunca enviado ao cliente.
- Idle offline calculado pelo relógio do servidor e `last_simulated_at`, nunca
  informado pelo cliente.
- Economia em transações Postgres com verificação de saldo, impedindo double-spend.
- Senha com argon2id; sessão em cookie httpOnly, Secure, SameSite Lax; WebSocket
  autenticado pelo mesmo cookie, nunca por token na URL. Expiração em 30 dias de
  inatividade.
- `hunt_log` permite detectar outliers de XP por minuto.
- Segredos em variáveis de ambiente; Postgres sem porta pública em produção; conta
  `admin` separada da conta de jogo.
- Bot não tem incentivo no MVP: o jogo já joga sozinho. Multi-conta vira preocupação
  apenas com market.

## 9. Cliente

Vite + TypeScript. Canvas PixiJS para a cena, interface em HTML por cima.

**Cena:** container de mapa com camadas de tile desenhadas uma vez; camada de entidades
ordenada por Y; camada de texto para nomes, níveis e barras de HP. Câmera segue o
Pokémon do jogador, zoom em passos fixos.

**Estado:** espelho do último snapshot mais deltas, objeto imutável recriado a cada
`hunt.tick`. Função `reconcile(estadoAnterior, estadoNovo, sprites)` cria, remove e
atualiza sprites. Movimento entre tiles interpolado ao longo dos 200 ms do tick; o
servidor sempre prevalece.

**Animações:** por espécie, andar em 4 direções e ataque, lidas do atlas. Golpe em
`hunt.tick` dispara animação de ataque e flash no alvo. Sem partículas no MVP.

**Interface:** barra superior de painéis, coluna esquerda de golpes com cooldown, log
no rodapé, mochila e time em modais. Vanilla TypeScript, componentes pequenos, store
com assinatura por fatia. Sem framework.

**Assets:** carregamento único no login (atlas de tiles, atlas de Pokémon do MVP,
ícones), abaixo de 5 MB. Carregamento por hunt quando a lista crescer.

## 10. Testes

- **Unitários em `shared`** (Vitest): tabela de tipos, dano, curva de XP, captura.
  Tabelas de casos.
- **Simulação** com PRNG seedado: 1000 ticks de uma hunt verificando invariantes (HP
  nunca negativo, XP monotônico, um evento de derrota por selvagem morto, respawn
  respeita o tempo). Seed fixa torna o resultado reprodutível para regressão de
  balanceamento.
- **Integração no servidor** com Postgres em Docker: registro, login, iniciar hunt,
  receber snapshot, save no banco após persistência. Transações de ouro e item sob
  requisições concorrentes para provar ausência de double-spend.
- **E2E** (Playwright): criar conta, iniciar hunt, ver a primeira derrota no log.
- **Cliente:** teste unitário de `reconcile` com estados sintéticos. Renderização
  validada por screenshot manual no MVP.

Meta: 80% de cobertura em `shared` e `server`. Cliente fora da meta no MVP.

## 11. Fases de entrega

1. Fase zero: pipeline de assets e primeiro atlas com 3 hunts e ~20 espécies.
2. `shared`: dados e fórmulas com testes.
3. `server`: auth, banco, simulação, WebSocket, persistência, recuperação no boot.
4. `client`: render, reconcile, interface, log.
5. E2E, compose local, README de execução.

Cada fase é um plano de implementação separado.
