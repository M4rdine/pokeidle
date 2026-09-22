# Deploy

O jogo roda como um container só: um processo serve a API, o WebSocket e o build do cliente. O
Postgres fica fora. Nada no código conhece o provedor, então trocar de host é editar este
documento e o `fly.toml`.

## Variáveis obrigatórias em produção

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Postgres da aplicação; as migrações rodam sozinhas no boot |
| `APP_ORIGIN` | Origem pública, usada na checagem de Origin do WebSocket e nos cookies |
| `COOKIE_SECURE` | `true` atrás de HTTPS |
| `TRUST_PROXY` | `1` atrás de um proxy, para o limite por IP ver o IP real |

`ASSETS_DIR` e `CLIENT_DIST` têm padrão correto dentro da imagem e não precisam ser definidos.

O atlas servido já vem no repositório, então um clone limpo constrói e roda. Para regerá-lo depois
de mexer em tile, prop ou conjunto de terreno:

```bash
pnpm assets build --extracted assets/extracted-otp2019
```

O build já publica os quatro arquivos servidos em `packages/server/public/atlas`. Antes isso era
um `cp` manual, e bastava esquecê-lo uma vez para o jogo abrir com o mapa em branco — o navegador
pedia tiles que a cópia servida não tinha. `packages/server/test/atlas-cobertura.test.ts` falha
quando a cópia fica para trás.

## Métricas

`/metrics` responde no formato Prometheus e `/metrics/ui/` é um painel que lê esse mesmo
endpoint — caçadas ativas, quantis de tick, persistência, HTTP e erros por escopo.

Os dois passam pela mesma guarda, e não existe configuração que os deixe abertos:

- Com `METRICS_TOKEN` no ambiente, exigem `Authorization: Bearer <token>` de qualquer origem,
  inclusive local.
- Sem o token, só respondem ao loopback — o caso do desenvolvimento.

Em produção, defina o token junto dos outros segredos:

```bash
fly secrets set METRICS_TOKEN="$(openssl rand -hex 24)"
curl -H "Authorization: Bearer <token>" https://<app>.fly.dev/metrics
```

Para histórico e alerta, aponte um Prometheus para essa URL; o endpoint não guarda série, e o
painel mostra só o agora.

## Antes de começar

Três coisas na máquina de quem publica, e todas as três precisam estar lá porque o build é local:

```bash
brew install flyctl          # ou: curl -L https://fly.io/install.sh | sh
docker info                  # Docker precisa estar no ar (Colima, Docker Desktop, o que for)
pnpm assets build --extracted assets/extracted-otp2019   # gera o atlas que a imagem leva
```

Vale construir a imagem antes de gastar um deploy:

```bash
docker build -t pokeidle:local .
```

Se isso passa, o deploy só pode falhar por credencial, variável ou banco — nunca por build.

## Primeiro deploy

1. Criar o banco no Neon e copiar a URL de conexão com `sslmode=require`.
2. `fly launch --no-deploy` (o `fly.toml` deste repositório já está pronto; responda que não quer
   criar Postgres nem Redis do Fly).
3. Definir os segredos de uma vez. `COOKIE_SECURE`, `TRUST_PROXY`, `PORT` e `NODE_ENV` já vêm do
   `[env]` do `fly.toml` e não entram aqui:

   ```bash
   fly secrets set \
     DATABASE_URL='postgres://...?sslmode=require' \
     APP_ORIGIN='https://<app>.fly.dev' \
     METRICS_TOKEN="$(openssl rand -hex 24)"
   ```
4. `fly deploy`

   O atlas servido está no repositório, então o build remoto do Fly produz a mesma imagem que o
   local. `--local-only` continua valendo quando se quer construir na própria máquina — só não é
   mais obrigatório.
5. Conferir `https://<app>.fly.dev/health`, que responde status, versão e tempo de atividade.
6. Conferir que o mapa desenha: abrir o jogo, registrar e entrar numa área.

## Deploy seguinte

`fly deploy`. As migrações rodam no boot; se uma falhar, o processo sai e o Fly mantém a máquina
antiga no ar.

## Como está publicado hoje

Numa VPS Ubuntu que já hospedava outros projetos, então o Pokeidle foi encaixado sem encostar em
nada do que estava no ar:

- **Postgres próprio, em container.** A máquina tem um Postgres compartilhado; dar um banco
  isolado ao jogo mantém backup, upgrade e raio de estrago separados dos outros projetos.
- **Aplicação publicada só no loopback** (`127.0.0.1:3200`). Quem fala com o mundo é o nginx, que
  termina o TLS. O servidor escuta em `0.0.0.0` dentro do container, então publicar na interface
  pública o exporia sem proxy e sem TLS.
- **Domínio gratuito via sslip.io**, que resolve o IP a partir do próprio nome e dispensa DNS.
- **Certificado pelo certbot**, com renovação automática já agendada.
- **`restart: unless-stopped`** nos dois containers, com o Docker habilitado no boot: reiniciar a
  máquina traz o jogo de volta sozinho.

A pilha vive em `/opt/pokeidle`, e os segredos em `/opt/pokeidle/.env` com permissão só do root —
gerados na própria máquina, nunca versionados.

Para atualizar:

```bash
cd /opt/pokeidle/src && git pull
docker build -t pokeidle:vps . && cd /opt/pokeidle && docker compose up -d --force-recreate app
```

## Deploy automático

Commit na `main` publica sozinho. A corrente é: **CI verde → workflow `Deploy` → a VPS puxa,
reconstrói e recria o container**. O `Deploy` escuta a conclusão do CI e tem uma guarda explícita
(`workflow_run` dispara mesmo quando o CI falha), então teste vermelho não vira publicação.

Para republicar sem commit novo: aba Actions → Deploy → *Run workflow*.

### A chave de deploy

O GitHub entra na VPS com uma chave dedicada, e ela **só consegue rodar um comando**. No
`authorized_keys` do servidor:

```
command="/opt/pokeidle/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc ssh-ed25519 AAAA...
```

O que o workflow pede é ignorado: a chave sempre executa `/opt/pokeidle/deploy.sh`. Vazada, ela
não dá shell, não lê arquivo e não abre túnel — publica o Pokeidle, e nada mais. Numa máquina que
hospeda outros projetos, essa diferença é o que separa um incidente de uma catástrofe.

O script pega um `flock` antes de agir (dois deploys ao mesmo tempo disputariam a mesma imagem) e
só devolve sucesso depois que o `/health` responde: container de pé não é aplicação no ar.

Segredos do repositório: `VPS_SSH_KEY`, `VPS_HOST` e `VPS_KNOWN_HOSTS` — este último fixa a
identidade do servidor, sem o que um DNS sequestrado receberia a chave privada.

## Trocar de host

A imagem é um `Dockerfile` comum, sem nada do Fly. Em Render, Railway ou qualquer runner de
container, basta apontar para o repositório, definir as quatro variáveis acima e expor a porta
3000. O `healthcheck` da imagem já responde em `/health`.

## Capacidade

`pnpm --filter @pokeidle/server carga` gera N caçadas simultâneas contra um servidor no ar e lê o
que ele publica em `/metrics`. Ela existe porque a sobrecarga do agendador não aparece como erro em
lugar nenhum: o processo roda todas as caçadas dentro da mesma janela de 200 ms, e quando a soma
passa da janela o jogo inteiro anda mais devagar que o relógio, para todo mundo ao mesmo tempo. O
sintoma que chega é "o jogo travou".

```
pnpm --filter @pokeidle/server carga --cacadas 50 --segundos 60
```

O teto prático por rodada é o limite global de 300 requisições por minuto por IP, porque cada
caçada gasta uma no `POST /hunts/:id/start`.

### O que a primeira medição mostrou (22/09/2026, máquina de desenvolvimento)

| caçadas | tempo por tick | ritmo do relógio | gravações |
|---|---|---|---|
| 17 | 2,4 ms | 100,0 % | — |
| 52 | 204 ms | 57,8 % | 171 a 2.322 ms cada, 100 % acima de 200 ms |

**O motor não é o gargalo.** A 17 caçadas ele gasta 0,14 ms por caçada por tick. Quem derruba o
ritmo é a persistência, e o problema não é o tamanho de cada gravação: é que elas chegam todas
juntas. `needsSave` compara `tick - lastSaveTick`, então caçadas que começam no mesmo instante
ficam alinhadas para sempre e as 52 gravam no mesmo tick, contra um pool de 10 conexões.

Os números absolutos são desta máquina, com o Postgres num disco virtualizado pelo Colima — o
mesmo que já fez um `TRUNCATE` levar 30 s nos testes. O VPS não tem esses números. O que vale em
qualquer máquina é a FORMA: rajada alinhada, não volume.

