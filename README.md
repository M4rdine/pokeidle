# Pokeidle

MMO idle de Pokémon que roda no navegador: você escolhe uma área, seu Pokémon caça sozinho, e o
progresso continua com a aba fechada. A simulação inteira acontece no servidor.

[![CI](https://github.com/M4rdine/pokeidle/actions/workflows/ci.yml/badge.svg)](https://github.com/M4rdine/pokeidle/actions/workflows/ci.yml)

## O que tem de interessante aqui

- **Motor determinístico e puro.** O combate, a captura, a progressão e o caminho são funções sem
  efeito colateral, testadas com uma corrida de 3000 ticks que trava invariantes e progresso.
- **Autoridade total no servidor.** O cliente não simula nada e não decide nada: ele desenha o que
  recebe e manda intenção. É o que elimina a fraude que derruba clones de jogo idle.
- **Tempo real com um agendador só.** Cinco ticks por segundo para todos os treinadores, com
  58 µs por tick por treinador e cerca de 850 caçadas simultâneas a 25 % de CPU numa máquina.
- **Progresso offline.** Quem volta depois de horas recebe a simulação recuperada em fatias, com
  teto de 12 horas.
- **Observabilidade de verdade.** `/metrics` no formato Prometheus (tick, caçadas, persistência,
  HTTP, erros) e um painel que lê o mesmo endpoint, os dois atrás de credencial.
- **Pipeline de assets escrito do zero.** Leitura de sprites, atlas, fatiamento, tileset do Tiled
  com pincéis de terreno e prévia do mapa em PNG.

## Rodar localmente

Precisa de Node 22, pnpm e Docker.

```bash
pnpm install
docker compose up -d                 # Postgres em 5433
cp .env.example packages/server/.env # ajuste se quiser
pnpm --filter @pokeidle/client build
pnpm --filter @pokeidle/server start # http://localhost:3000
```

## Testes

```bash
pnpm -r test        # suíte completa dos cinco pacotes
pnpm client:e2e     # smoke no navegador, com Playwright
```

Os testes de integração do servidor compartilham um Postgres só e rodam um arquivo por vez. Não
rode duas suítes ao mesmo tempo na mesma máquina.

## Estrutura

| Pacote | Responsabilidade |
|---|---|
| `packages/shared` | dados, fórmulas puras e o protocolo entre cliente e servidor |
| `packages/server` | Fastify, Postgres, o motor de simulação e o agendador de tempo real |
| `packages/client` | PixiJS sem framework, com espelho puro do estado |
| `tools/assets` | extração de sprites, atlas, tileset do Tiled e importação de mapa |
| `tools/pokedata` | ingestão de espécies e golpes a partir do PokeAPI |

## Documentação

- `docs/design/` — documento de design, plano de três meses e triagem da referência
- `docs/superpowers/specs/` — as specs de cada fase entregue
- `docs/deploy.md` — como publicar
- `tools/assets/README.md` — contrato de autoria de mapa e do pipeline de assets

## Licença dos assets

Os sprites usados em desenvolvimento vêm de um pack de fã e **não são redistribuídos aqui**.
Nem o dump em `assets/`, nem o atlas servido ao navegador em `packages/server/public/atlas`:
os dois são ignorados pelo git. Quem clonar este repositório recebe o código inteiro e monta o
próprio atlas com `pnpm assets build`, apontando para os assets que tiver. O código é do autor.
